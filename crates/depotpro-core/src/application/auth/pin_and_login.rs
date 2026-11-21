// ============================================================================
// Gestion du PIN propriétaire et blocage anti-bruteforce
// ============================================================================

use crate::application::sales::audit_log_tx;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;
use serde::Serialize;

use super::{require_current_actor_permission, Permission, SessionIdentity, PIN_MAX_ATTEMPTS};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatusDto {
    pub needs_setup: bool,
    pub locked_until: Option<String>,
    pub failed_attempts: i64,
}

pub fn validate_pin_format(pin: &str) -> CoreResult<()> {
    if pin.len() != 6 || !pin.chars().all(|c| c.is_ascii_digit()) {
        return Err(CoreError::Validation(
            "Le code PIN doit contenir exactement 6 chiffres.".to_string(),
        ));
    }
    Ok(())
}

pub async fn get_auth_status(db: &DepotDb) -> CoreResult<AuthStatusDto> {
    let row: Option<(i64, Option<String>)> = sqlx::query_as(
        "SELECT failed_attempts,
                CASE WHEN locked_until IS NOT NULL AND locked_until > datetime('now')
                     THEN locked_until
                     ELSE NULL
                END
         FROM owner_security
         WHERE id = 1",
    )
    .fetch_optional(&db.pool)
    .await?;

    Ok(match row {
        None => AuthStatusDto {
            needs_setup: true,
            locked_until: None,
            failed_attempts: 0,
        },
        Some((failed_attempts, locked_until)) => AuthStatusDto {
            needs_setup: false,
            locked_until,
            failed_attempts,
        },
    })
}

pub async fn setup_owner_pin(db: &DepotDb, pin: &str) -> CoreResult<SessionIdentity> {
    validate_pin_format(pin)?;
    let existing: Option<(i64,)> = sqlx::query_as("SELECT id FROM owner_security WHERE id = 1")
        .fetch_optional(&db.pool)
        .await?;
    if existing.is_some() {
        return Err(CoreError::Validation(
            "Le code PIN propriétaire est déjà configuré.".to_string(),
        ));
    }
    let hash = bcrypt::hash(pin, 10)
        .map_err(|e| CoreError::Internal(format!("Erreur hachage bcrypt : {e}")))?;

    let (_guard, mut tx) = db.begin_write().await?;
    let existing_tx: Option<(i64,)> = sqlx::query_as("SELECT id FROM owner_security WHERE id = 1")
        .fetch_optional(&mut *tx)
        .await?;
    if existing_tx.is_some() {
        return Err(CoreError::Validation(
            "Le code PIN propriétaire est déjà configuré.".to_string(),
        ));
    }

    sqlx::query("INSERT INTO owner_security (id, pin_hash, failed_attempts) VALUES (1, ?, 0)")
        .bind(&hash)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "INSERT INTO users (username, display_name, role, pin_hash, active, failed_attempts)
         VALUES ('owner', 'Propriétaire', 'owner', ?, 1, 0)
         ON CONFLICT(username) DO UPDATE SET pin_hash = excluded.pin_hash, active = 1, failed_attempts = 0, locked_until = NULL",
    )
    .bind(&hash)
    .execute(&mut *tx)
    .await?;

    audit_log_tx(
        &mut tx,
        "PIN_SETUP",
        "owner_security",
        Some("1".to_string()),
        "Configuration initiale du PIN propriétaire",
    )
    .await?;
    tx.commit().await?;
    Ok(SessionIdentity::owner())
}

