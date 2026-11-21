// ============================================================================
// Restauration atomique de sauvegardes SQLite avec rollback garanti
// ============================================================================

use std::fs::File;
use std::path::{Path, PathBuf};

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::create_and_list::create_consistent_backup;
use super::paths::{remove_sqlite_sidecars, resolve_safe_backup_path, sync_parent_dir};
use super::restore_engine::restore_from_plain_path_with_hook;
use super::{
    verify_backup_path_read_only, BackupEntityCounts, BackupRestoreDto, RestoreFailureHook,
};

pub async fn restore_backup(
    db: &DepotDb,
    backup_dir: &Path,
    filename: &str,
) -> CoreResult<BackupRestoreDto> {
    require_current_actor_permission(Permission::BackupsRestore)?;
    let (safe_name, src_path) = resolve_safe_backup_path(backup_dir, filename)?;
    let check = verify_backup_path_read_only(&src_path, &safe_name).await?;
    if !check.compatible || check.integrity != "ok" || check.foreign_key_errors > 0 {
        return Err(CoreError::Validation(
            check.compatibility_reason.unwrap_or_else(|| {
                "Sauvegarde corrompue ou incompatible : restauration refusée.".to_string()
            }),
        ));
    }

    let safety_path = create_consistent_backup(db, backup_dir).await?;
    let safety_name = safety_path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let safety_check = verify_backup_path_read_only(&safety_path, &safety_name).await?;
    if !safety_check.compatible
        || safety_check.integrity != "ok"
        || safety_check.foreign_key_errors > 0
    {
        return Err(CoreError::Database(
            "La sauvegarde de sécurité préalable a échoué au contrôle d'intégrité.".to_string(),
        ));
    }

    let dest_path = PathBuf::from(&db.db_path);
    let dest_dir = dest_path
        .parent()
        .ok_or_else(|| CoreError::Internal("Chemin base cible invalide.".to_string()))?;
    std::fs::create_dir_all(dest_dir)
        .map_err(|e| CoreError::Internal(format!("Répertoire cible inaccessible : {e}")))?;

    let uid = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let staging_path = dest_dir.join(format!(".depotpro_restore_tmp_{uid}.db"));
    let rollback_path = dest_dir.join(format!(".depotpro_restore_prev_{uid}.db"));

    std::fs::copy(&src_path, &staging_path)
        .map_err(|e| CoreError::Internal(format!("Copie temporaire impossible : {e}")))?;
    {
        let f = File::open(&staging_path).map_err(|e| {
            CoreError::Internal(format!("Ouverture fichier temporaire impossible : {e}"))
        })?;
        f.sync_all().map_err(|e| {
            CoreError::Internal(format!("Fsync fichier temporaire impossible : {e}"))
        })?;
    }
    let staged_check = match verify_backup_path_read_only(&staging_path, &safe_name).await {
        Ok(v)
            if v.compatible
                && v.integrity == "ok"
                && v.foreign_key_errors == 0
                && v.sha256 == check.sha256 =>
        {
            v
        }
        Ok(_) => {
            let _ = std::fs::remove_file(&staging_path);
            return Err(CoreError::Database(
                "Le fichier temporaire restauré diffère ou est incohérent.".to_string(),
            ));
        }
        Err(e) => {
            let _ = std::fs::remove_file(&staging_path);
            return Err(e);
        }
    };

    let _guard = db.lock_write().await;
    let _ = sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(&db.pool)
        .await;
    db.pool.close().await;

    remove_sqlite_sidecars(&dest_path);
    let had_dest = dest_path.exists();
    if had_dest {
        if let Err(e) = std::fs::rename(&dest_path, &rollback_path) {
            let _ = std::fs::remove_file(&staging_path);
            return Err(CoreError::Internal(format!(
                "Sauvegarde temporaire base précédente impossible : {e}"
            )));
        }
    }
    if let Err(e) = std::fs::rename(&staging_path, &dest_path) {
        let _ = std::fs::remove_file(&staging_path);
        if rollback_path.exists() {
            let _ = std::fs::rename(&rollback_path, &dest_path);
        }
        return Err(CoreError::Internal(format!(
            "Remplacement atomique impossible : {e}"
        )));
    }
    let _ = sync_parent_dir(dest_dir);
    if rollback_path.exists() {
        let _ = std::fs::remove_file(&rollback_path);
    }

    Ok(BackupRestoreDto {
        restored: safe_name,
        safety_backup: safety_name,
        restored_sha256: staged_check.sha256,
        integrity: staged_check.integrity,
        foreign_key_errors: staged_check.foreign_key_errors,
        schema_version: staged_check.schema_version,
        counts: staged_check.counts.unwrap_or(BackupEntityCounts {
            products: 0,
            stock_movements: 0,
            clients: 0,
            suppliers: 0,
            sales: 0,
            sales_returns: 0,
            customer_receivables: 0,
            purchase_orders: 0,
            purchase_receipts: 0,
            supplier_debts: 0,
            returnable_stock_movements: 0,
            cash_movements: 0,
            expenses: 0,
            audit_logs: 0,
        }),
    })
}

pub async fn restore_and_reconnect(
    db_lock: &tokio::sync::RwLock<DepotDb>,
    backup_dir: &Path,
    filename: &str,
) -> CoreResult<BackupRestoreDto> {
    restore_and_reconnect_with_hook(db_lock, backup_dir, filename, RestoreFailureHook::None).await
}

pub async fn restore_and_reconnect_with_hook(
    db_lock: &tokio::sync::RwLock<DepotDb>,
    backup_dir: &Path,
    filename: &str,
    failure_hook: RestoreFailureHook,
) -> CoreResult<BackupRestoreDto> {
    require_current_actor_permission(Permission::BackupsRestore)?;
    let (safe_name, src_path) = resolve_safe_backup_path(backup_dir, filename)?;
    let mut guard = db_lock.write().await;
    restore_from_plain_path_with_hook(&mut guard, backup_dir, &src_path, &safe_name, failure_hook)
        .await
}
