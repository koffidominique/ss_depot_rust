// ============================================================================
// Helpers transactionnels partagés (audit, session de caisse, solde espèces)
// ============================================================================

use sqlx::{Sqlite, Transaction};

use crate::application::auth::current_actor;
use crate::domain::money::Money;
use crate::error::{CoreError, CoreResult};

pub(crate) async fn audit_log_tx(
    tx: &mut Transaction<'_, Sqlite>,
    action: &str,
    entity_type: &str,
    entity_id: Option<String>,
    details: &str,
) -> CoreResult<()> {
    let actor = current_actor();
    sqlx::query(
        "INSERT INTO audit_logs (action, entity_type, entity_id, details, actor_user_id, actor_name, actor_role)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(action)
    .bind(entity_type)
    .bind(entity_id)
    .bind(details)
    .bind(actor.as_ref().map(|a| a.user_id.clone()))
    .bind(actor.as_ref().map(|a| a.display_name.clone()))
    .bind(actor.as_ref().map(|a| a.role.as_str().to_string()))
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub(crate) async fn require_open_session_tx(
    tx: &mut Transaction<'_, Sqlite>,
) -> CoreResult<(i64, String, i64)> {
    let row: Option<(i64, String, i64)> = sqlx::query_as(
        "SELECT id, reference, opening_cash FROM cash_sessions WHERE status = 'open' LIMIT 1",
    )
    .fetch_optional(&mut **tx)
    .await?;
    row.ok_or_else(|| {
        CoreError::SessionNotOpen(
            "Aucune session de caisse ouverte. Ouvrez la caisse avant d'enregistrer une opération."
                .to_string(),
        )
    })
}

pub(crate) async fn get_theoretical_cash_tx(
    tx: &mut Transaction<'_, Sqlite>,
    session_id: i64,
    opening_cash: i64,
) -> CoreResult<i64> {
    let net: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)
         FROM cash_movements
         WHERE session_id = ? AND method_code = 'cash'",
    )
    .bind(session_id)
    .fetch_one(&mut **tx)
    .await?;
    Money(opening_cash)
        .checked_add(Money(net), "Solde théorique de caisse")
        .map(Money::value)
}
