// ============================================================================
// Annulation complète d'une vente (stock, consignes, créances, caisse)
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{
    audit_log_tx, get_sale_detail, get_theoretical_cash_tx, require_open_session_tx,
    CancelSaleInput, SaleDetailDto,
};

pub async fn cancel_sale(
    db: &DepotDb,
    sale_id: i64,
    input: CancelSaleInput,
) -> CoreResult<SaleDetailDto> {
    require_current_actor_permission(Permission::SalesCancelReturn)?;
    let request_key = input.request_key.trim().to_string();
    if request_key.is_empty() {
        return Err(CoreError::Validation(
            "Clé d'idempotence requise.".to_string(),
        ));
    }
    let reason = input.reason.trim().to_string();
    if reason.is_empty() {
        return Err(CoreError::Validation(
            "Le motif d'annulation est obligatoire.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    let dup: Option<(i64, i64)> =
        sqlx::query_as("SELECT id, sale_id FROM sales_cancellations WHERE request_key = ?")
            .bind(&request_key)
            .fetch_optional(&mut *tx)
            .await?;
    if let Some((_dup_id, dup_sale_id)) = dup {
        tx.rollback().await?;
        if dup_sale_id != sale_id {
            return Err(CoreError::DuplicateOperation(
                "Cette clé d'idempotence a déjà été utilisée pour une autre vente.".to_string(),
            ));
        }
        return get_sale_detail(db, sale_id).await;
    }

    let (session_id, _sref, opening_cash) = require_open_session_tx(&mut tx).await?;
    let sale: Option<(i64, String, String)> =
        sqlx::query_as("SELECT id, reference, status FROM sales WHERE id = ?")
            .bind(sale_id)
            .fetch_optional(&mut *tx)
            .await?;
    let (_id, sale_ref, status) =
        sale.ok_or_else(|| CoreError::Validation("Vente introuvable.".to_string()))?;
    if status == "cancelled" {
        return Err(CoreError::HistoricalImmutable(
            "Cette vente est déjà annulée.".to_string(),
        ));
    }
    let ret_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sales_returns WHERE sale_id = ?")
        .bind(sale_id)
        .fetch_one(&mut *tx)
        .await?;
    if ret_count > 0 {
        return Err(CoreError::HistoricalImmutable(
            "Impossible d'annuler une vente ayant déjà fait l'objet d'un retour partiel."
                .to_string(),
        ));
    }

    let lines: Vec<(i64, i64)> =
        sqlx::query_as("SELECT product_id, base_quantity_milli FROM sale_lines WHERE sale_id = ?")
            .bind(sale_id)
            .fetch_all(&mut *tx)
            .await?;
    for (pid, qty_milli) in lines {
        let cur_stock: i64 = sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
            .bind(pid)
            .fetch_one(&mut *tx)
            .await?;
        let next_stock = cur_stock.checked_add(qty_milli).ok_or_else(|| {
            CoreError::Validation("Débordement stock lors de l'annulation.".to_string())
        })?;
        sqlx::query("UPDATE products SET stock_milli = ? WHERE id = ?")
            .bind(next_stock)
            .bind(pid)
            .execute(&mut *tx)
            .await?;
        crate::application::inventory::sync_stock_balance_tx(&mut tx, pid, next_stock).await?;
        sqlx::query(
            "INSERT INTO stock_movements (product_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, reason, reference_document)
             VALUES (?, 'sale_cancel_in', ?, ?, ?, ?, ?)",
        )
        .bind(pid)
        .bind(qty_milli)
        .bind(cur_stock)
        .bind(next_stock)
        .bind(format!("Annulation vente {sale_ref} : {reason}"))
        .bind(&sale_ref)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query(
        "UPDATE customer_receivables SET remaining_amount = 0, status = 'cancelled' WHERE sale_id = ?",
    )
    .bind(sale_id)
    .execute(&mut *tx)
    .await?;

    let deposits: Vec<(Option<i64>, i64, i64, i64, i64)> = sqlx::query_as(
        "SELECT client_id, returnable_id, pieces, returned_pieces, amount FROM deposit_issues WHERE sale_id = ?",
    )
    .bind(sale_id)
    .fetch_all(&mut *tx)
    .await?;
    for (cid_opt, rid, pieces, returned_pieces, amount) in deposits {
        if returned_pieces > 0 {
            return Err(CoreError::HistoricalImmutable(
                "Des vides ont déjà été retournés sur cette vente.".to_string(),
            ));
        }
        if let Some(cid) = cid_opt {
            sqlx::query(
                "UPDATE customer_packaging_accounts
                 SET balance_pieces = MAX(0, balance_pieces - ?),
                     deposit_held_amount = MAX(0, deposit_held_amount - ?)
                 WHERE client_id = ? AND returnable_id = ?",
            )
            .bind(pieces)
            .bind(amount)
            .bind(cid)
            .bind(rid)
            .execute(&mut *tx)
            .await?;
        }
    }

    let refunded: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(total_amount), 0) FROM payments WHERE sale_id = ? AND payment_kind IN ('sale', 'receivable')",
    )
    .bind(sale_id)
    .fetch_one(&mut *tx)
    .await?;
    let refund_method = input
        .refund_method_code
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("cash")
        .to_string();

    if refunded > 0 {
        let pm: Option<(String, i64, i64)> =
            sqlx::query_as("SELECT code, is_cash, active FROM payment_methods WHERE code = ?")
                .bind(&refund_method)
                .fetch_optional(&mut *tx)
                .await?;
        let (pm_code, is_cash, active) = pm.ok_or_else(|| {
            CoreError::InvalidPayment(format!(
                "Moyen de remboursement introuvable : {refund_method}"
            ))
        })?;
        if active == 0 {
            return Err(CoreError::InvalidPayment(format!(
                "Moyen de remboursement inactif : {pm_code}"
            )));
        }
        if is_cash == 1 {
            let avail = get_theoretical_cash_tx(&mut tx, session_id, opening_cash).await?;
            if refunded > avail {
                return Err(CoreError::InvalidPayment(
                    "Espèces insuffisantes en caisse pour rembourser cette vente.".to_string(),
                ));
            }
        }
        sqlx::query(
            "INSERT INTO cash_movements (session_id, request_key, kind, method_code, direction, amount, description, reference_document)
             VALUES (?, ?, 'sale_refund', ?, 'out', ?, ?, ?)",
        )
        .bind(session_id)
        .bind(format!("cancel-ref:{request_key}"))
        .bind(&pm_code)
        .bind(refunded)
        .bind(format!("Annulation {sale_ref} — {reason}"))
        .bind(&sale_ref)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query(
        "INSERT INTO sales_cancellations (sale_id, session_id, request_key, reason, refund_method_code, refunded_amount)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(sale_id)
    .bind(session_id)
    .bind(&request_key)
    .bind(&reason)
    .bind(if refunded > 0 { Some(refund_method) } else { None })
    .bind(refunded)
    .execute(&mut *tx)
    .await?;

    sqlx::query("UPDATE sales SET status = 'cancelled' WHERE id = ?")
        .bind(sale_id)
        .execute(&mut *tx)
        .await?;

    audit_log_tx(
        &mut tx,
        "CANCEL_SALE",
        "sales",
        Some(sale_id.to_string()),
        &format!("Annulation {sale_ref} ({reason})"),
    )
    .await?;
    tx.commit().await?;

    get_sale_detail(db, sale_id).await
}
