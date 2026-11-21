// ============================================================================
// Requêtes de lecture et pagination des ventes
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{
    PaginatedSalesDto, SaleCancellationDto, SaleDepositDto, SaleDetailDto, SaleLineDto,
    SalePaymentDto, SaleReturnDto, SaleSummaryDto,
};

pub async fn get_sale_detail(db: &DepotDb, sale_id: i64) -> CoreResult<SaleDetailDto> {
    require_current_actor_permission(Permission::SalesRead)?;
    let sale = sqlx::query_as::<_, SaleSummaryDto>(
        "SELECT s.id, s.reference, s.client_id, COALESCE(c.name, 'Client Comptoir') AS client_name,
                s.sale_type, s.price_tier, s.subtotal_merchandise, s.discount_amount,
                s.total_merchandise, s.total_deposit, s.total_amount, s.paid_amount,
                COALESCE(cr.remaining_amount, 0) AS remaining_amount,
                (SELECT GROUP_CONCAT(DISTINCT pm.label)
                 FROM payments p JOIN payment_parts pp ON pp.payment_id = p.id JOIN payment_methods pm ON pm.code = pp.method_code
                 WHERE p.sale_id = s.id) AS payment_labels,
                s.status, s.notes, s.created_at
         FROM sales s
         LEFT JOIN clients c ON c.id = s.client_id
         LEFT JOIN customer_receivables cr ON cr.sale_id = s.id
         WHERE s.id = ?",
    )
    .bind(sale_id)
    .fetch_optional(&db.pool)
    .await?
    .ok_or_else(|| CoreError::Validation("Vente introuvable.".to_string()))?;

    let (client_code, client_phone, receivable_id, due_date): (
        Option<String>,
        Option<String>,
        Option<i64>,
        Option<String>,
    ) = sqlx::query_as(
        "SELECT c.code, c.phone, cr.id, cr.due_date
         FROM sales s
         LEFT JOIN clients c ON c.id = s.client_id
         LEFT JOIN customer_receivables cr ON cr.sale_id = s.id
         WHERE s.id = ?",
    )
    .bind(sale_id)
    .fetch_one(&db.pool)
    .await?;

    let lines = sqlx::query_as::<_, SaleLineDto>(
        "SELECT sl.id, sl.sale_id, sl.product_id, sl.packaging_id, sl.product_name, sl.packaging_name,
                sl.base_unit, sl.coefficient_milli, sl.quantity_milli, sl.base_quantity_milli,
                sl.unit_price, sl.discount_amount, sl.line_total,
                COALESCE((SELECT SUM(srl.base_quantity_milli) FROM sales_return_lines srl WHERE srl.sale_line_id = sl.id), 0) AS returned_base_milli
         FROM sale_lines sl
         WHERE sl.sale_id = ?",
    )
    .bind(sale_id)
    .fetch_all(&db.pool)
    .await?;

    let payments = sqlx::query_as::<_, SalePaymentDto>(
        "SELECT p.id, p.reference, pp.method_code, pm.label AS method_label, pp.amount AS part_amount, p.created_at
         FROM payments p
         JOIN payment_parts pp ON pp.payment_id = p.id
         JOIN payment_methods pm ON pm.code = pp.method_code
         WHERE p.sale_id = ?
         ORDER BY p.id ASC",
    )
    .bind(sale_id)
    .fetch_all(&db.pool)
    .await?;

    let deposits = sqlx::query_as::<_, SaleDepositDto>(
        "SELECT di.id, di.returnable_id, rpt.name AS packaging_name, rpt.code AS packaging_code,
                di.pieces, di.returned_pieces, di.unit_value, di.amount,
                CASE
                    WHEN rpt.kind = 'bottle' THEN (
                        SELECT sl.product_name || ' (' ||
                            CASE WHEN sl.base_quantity_milli % 1000 = 0
                                 THEN CAST(sl.base_quantity_milli / 1000 AS TEXT)
                                 ELSE rtrim(rtrim(printf('%.3f', sl.base_quantity_milli / 1000.0), '0'), '.')
                            END || ' ' || sl.base_unit || ')'
                        FROM sale_lines sl
                        WHERE sl.id = di.sale_line_id
                    )
                    ELSE (
                        SELECT GROUP_CONCAT(
                            sl.product_name || ' (' ||
                            CASE WHEN sl.base_quantity_milli % 1000 = 0
                                 THEN CAST(sl.base_quantity_milli / 1000 AS TEXT)
                                 ELSE rtrim(rtrim(printf('%.3f', sl.base_quantity_milli / 1000.0), '0'), '.')
                            END || ' ' || sl.base_unit || ')',
                            ' + '
                        )
                        FROM sale_lines sl
                        JOIN deposit_packaging_components dpc ON dpc.packaging_id = sl.packaging_id
                        WHERE sl.sale_id = di.sale_id AND dpc.returnable_id = di.returnable_id
                    )
                END AS expected_products
         FROM deposit_issues di
         JOIN returnable_packaging_types rpt ON rpt.id = di.returnable_id
         WHERE di.sale_id = ?",
    )
    .bind(sale_id)
    .fetch_all(&db.pool)
    .await?;

    let cancellation = sqlx::query_as::<_, SaleCancellationDto>(
        "SELECT id, reason, refund_method_code, refunded_amount, created_at FROM sales_cancellations WHERE sale_id = ?",
    )
    .bind(sale_id)
    .fetch_optional(&db.pool)
    .await?;

    let returns = sqlx::query_as::<_, SaleReturnDto>(
        "SELECT id, reference, credit_note_ref, total_amount, credit_reduction, refund_amount, reason, created_at
         FROM sales_returns WHERE sale_id = ? ORDER BY id DESC",
    )
    .bind(sale_id)
    .fetch_all(&db.pool)
    .await?;

    Ok(SaleDetailDto {
        sale,
        client_code,
        client_phone,
        receivable_id,
        due_date,
        lines,
        payments,
        deposits,
        cancellation,
        returns,
    })
}