pub async fn verify_owner_pin(db: &DepotDb, pin: &str) -> CoreResult<()> {
    validate_pin_format(pin)?;
    let row: Option<(String, Option<String>)> = sqlx::query_as(
        "SELECT pin_hash,
                CASE WHEN locked_until IS NOT NULL AND locked_until > datetime('now')
                     THEN locked_until
                     ELSE NULL
                END
         FROM owner_security
         WHERE id = 1",
    )
    .fetch_optional(&db.pool)
    .await?;

    let (pin_hash, active_lock) =
        row.ok_or_else(|| CoreError::Unauthorized("Aucun code PIN configuré.".to_string()))?;
    if active_lock.is_some() {
        return Err(CoreError::RateLimited(
            "Trop de tentatives incorrectes. Réessayez dans quelques secondes.".to_string(),
        ));
    }

    let ok = bcrypt::verify(pin, &pin_hash)
        .map_err(|e| CoreError::Internal(format!("Erreur vérification PIN : {e}")))?;

    let (_guard, mut tx) = db.begin_write().await?;
    let tx_row: Option<(i64, i64)> = sqlx::query_as(
        "SELECT failed_attempts,
                CASE WHEN locked_until IS NOT NULL AND locked_until > datetime('now') THEN 1 ELSE 0 END
         FROM owner_security
         WHERE id = 1",
    )
    .fetch_optional(&mut *tx)
    .await?;
    let (current_attempts, is_locked_now) =
        tx_row.ok_or_else(|| CoreError::Unauthorized("Aucun code PIN configuré.".to_string()))?;

    if is_locked_now == 1 {
        tx.rollback().await?;
        return Err(CoreError::RateLimited(
            "Trop de tentatives incorrectes. Réessayez dans quelques secondes.".to_string(),
        ));
    }

    if !ok {
        let next_attempts = current_attempts + 1;
        if next_attempts >= PIN_MAX_ATTEMPTS {
            sqlx::query(
                "UPDATE owner_security
                 SET failed_attempts = ?, locked_until = datetime('now', '+30 seconds'), updated_at = datetime('now')
                 WHERE id = 1",
            )
            .bind(next_attempts)
            .execute(&mut *tx)
            .await?;
        } else {
            sqlx::query(
                "UPDATE owner_security SET failed_attempts = ?, updated_at = datetime('now') WHERE id = 1",
            )
            .bind(next_attempts)
            .execute(&mut *tx)
            .await?;
        }
        audit_log_tx(
            &mut tx,
            "PIN_FAILED",
            "owner_security",
            Some("1".to_string()),
            &format!("Tentative PIN propriétaire échouée (#{next_attempts})"),
        )
        .await?;
        tx.commit().await?;
        return Err(CoreError::Unauthorized("Code PIN incorrect.".to_string()));
    }

    sqlx::query(
        "UPDATE owner_security SET failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = 1",
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE username = 'owner'",
    )
    .execute(&mut *tx)
    .await?;
    audit_log_tx(
        &mut tx,
        "PIN_LOGIN",
        "owner_security",
        Some("1".to_string()),
        "Connexion propriétaire réussie",
    )
    .await?;
    tx.commit().await?;
    Ok(())
}

pub async fn change_owner_pin(db: &DepotDb, current_pin: &str, new_pin: &str) -> CoreResult<()> {
    require_current_actor_permission(Permission::SecurityChangeOwnerPin)?;
    validate_pin_format(current_pin)?;
    validate_pin_format(new_pin)?;
    let row: Option<(String,)> = sqlx::query_as("SELECT pin_hash FROM owner_security WHERE id = 1")
        .fetch_optional(&db.pool)
        .await?;
    let (pin_hash,) =
        row.ok_or_else(|| CoreError::Unauthorized("Aucun code PIN configuré.".to_string()))?;

    let ok = bcrypt::verify(current_pin, &pin_hash)
        .map_err(|e| CoreError::Internal(format!("Erreur vérification PIN : {e}")))?;
    if !ok {
        return Err(CoreError::Unauthorized(
            "Code PIN actuel incorrect.".to_string(),
        ));
    }

    let next_hash = bcrypt::hash(new_pin, 10)
        .map_err(|e| CoreError::Internal(format!("Erreur hachage bcrypt : {e}")))?;
    let (_guard, mut tx) = db.begin_write().await?;
    sqlx::query(
        "UPDATE owner_security SET pin_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = 1",
    )
    .bind(&next_hash)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "UPDATE users SET pin_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE username = 'owner'",
    )
    .bind(&next_hash)
    .execute(&mut *tx)
    .await?;
    audit_log_tx(
        &mut tx,
        "PIN_CHANGED",
        "owner_security",
        Some("1".to_string()),
        "Modification du code PIN propriétaire",
    )
    .await?;
    tx.commit().await?;
    Ok(())
}
