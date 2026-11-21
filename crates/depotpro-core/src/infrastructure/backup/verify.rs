// ============================================================================
// Inspection et vérification en lecture seule des archives SQLite
// ============================================================================

use std::collections::HashSet;
use std::fs::File;
use std::io::Read;
use std::path::Path;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};

use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::{CURRENT_SCHEMA_VERSION, MIN_SUPPORTED_SCHEMA_VERSION};

use super::{
    sha256_file, BackupEntityCounts, BackupVerifyDto, BACKUP_FORMAT_V3, ENCRYPTED_BACKUP_MAGIC,
    MIN_APP_VERSION, REQUIRED_CORE_TABLES, SQLITE_HEADER_MAGIC,
};

fn validate_sqlite_archive_header(path: &Path) -> CoreResult<()> {
    let meta = std::fs::symlink_metadata(path)
        .map_err(|e| CoreError::Validation(format!("Impossible d'inspecter l'archive : {e}")))?;
    if meta.file_type().is_symlink() || !meta.is_file() {
        return Err(CoreError::Validation(
            "L'archive doit être un fichier régulier non symbolique.".to_string(),
        ));
    }
    if meta.len() < 100 {
        return Err(CoreError::Validation(
            "Archive SQLite invalide ou tronquée (taille insuffisante).".to_string(),
        ));
    }
    let mut file = File::open(path)
        .map_err(|e| CoreError::Validation(format!("Ouverture archive impossible : {e}")))?;
    let mut header = [0u8; 16];
    file.read_exact(&mut header)
        .map_err(|e| CoreError::Validation(format!("Lecture en-tête SQLite impossible : {e}")))?;
    if &header[..8] == ENCRYPTED_BACKUP_MAGIC {
        return Err(CoreError::Validation(
            "Archive chiffrée (.dpbkp) : fournissez la clé de déchiffrement.".to_string(),
        ));
    }
    if &header != SQLITE_HEADER_MAGIC {
        return Err(CoreError::Validation(
            "Archive invalide : en-tête SQLite format 3 absent ou fichier corrompu.".to_string(),
        ));
    }
    Ok(())
}

pub async fn open_backup_read_only(path: &Path) -> CoreResult<SqlitePool> {
    validate_sqlite_archive_header(path)?;
    let opts = SqliteConnectOptions::new()
        .filename(path)
        .read_only(true)
        .create_if_missing(false);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .after_connect(|conn, _meta| {
            Box::pin(async move {
                sqlx::query("PRAGMA query_only = ON;").execute(conn).await?;
                Ok(())
            })
        })
        .connect_with(opts)
        .await
        .map_err(|e| {
            CoreError::Validation(format!(
                "Impossible d'ouvrir l'archive en lecture seule : {e}"
            ))
        })?;
    Ok(pool)
}

async fn table_has_column_ro(pool: &SqlitePool, table: &str, column: &str) -> CoreResult<bool> {
    let sql = format!("PRAGMA table_info({table})");
    let rows = sqlx::query(&sql).fetch_all(pool).await?;
    for row in rows {
        let name: String = row.try_get("name")?;
        if name == column {
            return Ok(true);
        }
    }
    Ok(false)
}

pub async fn collect_entity_counts(pool: &SqlitePool) -> CoreResult<BackupEntityCounts> {
    Ok(BackupEntityCounts {
        products: sqlx::query_scalar("SELECT COUNT(*) FROM products")
            .fetch_one(pool)
            .await?,
        stock_movements: sqlx::query_scalar("SELECT COUNT(*) FROM stock_movements")
            .fetch_one(pool)
            .await?,
        clients: sqlx::query_scalar("SELECT COUNT(*) FROM clients")
            .fetch_one(pool)
            .await?,
        suppliers: sqlx::query_scalar("SELECT COUNT(*) FROM suppliers")
            .fetch_one(pool)
            .await?,
        sales: sqlx::query_scalar("SELECT COUNT(*) FROM sales")
            .fetch_one(pool)
            .await?,
        sales_returns: sqlx::query_scalar("SELECT COUNT(*) FROM sales_returns")
            .fetch_one(pool)
            .await?,
        customer_receivables: sqlx::query_scalar("SELECT COUNT(*) FROM customer_receivables")
            .fetch_one(pool)
            .await?,
        purchase_orders: sqlx::query_scalar("SELECT COUNT(*) FROM purchase_orders")
            .fetch_one(pool)
            .await?,
        purchase_receipts: sqlx::query_scalar("SELECT COUNT(*) FROM purchase_receipts")
            .fetch_one(pool)
            .await?,
        supplier_debts: sqlx::query_scalar("SELECT COUNT(*) FROM supplier_debts")
            .fetch_one(pool)
            .await?,
        returnable_stock_movements: sqlx::query_scalar(
            "SELECT COUNT(*) FROM returnable_stock_movements",
        )
        .fetch_one(pool)
        .await?,
        cash_movements: sqlx::query_scalar("SELECT COUNT(*) FROM cash_movements")
            .fetch_one(pool)
            .await?,
        expenses: sqlx::query_scalar("SELECT COUNT(*) FROM expenses")
            .fetch_one(pool)
            .await?,
        audit_logs: sqlx::query_scalar("SELECT COUNT(*) FROM audit_logs")
            .fetch_one(pool)
            .await?,
    })
}

