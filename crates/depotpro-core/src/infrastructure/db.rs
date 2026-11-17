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
}

impl DepotDb {
    pub async fn connect(db_path: &Path) -> CoreResult<Self> {
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
            .busy_timeout(Duration::from_millis(5000));

        // SQLite WAL autorise plusieurs lecteurs, mais un seul écrivain à la fois.
        // Le verrou write_lock sérialise proprement toutes les transactions d'écriture.
        let pool = SqlitePoolOptions::new()
            .max_connections(4)
            .connect_with(options)
            .await?;

        sqlx::raw_sql(V3_SCHEMA_SQL).execute(&pool).await?;

        let has_logo_path: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM pragma_table_info('app_settings') WHERE name = 'logo_path'",
        )
        .fetch_one(&pool)
        .await?;
        if has_logo_path == 0 {
            sqlx::query("ALTER TABLE app_settings ADD COLUMN logo_path TEXT NULL")
                .execute(&pool)
                .await?;
        }

        let has_receipt_path: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM pragma_table_info('expenses') WHERE name = 'receipt_path'",
        )
        .fetch_one(&pool)
        .await?;
        if has_receipt_path == 0 {
            sqlx::query("ALTER TABLE expenses ADD COLUMN receipt_path TEXT NULL")
                .execute(&pool)
                .await?;
        }

        sqlx::query("INSERT OR IGNORE INTO schema_version (version, name) VALUES (1, '0001_initial_v3')")
            .execute(&pool)
            .await?;

        sqlx::query(
            "INSERT OR IGNORE INTO app_settings (id, company_name, company_legal_name, address, phone, city, country, currency)
             VALUES (1, 'DEPOTPRO Distribution', 'Dépôt Central Boissons & Consignes SARL', 'Zone Industrielle Koumassi', '+225 07 00 00 00 00', 'Abidjan', 'Côte d''Ivoire', 'FCFA')",
        )
        .execute(&pool)
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
            .execute(&pool)
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
                .execute(&pool)
                .await?;
        }

        let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
            .fetch_one(&pool)
            .await?;
        if integrity != "ok" {
            return Err(CoreError::Database(format!(
                "Échec contrôle intégrité SQLite au démarrage : {integrity}"
            )));
        }

        Ok(Self {
            pool,
            write_lock: Arc::new(Mutex::new(())),
            db_path: path_str,
        })
    }

    pub async fn lock_write(&self) -> tokio::sync::OwnedMutexGuard<()> {
        self.write_lock.clone().lock_owned().await
    }

    pub async fn begin_write(&self) -> CoreResult<(tokio::sync::OwnedMutexGuard<()>, Transaction<'_, Sqlite>)> {
        let guard = self.lock_write().await;
        let tx = self.pool.begin().await?;
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
