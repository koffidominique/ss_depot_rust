// ============================================================================
// Création cohérente (VACUUM INTO), liste, lecture et rotation des sauvegardes
// ============================================================================

use std::fs::File;
use std::path::{Path, PathBuf};

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::sales::audit_log_tx;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::paths::{is_valid_backup_filename, resolve_safe_backup_path};
use super::{
    sha256_file, verify_backup_path_read_only, BackupFileDto, BackupVerifyDto, MAX_RETAINED_BACKUPS,
};

pub(crate) async fn export_consistent_sqlite_to_path(
    db: &DepotDb,
    dest: &Path,
    label_name: &str,
) -> CoreResult<BackupVerifyDto> {
    let escaped = dest.to_string_lossy().replace('\'', "''");

    let _guard = db.lock_write().await;
    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(&db.pool)
        .await?;
    sqlx::query(&format!("VACUUM INTO '{escaped}'"))
        .execute(&db.pool)
        .await?;
    drop(_guard);

    let dest_file = File::open(dest)
        .map_err(|e| CoreError::Internal(format!("Synchronisation sauvegarde impossible : {e}")))?;
    dest_file
        .sync_all()
        .map_err(|e| CoreError::Internal(format!("Fsync sauvegarde impossible : {e}")))?;
    drop(dest_file);

    let verify_res = verify_backup_path_read_only(dest, label_name).await;
    match verify_res {
        Ok(v) if v.compatible && v.integrity == "ok" && v.foreign_key_errors == 0 => Ok(v),
        Ok(v) => {
            let _ = std::fs::remove_file(dest);
            Err(CoreError::Database(v.compatibility_reason.unwrap_or_else(
                || "La sauvegarde a échoué au contrôle d'intégrité.".to_string(),
            )))
        }
        Err(e) => {
            let _ = std::fs::remove_file(dest);
            Err(e)
        }
    }
}

pub async fn create_consistent_backup(db: &DepotDb, backup_dir: &Path) -> CoreResult<PathBuf> {
    require_current_actor_permission(Permission::BackupsCreate)?;
    std::fs::create_dir_all(backup_dir).map_err(|e| {
        CoreError::Internal(format!("Création répertoire sauvegarde impossible : {e}"))
    })?;
    let ts = chrono::Utc::now().format("%Y%m%d%H%M%S");
    let uid_suffix = uuid::Uuid::new_v4().to_string()[..6].to_string();
    let filename = format!("depotpro_backup_{ts}_{uid_suffix}.db");
    let dest = backup_dir.join(&filename);
    let check = export_consistent_sqlite_to_path(db, &dest, &filename).await?;

    let (_guard2, mut tx) = db.begin_write().await?;
    audit_log_tx(
        &mut tx,
        "CREATE_BACKUP",
        "backups",
        Some(filename.clone()),
        &format!(
            "Sauvegarde cohérente créée et vérifiée : {filename} (sha256={})",
            &check.sha256[..12]
        ),
    )
    .await?;
    tx.commit().await?;

    prune_old_backups(backup_dir, MAX_RETAINED_BACKUPS);

    Ok(dest)
}

pub(crate) fn prune_old_backups(backup_dir: &Path, keep_count: usize) {
    let Ok(entries) = std::fs::read_dir(backup_dir) else {
        return;
    };
    let mut files: Vec<(PathBuf, std::time::SystemTime)> = entries
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if !is_valid_backup_filename(&name) {
                return None;
            }
            let meta = std::fs::symlink_metadata(e.path()).ok()?;
            if meta.file_type().is_symlink() || !meta.is_file() {
                return None;
            }
            let modified = meta.modified().ok()?;
            Some((e.path(), modified))
        })
        .collect();
    files.sort_by_key(|a| std::cmp::Reverse(a.1));
    for (obsolete_path, _) in files.into_iter().skip(keep_count) {
        let _ = std::fs::remove_file(obsolete_path);
    }
}

pub async fn create_backup_summary(db: &DepotDb, backup_dir: &Path) -> CoreResult<BackupFileDto> {
    require_current_actor_permission(Permission::BackupsCreate)?;
    let path = create_consistent_backup(db, backup_dir).await?;
    let meta = std::fs::metadata(&path).map_err(|e| {
        CoreError::Internal(format!("Lecture métadonnées sauvegarde impossible : {e}"))
    })?;
    let name = path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let sha256 = sha256_file(&path)?;
    Ok(BackupFileDto {
        name,
        size: meta.len(),
        created_at: chrono::Utc::now().to_rfc3339(),
        integrity: Some("ok".to_string()),
        sha256: Some(sha256),
        encrypted: false,
    })
}

pub fn list_backups(backup_dir: &Path) -> CoreResult<Vec<BackupFileDto>> {
    require_current_actor_permission(Permission::BackupsRead)?;
    std::fs::create_dir_all(backup_dir).map_err(|e| {
        CoreError::Internal(format!("Accès répertoire sauvegardes impossible : {e}"))
    })?;
    let mut items = Vec::new();
    let entries = std::fs::read_dir(backup_dir).map_err(|e| {
        CoreError::Internal(format!("Lecture répertoire sauvegardes impossible : {e}"))
    })?;

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !is_valid_backup_filename(&name) {
            continue;
        }
        let path = entry.path();
        let Ok(meta) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        if meta.file_type().is_symlink() || !meta.is_file() {
            continue;
        }
        let created_at = meta
            .modified()
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
            .unwrap_or_else(|_| chrono::Utc::now().to_rfc3339());
        let sha256 = sha256_file(&path).ok();
        let encrypted = name.ends_with(".dpbkp");
        items.push(BackupFileDto {
            name,
            size: meta.len(),
            created_at,
            integrity: None,
            sha256,
            encrypted,
        });
    }
    items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(items)
}

pub async fn verify_backup(backup_dir: &Path, filename: &str) -> CoreResult<BackupVerifyDto> {
    require_current_actor_permission(Permission::BackupsRead)?;
    let (safe_name, full_path) = resolve_safe_backup_path(backup_dir, filename)?;
    verify_backup_path_read_only(&full_path, &safe_name).await
}

pub fn read_backup_bytes(backup_dir: &Path, filename: &str) -> CoreResult<(String, Vec<u8>)> {
    require_current_actor_permission(Permission::BackupsRead)?;
    let (safe_name, full_path) = resolve_safe_backup_path(backup_dir, filename)?;
    let bytes = std::fs::read(&full_path)
        .map_err(|e| CoreError::Internal(format!("Lecture sauvegarde impossible : {e}")))?;
    Ok((safe_name, bytes))
}
