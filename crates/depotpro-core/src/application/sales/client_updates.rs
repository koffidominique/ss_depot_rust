// ============================================================================
// Mise à jour des clients et de leurs politiques de crédit
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::domain::money::Money;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::clients::list_clients;
use super::{
    audit_log_tx, ClientCreditSettingsDto, ClientSummaryDto, UpdateClientInput,
    UpdateCreditPolicyInput,
};

pub async fn update_client(
    db: &DepotDb,
    client_id: i64,
    input: UpdateClientInput,
) -> CoreResult<ClientSummaryDto> {
    require_current_actor_permission(Permission::SalesWrite)?;
    type ExistingClientRow = (
        String,
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        i64,
    );
    let (_guard, mut tx) = db.begin_write().await?;
    let existing: Option<ExistingClientRow> = sqlx::query_as(
        "SELECT code, name, client_type, phone, address, city, email, contact_person, is_active
         FROM clients WHERE id = ?",
    )
    .bind(client_id)
    .fetch_optional(&mut *tx)
    .await?;

    let (
        code,
        prev_name,
        prev_type,
        prev_phone,
        prev_address,
        prev_city,
        prev_email,
        prev_contact,
        prev_active,
    ) = existing.ok_or_else(|| CoreError::Validation("Client introuvable.".to_string()))?;

    let name = match input.name {
        Some(n) => {
            let clean = n.trim().to_string();
            if clean.is_empty() {
                return Err(CoreError::Validation(
                    "Le nom du client est obligatoire.".to_string(),
                ));
            }
            clean
        }
        None => prev_name,
    };
    let client_type = match input.client_type {
        Some(t) => {
            if !matches!(t.as_str(), "particulier" | "professionnel") {
                return Err(CoreError::Validation(
                    "Type de client invalide.".to_string(),
                ));
            }
            t
        }
        None => prev_type,
    };

    let opt_text = |opt: Option<Option<String>>, prev: Option<String>| -> Option<String> {
        match opt {
            None => prev,
            Some(None) => None,
            Some(Some(s)) => {
                let t = s.trim().to_string();
                if t.is_empty() {
                    None
                } else {
                    Some(t)
                }
            }
        }
    };

    let phone = opt_text(input.phone, prev_phone);
    let address = opt_text(input.address, prev_address);
    let city = opt_text(input.city, prev_city);
    let email = opt_text(input.email, prev_email);
    let contact_person = opt_text(input.contact_person, prev_contact);
    let is_active = match input.is_active {
        Some(v) => {
            if v {
                1
            } else {
                0
            }
        }
        None => prev_active,
    };

    sqlx::query(
        "UPDATE clients
         SET name = ?, client_type = ?, phone = ?, address = ?, city = ?, email = ?, contact_person = ?, is_active = ?
         WHERE id = ?",
    )
    .bind(&name)
    .bind(&client_type)
    .bind(&phone)
    .bind(&address)
    .bind(&city)
    .bind(&email)
    .bind(&contact_person)
    .bind(is_active)
    .bind(client_id)
    .execute(&mut *tx)
    .await?;

    audit_log_tx(
        &mut tx,
        "UPDATE_CLIENT",
        "clients",
        Some(client_id.to_string()),
        &format!("{code} — {name}"),
    )
    .await?;
    tx.commit().await?;

    list_clients(db, Some(&code))
        .await?
        .into_iter()
        .find(|c| c.id == client_id)
        .ok_or_else(|| CoreError::Internal("Client introuvable après mise à jour.".to_string()))
}

pub async fn update_client_credit_policy(
    db: &DepotDb,
    client_id: i64,
    input: UpdateCreditPolicyInput,
) -> CoreResult<ClientCreditSettingsDto> {
    require_current_actor_permission(Permission::SalesWrite)?;
    if !matches!(
        input.credit_policy.as_str(),
        "forbidden" | "limited" | "unlimited"
    ) {
        return Err(CoreError::Validation(
            "Politique de crédit explicite requise.".to_string(),
        ));
    }
    let limit = if input.credit_policy == "limited" {
        let raw = input
            .credit_limit
            .ok_or_else(|| CoreError::Validation("Plafond de crédit requis.".to_string()))?;
        Some(Money::from_non_negative(raw, "Plafond de crédit")?.value())
    } else {
        None
    };
    let terms = input.payment_terms_days.unwrap_or(0);
    if terms < 0 {
        return Err(CoreError::Validation(
            "Délai de paiement invalide.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    let exists: Option<(i64,)> = sqlx::query_as("SELECT id FROM clients WHERE id = ?")
        .bind(client_id)
        .fetch_optional(&mut *tx)
        .await?;
    if exists.is_none() {
        return Err(CoreError::Validation("Client introuvable.".to_string()));
    }

    sqlx::query(
        "INSERT INTO client_credit_settings (client_id, policy, credit_limit, payment_terms_days, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(client_id) DO UPDATE SET
           policy = excluded.policy,
           credit_limit = excluded.credit_limit,
           payment_terms_days = excluded.payment_terms_days,
           updated_at = datetime('now')",
    )
    .bind(client_id)
    .bind(&input.credit_policy)
    .bind(limit)
    .bind(terms)
    .execute(&mut *tx)
    .await?;

    audit_log_tx(
        &mut tx,
        "UPDATE_CLIENT_CREDIT",
        "clients",
        Some(client_id.to_string()),
        &format!("Politique {}", input.credit_policy),
    )
    .await?;
    tx.commit().await?;

    let updated = sqlx::query_as::<_, ClientCreditSettingsDto>(
        "SELECT client_id, policy, credit_limit, payment_terms_days, updated_at
         FROM client_credit_settings WHERE client_id = ?",
    )
    .bind(client_id)
    .fetch_one(&db.pool)
    .await?;
    Ok(updated)
}
