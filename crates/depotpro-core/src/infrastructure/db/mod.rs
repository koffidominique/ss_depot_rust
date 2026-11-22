// ============================================================================
// Connexion SQLite WAL, verrous d'écriture, séquences & réexports migrations
// ============================================================================

use crate::error::{CoreError, CoreResult};
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{Sqlite, SqlitePool, Transaction};
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;

mod migrations;
mod schema;
mod sql_defs;

pub use migrations::{
    split_sql_statements, MigrationDef, MigrationRunReport, CURRENT_SCHEMA_VERSION, MIGRATIONS,
    MIN_SUPPORTED_SCHEMA_VERSION, V3_MIGRATION_0002_SQL, V3_MIGRATION_0003_SQL,
    V3_MIGRATION_0004_SQL, V3_MIGRATION_0005_SQL, V3_MIGRATION_0006_SQL, V3_MIGRATION_0007_SQL,
    V3_MIGRATION_0008_SQL, V3_MIGRATION_0009_SQL, V3_MIGRATION_0010_SQL, V3_MIGRATION_0011_SQL,
    V3_MIGRATION_0012_SQL, V3_MIGRATION_0013_SQL, V3_MIGRATION_0014_SQL, V3_MIGRATION_0015_SQL,
    V3_MIGRATION_0016_SQL, V3_MIGRATION_0017_SQL, V3_MIGRATION_0018_SQL, V3_MIGRATION_0019_SQL,
    V3_MIGRATION_0020_SQL, V3_MIGRATION_0021_SQL, V3_MIGRATION_0022_SQL, V3_MIGRATION_0023_SQL,
    V3_SCHEMA_SQL,
};
pub use schema::{
    SchemaColumnSnapshot, SchemaIndexSnapshot, SchemaSnapshot, SchemaTableSnapshot,
    SchemaVersionEntry,
};

#[derive(Clone)]
pub struct DepotDb {
    pub pool: SqlitePool,
    write_lock: Arc<Mutex<()>>,
    pub db_path: String,
    busy_timeout_ms: u64,
}

fn default_busy_timeout_ms() -> u64 {
    std::env::var("DEPOTPRO_BUSY_TIMEOUT_MS")
        .ok()
        .and_then(|v| v.trim().parse::<u64>().ok())
        .map(|v| v.clamp(1, 60_000))
        .unwrap_or(5_000)
}

async fn backup_before_schema_upgrade(db_path: &Path, backup_dir: &Path) -> CoreResult<()> {
    let Ok(meta) = std::fs::metadata(db_path) else {
        return Ok(());
    };
    if !meta.is_file() || meta.len() < 100 {
        return Ok(());
    }

    let ro_opts = SqliteConnectOptions::new()
        .filename(db_path)
        .read_only(true)
        .create_if_missing(false);
    let Ok(ro_pool) = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(ro_opts)
        .await
    else {
        return Ok(());
    };

    let has_sv: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'",
    )
    .fetch_one(&ro_pool)
    .await
    .unwrap_or(0);
    let current_v: i64 = if has_sv > 0 {
        sqlx::query_scalar("SELECT COALESCE(MAX(version), 0) FROM schema_version")
            .fetch_one(&ro_pool)
            .await
            .unwrap_or(0)
    } else {
        0
    };
    ro_pool.close().await;

    if current_v <= 0 || current_v >= CURRENT_SCHEMA_VERSION {
        return Ok(());
    }

    std::fs::create_dir_all(backup_dir).map_err(|e| {
        CoreError::Internal(format!(
            "Création répertoire sauvegarde pré-migration : {e}"
        ))
    })?;
    let ts = chrono::Utc::now().format("%Y%m%d%H%M%S");
    let dest = backup_dir.join(format!("depotpro_backup_{ts}_pre{current_v}.db"));
    let escaped = dest.to_string_lossy().replace('\'', "''");

    let rw_opts = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(false)
        .busy_timeout(Duration::from_millis(5_000));
    if let Ok(rw_pool) = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(rw_opts)
        .await
    {
        let _ = sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
            .execute(&rw_pool)
            .await;
        if sqlx::query(&format!("VACUUM INTO '{escaped}'"))
            .execute(&rw_pool)
            .await
            .is_err()
        {
            let _ = std::fs::remove_file(&dest);
            let _ = std::fs::copy(db_path, &dest);
        }
        rw_pool.close().await;
    }

    Ok(())
}

impl DepotDb {
    pub async fn connect(db_path: &Path) -> CoreResult<Self> {
        Self::connect_full(db_path, default_busy_timeout_ms(), None).await
    }

    pub async fn connect_with_backup_dir(db_path: &Path, backup_dir: &Path) -> CoreResult<Self> {
        Self::connect_full(db_path, default_busy_timeout_ms(), Some(backup_dir)).await
    }

