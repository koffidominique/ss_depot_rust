// ============================================================================
// Gestion des comptes utilisateurs (création, liste, activation/désactivation)
// ============================================================================

use crate::application::sales::audit_log_tx;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;
use serde::{Deserialize, Serialize};

use super::{require_current_actor_permission, validate_pin_format, Permission, Role};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserDto {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub role: Role,
    pub role_label: String,
    pub active: bool,
    pub failed_attempts: i64,
    pub locked_until: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUserInput {
    pub username: String,
    pub display_name: String,
    pub role: Role,
    pub pin: String,
}

type UserRow = (
    i64,
    String,
    String,
    String,
    i64,
    i64,
    Option<String>,
    String,
);

fn validate_username(username: &str) -> CoreResult<String> {
    let trimmed = username.trim().to_ascii_lowercase();
    if trimmed.len() < 3 || trimmed.len() > 32 {
        return Err(CoreError::Validation(
            "L'identifiant utilisateur doit contenir entre 3 et 32 caractères.".to_string(),
        ));
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '_' || c == '-')
    {
        return Err(CoreError::Validation(
            "L'identifiant utilisateur ne peut contenir que lettres minuscules, chiffres, '.', '_' ou '-'.".to_string(),
        ));
    }
    if trimmed == "owner" {
        return Err(CoreError::Validation(
            "L'identifiant 'owner' est réservé au compte Propriétaire.".to_string(),
        ));
    }
    Ok(trimmed)
}

pub async fn create_user(db: &DepotDb, input: CreateUserInput) -> CoreResult<UserDto> {
    require_current_actor_permission(Permission::SecurityManageUsers)?;
    let username = validate_username(&input.username)?;
    let display_name = input.display_name.trim().to_string();
    if display_name.is_empty() {
        return Err(CoreError::Validation(
            "Le nom complet de l'utilisateur est obligatoire.".to_string(),
        ));
    }
    if input.role == Role::Owner {
        return Err(CoreError::Validation(
            "Le rôle Propriétaire est unique.".to_string(),
        ));
    }
    validate_pin_format(&input.pin)?;
    let hash = bcrypt::hash(&input.pin, 10)
        .map_err(|e| CoreError::Internal(format!("Erreur hachage bcrypt : {e}")))?;

    let (_guard, mut tx) = db.begin_write().await?;
    let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE username = ?")
        .bind(&username)
        .fetch_one(&mut *tx)
        .await?;
    if exists > 0 {
        return Err(CoreError::DuplicateOperation(
            "Cet identifiant utilisateur existe déjà.".to_string(),
        ));
    }

    let res = sqlx::query(
        "INSERT INTO users (username, display_name, role, pin_hash, active, failed_attempts)
         VALUES (?, ?, ?, ?, 1, 0)",
    )
    .bind(&username)
    .bind(&display_name)
    .bind(input.role.as_str())
    .bind(&hash)
    .execute(&mut *tx)
    .await?;
    let uid = res.last_insert_rowid();

    audit_log_tx(
        &mut tx,
        "CREATE_USER",
        "users",
        Some(uid.to_string()),
        &format!(
            "Création utilisateur {username} ({})",
            input.role.label_fr()
        ),
    )
    .await?;
    tx.commit().await?;

    get_user_by_id(db, uid).await
}

async fn get_user_by_id(db: &DepotDb, user_id: i64) -> CoreResult<UserDto> {
    let row: Option<UserRow> = sqlx::query_as(
        "SELECT id, username, display_name, role, active, failed_attempts,
                CASE WHEN locked_until IS NOT NULL AND locked_until > datetime('now')
                     THEN locked_until ELSE NULL END,
                created_at
         FROM users
         WHERE id = ?",
    )
    .bind(user_id)
    .fetch_optional(&db.pool)
    .await?;

    let (id, username, display_name, role_raw, active, failed_attempts, locked_until, created_at) =
        row.ok_or_else(|| CoreError::Validation("Utilisateur introuvable.".to_string()))?;
    let role = Role::from_db_str(&role_raw)?;
    Ok(UserDto {
        id,
        username,
        display_name,
        role,
        role_label: role.label_fr().to_string(),
        active: active == 1,
        failed_attempts,
        locked_until,
        created_at,
    })
}

pub async fn list_users(db: &DepotDb) -> CoreResult<Vec<UserDto>> {
    require_current_actor_permission(Permission::SecurityManageUsers)?;
    let rows: Vec<UserRow> = sqlx::query_as(
        "SELECT id, username, display_name, role, active, failed_attempts,
                CASE WHEN locked_until IS NOT NULL AND locked_until > datetime('now')
                     THEN locked_until ELSE NULL END,
                created_at
         FROM users
         ORDER BY id ASC",
    )
    .fetch_all(&db.pool)
    .await?;

    let mut out = Vec::with_capacity(rows.len());
    for (id, username, display_name, role_raw, active, failed_attempts, locked_until, created_at) in
        rows
    {
        let role = Role::from_db_str(&role_raw)?;
        out.push(UserDto {
            id,
            username,
            display_name,
            role,
            role_label: role.label_fr().to_string(),
            active: active == 1,
            failed_attempts,
            locked_until,
            created_at,
        });
    }
    Ok(out)
}

pub async fn set_user_active(db: &DepotDb, user_id: i64, active: bool) -> CoreResult<UserDto> {
    require_current_actor_permission(Permission::SecurityManageUsers)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let row: Option<(String, String)> =
        sqlx::query_as("SELECT username, role FROM users WHERE id = ?")
            .bind(user_id)
            .fetch_optional(&mut *tx)
            .await?;
    let (username, role_raw) =
        row.ok_or_else(|| CoreError::Validation("Utilisateur introuvable.".to_string()))?;
    if role_raw == "owner" || username == "owner" {
        return Err(CoreError::Validation(
            "Impossible de désactiver le compte Propriétaire.".to_string(),
        ));
    }

    sqlx::query("UPDATE users SET active = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(if active { 1 } else { 0 })
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

    audit_log_tx(
        &mut tx,
        if active {
            "ACTIVATE_USER"
        } else {
            "DEACTIVATE_USER"
        },
        "users",
        Some(user_id.to_string()),
        &format!(
            "{} du compte {username}",
            if active {
                "Activation"
            } else {
                "Désactivation"
            }
        ),
    )
    .await?;
    tx.commit().await?;

    get_user_by_id(db, user_id).await
}
