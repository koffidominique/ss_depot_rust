// ============================================================================
// Moteur transactionnel de restauration et reconnexion du pool SQLite
// ============================================================================

use std::fs::File;
use std::path::{Path, PathBuf};

use crate::application::sales::audit_log_tx;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::create_and_list::create_consistent_backup;
use super::paths::{remove_sqlite_sidecars, sync_parent_dir};
use super::{
    collect_entity_counts, verify_backup_path_read_only, BackupRestoreDto, RestoreFailureHook,
};

pub(crate) async fn restore_from_plain_path_with_hook(
    guard: &mut DepotDb,
    backup_dir: &Path,
    src_path: &Path,
    display_name: &str,
    failure_hook: RestoreFailureHook,
) -> CoreResult<BackupRestoreDto> {
    let safe_name = display_name.to_string();

    let source_check = verify_backup_path_read_only(src_path, &safe_name).await?;
    if !source_check.compatible
        || source_check.integrity != "ok"
        || source_check.foreign_key_errors > 0
    {
        return Err(CoreError::Validation(
            source_check.compatibility_reason.unwrap_or_else(|| {
                "Sauvegarde corrompue ou incompatible : restauration refusée.".to_string()
            }),
        ));
    }

    let safety_path = create_consistent_backup(guard, backup_dir).await?;
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
            "La sauvegarde de sécurité préalable est invalide : restauration annulée.".to_string(),
        ));
    }

    let dest_path = PathBuf::from(&guard.db_path);
    let dest_dir = dest_path
        .parent()
        .ok_or_else(|| CoreError::Internal("Répertoire base cible invalide.".to_string()))?
        .to_path_buf();
    std::fs::create_dir_all(&dest_dir)
        .map_err(|e| CoreError::Internal(format!("Création répertoire base impossible : {e}")))?;

    let uid = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let staging_path = dest_dir.join(format!(".depotpro_restore_tmp_{uid}.db"));
    let rollback_path = dest_dir.join(format!(".depotpro_restore_prev_{uid}.db"));

    std::fs::copy(src_path, &staging_path).map_err(|e| {
        CoreError::Internal(format!("Copie vers fichier temporaire impossible : {e}"))
    })?;
    {
        let staged_file = File::open(&staging_path).map_err(|e| {
            let _ = std::fs::remove_file(&staging_path);
            CoreError::Internal(format!("Ouverture fichier temporaire impossible : {e}"))
        })?;
        if let Err(e) = staged_file.sync_all() {
            let _ = std::fs::remove_file(&staging_path);
            return Err(CoreError::Internal(format!(
                "Synchronisation disque fichier temporaire impossible : {e}"
            )));
        }
    }

    let staged_check = match verify_backup_path_read_only(&staging_path, &safe_name).await {
        Ok(v)
            if v.compatible
                && v.integrity == "ok"
                && v.foreign_key_errors == 0
                && v.sha256 == source_check.sha256 =>
        {
            v
        }
        Ok(_) => {
            let _ = std::fs::remove_file(&staging_path);
            return Err(CoreError::Database(
                "Échec vérification du fichier temporaire de restauration.".to_string(),
            ));
        }
        Err(e) => {
            let _ = std::fs::remove_file(&staging_path);
            return Err(e);
        }
    };

    {
        let _write_guard = guard.lock_write().await;
        let _ = sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
            .execute(&guard.pool)
            .await;
    }
    guard.pool.close().await;

    let phase_result: CoreResult<(DepotDb, BackupRestoreDto)> = async {
        remove_sqlite_sidecars(&dest_path);

        if failure_hook == RestoreFailureHook::BeforeAtomicReplace {
            return Err(CoreError::Internal(
                "Interruption simulée avant remplacement atomique.".to_string(),
            ));
        }

        if dest_path.exists() {
            std::fs::rename(&dest_path, &rollback_path).map_err(|e| {
                CoreError::Internal(format!("Mise en réserve base courante impossible : {e}"))
            })?;
        }

        std::fs::rename(&staging_path, &dest_path).map_err(|e| {
            CoreError::Internal(format!("Remplacement atomique de la base impossible : {e}"))
        })?;
        if let Ok(f) = File::open(&dest_path) {
            let _ = f.sync_all();
        }
        sync_parent_dir(&dest_dir)?;

        if failure_hook == RestoreFailureHook::BeforeReconnect {
            return Err(CoreError::Database(
                "Échec simulé de reconnexion SQLite après remplacement.".to_string(),
            ));
        }

        let new_db = DepotDb::connect(&dest_path).await?;

        let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
            .fetch_one(&new_db.pool)
            .await?;
        let fk_rows: Vec<(String, i64, String, i64)> = sqlx::query_as("PRAGMA foreign_key_check")
            .fetch_all(&new_db.pool)
            .await?;
        if integrity != "ok" || !fk_rows.is_empty() {
            new_db.pool.close().await;
            return Err(CoreError::Database(format!(
                "Vérification post-restauration échouée (integrity={integrity}, fk={}).",
                fk_rows.len()
            )));
        }
        let schema_version: i64 =
            sqlx::query_scalar("SELECT COALESCE(MAX(version), 0) FROM schema_version")
                .fetch_one(&new_db.pool)
                .await?;

        if failure_hook == RestoreFailureHook::AfterReconnectPostVerify {
            new_db.pool.close().await;
            return Err(CoreError::Database(
                "Échec simulé de vérification post-restauration.".to_string(),
            ));
        }

        let (_wg, mut tx) = new_db.begin_write().await?;
        audit_log_tx(
            &mut tx,
            "RESTORE_BACKUP",
            "backups",
            Some(safe_name.clone()),
            &format!("Base restaurée depuis {safe_name} (sauvegarde sécurité : {safety_name})"),
        )
        .await?;
        tx.commit().await?;

        let counts = collect_entity_counts(&new_db.pool).await?;

        Ok((
            new_db,
            BackupRestoreDto {
                restored: safe_name.clone(),
                safety_backup: safety_name.clone(),
                restored_sha256: staged_check.sha256.clone(),
                integrity,
                foreign_key_errors: fk_rows.len(),
                schema_version,
                counts,
            },
        ))
    }
    .await;

    match phase_result {
        Ok((new_db, dto)) => {
            let _ = std::fs::remove_file(&rollback_path);
            let _ = std::fs::remove_file(&staging_path);
            *guard = new_db;
            Ok(dto)
        }
        Err(err) => {
            let _ = std::fs::remove_file(&staging_path);
            remove_sqlite_sidecars(&dest_path);
            if rollback_path.exists() {
                let _ = std::fs::remove_file(&dest_path);
                let _ = std::fs::rename(&rollback_path, &dest_path);
            } else if !dest_path.exists() && safety_path.exists() {
                let _ = std::fs::copy(&safety_path, &dest_path);
            }
            let _ = sync_parent_dir(&dest_dir);

            if let Ok(recovered_db) = DepotDb::connect(&dest_path).await {
                *guard = recovered_db;
            }
            Err(err)
        }
    }
}
