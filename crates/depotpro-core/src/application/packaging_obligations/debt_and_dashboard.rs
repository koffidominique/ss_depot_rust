// ============================================================================
// Règlement des créances emballages & tableau de bord séparé par client
// ============================================================================

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{get_client_packaging_financial_balance, insert_ledger_entry, list_obligations};

#[derive(Debug, Deserialize)]
pub struct PayPackagingDebtInput {
    pub client_id: i64,
    pub parts: Vec<PayPackagingPart>,
    pub request_key: String,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PayPackagingPart {
    pub method_code: String,
    pub amount: i64,
}

#[derive(Debug, Serialize)]
pub struct PayPackagingDebtDto {
    pub client_id: i64,
    pub packaging_financial_balance: i64,
}

#[derive(Debug, Serialize)]
pub struct ClientPackagingDashboardDto {
    pub client_id: i64,
    /// Dette commerciale (créance de marchandises) — registre customer_receivables.
    pub commercial_debt: i64,
    /// Créance financière d'emballages exigible (après conversion uniquement).
    pub packaging_financial_debt: i64,
    /// Obligations physiques en attente : quantité de pièces à restituer.
    pub pending_pieces: i64,
    /// Valeur indicative des emballages en attente — JAMAIS exigible avant conversion.
    pub pending_reference_value: i64,
    /// Total financier réellement dû (commercial + créances d'emballages converties).
    pub total_financial_due: i64,
}

/// Règlement d'une créance financière d'emballages (registre distinct du compte
/// commercial). Idempotent via request_key.
pub async fn pay_packaging_financial_debt(
    db: &DepotDb,
    input: PayPackagingDebtInput,
    actor: Option<&str>,
) -> CoreResult<PayPackagingDebtDto> {
    if input.request_key.trim().is_empty() {
        return Err(CoreError::Validation(
            "Clé d'idempotence requise.".to_string(),
        ));
    }
    if input.parts.is_empty() {
        return Err(CoreError::Validation(
            "Indiquez au moins un moyen de paiement.".to_string(),
        ));
    }
    let mut g = db.begin_write().await?;
    let tx0 = &mut g.1;

    let existing: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM customer_packaging_financial_ledger
         WHERE request_key = ? AND entry_type = 'payment'",
    )
    .bind(input.request_key.trim())
    .fetch_optional(&mut **tx0)
    .await?;
    if existing.is_some() {
        let bal = get_client_packaging_financial_balance(db, input.client_id).await?;
        return Ok(PayPackagingDebtDto {
            client_id: input.client_id,
            packaging_financial_balance: bal.packaging_financial_balance,
        });
    }

    let tx = &mut g.1;
    let mut total = 0i64;
    let mut parts: Vec<(String, i64)> = Vec::new();
    for p in &input.parts {
        if p.amount <= 0 {
            return Err(CoreError::Validation(
                "Le montant payé doit être strictement positif.".to_string(),
            ));
        }
        let pm: Option<(String, i64)> =
            sqlx::query_as("SELECT code, active FROM payment_methods WHERE code = ?")
                .bind(&p.method_code)
                .fetch_optional(&mut **tx)
                .await?;
        let (code, active) =
            pm.ok_or_else(|| CoreError::Validation("Moyen de paiement invalide.".to_string()))?;
        if active == 0 {
            return Err(CoreError::Validation(
                "Moyen de paiement inactif.".to_string(),
            ));
        }
        total = total.checked_add(p.amount).ok_or_else(|| {
            CoreError::Validation("Débordement du montant du règlement.".to_string())
        })?;
        parts.push((code, p.amount));
    }
    if total <= 0 {
        return Err(CoreError::Validation(
            "Le règlement doit être positif.".to_string(),
        ));
    }
    let balance = get_client_packaging_financial_balance(db, input.client_id)
        .await?
        .packaging_financial_balance;
    if total > balance {
        return Err(CoreError::Validation(format!(
            "Le règlement ({total}) dépasse la créance d'emballages restante ({balance})."
        )));
    }

    insert_ledger_entry(
        tx,
        input.request_key.trim(),
        input.client_id,
        None,
        "payment",
        total,
        "credit",
        actor,
        input.note.clone(),
    )
    .await?;
    sqlx::query(
        "INSERT INTO audit_logs (entity_type, entity_id, action, details, actor_name)
         VALUES ('customer_packaging_financial_ledger', ?, 'PAY_PACKAGING_DEBT', ?, ?)",
    )
    .bind(input.client_id.to_string())
    .bind(format!("Règlement créance d'emballages : {total} FCFA"))
    .bind(actor)
    .execute(&mut **tx)
    .await?;
    g.1.commit().await?;
    let bal = get_client_packaging_financial_balance(db, input.client_id).await?;
    Ok(PayPackagingDebtDto {
        client_id: input.client_id,
        packaging_financial_balance: bal.packaging_financial_balance,
    })
}

/// Tableau de bord emballages d'un client : soldes strictement séparés
/// (MAJ.md §6.2 et §11.2 — la valeur indicative n'est jamais une dette exigible).
pub async fn get_client_packaging_dashboard(
    db: &DepotDb,
    client_id: i64,
) -> CoreResult<ClientPackagingDashboardDto> {
    let commercial_debt: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(remaining_amount), 0) FROM customer_receivables
         WHERE client_id = ? AND status IN ('open', 'partial')",
    )
    .bind(client_id)
    .fetch_one(&db.pool)
    .await?;
    let packaging_financial_debt = get_client_packaging_financial_balance(db, client_id)
        .await?
        .packaging_financial_balance;
    let obligations = list_obligations(db, Some(client_id)).await?;
    let pending_pieces: i64 = obligations.iter().map(|o| o.pending_pieces).sum();
    let pending_reference_value: i64 = obligations.iter().map(|o| o.total_reference_value).sum();
    Ok(ClientPackagingDashboardDto {
        client_id,
        commercial_debt,
        packaging_financial_debt,
        pending_pieces,
        pending_reference_value,
        total_financial_due: commercial_debt + packaging_financial_debt,
    })
}
