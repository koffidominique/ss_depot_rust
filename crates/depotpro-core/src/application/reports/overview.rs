// ============================================================================
// Rapports commerciaux, rentabilité, paiements et valorisation du stock
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::CoreResult;
use crate::infrastructure::db::DepotDb;

use super::{
    CommercialReportDto, DailySalePointDto, PaymentBreakdownDto, ProfitabilityDto,
    ReportsOverviewDto, StockReportDto,
};

pub async fn get_reports_overview(
    db: &DepotDb,
    from_date: Option<&str>,
    to_date: Option<&str>,
) -> CoreResult<ReportsOverviewDto> {
    require_current_actor_permission(Permission::ReportsRead)?;
    let from = from_date
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("");
    let to = to_date
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("9999-12-31");

    let (commercial_count, merchandise_revenue, deposit_billed, paid_amount): (i64, i64, i64, i64) =
        sqlx::query_as(
            "SELECT COUNT(*),
                COALESCE(SUM(total_merchandise), 0),
                COALESCE(SUM(total_deposit), 0),
                COALESCE(SUM(paid_amount), 0)
         FROM sales
         WHERE status != 'cancelled'
           AND substr(created_at, 1, 10) >= ?
           AND substr(created_at, 1, 10) <= ?",
        )
        .bind(from)
        .bind(to)
        .fetch_one(&db.pool)
        .await?;

    let lines: Vec<(i64, i64, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT sl.base_quantity_milli, sl.line_total, sl.cost_num, sl.cost_den
         FROM sale_lines sl
         JOIN sales s ON s.id = sl.sale_id
         WHERE s.status != 'cancelled'
           AND substr(s.created_at, 1, 10) >= ?
           AND substr(s.created_at, 1, 10) <= ?",
    )
    .bind(from)
    .bind(to)
    .fetch_all(&db.pool)
    .await?;

    let mut known_cost_total: i64 = 0;
    let mut known_cost_revenue: i64 = 0;
    let mut unknown_cost_lines: i64 = 0;

    for (base_qty_milli, line_total, cost_num, cost_den) in lines {
        let parsed = cost_num
            .as_deref()
            .and_then(|n| n.parse::<i128>().ok())
            .zip(cost_den.as_deref().and_then(|d| d.parse::<i128>().ok()));
        if let Some((num, den)) = parsed {
            if den > 0 {
                let scaled = (base_qty_milli as i128) * num;
                let denom = den * 1000_i128;
                let line_cost = ((scaled + denom / 2) / denom) as i64;
                known_cost_total += line_cost;
                known_cost_revenue += line_total;
                continue;
            }
        }
        unknown_cost_lines += 1;
    }

    let expenses_total: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount), 0)
         FROM expenses
         WHERE substr(COALESCE(expense_date, created_at), 1, 10) >= ?
           AND substr(COALESCE(expense_date, created_at), 1, 10) <= ?",
    )
    .bind(from)
    .bind(to)
    .fetch_one(&db.pool)
    .await?;

    let payment_breakdown = sqlx::query_as::<_, PaymentBreakdownDto>(
        "SELECT pm.code, pm.label, pm.is_cash,
                COALESCE(SUM(CASE WHEN cm.direction = 'in' THEN cm.amount ELSE 0 END), 0) AS total_in,
                COALESCE(SUM(CASE WHEN cm.direction = 'out' THEN cm.amount ELSE 0 END), 0) AS total_out
         FROM payment_methods pm
         LEFT JOIN cash_movements cm ON cm.method_code = pm.code
           AND substr(cm.created_at, 1, 10) >= ?
           AND substr(cm.created_at, 1, 10) <= ?
         GROUP BY pm.code, pm.label, pm.is_cash
         ORDER BY total_in DESC, pm.code ASC",
    )
    .bind(from)
    .bind(to)
    .fetch_all(&db.pool)
    .await?;

    let (product_count, unknown_cost_products): (i64, i64) = sqlx::query_as(
        "SELECT COUNT(*),
                COALESCE(SUM(CASE WHEN average_cost_num IS NULL OR average_cost_den IS NULL THEN 1 ELSE 0 END), 0)
         FROM products WHERE is_active = 1",
    )
    .fetch_one(&db.pool)
    .await?;

    let valued_rows: Vec<(i64, String, String)> = sqlx::query_as(
        "SELECT stock_milli, average_cost_num, average_cost_den
         FROM products
         WHERE is_active = 1 AND average_cost_num IS NOT NULL AND average_cost_den IS NOT NULL",
    )
    .fetch_all(&db.pool)
    .await?;
    let mut known_valuation_fcfa: i64 = 0;
    for (stock_milli, num_s, den_s) in valued_rows {
        if let (Ok(num), Ok(den)) = (num_s.parse::<i128>(), den_s.parse::<i128>()) {
            if den > 0 {
                let denom = den * 1000_i128;
                known_valuation_fcfa += (((stock_milli as i128) * num + denom / 2) / denom) as i64;
            }
        }
    }

    let daily_sales = sqlx::query_as::<_, DailySalePointDto>(
        "SELECT substr(created_at, 1, 10) AS day,
                COUNT(*) AS count,
                COALESCE(SUM(total_merchandise), 0) AS revenue,
                COALESCE(SUM(total_deposit), 0) AS deposit,
                COALESCE(SUM(paid_amount), 0) AS collected
         FROM sales
         WHERE status != 'cancelled'
           AND substr(created_at, 1, 10) >= ?
           AND substr(created_at, 1, 10) <= ?
         GROUP BY substr(created_at, 1, 10)
         ORDER BY day ASC",
    )
    .bind(from)
    .bind(to)
    .fetch_all(&db.pool)
    .await?;

    let known_gross_margin = known_cost_revenue - known_cost_total;
    Ok(ReportsOverviewDto {
        commercial: CommercialReportDto {
            count: commercial_count,
            merchandise_revenue,
            deposit_billed,
            paid_amount,
        },
        profitability: ProfitabilityDto {
            known_cost_total,
            known_cost_revenue,
            known_gross_margin,
            unknown_cost_lines,
            expenses_total,
            net_known_result: known_gross_margin - expenses_total,
        },
        payment_breakdown,
        stock: StockReportDto {
            product_count,
            unknown_cost_products,
            known_valuation_fcfa,
        },
        daily_sales,
    })
}
