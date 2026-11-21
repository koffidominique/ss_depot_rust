// ============================================================================
// Indicateurs et séries du tableau de bord principal
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::CoreResult;
use crate::infrastructure::db::DepotDb;

use super::{
    DashboardDataDto, DashboardKpisDto, LowStockProductDto, RecentAuditDto, SalesSeriesPointDto,
    TopProductDto,
};

pub async fn get_dashboard_kpis(db: &DepotDb) -> CoreResult<DashboardKpisDto> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let (sales_count, revenue_merchandise, deposits_total): (i64, i64, i64) = sqlx::query_as(
        "SELECT COUNT(*), COALESCE(SUM(total_merchandise), 0), COALESCE(SUM(total_deposit), 0)
         FROM sales WHERE status != 'cancelled'",
    )
    .fetch_one(&db.pool)
    .await?;

    let collections_total: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount), 0) FROM cash_movements WHERE direction = 'in'",
    )
    .fetch_one(&db.pool)
    .await?;

    let (receivables_total, receivables_count): (i64, i64) = sqlx::query_as(
        "SELECT COALESCE(SUM(remaining_amount), 0), COUNT(*) FROM customer_receivables WHERE status IN ('open', 'partial')",
    )
    .fetch_one(&db.pool)
    .await?;

    let (overdue_receivables_total, overdue_receivables_count): (i64, i64) = sqlx::query_as(
        "SELECT COALESCE(SUM(remaining_amount), 0), COUNT(*)
         FROM customer_receivables
         WHERE status IN ('open', 'partial') AND remaining_amount > 0 AND due_date IS NOT NULL AND date(due_date) < date('now')",
    )
    .fetch_one(&db.pool)
    .await?;

    let (supplier_debts_total, supplier_debts_count): (i64, i64) = sqlx::query_as(
        "SELECT COALESCE(SUM(remaining_amount), 0), COUNT(*) FROM supplier_debts WHERE status IN ('open', 'partial')",
    )
    .fetch_one(&db.pool)
    .await?;

    let (overdue_supplier_debts_total, overdue_supplier_debts_count): (i64, i64) = sqlx::query_as(
        "SELECT COALESCE(SUM(remaining_amount), 0), COUNT(*)
         FROM supplier_debts
         WHERE status IN ('open', 'partial') AND remaining_amount > 0 AND due_date IS NOT NULL AND date(due_date) < date('now')",
    )
    .fetch_one(&db.pool)
    .await?;

    let expenses_total: i64 = sqlx::query_scalar("SELECT COALESCE(SUM(amount), 0) FROM expenses")
        .fetch_one(&db.pool)
        .await?;

    let open_session: Option<(i64, String, i64)> = sqlx::query_as(
        "SELECT id, reference, opening_cash FROM cash_sessions WHERE status = 'open' LIMIT 1",
    )
    .fetch_optional(&db.pool)
    .await?;

    let mut cash_physical_theoretical = 0;
    let mut digital_session_total = 0;
    let mut cash_session_reference = None;
    let cash_session_open = open_session.is_some();

    if let Some((sid, sref, opening_cash)) = open_session {
        cash_session_reference = Some(sref);
        let cash_net: i64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)
             FROM cash_movements WHERE session_id = ? AND method_code = 'cash'",
        )
        .bind(sid)
        .fetch_one(&db.pool)
        .await?;
        cash_physical_theoretical = opening_cash + cash_net;

        digital_session_total = sqlx::query_scalar(
            "SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)
             FROM cash_movements WHERE session_id = ? AND method_code != 'cash'",
        )
        .bind(sid)
        .fetch_one(&db.pool)
        .await?;
    }

    let out_of_stock_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM products WHERE is_active = 1 AND stock_milli <= 0",
    )
    .fetch_one(&db.pool)
    .await?;

    let low_stock_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM products WHERE is_active = 1 AND stock_milli > 0 AND stock_milli <= min_stock_milli",
    )
    .fetch_one(&db.pool)
    .await?;

    Ok(DashboardKpisDto {
        revenue_merchandise,
        deposits_total,
        sales_count,
        collections_total,
        receivables_total,
        receivables_count,
        overdue_receivables_total,
        overdue_receivables_count,
        supplier_debts_total,
        supplier_debts_count,
        overdue_supplier_debts_total,
        overdue_supplier_debts_count,
        expenses_total,
        cash_session_open,
        cash_session_reference,
        cash_physical_theoretical,
        digital_session_total,
        low_stock_count,
        out_of_stock_count,
    })
}

pub async fn get_dashboard_data(db: &DepotDb) -> CoreResult<DashboardDataDto> {
    let kpis = get_dashboard_kpis(db).await?;

    let low_stock_products = sqlx::query_as::<_, LowStockProductDto>(
        "SELECT id, reference, name, base_unit, stock_milli, min_stock_milli
         FROM products WHERE is_active = 1 AND stock_milli <= min_stock_milli
         ORDER BY stock_milli ASC LIMIT 10",
    )
    .fetch_all(&db.pool)
    .await?;

    let top_products = sqlx::query_as::<_, TopProductDto>(
        "SELECT sl.product_id, sl.product_name, sl.base_unit,
                SUM(sl.base_quantity_milli) AS total_base_milli,
                SUM(sl.line_total) AS total_revenue
         FROM sale_lines sl
         JOIN sales s ON s.id = sl.sale_id
         WHERE s.status != 'cancelled'
         GROUP BY sl.product_id, sl.product_name, sl.base_unit
         ORDER BY total_revenue DESC
         LIMIT 6",
    )
    .fetch_all(&db.pool)
    .await?;

    let sales_series = sqlx::query_as::<_, SalesSeriesPointDto>(
        "SELECT substr(created_at, 1, 10) AS day,
                COUNT(*) AS count,
                COALESCE(SUM(total_merchandise), 0) AS revenue,
                COALESCE(SUM(paid_amount), 0) AS collected
         FROM sales
         WHERE status != 'cancelled'
         GROUP BY substr(created_at, 1, 10)
         ORDER BY day ASC
         LIMIT 30",
    )
    .fetch_all(&db.pool)
    .await?;

    let recent_audit = sqlx::query_as::<_, RecentAuditDto>(
        "SELECT id, action, entity_type, details, actor_user_id, actor_name, actor_role, created_at
         FROM audit_logs ORDER BY id DESC LIMIT 8",
    )
    .fetch_all(&db.pool)
    .await?;

    Ok(DashboardDataDto {
        kpis,
        low_stock_products,
        top_products,
        sales_series,
        recent_audit,
    })
}
