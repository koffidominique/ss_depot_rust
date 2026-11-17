use std::path::{Path, PathBuf};
use serde::Serialize;

use crate::application::sales::audit_log_tx;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFileDto {
    pub name: String,
    pub size: u64,
    pub created_at: String,
    pub integrity: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupVerifyDto {
    pub name: String,
    pub integrity: String,
    pub foreign_key_errors: usize,
    pub schema_version: i64,
}

#[derive(Debug, Serialize)]
pub struct BackupRestoreDto {
    pub restored: String,
}

pub async fn create_consistent_backup(db: &DepotDb, backup_dir: &Path) -> CoreResult<PathBuf> {
    std::fs::create_dir_all(backup_dir)
        .map_err(|e| CoreError::Internal(format!("Création répertoire sauvegarde impossible : {e}")))?;
    let ts = chrono::Utc::now().format("%Y%m%d%H%M%S");
    let uid_suffix = uuid::Uuid::new_v4().to_string()[..6].to_string();
    let filename = format!("depotpro_backup_{ts}_{uid_suffix}.db");
    let dest = backup_dir.join(filename);
    let escaped = dest.to_string_lossy().replace('\'', "''");

    let _guard = db.lock_write().await;
    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(&db.pool)
        .await?;
    sqlx::query(&format!("VACUUM INTO '{escaped}'"))
        .execute(&db.pool)
        .await?;
    drop(_guard);

    let verify_pool = DepotDb::connect(&dest).await?;
    let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(&verify_pool.pool)
        .await?;
    verify_pool.pool.close().await;

    if integrity != "ok" {
        return Err(CoreError::Database(
            "La sauvegarde a échoué au contrôle d'intégrité.".to_string(),
        ));
    }

    let (_guard2, mut tx) = db.begin_write().await?;
    let fname = dest
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    audit_log_tx(
        &mut tx,
        "CREATE_BACKUP",
        "backups",
        Some(fname.clone()),
        &format!("Sauvegarde cohérente créée : {fname}"),
    )
    .await?;
    tx.commit().await?;

    Ok(dest)
}

pub async fn create_backup_summary(db: &DepotDb, backup_dir: &Path) -> CoreResult<BackupFileDto> {
    let path = create_consistent_backup(db, backup_dir).await?;
    let meta = std::fs::metadata(&path)
        .map_err(|e| CoreError::Internal(format!("Lecture métadonnées sauvegarde impossible : {e}")))?;
    let name = path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    Ok(BackupFileDto {
        name,
        size: meta.len(),
        created_at: chrono::Utc::now().to_rfc3339(),
        integrity: Some("ok".to_string()),
    })
}

pub fn list_backups(backup_dir: &Path) -> CoreResult<Vec<BackupFileDto>> {
    std::fs::create_dir_all(backup_dir)
        .map_err(|e| CoreError::Internal(format!("Accès répertoire sauvegardes impossible : {e}")))?;
    let mut items = Vec::new();
    let entries = std::fs::read_dir(backup_dir)
        .map_err(|e| CoreError::Internal(format!("Lecture répertoire sauvegardes impossible : {e}")))?;

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with("depotpro_backup_") && name.ends_with(".db") {
            if let Ok(meta) = entry.metadata() {
                let created_at = meta
                    .modified()
                    .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
                    .unwrap_or_else(|_| chrono::Utc::now().to_rfc3339());
                items.push(BackupFileDto {
                    name,
                    size: meta.len(),
                    created_at,
                    integrity: None,
                });
            }
        }
    }
    items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(items)
}

pub async fn verify_backup(backup_dir: &Path, filename: &str) -> CoreResult<BackupVerifyDto> {
    let safe_name = Path::new(filename)
        .file_name()
        .ok_or_else(|| CoreError::Validation("Nom de sauvegarde invalide.".to_string()))?
        .to_string_lossy()
        .to_string();
    let full_path = backup_dir.join(&safe_name);
    if !full_path.exists() {
        return Err(CoreError::Validation(
            "Fichier de sauvegarde introuvable.".to_string(),
        ));
    }

    let test_db = DepotDb::connect(&full_path).await?;
    let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(&test_db.pool)
        .await?;
    let fk_rows: Vec<(String, i64, String, i64)> = sqlx::query_as("PRAGMA foreign_key_check")
        .fetch_all(&test_db.pool)
        .await?;
    let schema_version: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(version), 1) FROM schema_version")
            .fetch_one(&test_db.pool)
            .await?;
    test_db.pool.close().await;

    Ok(BackupVerifyDto {
        name: safe_name,
        integrity,
        foreign_key_errors: fk_rows.len(),
        schema_version,
    })
}

pub async fn restore_backup(
    db: &DepotDb,
    backup_dir: &Path,
    filename: &str,
) -> CoreResult<BackupRestoreDto> {
    let check = verify_backup(backup_dir, filename).await?;
    if check.integrity != "ok" || check.foreign_key_errors > 0 {
        return Err(CoreError::Database(
            "Sauvegarde corrompue ou incohérente : restauration refusée.".to_string(),
        ));
    }

    let _ = create_consistent_backup(db, backup_dir).await?;
    let src_path = backup_dir.join(&check.name);
    let dest_path = PathBuf::from(&db.db_path);

    let _guard = db.lock_write().await;
    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(&db.pool)
        .await?;
    db.pool.close().await;

    for suffix in ["-wal", "-shm"] {
        let sidecar = PathBuf::from(format!("{}{}", dest_path.to_string_lossy(), suffix));
        if sidecar.exists() {
            let _ = std::fs::remove_file(sidecar);
        }
    }
    std::fs::copy(&src_path, &dest_path)
        .map_err(|e| CoreError::Internal(format!("Copie de restauration impossible : {e}")))?;

    Ok(BackupRestoreDto {
        restored: check.name,
    })
}
