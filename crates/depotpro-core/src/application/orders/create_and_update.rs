// ============================================================================
// Création (draft) et mise à jour de commandes mixtes
// ============================================================================

use crate::application::auth::{current_actor, require_current_actor_permission, Permission};
use crate::application::sales::audit_log_tx;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::composition::compute_order_totals;
use super::composition_resolve::resolve_preview_lines_tx;
use super::create_helpers::{
    check_min_selling_prices_tx, generate_order_number_tx, resolve_allocations_tx,
    write_lines_and_allocations_tx,
};
use super::dtos::{CreateOrderInput, OrderDetailDto, UpdateOrderInput};
use super::queries::get_order;

pub async fn create_order(db: &DepotDb, input: CreateOrderInput) -> CoreResult<OrderDetailDto> {
    require_current_actor_permission(Permission::SalesWrite)?;
    if input.lines.is_empty() {
        return Err(CoreError::Validation(
            "La commande doit contenir au moins une ligne produit.".to_string(),
        ));
    }
    let (_guard, mut tx) = db.begin_write().await?;
    let client_ok: Option<i64> =
        sqlx::query_scalar("SELECT id FROM clients WHERE id = ? AND is_active = 1")
            .bind(input.customer_id)
            .fetch_optional(&mut *tx)
            .await?;
    if client_ok.is_none() {
        return Err(CoreError::NotFound("Client introuvable ou inactif.".into()));
    }

    let (lines, native_caps) = resolve_preview_lines_tx(&mut tx, &input.lines).await?;
    check_min_selling_prices_tx(&mut tx, &lines, input.allow_price_override.unwrap_or(false))
        .await?;
    let allocations =
        resolve_allocations_tx(&mut tx, &lines, &native_caps, input.allocations.as_deref()).await?;
    let totals = compute_order_totals(
        &lines,
        &allocations,
        input.discount_xof.unwrap_or(0).max(0),
        input.tax_xof.unwrap_or(0).max(0),
    );
    let order_number = generate_order_number_tx(&mut tx).await?;
    let order_type = input
        .order_type
        .as_deref()
        .filter(|t| matches!(*t, "vente" | "retour" | "mixte"))
        .unwrap_or(if lines.len() > 1 { "mixte" } else { "vente" });
    let actor_id = current_actor().and_then(|a| a.user_id.parse::<i64>().ok());

    let order_id = sqlx::query(
        "INSERT INTO orders (
            order_number, customer_id, order_type, status, subtotal_xof, deposit_total_xof,
            discount_xof, tax_xof, total_xof, deposit_due_xof, total_to_collect_xof,
            payment_method, delivery_date, delivery_address, notes, created_by
         ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&order_number)
    .bind(input.customer_id)
    .bind(order_type)
    .bind(totals.subtotal_xof)
    .bind(totals.deposit_total_xof)
    .bind(totals.discount_xof)
    .bind(totals.tax_xof)
    .bind(totals.total_xof)
    .bind(totals.deposit_due_xof)
    .bind(totals.total_to_collect_xof)
    .bind(input.payment_method.as_deref())
    .bind(input.delivery_date.as_deref())
    .bind(input.delivery_address.as_deref())
    .bind(input.notes.as_deref())
    .bind(actor_id)
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    write_lines_and_allocations_tx(
        &mut tx,
        order_id,
        &lines,
        &input.lines,
        &allocations,
        input.allocations.as_deref(),
    )
    .await?;
    audit_log_tx(
        &mut tx,
        "create_order",
        "order",
        Some(order_id.to_string()),
        &format!(
            "Commande {} créée ({} lignes, {} allocations)",
            order_number,
            lines.len(),
            allocations.len()
        ),
    )
    .await?;
    tx.commit().await?;
    get_order(db, order_id).await
}

pub async fn update_order(
    db: &DepotDb,
    id: i64,
    input: UpdateOrderInput,
) -> CoreResult<OrderDetailDto> {
    require_current_actor_permission(Permission::SalesWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let status: Option<String> = sqlx::query_scalar("SELECT status FROM orders WHERE id = ?")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?;
    let status = status.ok_or_else(|| CoreError::NotFound("Commande introuvable.".into()))?;
    if status != "draft" {
        return Err(CoreError::Validation(
            "Seule une commande en brouillon (draft) peut être modifiée.".to_string(),
        ));
    }
    if let Some(ref raw_lines) = input.lines {
        if raw_lines.is_empty() {
            return Err(CoreError::Validation(
                "La commande doit contenir au moins une ligne.".into(),
            ));
        }
        sqlx::query("DELETE FROM order_lines WHERE order_id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM order_packaging_allocations WHERE order_id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        let (lines, native_caps) = resolve_preview_lines_tx(&mut tx, raw_lines).await?;
        check_min_selling_prices_tx(&mut tx, &lines, input.allow_price_override.unwrap_or(false))
            .await?;
        let allocs =
            resolve_allocations_tx(&mut tx, &lines, &native_caps, input.allocations.as_deref())
                .await?;
        let totals = compute_order_totals(
            &lines,
            &allocs,
            input.discount_xof.unwrap_or(0).max(0),
            input.tax_xof.unwrap_or(0).max(0),
        );
        write_lines_and_allocations_tx(
            &mut tx,
            id,
            &lines,
            raw_lines,
            &allocs,
            input.allocations.as_deref(),
        )
        .await?;
        sqlx::query(
            "UPDATE orders SET subtotal_xof = ?, deposit_total_xof = ?, discount_xof = ?, tax_xof = ?,
             total_xof = ?, deposit_due_xof = ?, total_to_collect_xof = ?, updated_at = datetime('now')
             WHERE id = ?",
        )
        .bind(totals.subtotal_xof)
        .bind(totals.deposit_total_xof)
        .bind(totals.discount_xof)
        .bind(totals.tax_xof)
        .bind(totals.total_xof)
        .bind(totals.deposit_due_xof)
        .bind(totals.total_to_collect_xof)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    }
    if let Some(cid) = input.customer_id {
        sqlx::query("UPDATE orders SET customer_id = ?, updated_at = datetime('now') WHERE id = ?")
            .bind(cid)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(pm) = input.payment_method {
        sqlx::query(
            "UPDATE orders SET payment_method = ?, updated_at = datetime('now') WHERE id = ?",
        )
        .bind(pm)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    get_order(db, id).await
}
