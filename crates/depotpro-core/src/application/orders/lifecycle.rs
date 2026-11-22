// ============================================================================
// Cycle de vie commande : confirm (stock) et deliver (consignes & emballages)
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::inventory::sync_stock_balance_tx;
use crate::application::sales::audit_log_tx;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::dtos::OrderDetailDto;
use super::queries::get_order;

pub async fn confirm_order(db: &DepotDb, id: i64) -> CoreResult<OrderDetailDto> {
    require_current_actor_permission(Permission::SalesWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let row: Option<(String, String, i64, Option<String>, i64)> = sqlx::query_as(
        "SELECT order_number, status, customer_id, payment_method, total_to_collect_xof
         FROM orders WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;
    let (order_number, status, customer_id, payment_method, total_collect) =
        row.ok_or_else(|| CoreError::NotFound("Commande introuvable.".into()))?;
    if status != "draft" {
        return Err(CoreError::Validation(format!(
            "Impossible de confirmer une commande au statut {status}."
        )));
    }
    crate::application::commercial_documents::require_approval_or_owner(
        "customer_order",
        id,
        &mut tx,
    )
    .await?;
    crate::application::commercial_documents::record_owner_direct_approval(
        "customer_order",
        id,
        &mut tx,
    )
    .await?;

    if payment_method.as_deref() == Some("credit") {
        let credit_row: Option<(String, Option<i64>)> = sqlx::query_as(
            "SELECT policy, credit_limit FROM client_credit_settings WHERE client_id = ?",
        )
        .bind(customer_id)
        .fetch_optional(&mut *tx)
        .await?;
        let (policy, limit) = credit_row.unwrap_or_else(|| ("forbidden".to_string(), None));
        if policy == "forbidden" {
            return Err(CoreError::CreditPolicyViolation(
                "Ce client n'est pas autorisé à commander à crédit.".to_string(),
            ));
        }
        if policy == "limited" {
            let max_credit = limit.unwrap_or(0);
            let used: i64 = sqlx::query_scalar(
                "SELECT COALESCE(SUM(remaining_amount), 0) FROM customer_receivables
                 WHERE client_id = ? AND status IN ('open', 'partial')",
            )
            .bind(customer_id)
            .fetch_one(&mut *tx)
            .await?;
            if used + total_collect > max_credit {
                return Err(CoreError::CreditPolicyViolation(format!(
                    "Plafond crédit dépassé ({} + {} > {} FCFA).",
                    used, total_collect, max_credit
                )));
            }
        }
    }

    let lines: Vec<(i64, i64, i64, i64)> = sqlx::query_as(
        "SELECT id, product_id, variant_id, base_quantity FROM order_lines WHERE order_id = ?",
    )
    .bind(id)
    .fetch_all(&mut *tx)
    .await?;

    let allow_neg: i64 =
        sqlx::query_scalar("SELECT allow_negative_stock FROM app_settings WHERE id = 1")
            .fetch_optional(&mut *tx)
            .await?
            .unwrap_or(0);

    for (line_id, product_id, variant_id, base_qty) in lines {
        let (stock_milli, prod_name, loc_id): (i64, String, Option<i64>) = sqlx::query_as(
            "SELECT stock_milli, name, default_location_id FROM products WHERE id = ?",
        )
        .bind(product_id)
        .fetch_one(&mut *tx)
        .await?;
        let qty_milli = base_qty * 1000;
        let next_milli = stock_milli - qty_milli;
        if allow_neg == 0 && next_milli < 0 {
            return Err(CoreError::InsufficientStock(format!(
                "Stock insuffisant pour {prod_name} (requis: {base_qty}, disponible: {}).",
                stock_milli / 1000
            )));
        }
        sqlx::query("UPDATE products SET stock_milli = ? WHERE id = ?")
            .bind(next_milli)
            .bind(product_id)
            .execute(&mut *tx)
            .await?;
        sync_stock_balance_tx(&mut tx, product_id, next_milli).await?;
        sqlx::query(
            "INSERT INTO stock_movements (
                product_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli,
                reason, reference_document, location_id, variant_id, order_id, order_line_id
             ) VALUES (?, 'sale_out', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(product_id)
        .bind(-qty_milli)
        .bind(stock_milli)
        .bind(next_milli)
        .bind(format!("Confirmation commande {order_number}"))
        .bind(&order_number)
        .bind(loc_id)
        .bind(variant_id)
        .bind(id)
        .bind(line_id)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query(
        "UPDATE orders SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?",
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;
    audit_log_tx(
        &mut tx,
        "confirm_order",
        "order",
        Some(id.to_string()),
        &format!("Commande {order_number} confirmée"),
    )
    .await?;
    tx.commit().await?;
    get_order(db, id).await
}

pub async fn deliver_order(db: &DepotDb, id: i64) -> CoreResult<OrderDetailDto> {
    require_current_actor_permission(Permission::SalesWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let row: Option<(String, String, i64)> =
        sqlx::query_as("SELECT order_number, status, customer_id FROM orders WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let (order_number, status, customer_id) =
        row.ok_or_else(|| CoreError::NotFound("Commande introuvable.".into()))?;
    if !matches!(status.as_str(), "confirmed" | "preparing") {
        return Err(CoreError::Validation(
            "La commande doit être confirmée avant livraison.".to_string(),
        ));
    }

    let allocs: Vec<(i64, i64, i64, i64, i64)> = sqlx::query_as(
        "SELECT id, packaging_asset_id, quantity, is_consigned, deposit_amount_xof
         FROM order_packaging_allocations WHERE order_id = ?",
    )
    .bind(id)
    .fetch_all(&mut *tx)
    .await?;

    for (alloc_id, asset_id, qty, is_consigned, unit_dep) in allocs {
        let total_dep = if is_consigned == 1 { unit_dep * qty } else { 0 };
        sqlx::query(
            "INSERT INTO packaging_movements (
                packaging_asset_id, customer_id, order_id, order_packaging_allocation_id,
                movement_type, quantity, unit_deposit_xof, total_deposit_xof, notes
             ) VALUES (?, ?, ?, ?, 'LIVRAISON_CLIENT', ?, ?, ?, ?)",
        )
        .bind(asset_id)
        .bind(customer_id)
        .bind(id)
        .bind(alloc_id)
        .bind(qty)
        .bind(unit_dep)
        .bind(total_dep)
        .bind(format!("Livraison commande {order_number}"))
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "UPDATE packaging_assets SET stock_empty = MAX(0, stock_empty - ?) WHERE id = ?",
        )
        .bind(qty)
        .bind(asset_id)
        .execute(&mut *tx)
        .await?;

        if is_consigned == 1 {
            sqlx::query(
                "INSERT INTO customer_deposit_balances (
                    customer_id, packaging_asset_id, quantity_held,
                    amount_held_xof, last_movement_at
                 ) VALUES (?, ?, ?, ?, datetime('now'))
                 ON CONFLICT(customer_id, packaging_asset_id) DO UPDATE SET
                    quantity_held = quantity_held + excluded.quantity_held,
                    amount_held_xof = amount_held_xof + excluded.amount_held_xof,
                    last_movement_at = datetime('now')",
            )
            .bind(customer_id)
            .bind(asset_id)
            .bind(qty)
            .bind(total_dep)
            .execute(&mut *tx)
            .await?;
        }
    }

    sqlx::query(
        "UPDATE orders SET status = 'delivered',
         delivery_date = COALESCE(delivery_date, datetime('now')),
         updated_at = datetime('now') WHERE id = ?",
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;
    audit_log_tx(
        &mut tx,
        "deliver_order",
        "order",
        Some(id.to_string()),
        &format!("Commande {order_number} livrée"),
    )
    .await?;
    tx.commit().await?;
    get_order(db, id).await
}
