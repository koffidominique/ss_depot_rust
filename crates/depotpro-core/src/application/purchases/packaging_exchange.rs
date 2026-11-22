// ============================================================================
// Réservation et émission physique des emballages fournisseur (CMD -> REC)
// ============================================================================

use sqlx::{Sqlite, Transaction};

use crate::error::{CoreError, CoreResult};

#[allow(clippy::too_many_arguments)]
pub(crate) async fn issue_reserved_packaging_tx(
    tx: &mut Transaction<'_, Sqlite>,
    po_line_id: i64,
    cumulative_received_milli: i64,
    ordered_milli: i64,
    receipt_id: i64,
    request_key: &str,
    rec_ref: &str,
    po_ref: &str,
) -> CoreResult<()> {
    let reservations: Vec<(i64, i64, i64, i64, String, String, String)> = sqlx::query_as(
        "SELECT returnable_id, required_pieces, reserved_pieces, issued_pieces, code_snapshot, name_snapshot, kind_snapshot
         FROM purchase_order_packaging_requirements WHERE purchase_order_line_id = ? AND reservation_status IN ('reserved', 'partially_issued')",
    ).bind(po_line_id).fetch_all(&mut **tx).await?;
    for (returnable_id, required, reserved, issued, code, name, kind) in reservations {
        let target_numerator = (required as i128)
            .checked_mul(cumulative_received_milli as i128)
            .ok_or_else(|| CoreError::Validation("Débordement de la quantité physique reçue.".into()))?;
        if target_numerator % ordered_milli as i128 != 0 {
            return Err(CoreError::Validation(format!(
                "La réception partielle génère une quantité fractionnaire d'emballages ({code}); réceptionnez une quantité physique entière."
            )));
        }
        let target = i64::try_from(target_numerator / ordered_milli as i128)
            .map_err(|_| CoreError::Validation("Débordement quantité emballages.".into()))?;
        let delta = target - issued;
        if delta < 0 {
            return Err(CoreError::Internal("La réservation d'emballages est incohérente.".into()));
        }
        if delta > reserved {
            return Err(CoreError::InsufficientStock(format!("La réservation {code} ne couvre pas la réception (réservé {reserved}, requis {delta}).")));
        }
        if delta == 0 { continue; }

        let before: i64 = sqlx::query_scalar(
            "SELECT COALESCE((SELECT quantity FROM returnable_stock_balances WHERE packaging_id = ?), 0)",
        ).bind(returnable_id).fetch_one(&mut **tx).await?;
        if before < delta {
            return Err(CoreError::InsufficientStock(format!(
                "Stock physique d'emballages insuffisant pour {code}: disponible {before}, requis {delta}."
            )));
        }
        let after = before - delta;
        sqlx::query(
            "INSERT INTO returnable_stock_balances (packaging_id, quantity) VALUES (?, ?)
             ON CONFLICT(packaging_id) DO UPDATE SET quantity = excluded.quantity",
        ).bind(returnable_id).bind(after).execute(&mut **tx).await?;
        let mov_key = format!("sup-exch:{request_key}:{returnable_id}:{po_line_id}:{receipt_id}");
        sqlx::query(
            "INSERT INTO returnable_stock_movements (request_key, packaging_id, movement_type, quantity, stock_before, stock_after, reason, reference_document)
             VALUES (?, ?, 'supplier_exchange', ?, ?, ?, ?, ?)",
        ).bind(mov_key).bind(returnable_id).bind(delta).bind(before).bind(after)
         .bind(format!("Échange fournisseur réception {rec_ref} (CMD {po_ref})"))
         .bind(rec_ref).execute(&mut **tx).await?;
        sqlx::query(
            "UPDATE purchase_order_packaging_requirements SET reserved_pieces = reserved_pieces - ?, issued_pieces = ?,
             reservation_status = CASE WHEN reserved_pieces - ? = 0 THEN 'issued' ELSE 'partially_issued' END,
             updated_at = datetime('now') WHERE purchase_order_line_id = ? AND returnable_id = ?",
        ).bind(delta).bind(target).bind(delta).bind(po_line_id).bind(returnable_id).execute(&mut **tx).await?;
        sqlx::query(
            "INSERT INTO supplier_packaging_exchange_lines (receipt_id, purchase_order_line_id, returnable_id, code_snapshot, name_snapshot, kind_snapshot, pieces_issued)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        ).bind(receipt_id).bind(po_line_id).bind(returnable_id).bind(code).bind(name).bind(kind).bind(delta)
         .execute(&mut **tx).await?;
    }
    Ok(())
}

pub(crate) async fn release_order_packaging_reservations_tx(
    tx: &mut Transaction<'_, Sqlite>,
    purchase_order_id: i64,
) -> CoreResult<()> {
    sqlx::query(
        "UPDATE purchase_order_packaging_requirements
         SET reserved_pieces = 0, reservation_status = 'released', updated_at = datetime('now')
         WHERE purchase_order_line_id IN (SELECT id FROM purchase_order_lines WHERE purchase_order_id = ?)
           AND reservation_status IN ('reserved', 'partially_issued')",
    )
    .bind(purchase_order_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