pub async fn verify_backup_path_read_only(
    path: &Path,
    display_name: &str,
) -> CoreResult<BackupVerifyDto> {
    let sha256 = sha256_file(path)?;
    let pool = open_backup_read_only(path).await?;

    let result = inspect_backup_pool(&pool, display_name, &sha256).await;
    pool.close().await;
    result
}

async fn inspect_backup_pool(
    pool: &SqlitePool,
    display_name: &str,
    sha256: &str,
) -> CoreResult<BackupVerifyDto> {
    let integrity_rows: Vec<String> = match sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_all(pool)
        .await
    {
        Ok(rows) => rows,
        Err(e) => {
            return Err(CoreError::Validation(format!(
                "Archive SQLite corrompue ou illisible : {e}"
            )));
        }
    };

    let integrity = if integrity_rows.is_empty() {
        "empty".to_string()
    } else if integrity_rows.len() == 1 {
        integrity_rows[0].clone()
    } else {
        integrity_rows.join("; ")
    };

    let foreign_key_errors = if integrity == "ok" {
        let fk_rows: Vec<(String, i64, String, i64)> = sqlx::query_as("PRAGMA foreign_key_check")
            .fetch_all(pool)
            .await
            .map_err(|e| {
                CoreError::Validation(format!(
                    "Contrôle des clés étrangères impossible sur l'archive : {e}"
                ))
            })?;
        fk_rows.len()
    } else {
        0
    };

    let table_names: Vec<String> =
        sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type = 'table'")
            .fetch_all(pool)
            .await
            .map_err(|e| {
                CoreError::Validation(format!("Lecture du catalogue SQLite impossible : {e}"))
            })?;
    let table_set: HashSet<String> = table_names.into_iter().collect();

    let missing_tables: Vec<&str> = REQUIRED_CORE_TABLES
        .iter()
        .copied()
        .filter(|t| !table_set.contains(*t))
        .collect();

    let mut applied_versions: Vec<i64> = Vec::new();
    if integrity == "ok" && table_set.contains("schema_version") {
        applied_versions =
            sqlx::query_scalar("SELECT version FROM schema_version ORDER BY version ASC")
                .fetch_all(pool)
                .await
                .map_err(|e| {
                    CoreError::Validation(format!("Lecture table schema_version impossible : {e}"))
                })?;
    }

    let schema_version = applied_versions.iter().copied().max().unwrap_or(0);

    let mut compatibility_reason: Option<String> = None;
    if integrity != "ok" {
        compatibility_reason = Some(format!(
            "Échec du contrôle d'intégrité SQLite : {integrity}"
        ));
    } else if foreign_key_errors > 0 {
        compatibility_reason = Some(format!(
            "Violations de clés étrangères détectées ({foreign_key_errors})."
        ));
    } else if !missing_tables.is_empty() {
        compatibility_reason = Some(format!(
            "Format d'archive incompatible : table(s) DEPOTPRO manquante(s) ({}).",
            missing_tables.join(", ")
        ));
    } else if applied_versions.is_empty() || schema_version < MIN_SUPPORTED_SCHEMA_VERSION {
        compatibility_reason =
            Some("Version de schéma absente ou invalide dans schema_version.".to_string());
    } else if schema_version > CURRENT_SCHEMA_VERSION {
        compatibility_reason = Some(format!(
            "Version de schéma incompatible (v{schema_version} > v{CURRENT_SCHEMA_VERSION}) : mise à jour de l'application requise."
        ));
    } else if applied_versions.iter().any(|&v| v < 1) {
        compatibility_reason =
            Some("Entrée de migration invalide (< 1) dans schema_version.".to_string());
    } else if applied_versions.contains(&2)
        && !table_has_column_ro(pool, "app_settings", "logo_path").await?
    {
        compatibility_reason = Some(
            "Incohérence de migration v2 : colonne app_settings.logo_path absente.".to_string(),
        );
    } else if applied_versions.contains(&3)
        && !table_has_column_ro(pool, "expenses", "receipt_path").await?
    {
        compatibility_reason = Some(
            "Incohérence de migration v3 : colonne expenses.receipt_path absente.".to_string(),
        );
    } else if applied_versions.contains(&4)
        && !table_has_column_ro(pool, "app_settings", "setup_completed").await?
    {
        compatibility_reason = Some(
            "Incohérence de migration v4 : colonne app_settings.setup_completed absente."
                .to_string(),
        );
    } else if applied_versions.contains(&5)
        && (!table_set.contains("users")
            || !table_has_column_ro(pool, "audit_logs", "actor_user_id").await?)
    {
        compatibility_reason = Some(
            "Incohérence de migration v5 : table users ou colonne audit_logs.actor_user_id absente."
                .to_string(),
        );
    }

    let compatible = compatibility_reason.is_none();
    let counts = if compatible {
        Some(collect_entity_counts(pool).await?)
    } else {
        None
    };

    Ok(BackupVerifyDto {
        name: display_name.to_string(),
        integrity,
        foreign_key_errors,
        schema_version,
        applied_versions,
        backup_format: BACKUP_FORMAT_V3.to_string(),
        min_app_version: MIN_APP_VERSION.to_string(),
        compatible,
        compatibility_reason,
        sha256: sha256.to_string(),
        counts,
    })
}
