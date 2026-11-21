// ============================================================================
// Facturation, paiement et annulation d'une commande
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::inventory::sync_stock_balance_tx;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::dtos::{OrderDetailDto, PayOrderInput};
use super::queries::get_order;

pub async fn invoice_order(db: &DepotDb, id: i64) -> CoreResult<OrderDetailDto> {
    require_current_actor_permission(Permission::SalesWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let status: Option<String> = sqlx::query_scalar("SELECT status FROM orders WHERE id = ?")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?;
    let status = status.ok_or_else(|| CoreError::NotFound("Commande introuvable.".into()))?;
    if !matches!(status.as_str(), "confirmed" | "delivered") {
        return Err(CoreError::Validation(
            "La commande doit être confirmée ou livrée pour être facturée.".into(),
        ));
    }
    sqlx::query("UPDATE orders SET status = 'invoiced', updated_at = datetime('now') WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    get_order(db, id).await
}

pub async fn pay_order(db: &DepotDb, id: i64, input: PayOrderInput) -> CoreResult<OrderDetailDto> {
    require_current_actor_permission(Permission::SalesWrite)?;
    if input.amount_xof <= 0 {
        return Err(CoreError::Validation("Montant payé doit être > 0.".into()));
    }
    let (_guard, mut tx) = db.begin_write().await?;
    let row: Option<(i64, i64)> =
        sqlx::query_as("SELECT paid_xof, total_to_collect_xof FROM orders WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let (paid, total) = row.ok_or_else(|| CoreError::NotFound("Commande introuvable.".into()))?;
    let next_paid = paid + input.amount_xof;
    let pay_status = if next_paid >= total {
        "paid"
    } else {
        "partial"
    };
    let method = match input.method.trim().to_lowercase().as_str() {
        "cash" | "mobile_money" | "credit" | "mixed" => input.method.trim().to_lowercase(),
        _ => "cash".to_string(),
    };
    sqlx::query(
        "UPDATE orders SET paid_xof = ?, payment_status = ?, payment_method = ?,
         status = CASE
            WHEN ? = 'paid' AND status IN ('delivered', 'invoiced') THEN 'paid'
            ELSE status
         END,
         updated_at = datetime('now') WHERE id = ?",
    )
    .bind(next_paid)
    .bind(pay_status)
    .bind(&method)
    .bind(pay_status)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    get_order(db, id).await
}

pub async fn cancel_order(db: &DepotDb, id: i64) -> CoreResult<OrderDetailDto> {
    require_current_actor_permission(Permission::SalesCancelReturn)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let row: Option<(String, String)> =
        sqlx::query_as("SELECT order_number, status FROM orders WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let (order_number, status) =
        row.ok_or_else(|| CoreError::NotFound("Commande introuvable.".into()))?;
    if status == "cancelled" {
        return Err(CoreError::Validation("Commande déjà annulée.".into()));
    }
    if matches!(status.as_str(), "delivered" | "invoiced" | "paid") {
        return Err(CoreError::Validation(
            "Impossible d'annuler une commande déjà livrée ou payée.".into(),
        ));
    }
    if status == "confirmed" {
        let lines: Vec<(i64, i64, i64, i64)> = sqlx::query_as(
            "SELECT id, product_id, variant_id, base_quantity FROM order_lines WHERE order_id = ?",
        )
        .bind(id)
        .fetch_all(&mut *tx)
        .await?;
        for (line_id, product_id, variant_id, base_qty) in lines {
            let (stock_milli, loc_id): (i64, Option<i64>) = sqlx::query_as(
                "SELECT stock_milli, default_location_id FROM products WHERE id = ?",
            )
            .bind(product_id)
            .fetch_one(&mut *tx)
            .await?;
            let qty_milli = base_qty * 1000;
            let next_milli = stock_milli + qty_milli;
            sqlx::query("UPDATE products SET stock_milli = ? WHERE id = ?")
                .bind(next_milli)
                .bind(product_id)
                .execute(&mut *tx)
                .await?;
            sync_stock_balance_tx(&mut tx, product_id, next_milli).await?;
            sqlx::query(
                "INSERT INTO stock_movements (
                    product_id, movement_type, quantity_milli, stock_before_milli,
                    stock_after_milli, reason, reference_document, location_id,
                    variant_id, order_id, order_line_id
                 ) VALUES (?, 'sale_cancel_in', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(product_id)
            .bind(qty_milli)
            .bind(stock_milli)
            .bind(next_milli)
            .bind(format!("Annulation commande {order_number}"))
            .bind(&order_number)
            .bind(loc_id)
            .bind(variant_id)
            .bind(id)
            .bind(line_id)
            .execute(&mut *tx)
            .await?;
        }
    }
    sqlx::query("UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    get_order(db, id).await
}