pub async fn list_sales(
    db: &DepotDb,
    search: Option<&str>,
    status: Option<&str>,
    from_date: Option<&str>,
    to_date: Option<&str>,
    limit: i64,
    offset: i64,
) -> CoreResult<PaginatedSalesDto> {
    require_current_actor_permission(Permission::SalesRead)?;
    let ps = limit.clamp(1, 100);
    let page = (offset / ps) + 1;
    let pat = format!("%{}%", search.unwrap_or("").trim());
    let status_filter = status.filter(|s| *s != "all").unwrap_or("");
    let from_f = from_date.unwrap_or("").trim();
    let to_f = to_date.unwrap_or("").trim();

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*)
         FROM sales s
         LEFT JOIN clients c ON c.id = s.client_id
         WHERE (? = '' OR s.status = ?)
           AND (s.reference LIKE ? OR COALESCE(c.name, 'Client Comptoir') LIKE ?)
           AND (? = '' OR substr(s.created_at, 1, 10) >= ?)
           AND (? = '' OR substr(s.created_at, 1, 10) <= ?)",
    )
    .bind(status_filter)
    .bind(status_filter)
    .bind(&pat)
    .bind(&pat)
    .bind(from_f)
    .bind(from_f)
    .bind(to_f)
    .bind(to_f)
    .fetch_one(&db.pool)
    .await?;

    let items = sqlx::query_as::<_, SaleSummaryDto>(
        "SELECT s.id, s.reference, s.client_id, COALESCE(c.name, 'Client Comptoir') AS client_name,
                s.sale_type, s.price_tier, s.subtotal_merchandise, s.discount_amount,
                s.total_merchandise, s.total_deposit, s.total_amount, s.paid_amount,
                COALESCE(cr.remaining_amount, 0) AS remaining_amount,
                (SELECT GROUP_CONCAT(DISTINCT pm.label)
                 FROM payments p JOIN payment_parts pp ON pp.payment_id = p.id JOIN payment_methods pm ON pm.code = pp.method_code
                 WHERE p.sale_id = s.id) AS payment_labels,
                s.status, s.notes, s.created_at
         FROM sales s
         LEFT JOIN clients c ON c.id = s.client_id
         LEFT JOIN customer_receivables cr ON cr.sale_id = s.id
         WHERE (? = '' OR s.status = ?)
           AND (s.reference LIKE ? OR COALESCE(c.name, 'Client Comptoir') LIKE ?)
           AND (? = '' OR substr(s.created_at, 1, 10) >= ?)
           AND (? = '' OR substr(s.created_at, 1, 10) <= ?)
         ORDER BY s.id DESC
         LIMIT ? OFFSET ?",
    )
    .bind(status_filter)
    .bind(status_filter)
    .bind(&pat)
    .bind(&pat)
    .bind(from_f)
    .bind(from_f)
    .bind(to_f)
    .bind(to_f)
    .bind(ps)
    .bind(offset)
    .fetch_all(&db.pool)
    .await?;

    let total_pages = ((total + ps - 1) / ps).max(1);
    Ok(PaginatedSalesDto {
        items,
        total,
        page,
        page_size: ps,
        total_pages,
    })
}
