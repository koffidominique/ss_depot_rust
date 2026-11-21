// ============================================================================
// Lectures & requêtes sur les commandes clientèle mixtes
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::dtos::{
    CustomerDepositBalanceDto, OrderDetailDto, OrderLineDto, OrderLinePackagingLinkDto,
    OrderListFilter, OrderPackagingAllocationDto, OrderSummaryDto,
};
use super::packaging_and_returns::load_customer_deposits;

pub async fn list_orders(
    db: &DepotDb,
    filter: OrderListFilter,
) -> CoreResult<Vec<OrderSummaryDto>> {
    require_current_actor_permission(Permission::SalesRead)?;
    let rows: Vec<OrderSummaryDto> = sqlx::query_as(
        "SELECT o.id, o.order_number, o.customer_id, c.name AS customer_name, o.order_type, o.status,
                o.subtotal_xof, o.deposit_total_xof, o.discount_xof, o.tax_xof, o.total_xof,
                o.deposit_due_xof, o.total_to_collect_xof, o.paid_xof, o.payment_status,
                o.payment_method, o.delivery_date, o.delivery_address, o.notes, o.created_at, o.updated_at
         FROM orders o
         JOIN clients c ON c.id = o.customer_id
         WHERE (? IS NULL OR o.status = ?)
           AND (? IS NULL OR o.customer_id = ?)
           AND (? IS NULL OR date(o.created_at) >= date(?))
           AND (? IS NULL OR date(o.created_at) <= date(?))
         ORDER BY o.id DESC LIMIT 200",
    )
    .bind(&filter.status)
    .bind(&filter.status)
    .bind(filter.customer_id)
    .bind(filter.customer_id)
    .bind(&filter.from)
    .bind(&filter.from)
    .bind(&filter.to)
    .bind(&filter.to)
    .fetch_all(&db.pool)
    .await?;
    Ok(rows)
}

pub async fn get_order(db: &DepotDb, id: i64) -> CoreResult<OrderDetailDto> {
    require_current_actor_permission(Permission::SalesRead)?;
    let order: Option<OrderSummaryDto> = sqlx::query_as(
        "SELECT o.id, o.order_number, o.customer_id, c.name AS customer_name, o.order_type, o.status,
                o.subtotal_xof, o.deposit_total_xof, o.discount_xof, o.tax_xof, o.total_xof,
                o.deposit_due_xof, o.total_to_collect_xof, o.paid_xof, o.payment_status,
                o.payment_method, o.delivery_date, o.delivery_address, o.notes, o.created_at, o.updated_at
         FROM orders o
         JOIN clients c ON c.id = o.customer_id
         WHERE o.id = ?",
    )
    .bind(id)
    .fetch_optional(&db.pool)
    .await?;
    let order = order.ok_or_else(|| CoreError::NotFound("Commande introuvable.".into()))?;
    let lines: Vec<OrderLineDto> = sqlx::query_as(
        "SELECT ol.id, ol.order_id, ol.product_id, p.name AS product_name, ol.variant_id,
                pv.name AS variant_name, pv.compatibility_class, ol.requested_unit,
                ol.requested_quantity, ol.base_quantity, ol.unit_price_xof, ol.line_total_xof,
                ol.discount_xof, ol.notes
         FROM order_lines ol
         JOIN products p ON p.id = ol.product_id
         JOIN product_variants pv ON pv.id = ol.variant_id
         WHERE ol.order_id = ? ORDER BY ol.id ASC",
    )
    .bind(id)
    .fetch_all(&db.pool)
    .await?;
    let allocations: Vec<OrderPackagingAllocationDto> = sqlx::query_as(
        "SELECT opa.id, opa.order_id, opa.packaging_asset_id, pa.name AS packaging_name,
                pa.compatibility_class, pa.capacity, opa.quantity, opa.is_consigned,
                opa.deposit_amount_xof, opa.provided_by, opa.returned_quantity, opa.notes
         FROM order_packaging_allocations opa
         JOIN packaging_assets pa ON pa.id = opa.packaging_asset_id
         WHERE opa.order_id = ? ORDER BY opa.id ASC",
    )
    .bind(id)
    .fetch_all(&db.pool)
    .await?;
    let links: Vec<OrderLinePackagingLinkDto> = sqlx::query_as(
        "SELECT l.id, l.order_line_id, l.order_packaging_allocation_id, l.units_in_packaging
         FROM order_line_packaging_links l
         JOIN order_lines ol ON ol.id = l.order_line_id
         WHERE ol.order_id = ? ORDER BY l.id ASC",
    )
    .bind(id)
    .fetch_all(&db.pool)
    .await?;
    let customer_deposits: Vec<CustomerDepositBalanceDto> =
        load_customer_deposits(&db.pool, order.customer_id).await?;
    Ok(OrderDetailDto {
        order,
        lines,
        allocations,
        links,
        customer_deposits,
    })
}
