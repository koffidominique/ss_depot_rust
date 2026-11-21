// ============================================================================
// Diagnostic de la base SQLite locale & import de sauvegardes externes
// ============================================================================

use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::sales::audit_log_tx;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::create_and_list::{list_backups, prune_old_backups};
use super::paths::TempFileCleanup;
use super::{
    sha256_bytes, verify_backup_path_read_only, BackupFileDto, ENCRYPTED_BACKUP_MAGIC,
    MAX_RETAINED_BACKUPS, SQLITE_HEADER_MAGIC,
};

const MAX_IMPORT_BACKUP_BYTES: usize = 256 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDbStatusDto {
    pub db_path: String,
    pub backup_dir: String,
    pub db_size_bytes: u64,
    pub wal_size_bytes: u64,
    pub schema_version: i64,
    pub journal_mode: String,
    pub integrity: String,
    pub foreign_key_errors: usize,
    pub backup_count: usize,
    pub last_backup_at: Option<String>,
}

pub async fn inspect_local_db(db: &DepotDb, backup_dir: &Path) -> CoreResult<LocalDbStatusDto> {
    require_current_actor_permission(Permission::BackupsRead)?;

    let db_path = Path::new(&db.db_path);
    let db_size_bytes = std::fs::metadata(db_path).map(|m| m.len()).unwrap_or(0);
    let wal_path = PathBuf::from(format!("{}-wal", db.db_path));
    let wal_size_bytes = std::fs::metadata(&wal_path).map(|m| m.len()).unwrap_or(0);

    let schema_version: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(version), 0) FROM schema_version")
            .fetch_one(&db.pool)
            .await?;
    let journal_mode: String = sqlx::query_scalar("PRAGMA journal_mode")
        .fetch_one(&db.pool)
        .await
        .unwrap_or_else(|_| "unknown".to_string());
    let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(&db.pool)
        .await?;
    let fk_rows: Vec<(String, i64, String, i64)> = sqlx::query_as("PRAGMA foreign_key_check")
        .fetch_all(&db.pool)
        .await?;

    let backups = list_backups(backup_dir).unwrap_or_default();
    let last_backup_at = backups.first().map(|b| b.created_at.clone());

    Ok(LocalDbStatusDto {
        db_path: db.db_path.clone(),
        backup_dir: backup_dir.to_string_lossy().to_string(),
        db_size_bytes,
        wal_size_bytes,
        schema_version,
        journal_mode: journal_mode.to_uppercase(),
        integrity,
        foreign_key_errors: fk_rows.len(),
        backup_count: backups.len(),
        last_backup_at,
    })
}

pub async fn import_backup_bytes(
    db: &DepotDb,
    backup_dir: &Path,
    filename_hint: &str,
    bytes: &[u8],
) -> CoreResult<BackupFileDto> {
    require_current_actor_permission(Permission::BackupsCreate)?;

    if bytes.len() < 100 {
        return Err(CoreError::Validation(
            "Fichier de sauvegarde vide ou trop petit.".to_string(),
        ));
    }
    if bytes.len() > MAX_IMPORT_BACKUP_BYTES {
        return Err(CoreError::Validation(
            "Fichier de sauvegarde trop volumineux (max 256 Mo).".to_string(),
        ));
    }

    let is_encrypted = bytes.starts_with(ENCRYPTED_BACKUP_MAGIC);
    let is_sqlite = bytes.starts_with(SQLITE_HEADER_MAGIC);
    if !is_encrypted && !is_sqlite {
        return Err(CoreError::Validation(
            "Format invalide : sélectionnez un fichier SQLite (.db) ou chiffré (.dpbkp) DEPOTPRO."
                .to_string(),
        ));
    }

    let lower_hint = filename_hint.trim().to_ascii_lowercase();
    if is_encrypted && !lower_hint.ends_with(".dpbkp") && lower_hint.ends_with(".db") {
        return Err(CoreError::Validation(
            "Le contenu est chiffré (.dpbkp), l'extension .db ne correspond pas.".to_string(),
        ));
    }

    std::fs::create_dir_all(backup_dir).map_err(|e| {
        CoreError::Internal(format!("Accès répertoire sauvegardes impossible : {e}"))
    })?;

    let ext = if is_encrypted { "dpbkp" } else { "db" };
    let ts = chrono::Utc::now().format("%Y%m%d%H%M%S");
    let uid = uuid::Uuid::new_v4().to_string()[..6].to_string();
    let final_name = format!("depotpro_backup_{ts}_imp{uid}.{ext}");
    let tmp_path = backup_dir.join(format!(".import_tmp_{ts}_{uid}.{ext}"));
    let final_path = backup_dir.join(&final_name);

    let _cleanup = TempFileCleanup(tmp_path.clone());
    {
        let mut f = File::create(&tmp_path).map_err(|e| {
            CoreError::Internal(format!("Écriture temporaire sauvegarde impossible : {e}"))
        })?;
        f.write_all(bytes)
            .map_err(|e| CoreError::Internal(format!("Écriture octets sauvegarde : {e}")))?;
        f.sync_all()
            .map_err(|e| CoreError::Internal(format!("Fsync sauvegarde importée : {e}")))?;
    }

    let integrity = if !is_encrypted {
        let check = verify_backup_path_read_only(&tmp_path, &final_name).await?;
        if !check.compatible || check.integrity != "ok" || check.foreign_key_errors > 0 {
            return Err(CoreError::Validation(
                check.compatibility_reason.unwrap_or_else(|| {
                    "La sauvegarde importée est corrompue ou incompatible.".to_string()
                }),
            ));
        }
        Some(check.integrity)
    } else {
        None
    };

    std::fs::rename(&tmp_path, &final_path).map_err(|e| {
        CoreError::Internal(format!(
            "Enregistrement sauvegarde importée impossible : {e}"
        ))
    })?;

    let sha256 = sha256_bytes(bytes);
    let (_guard, mut tx) = db.begin_write().await?;
    audit_log_tx(
        &mut tx,
        "IMPORT_BACKUP",
        "backups",
        Some(final_name.clone()),
        &format!(
            "Sauvegarde externe importée ({final_name}, sha256={})",
            &sha256[..12]
        ),
    )
    .await?;
    tx.commit().await?;

    prune_old_backups(backup_dir, MAX_RETAINED_BACKUPS);

    Ok(BackupFileDto {
        name: final_name,
        size: bytes.len() as u64,
        created_at: chrono::Utc::now().to_rfc3339(),
        integrity,
        sha256: Some(sha256),
        encrypted: is_encrypted,
    })
}
