use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{Sqlite, SqlitePool, Transaction};
use tokio::sync::Mutex;
use crate::error::{CoreError, CoreResult};

pub const V3_SCHEMA_SQL: &str = include_str!("../../../../migrations/sqlite/0001_initial_v3.sql");

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

impl DepotDb {
    pub async fn connect(db_path: &Path) -> CoreResult<Self> {
        Self::connect_with_busy_timeout(db_path, default_busy_timeout_ms()).await
    }

    pub async fn connect_with_busy_timeout(db_path: &Path, busy_timeout_ms: u64) -> CoreResult<Self> {
        let clamped_timeout = busy_timeout_ms.clamp(1, 60_000);
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| CoreError::Internal(format!("Création répertoire SQLite impossible : {e}")))?;
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

        let has_schema_table: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'",
        )
        .fetch_one(&pool)
        .await?;
        let already_initialized = if has_schema_table > 0 {
            let v1_count: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM schema_version WHERE version >= 1")
                    .fetch_one(&pool)
                    .await?;
            let logo_col: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM pragma_table_info('app_settings') WHERE name = 'logo_path'",
            )
            .fetch_one(&pool)
            .await?;
            let receipt_col: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM pragma_table_info('expenses') WHERE name = 'receipt_path'",
            )
            .fetch_one(&pool)
            .await?;
            v1_count > 0 && logo_col > 0 && receipt_col > 0
        } else {
            false
        };

        if !already_initialized {
            let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
            sqlx::raw_sql(V3_SCHEMA_SQL).execute(&mut *tx).await?;

            let has_logo_path: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM pragma_table_info('app_settings') WHERE name = 'logo_path'",
            )
            .fetch_one(&mut *tx)
            .await?;
            if has_logo_path == 0 {
                sqlx::query("ALTER TABLE app_settings ADD COLUMN logo_path TEXT NULL")
                    .execute(&mut *tx)
                    .await?;
            }

            let has_receipt_path: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM pragma_table_info('expenses') WHERE name = 'receipt_path'",
            )
            .fetch_one(&mut *tx)
            .await?;
            if has_receipt_path == 0 {
                sqlx::query("ALTER TABLE expenses ADD COLUMN receipt_path TEXT NULL")
                    .execute(&mut *tx)
                    .await?;
            }

            sqlx::query(
                "INSERT OR IGNORE INTO schema_version (version, name) VALUES (1, '0001_initial_v3')",
            )
            .execute(&mut *tx)
            .await?;

            sqlx::query(
                "INSERT OR IGNORE INTO app_settings (id, company_name, company_legal_name, address, phone, city, country, currency)
                 VALUES (1, 'DEPOTPRO Distribution', 'Dépôt Central Boissons & Consignes SARL', 'Zone Industrielle Koumassi', '+225 07 00 00 00 00', 'Abidjan', 'Côte d''Ivoire', 'FCFA')",
            )
            .execute(&mut *tx)
            .await?;

            for (code, label, is_cash) in [
                ("cash", "Espèces", 1_i64),
                ("wave", "Wave Mobile Money", 0_i64),
                ("orange_money", "Orange Money", 0_i64),
                ("mtn_money", "MTN MoMo", 0_i64),
                ("transfer", "Virement bancaire", 0_i64),
            ] {
                sqlx::query(
                    "INSERT OR IGNORE INTO payment_methods (code, label, is_cash, active) VALUES (?, ?, ?, 1)",
                )
                .bind(code)
                .bind(label)
                .bind(is_cash)
                .execute(&mut *tx)
                .await?;
            }

            for cat in [
                "Carburant & Livraison",
                "Électricité & Eau",
                "Maintenance & Réparation",
                "Manutention",
                "Fournitures",
                "Divers",
            ] {
                sqlx::query("INSERT OR IGNORE INTO expense_categories (name) VALUES (?)")
                    .bind(cat)
                    .execute(&mut *tx)
                    .await?;
            }

            tx.commit().await?;
        }

        let db = Self {
            pool,
            write_lock: Arc::new(Mutex::new(())),
            db_path: path_str,
            busy_timeout_ms: clamped_timeout,
        };
        db.verify_integrity().await?;

        Ok(db)
    }

    pub fn busy_timeout_ms(&self) -> u64 {
        self.busy_timeout_ms
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
        let fk_errors: Vec<(String, i64, String, i64)> =
            sqlx::query_as("PRAGMA foreign_key_check")
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

    pub async fn next_sequence(tx: &mut Transaction<'_, Sqlite>, prefix: &str) -> CoreResult<String> {
        let year = chrono::Utc::now().format("%Y").to_string().parse::<i64>().unwrap_or(2026);
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
