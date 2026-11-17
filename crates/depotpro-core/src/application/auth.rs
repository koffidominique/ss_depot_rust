use serde::Serialize;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatusDto {
    pub needs_setup: bool,
    pub locked_until: Option<String>,
    pub failed_attempts: i64,
}

fn validate_pin_format(pin: &str) -> CoreResult<()> {
    if pin.len() != 6 || !pin.chars().all(|c| c.is_ascii_digit()) {
        return Err(CoreError::Validation(
            "Le code PIN propriétaire doit contenir exactement 6 chiffres.".to_string(),
        ));
    }
    Ok(())
}

pub async fn get_auth_status(db: &DepotDb) -> CoreResult<AuthStatusDto> {
    let row: Option<(i64, Option<String>)> = sqlx::query_as(
        "SELECT failed_attempts, locked_until FROM owner_security WHERE id = 1",
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

pub async fn setup_owner_pin(db: &DepotDb, pin: &str) -> CoreResult<()> {
    validate_pin_format(pin)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let existing: Option<(i64,)> = sqlx::query_as("SELECT id FROM owner_security WHERE id = 1")
        .fetch_optional(&mut *tx)
        .await?;
    if existing.is_some() {
        return Err(CoreError::Validation("Le code PIN propriétaire est déjà configuré.".to_string()));
    }
    let hash = bcrypt::hash(pin, 10)
        .map_err(|e| CoreError::Internal(format!("Erreur hachage bcrypt : {e}")))?;

    sqlx::query("INSERT INTO owner_security (id, pin_hash, failed_attempts) VALUES (1, ?, 0)")
        .bind(hash)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

pub async fn verify_owner_pin(db: &DepotDb, pin: &str) -> CoreResult<()> {
    validate_pin_format(pin)?;
    let row: Option<(String, i64, Option<String>)> = sqlx::query_as(
        "SELECT pin_hash, failed_attempts, locked_until FROM owner_security WHERE id = 1",
    )
    .fetch_optional(&db.pool)
    .await?;

    let (pin_hash, failed_attempts, locked_until) = row
        .ok_or_else(|| CoreError::Unauthorized("Aucun code PIN configuré.".to_string()))?;

    if let Some(until) = locked_until {
        let still_locked: i64 = sqlx::query_scalar("SELECT CASE WHEN ? > datetime('now') THEN 1 ELSE 0 END")
            .bind(&until)
            .fetch_one(&db.pool)
            .await?;
        if still_locked == 1 {
            return Err(CoreError::Unauthorized(
                "Trop de tentatives incorrectes. Réessayez dans quelques secondes.".to_string(),
            ));
        }
    }

    let ok = bcrypt::verify(pin, &pin_hash)
        .map_err(|e| CoreError::Internal(format!("Erreur vérification PIN : {e}")))?;

    let (_guard, mut tx) = db.begin_write().await?;
    if !ok {
        let next_attempts = failed_attempts + 1;
        if next_attempts >= 5 {
            sqlx::query(
                "UPDATE owner_security SET failed_attempts = ?, locked_until = datetime('now', '+30 seconds'), updated_at = datetime('now') WHERE id = 1",
            )
            .bind(next_attempts)
            .execute(&mut *tx)
            .await?;
        } else {
            sqlx::query("UPDATE owner_security SET failed_attempts = ?, updated_at = datetime('now') WHERE id = 1")
                .bind(next_attempts)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        return Err(CoreError::Unauthorized("Code PIN incorrect.".to_string()));
    }

    sqlx::query("UPDATE owner_security SET failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = 1")
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

pub async fn change_owner_pin(db: &DepotDb, current_pin: &str, new_pin: &str) -> CoreResult<()> {
    validate_pin_format(current_pin)?;
    validate_pin_format(new_pin)?;
    let row: Option<(String,)> = sqlx::query_as("SELECT pin_hash FROM owner_security WHERE id = 1")
        .fetch_optional(&db.pool)
        .await?;
    let (pin_hash,) = row.ok_or_else(|| CoreError::Unauthorized("Aucun code PIN configuré.".to_string()))?;

    let ok = bcrypt::verify(current_pin, &pin_hash)
        .map_err(|e| CoreError::Internal(format!("Erreur vérification PIN : {e}")))?;
    if !ok {
        return Err(CoreError::Unauthorized("Code PIN actuel incorrect.".to_string()));
    }

    let next_hash = bcrypt::hash(new_pin, 10)
        .map_err(|e| CoreError::Internal(format!("Erreur hachage bcrypt : {e}")))?;
    let (_guard, mut tx) = db.begin_write().await?;
    sqlx::query(
        "UPDATE owner_security SET pin_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = 1",
    )
    .bind(next_hash)
    .execute(&mut *tx)
    .await?;
    sqlx::query("INSERT INTO audit_logs (action, entity_type, entity_id, details) VALUES ('PIN_CHANGED', 'owner_security', '1', 'Modification du code PIN propriétaire')")
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}