    pub async fn connect_with_busy_timeout(
        db_path: &Path,
        busy_timeout_ms: u64,
    ) -> CoreResult<Self> {
        Self::connect_full(db_path, busy_timeout_ms, None).await
    }

    pub async fn connect_full(
        db_path: &Path,
        busy_timeout_ms: u64,
        backup_dir: Option<&Path>,
    ) -> CoreResult<Self> {
        let clamped_timeout = busy_timeout_ms.clamp(1, 60_000);
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                CoreError::Internal(format!("Création répertoire SQLite impossible : {e}"))
            })?;
        }
        if let Some(bdir) = backup_dir {
            let _ = std::fs::create_dir_all(bdir);
            backup_before_schema_upgrade(db_path, bdir).await?;
        }

        let path_str = db_path.to_string_lossy().to_string();
        let options = SqliteConnectOptions::new()
            .filename(db_path)
            .create_if_missing(true)
            .foreign_keys(true)
            .journal_mode(SqliteJournalMode::Wal)
            .synchronous(SqliteSynchronous::Full)
            .busy_timeout(Duration::from_millis(clamped_timeout));

        // SQLite WAL autorise plusieurs lecteurs, mais un seul écrivain à la fois.
        // Le verrou write_lock sérialise les écrivains en mémoire, et BEGIN IMMEDIATE
        // réserve le verrou SQLite dès le début de la transaction (y compris inter-processus).
        let pool = SqlitePoolOptions::new()
            .max_connections(4)
            .connect_with(options)
            .await?;

        Self::apply_migrations(&pool).await?;

        let db = Self {
            pool,
            write_lock: Arc::new(Mutex::new(())),
            db_path: path_str,
            busy_timeout_ms: clamped_timeout,
        };
        db.verify_integrity().await?;
        Self::ensure_neutral_defaults(&db.pool).await?;

        Ok(db)
    }

    pub fn busy_timeout_ms(&self) -> u64 {
        self.busy_timeout_ms
    }

    pub async fn flush_wal_and_close(&self) {
        let _guard = self.lock_write().await;
        let _ = sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
            .execute(&self.pool)
            .await;
        drop(_guard);
        self.pool.close().await;
    }

    pub async fn verify_integrity(&self) -> CoreResult<()> {
        let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
            .fetch_one(&self.pool)
            .await?;
        if integrity != "ok" {
            return Err(CoreError::Database(format!(
                "Échec contrôle intégrité SQLite : {integrity}"
            )));
        }
        let fk_errors: Vec<(String, i64, String, i64)> = sqlx::query_as("PRAGMA foreign_key_check")
            .fetch_all(&self.pool)
            .await?;
        if !fk_errors.is_empty() {
            return Err(CoreError::Database(format!(
                "Violations de clés étrangères détectées ({} erreur(s)).",
                fk_errors.len()
            )));
        }
        Ok(())
    }

    pub async fn lock_write(&self) -> tokio::sync::OwnedMutexGuard<()> {
        self.write_lock.clone().lock_owned().await
    }

    /// Démarre une transaction d'écriture atomique sur une connexion unique du pool
    /// en acquérant le verrou applicatif puis le verrou SQLite `BEGIN IMMEDIATE`.
    pub async fn begin_write(
        &self,
    ) -> CoreResult<(tokio::sync::OwnedMutexGuard<()>, Transaction<'_, Sqlite>)> {
        let guard = self.lock_write().await;
        let tx = self.pool.begin_with("BEGIN IMMEDIATE").await?;
        Ok((guard, tx))
    }

    pub async fn next_sequence(
        tx: &mut Transaction<'_, Sqlite>,
        prefix: &str,
    ) -> CoreResult<String> {
        let year = chrono::Utc::now()
            .format("%Y")
            .to_string()
            .parse::<i64>()
            .unwrap_or(2026);
        sqlx::query(
            "INSERT INTO document_sequences (prefix, year, last_number) VALUES (?, ?, 1)
             ON CONFLICT(prefix, year) DO UPDATE SET last_number = last_number + 1",
        )
        .bind(prefix)
        .bind(year)
        .execute(&mut **tx)
        .await?;

        let val: i64 = sqlx::query_scalar(
            "SELECT last_number FROM document_sequences WHERE prefix = ? AND year = ?",
        )
        .bind(prefix)
        .bind(year)
        .fetch_one(&mut **tx)
        .await?;

        Ok(format!("{prefix}-{year}-{val:05}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn depot_db_futures_are_send() {
        fn assert_send<F: std::future::Future + Send>(_: F) {}
        let path = Path::new("dummy_send_check.db");
        assert_send(DepotDb::connect(path));
        assert_send(DepotDb::connect_with_busy_timeout(path, 5_000));
    }
}
