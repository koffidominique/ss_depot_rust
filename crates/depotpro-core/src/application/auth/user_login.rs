// ============================================================================
// Vérification de connexion des utilisateurs (propriétaire & collaborateurs)
// ============================================================================

use crate::application::sales::audit_log_tx;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::pin_and_login::{validate_pin_format, verify_owner_pin};
use super::{Role, SessionIdentity, PIN_MAX_ATTEMPTS};

pub async fn verify_user_login(
    db: &DepotDb,
    username: Option<&str>,
    pin: &str,
) -> CoreResult<SessionIdentity> {
    let normalized = username
        .map(|u| u.trim().to_ascii_lowercase())
        .filter(|u| !u.is_empty())
        .unwrap_or_else(|| "owner".to_string());

    if normalized == "owner" {
        verify_owner_pin(db, pin).await?;
        return Ok(SessionIdentity::owner());
    }

    validate_pin_format(pin)?;
    let row: Option<(i64, String, String, String, String, i64, i64)> = sqlx::query_as(
        "SELECT id, username, display_name, role, pin_hash, active,
                CASE WHEN locked_until IS NOT NULL AND locked_until > datetime('now') THEN 1 ELSE 0 END
         FROM users
         WHERE username = ?",
    )
    .bind(&normalized)
    .fetch_optional(&db.pool)
    .await?;

    let (uid, uname, display_name, role_raw, pin_hash, active, is_locked) = row
        .ok_or_else(|| CoreError::Unauthorized("Identifiant ou code PIN incorrect.".to_string()))?;

    if active != 1 {
        return Err(CoreError::Unauthorized(
            "Compte utilisateur désactivé.".to_string(),
        ));
    }
    if is_locked == 1 {
        return Err(CoreError::RateLimited(
            "Trop de tentatives incorrectes. Réessayez dans quelques secondes.".to_string(),
        ));
    }

    let ok = bcrypt::verify(pin, &pin_hash)
        .map_err(|e| CoreError::Internal(format!("Erreur vérification PIN : {e}")))?;

    let (_guard, mut tx) = db.begin_write().await?;
    let tx_row: Option<(i64, i64, i64)> = sqlx::query_as(
        "SELECT active, failed_attempts,
                CASE WHEN locked_until IS NOT NULL AND locked_until > datetime('now') THEN 1 ELSE 0 END
         FROM users
         WHERE id = ?",
    )
    .bind(uid)
    .fetch_optional(&mut *tx)
    .await?;
    let (tx_active, current_attempts, tx_locked) =
        tx_row.ok_or_else(|| CoreError::Unauthorized("Compte introuvable.".to_string()))?;

    if tx_active != 1 {
        tx.rollback().await?;
        return Err(CoreError::Unauthorized(
            "Compte utilisateur désactivé.".to_string(),
        ));
    }
    if tx_locked == 1 {
        tx.rollback().await?;
        return Err(CoreError::RateLimited(
            "Trop de tentatives incorrectes. Réessayez dans quelques secondes.".to_string(),
        ));
    }

    if !ok {
        let next_attempts = current_attempts + 1;
        if next_attempts >= PIN_MAX_ATTEMPTS {
            sqlx::query(
                "UPDATE users SET failed_attempts = ?, locked_until = datetime('now', '+30 seconds'), updated_at = datetime('now') WHERE id = ?",
            )
            .bind(next_attempts)
            .bind(uid)
            .execute(&mut *tx)
            .await?;
        } else {
            sqlx::query(
                "UPDATE users SET failed_attempts = ?, updated_at = datetime('now') WHERE id = ?",
            )
            .bind(next_attempts)
            .bind(uid)
            .execute(&mut *tx)
            .await?;
        }
        audit_log_tx(
            &mut tx,
            "USER_PIN_FAILED",
            "users",
            Some(uid.to_string()),
            &format!("Tentative échouée pour {uname} (#{next_attempts})"),
        )
        .await?;
        tx.commit().await?;
        return Err(CoreError::Unauthorized(
            "Identifiant ou code PIN incorrect.".to_string(),
        ));
    }

    sqlx::query(
        "UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(uid)
    .execute(&mut *tx)
    .await?;
    let role = Role::from_db_str(&role_raw)?;
    let identity = SessionIdentity::from_role(uid.to_string(), uname.clone(), display_name, role);
    sqlx::query(
        "INSERT INTO audit_logs (action, entity_type, entity_id, details, actor_user_id, actor_name, actor_role)
         VALUES ('USER_LOGIN', 'users', ?, ?, ?, ?, ?)",
    )
    .bind(uid.to_string())
    .bind(format!("Connexion utilisateur {uname} ({})", role.label_fr()))
    .bind(&identity.user_id)
    .bind(&identity.display_name)
    .bind(identity.role.as_str())
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(identity)
}
