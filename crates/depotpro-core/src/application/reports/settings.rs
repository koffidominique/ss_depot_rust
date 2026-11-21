// ============================================================================
// Paramètres applicatifs et moyens de paiement
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::products::sanitize_image_path;
use crate::application::sales::audit_log_tx;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{AppSettingsDto, PaymentMethodDto, SettingsBundleDto, UpdateSettingsInput};

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
