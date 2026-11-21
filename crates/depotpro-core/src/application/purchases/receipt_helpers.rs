// ============================================================================
// Helpers transactionnels de réception : échange emballages & CUMP stock
// ============================================================================

use sqlx::{Sqlite, Transaction};

use crate::error::{CoreError, CoreResult};

#[allow(clippy::too_many_arguments)]
pub(crate) async fn exchange_supplier_packaging_tx(
    tx: &mut Transaction<'_, Sqlite>,
    pkg_id: i64,
    qty_milli: i64,
    pol_id: i64,
    request_key: &str,
    rec_ref: &str,
    po_ref: &str,
) -> CoreResult<()> {
    let packaging_components: Vec<(i64, i64)> = sqlx::query_as(
        "SELECT returnable_id, pieces_per_pack FROM deposit_packaging_components WHERE packaging_id = ?",
    )
    .bind(pkg_id)
    .fetch_all(&mut **tx)
    .await?;

    for (returnable_id, pieces_per_pack) in &packaging_components {
        let total_pieces_to_exchange = (*qty_milli as i128 * *pieces_per_pack as i128) / 1000;
        if total_pieces_to_exchange > 0 {
            let pieces_to_exchange = i64::try_from(total_pieces_to_exchange).map_err(|_| {
                CoreError::Validation("Débordement quantité échange fournisseur".to_string())
            })?;

            let bal: Option<(i64,)> = sqlx::query_as(
                "SELECT quantity FROM returnable_stock_balances WHERE packaging_id = ?",
            )
            .bind(returnable_id)
            .fetch_optional(&mut **tx)
            .await?;
            let before = bal.map(|b| b.0).unwrap_or(0);
            if before < pieces_to_exchange {
                return Err(CoreError::InsufficientStock(format!(
                    "Stock d'emballages vides insuffisant pour l'échange fournisseur (disponible: {}, requis: {})",
                    before, pieces_to_exchange
                )));
            }
            let after = before - pieces_to_exchange;

            if bal.is_some() {
                sqlx::query(
                    "UPDATE returnable_stock_balances SET quantity = ? WHERE packaging_id = ?",
                )
                .bind(after)
                .bind(returnable_id)
                .execute(&mut **tx)
                .await?;
            } else {
                sqlx::query(
                    "INSERT INTO returnable_stock_balances (packaging_id, quantity) VALUES (?, ?)",
                )
                .bind(returnable_id)
                .bind(after)
                .execute(&mut **tx)
                .await?;
            }

            let mov_key = format!("sup-exch:{request_key}:{returnable_id}:{pol_id}");
            sqlx::query(
                "INSERT INTO returnable_stock_movements (request_key, packaging_id, movement_type, quantity, stock_before, stock_after, reason, reference_document)
                 VALUES (?, ?, 'supplier_exchange', ?, ?, ?, ?, ?)",
            )
            .bind(&mov_key)
            .bind(returnable_id)
            .bind(pieces_to_exchange)
            .bind(before)
            .bind(after)
            .bind(format!("Échange fournisseur réception {rec_ref} (CMD {po_ref})"))
            .bind(rec_ref)
            .execute(&mut **tx)
            .await?;
        }
    }
    Ok(())
}

pub(crate) async fn apply_receipt_stock_and_cost_tx(
    tx: &mut Transaction<'_, Sqlite>,
    pid: i64,
    base_qty_milli: i64,
    amount: i64,
    rec_ref: &str,
    po_ref: &str,
) -> CoreResult<()> {
    let (cur_stock, avg_num, avg_den): (i64, Option<String>, Option<String>) = sqlx::query_as(
        "SELECT stock_milli, average_cost_num, average_cost_den FROM products WHERE id = ?",
    )
    .bind(pid)
    .fetch_one(&mut **tx)
    .await?;

    let next_stock = cur_stock
        .checked_add(base_qty_milli)
        .ok_or_else(|| CoreError::Validation("Débordement du stock produit.".to_string()))?;
    let mut next_num = avg_num.clone();
    let mut next_den = avg_den.clone();

    if amount >= 0
        && base_qty_milli > 0
        && (cur_stock == 0 || (avg_num.is_some() && avg_den.is_some()))
    {
        let old_num: i128 = avg_num.as_deref().and_then(|s| s.parse().ok()).unwrap_or(0);
        let old_den: i128 = avg_den
            .as_deref()
            .and_then(|s| s.parse().ok())
            .unwrap_or(1)
            .max(1);
        let old_val_scaled = ((cur_stock as i128) * old_num) / old_den;
        let added_val_scaled = (amount as i128) * 1000_i128;
        let total_num = old_val_scaled + added_val_scaled;
        let total_den = next_stock as i128;
        if total_den > 0 {
            next_num = Some(total_num.to_string());
            next_den = Some(total_den.to_string());
        }
    }

    sqlx::query(
        "UPDATE products SET stock_milli = ?, average_cost_num = ?, average_cost_den = ? WHERE id = ?",
    )
    .bind(next_stock)
    .bind(&next_num)
    .bind(&next_den)
    .bind(pid)
    .execute(&mut **tx)
    .await?;

    let unit_base_cost = if base_qty_milli > 0 {
        Some(
            i64::try_from((amount as i128 * 1000) / (base_qty_milli as i128)).map_err(|_| {
                CoreError::Validation("Débordement du coût unitaire de base.".to_string())
            })?,
        )
    } else {
        None
    };

    sqlx::query(
        "INSERT INTO stock_movements (product_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, unit_cost, reason, reference_document)
         VALUES (?, 'purchase_in', ?, ?, ?, ?, ?, ?)",
    )
    .bind(pid)
    .bind(base_qty_milli)
    .bind(cur_stock)
    .bind(next_stock)
    .bind(unit_base_cost)
    .bind(format!("Réception {rec_ref} (CMD {po_ref})"))
    .bind(rec_ref)
    .execute(&mut **tx)
    .await?;

    Ok(())
}
