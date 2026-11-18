use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::products::{deserialize_nullable_opt, sanitize_image_path};
use crate::application::sales::audit_log_tx;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardKpisDto {
    pub revenue_merchandise: i64,
    pub deposits_total: i64,
    pub sales_count: i64,
    pub collections_total: i64,
    pub receivables_total: i64,
    pub receivables_count: i64,
    pub overdue_receivables_total: i64,
    pub overdue_receivables_count: i64,
    pub supplier_debts_total: i64,
    pub supplier_debts_count: i64,
    pub overdue_supplier_debts_total: i64,
    pub overdue_supplier_debts_count: i64,
    pub expenses_total: i64,
    pub cash_session_open: bool,
    pub cash_session_reference: Option<String>,
    pub cash_physical_theoretical: i64,
    pub digital_session_total: i64,
    pub low_stock_count: i64,
    pub out_of_stock_count: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct LowStockProductDto {
    pub id: i64,
    pub reference: String,
    pub name: String,
    pub base_unit: String,
    pub stock_milli: i64,
    pub min_stock_milli: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct TopProductDto {
    pub product_id: i64,
    pub product_name: String,
    pub base_unit: String,
    pub total_base_milli: i64,
    pub total_revenue: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct SalesSeriesPointDto {
    pub day: String,
    pub count: i64,
    pub revenue: i64,
    pub collected: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct RecentAuditDto {
    pub id: i64,
    pub action: String,
    pub entity_type: String,
    pub details: String,
    pub actor_user_id: Option<String>,
    pub actor_name: Option<String>,
    pub actor_role: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardDataDto {
    pub kpis: DashboardKpisDto,
    pub low_stock_products: Vec<LowStockProductDto>,
    pub top_products: Vec<TopProductDto>,
    pub sales_series: Vec<SalesSeriesPointDto>,
    pub recent_audit: Vec<RecentAuditDto>,
}

#[derive(Debug, Serialize)]
pub struct CommercialReportDto {
    pub count: i64,
    pub merchandise_revenue: i64,
    pub deposit_billed: i64,
    pub paid_amount: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfitabilityDto {
    pub known_cost_total: i64,
    pub known_cost_revenue: i64,
    pub known_gross_margin: i64,
    pub unknown_cost_lines: i64,
    pub expenses_total: i64,
    pub net_known_result: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PaymentBreakdownDto {
    pub code: String,
    pub label: String,
    pub is_cash: i64,
    pub total_in: i64,
    pub total_out: i64,
}

#[derive(Debug, Serialize)]
pub struct StockReportDto {
    pub product_count: i64,
    pub unknown_cost_products: i64,
    #[serde(rename = "knownValuationFcfa")]
    pub known_valuation_fcfa: i64,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DailySalePointDto {
    pub day: String,
    pub count: i64,
    pub revenue: i64,
    pub deposit: i64,
    pub collected: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportsOverviewDto {
    pub commercial: CommercialReportDto,
    pub profitability: ProfitabilityDto,
    pub payment_breakdown: Vec<PaymentBreakdownDto>,
    pub stock: StockReportDto,
    pub daily_sales: Vec<DailySalePointDto>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct AppSettingsDto {
    pub company_name: String,
    pub company_legal_name: Option<String>,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub city: Option<String>,
    pub country: Option<String>,
    pub currency: String,
    pub allow_negative_stock: i64,
    pub invoice_prefix: String,
    pub sale_prefix: String,
    pub purchase_prefix: String,
    pub order_prefix: String,
    pub receipt_prefix: String,
    pub credit_note_prefix: String,
    pub theme: String,
    pub logo_path: Option<String>,
    pub setup_completed: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PaymentMethodDto {
    pub code: String,
    pub label: String,
    pub is_cash: i64,
    pub active: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsBundleDto {
    pub settings: AppSettingsDto,
    pub payment_methods: Vec<PaymentMethodDto>,
}

#[derive(Debug, Default, Deserialize)]
pub struct UpdateSettingsInput {
    pub company_name: Option<String>,
    pub company_legal_name: Option<String>,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub city: Option<String>,
    pub country: Option<String>,
    pub allow_negative_stock: Option<bool>,
    pub invoice_prefix: Option<String>,
    pub sale_prefix: Option<String>,
    pub purchase_prefix: Option<String>,
    pub order_prefix: Option<String>,
    pub receipt_prefix: Option<String>,
    pub credit_note_prefix: Option<String>,
    pub theme: Option<String>,
    #[serde(default, deserialize_with = "deserialize_nullable_opt")]
    pub logo_path: Option<Option<String>>,
    pub setup_completed: Option<bool>,
}

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
         ORDER BY total_in DESC",
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

pub async fn get_settings(db: &DepotDb) -> CoreResult<AppSettingsDto> {
    require_current_actor_permission(Permission::SettingsRead)?;
    let row = sqlx::query_as::<_, AppSettingsDto>(
        "SELECT company_name, company_legal_name, address, phone, email, city, country, currency,
                allow_negative_stock, invoice_prefix, sale_prefix, purchase_prefix, order_prefix,
                receipt_prefix, credit_note_prefix, theme, logo_path, setup_completed
         FROM app_settings WHERE id = 1",
    )
    .fetch_one(&db.pool)
    .await?;
    Ok(row)
}

pub async fn get_settings_bundle(db: &DepotDb) -> CoreResult<SettingsBundleDto> {
    let settings = get_settings(db).await?;
    let payment_methods = sqlx::query_as::<_, PaymentMethodDto>(
        "SELECT code, label, is_cash, active FROM payment_methods ORDER BY is_cash DESC, label ASC",
    )
    .fetch_all(&db.pool)
    .await?;
    Ok(SettingsBundleDto {
        settings,
        payment_methods,
    })
}

pub async fn update_settings(
    db: &DepotDb,
    input: UpdateSettingsInput,
) -> CoreResult<SettingsBundleDto> {
    require_current_actor_permission(Permission::SettingsWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let cur = get_settings(db).await?;

    let next_name = input
        .company_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(&cur.company_name)
        .to_string();
    let next_neg = input
        .allow_negative_stock
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(cur.allow_negative_stock);
    let next_theme = match input.theme.as_deref() {
        Some("dark") => "dark",
        Some("light") => "light",
        _ => cur.theme.as_str(),
    };
    let clean_opt = |next: Option<String>, prev: Option<String>| -> Option<String> {
        match next {
            Some(v) => {
                let t = v.trim().to_string();
                if t.is_empty() {
                    None
                } else {
                    Some(t)
                }
            }
            None => prev,
        }
    };
    let prefix_or = |next: Option<String>, prev: String| -> String {
        next.as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_uppercase)
            .unwrap_or(prev)
    };

    let has_identity_update = input.company_name.is_some()
        || input.company_legal_name.is_some()
        || input.address.is_some()
        || input.phone.is_some()
        || input.email.is_some()
        || input.city.is_some()
        || input.country.is_some()
        || input.logo_path.is_some();
    let next_setup_completed = match input.setup_completed {
        Some(v) => i64::from(v),
        None if has_identity_update => 1,
        None => cur.setup_completed,
    };

    let next_logo_path = match input.logo_path {
        Some(opt) => sanitize_image_path(opt.as_deref())?,
        None => cur.logo_path,
    };

    sqlx::query(
        "UPDATE app_settings
         SET company_name = ?, company_legal_name = ?, address = ?, phone = ?, email = ?, city = ?, country = ?,
             allow_negative_stock = ?, invoice_prefix = ?, sale_prefix = ?, purchase_prefix = ?, order_prefix = ?,
             receipt_prefix = ?, credit_note_prefix = ?, theme = ?, logo_path = ?, setup_completed = ?, updated_at = datetime('now')
         WHERE id = 1",
    )
    .bind(&next_name)
    .bind(clean_opt(input.company_legal_name, cur.company_legal_name))
    .bind(clean_opt(input.address, cur.address))
    .bind(clean_opt(input.phone, cur.phone))
    .bind(clean_opt(input.email, cur.email))
    .bind(clean_opt(input.city, cur.city))
    .bind(clean_opt(input.country, cur.country))
    .bind(next_neg)
    .bind(prefix_or(input.invoice_prefix, cur.invoice_prefix))
    .bind(prefix_or(input.sale_prefix, cur.sale_prefix))
    .bind(prefix_or(input.purchase_prefix, cur.purchase_prefix))
    .bind(prefix_or(input.order_prefix, cur.order_prefix))
    .bind(prefix_or(input.receipt_prefix, cur.receipt_prefix))
    .bind(prefix_or(input.credit_note_prefix, cur.credit_note_prefix))
    .bind(next_theme)
    .bind(next_logo_path)
    .bind(next_setup_completed)
    .execute(&mut *tx)
    .await?;

    audit_log_tx(
        &mut tx,
        "UPDATE_SETTINGS",
        "app_settings",
        Some("1".to_string()),
        "Mise à jour paramètres",
    )
    .await?;
    tx.commit().await?;
    get_settings_bundle(db).await
}

pub async fn add_payment_method(db: &DepotDb, label: &str) -> CoreResult<PaymentMethodDto> {
    require_current_actor_permission(Permission::SettingsWrite)?;
    let clean = label.trim();
    if clean.is_empty() {
        return Err(CoreError::Validation(
            "Le libellé du moyen de paiement est requis.".to_string(),
        ));
    }
    let slug: String = clean
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    let code = format!(
        "{}_{}",
        slug.trim_matches('_').chars().take(16).collect::<String>(),
        chrono::Utc::now().timestamp_millis() % 100_000
    );

    let (_guard, mut tx) = db.begin_write().await?;
    sqlx::query("INSERT INTO payment_methods (code, label, is_cash, active) VALUES (?, ?, 0, 1)")
        .bind(&code)
        .bind(clean)
        .execute(&mut *tx)
        .await?;
    audit_log_tx(
        &mut tx,
        "ADD_PAYMENT_METHOD",
        "payment_methods",
        Some(code.clone()),
        &format!("Ajout moyen de paiement : {clean}"),
    )
    .await?;
    tx.commit().await?;

    sqlx::query_as::<_, PaymentMethodDto>(
        "SELECT code, label, is_cash, active FROM payment_methods WHERE code = ?",
    )
    .bind(code)
    .fetch_one(&db.pool)
    .await
    .map_err(Into::into)
}

pub async fn toggle_payment_method(
    db: &DepotDb,
    code: &str,
    active: bool,
) -> CoreResult<PaymentMethodDto> {
    require_current_actor_permission(Permission::SettingsWrite)?;
    if code == "cash" && !active {
        return Err(CoreError::Validation(
            "Le moyen Espèces (cash) ne peut jamais être désactivé.".to_string(),
        ));
    }
    let (_guard, mut tx) = db.begin_write().await?;
    sqlx::query("UPDATE payment_methods SET active = ? WHERE code = ?")
        .bind(if active { 1_i64 } else { 0_i64 })
        .bind(code)
        .execute(&mut *tx)
        .await?;
    audit_log_tx(
        &mut tx,
        "TOGGLE_PAYMENT_METHOD",
        "payment_methods",
        Some(code.to_string()),
        &format!("Statut actif = {active}"),
    )
    .await?;
    tx.commit().await?;

    sqlx::query_as::<_, PaymentMethodDto>(
        "SELECT code, label, is_cash, active FROM payment_methods WHERE code = ?",
    )
    .bind(code)
    .fetch_optional(&db.pool)
    .await?
    .ok_or_else(|| CoreError::Validation("Moyen de paiement introuvable.".to_string()))
}
