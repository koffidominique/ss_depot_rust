use std::collections::HashSet;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
use serde::{Deserialize, Serialize};
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{Sqlite, SqlitePool, Transaction};
use tokio::sync::Mutex;
use crate::error::{CoreError, CoreResult};

pub const V3_SCHEMA_SQL: &str = include_str!("../../../../migrations/sqlite/0001_initial_v3.sql");
pub const V3_MIGRATION_0002_SQL: &str =
    include_str!("../../../../migrations/sqlite/0002_app_settings_logo_path.sql");
pub const V3_MIGRATION_0003_SQL: &str =
    include_str!("../../../../migrations/sqlite/0003_expense_receipt_path.sql");
pub const V3_MIGRATION_0004_SQL: &str =
    include_str!("../../../../migrations/sqlite/0004_onboarding_setup_state.sql");
pub const V3_MIGRATION_0005_SQL: &str =
    include_str!("../../../../migrations/sqlite/0005_security_roles_users.sql");

#[derive(Debug, Clone, Copy)]
pub struct MigrationDef {
    pub version: i64,
    pub name: &'static str,
    pub sql: &'static str,
}

pub const MIGRATIONS: &[MigrationDef] = &[
    MigrationDef {
        version: 1,
        name: "0001_initial_v3",
        sql: V3_SCHEMA_SQL,
    },
    MigrationDef {
        version: 2,
        name: "0002_app_settings_logo_path",
        sql: V3_MIGRATION_0002_SQL,
    },
    MigrationDef {
        version: 3,
        name: "0003_expense_receipt_path",
        sql: V3_MIGRATION_0003_SQL,
    },
    MigrationDef {
        version: 4,
        name: "0004_onboarding_setup_state",
        sql: V3_MIGRATION_0004_SQL,
    },
    MigrationDef {
        version: 5,
        name: "0005_security_roles_users",
        sql: V3_MIGRATION_0005_SQL,
    },
];

pub const MIN_SUPPORTED_SCHEMA_VERSION: i64 = 1;
pub const CURRENT_SCHEMA_VERSION: i64 = 5;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MigrationRunReport {
    pub applied_versions: Vec<i64>,
    pub latest_version: i64,
    pub skipped_legacy_columns_for: Vec<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaColumnSnapshot {
    pub name: String,
    pub col_type: String,
    pub notnull: i64,
    pub pk: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaTableSnapshot {
    pub name: String,
    pub columns: Vec<SchemaColumnSnapshot>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaIndexSnapshot {
    pub name: String,
    pub table_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaVersionEntry {
    pub version: i64,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaSnapshot {
    pub tables: Vec<SchemaTableSnapshot>,
    pub indexes: Vec<SchemaIndexSnapshot>,
    pub schema_versions: Vec<SchemaVersionEntry>,
}

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

pub fn split_sql_statements(sql: &str) -> Vec<String> {
    let mut statements = Vec::new();
    let mut current = String::new();
    let chars: Vec<char> = sql.chars().collect();
    let mut i = 0;
    let mut in_single_quote = false;
    let mut in_line_comment = false;

    while i < chars.len() {
        let ch = chars[i];
        let next = if i + 1 < chars.len() { chars[i + 1] } else { '\0' };

        if in_line_comment {
            if ch == '\n' {
                in_line_comment = false;
                current.push(ch);
            }
            i += 1;
            continue;
        }

        if in_single_quote {
            current.push(ch);
            if ch == '\'' && next == '\'' {
                current.push(next);
                i += 2;
                continue;
            } else if ch == '\'' {
                in_single_quote = false;
            }
            i += 1;
            continue;
        }

        if ch == '-' && next == '-' {
            in_line_comment = true;
            i += 2;
            continue;
        }

        if ch == '\'' {
            in_single_quote = true;
            current.push(ch);
            i += 1;
            continue;
        }

        if ch == ';' {
            let trimmed = current.trim();
            if !trimmed.is_empty() && !trimmed.to_ascii_uppercase().starts_with("PRAGMA ") {
                statements.push(trimmed.to_string());
            }
            current.clear();
            i += 1;
            continue;
        }

        current.push(ch);
        i += 1;
    }

    let trailing = current.trim();
    if !trailing.is_empty() && !trailing.to_ascii_uppercase().starts_with("PRAGMA ") {
        statements.push(trailing.to_string());
    }
    statements
}

async fn table_exists_tx(tx: &mut Transaction<'_, Sqlite>, table_name: &str) -> CoreResult<bool> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .bind(table_name)
    .fetch_one(&mut **tx)
    .await?;
    Ok(count > 0)
}

async fn column_exists_tx(
    tx: &mut Transaction<'_, Sqlite>,
    table_name: &str,
    column_name: &str,
) -> CoreResult<bool> {
    if !table_exists_tx(tx, table_name).await? {
        return Ok(false);
    }
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?")
            .bind(table_name)
            .bind(column_name)
            .fetch_one(&mut **tx)
            .await?;
    Ok(count > 0)
}

async fn should_skip_sql_due_to_existing_column(
    tx: &mut Transaction<'_, Sqlite>,
    migration: &MigrationDef,
) -> CoreResult<bool> {
    if migration.version == 2 || migration.name == "0002_app_settings_logo_path" {
        return column_exists_tx(tx, "app_settings", "logo_path").await;
    }
    if migration.version == 3 || migration.name == "0003_expense_receipt_path" {
        return column_exists_tx(tx, "expenses", "receipt_path").await;
    }
    if migration.version == 4 || migration.name == "0004_onboarding_setup_state" {
        return column_exists_tx(tx, "app_settings", "setup_completed").await;
    }
    if migration.version == 5 || migration.name == "0005_security_roles_users" {
        let has_users: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'users'",
        )
        .fetch_one(&mut **tx)
        .await?;
        let has_actor_id = column_exists_tx(tx, "audit_logs", "actor_user_id").await?;
        let has_actor_name = column_exists_tx(tx, "audit_logs", "actor_name").await?;
        let has_actor_role = column_exists_tx(tx, "audit_logs", "actor_role").await?;
        return Ok(has_users > 0 && has_actor_id && has_actor_name && has_actor_role);
    }
    Ok(false)
}

impl DepotDb {
    pub async fn connect(db_path: &Path) -> CoreResult<Self> {
        Self::connect_with_busy_timeout(db_path, default_busy_timeout_ms()).await
    }

    pub async fn connect_with_busy_timeout(db_path: &Path, busy_timeout_ms: u64) -> CoreResult<Self> {
        let clamped_timeout = busy_timeout_ms.clamp(1, 60_000);
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                CoreError::Internal(format!("Création répertoire SQLite impossible : {e}"))
            })?;
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

    pub async fn apply_migrations(pool: &SqlitePool) -> CoreResult<MigrationRunReport> {
        Self::apply_migrations_list(pool, MIGRATIONS).await
    }

    pub async fn apply_migrations_list(
        pool: &SqlitePool,
        migrations: &[MigrationDef],
    ) -> CoreResult<MigrationRunReport> {
        let mut ordered: Vec<MigrationDef> = migrations.to_vec();
        ordered.sort_by_key(|m| m.version);

        let has_schema_table: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'",
        )
        .fetch_one(pool)
        .await?;

        let mut applied_set = HashSet::new();
        if has_schema_table > 0 {
            let versions: Vec<i64> =
                sqlx::query_scalar("SELECT version FROM schema_version ORDER BY version ASC")
                    .fetch_all(pool)
                    .await?;
            for v in versions {
                applied_set.insert(v);
            }
        }

        let pending: Vec<MigrationDef> = ordered
            .into_iter()
            .filter(|m| !applied_set.contains(&m.version))
            .collect();

        if pending.is_empty() {
            let latest_version = applied_set.iter().copied().max().unwrap_or(0);
            return Ok(MigrationRunReport {
                applied_versions: Vec::new(),
                latest_version,
                skipped_legacy_columns_for: Vec::new(),
            });
        }

        let mut newly_applied = Vec::new();
        let mut skipped_legacy_columns_for = Vec::new();

        for migration in pending {
            let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;
            let skip_sql = should_skip_sql_due_to_existing_column(&mut tx, &migration).await?;
            if skip_sql {
                skipped_legacy_columns_for.push(migration.version);
            } else {
                let statements = split_sql_statements(migration.sql);
                for stmt in statements {
                    sqlx::query(&stmt).execute(&mut *tx).await?;
                }
            }

            sqlx::query(
                "INSERT INTO schema_version (version, name) VALUES (?, ?) ON CONFLICT(version) DO NOTHING",
            )
            .bind(migration.version)
            .bind(migration.name)
            .execute(&mut *tx)
            .await?;

            tx.commit().await?;
            newly_applied.push(migration.version);
            applied_set.insert(migration.version);
        }

        let latest_version = applied_set.iter().copied().max().unwrap_or(0);
        Ok(MigrationRunReport {
            applied_versions: newly_applied,
            latest_version,
            skipped_legacy_columns_for,
        })
    }

    /// Initialise uniquement les paramètres applicatifs neutres nécessaires au premier démarrage
    /// (aucun fournisseur, produit, stock ni client fictif).
    pub async fn ensure_neutral_defaults(pool: &SqlitePool) -> CoreResult<()> {
        let settings_count_pre: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM app_settings")
                .fetch_one(pool)
                .await?;
        let methods_count_pre: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM payment_methods")
                .fetch_one(pool)
                .await?;
        let exp_cat_count_pre: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM expense_categories")
                .fetch_one(pool)
                .await?;
        let cat_count_pre: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM categories")
                .fetch_one(pool)
                .await?;

        if settings_count_pre > 0
            && methods_count_pre > 0
            && exp_cat_count_pre > 0
            && cat_count_pre > 0
        {
            return Ok(());
        }

        let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;

        let settings_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM app_settings")
                .fetch_one(&mut *tx)
                .await?;
        if settings_count == 0 {
            sqlx::query(
                "INSERT OR IGNORE INTO app_settings (
                    id, company_name, company_legal_name, address, phone, email, city, country, currency, setup_completed
                 ) VALUES (1, 'Mon Dépôt', NULL, NULL, NULL, NULL, NULL, NULL, 'FCFA', 0)",
            )
            .execute(&mut *tx)
            .await?;
        }

        let methods_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM payment_methods")
                .fetch_one(&mut *tx)
                .await?;
        if methods_count == 0 {
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
        }

        let exp_cat_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM expense_categories")
                .fetch_one(&mut *tx)
                .await?;
        if exp_cat_count == 0 {
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
        }

        let cat_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM categories")
                .fetch_one(&mut *tx)
                .await?;
        if cat_count == 0 {
            for (name, desc) in [
                ("Bières", "Bières en bouteille, canette ou casier"),
                ("Boissons gazeuses", "Sodas et boissons gazeuses"),
                ("Eaux minérales", "Eaux plates et gazeuses"),
                ("Jus & Énergisants", "Jus de fruits, nectars et boissons énergisantes"),
            ] {
                sqlx::query(
                    "INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)",
                )
                .bind(name)
                .bind(desc)
                .execute(&mut *tx)
                .await?;
            }
        }

        tx.commit().await?;
        Ok(())
    }

    pub async fn extract_schema_snapshot(pool: &SqlitePool) -> CoreResult<SchemaSnapshot> {
        let table_names: Vec<String> = sqlx::query_scalar(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC",
        )
        .fetch_all(pool)
        .await?;

        let mut tables = Vec::with_capacity(table_names.len());
        for tname in table_names {
            let cols: Vec<(String, String, i64, i64)> = sqlx::query_as(
                "SELECT name, type, \"notnull\", pk FROM pragma_table_info(?)",
            )
            .bind(&tname)
            .fetch_all(pool)
            .await?;
            tables.push(SchemaTableSnapshot {
                name: tname,
                columns: cols
                    .into_iter()
                    .map(|(name, col_type, notnull, pk)| SchemaColumnSnapshot {
                        name,
                        col_type: col_type.to_uppercase(),
                        notnull,
                        pk,
                    })
                    .collect(),
            });
        }

        let idx_rows: Vec<(String, String)> = sqlx::query_as(
            "SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%' ORDER BY name ASC",
        )
        .fetch_all(pool)
        .await?;
        let indexes = idx_rows
            .into_iter()
            .map(|(name, table_name)| SchemaIndexSnapshot { name, table_name })
            .collect();

        let has_sv: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'",
        )
        .fetch_one(pool)
        .await?;
        let schema_versions = if has_sv > 0 {
            let rows: Vec<(i64, String)> =
                sqlx::query_as("SELECT version, name FROM schema_version ORDER BY version ASC")
                    .fetch_all(pool)
                    .await?;
            rows.into_iter()
                .map(|(version, name)| SchemaVersionEntry { version, name })
                .collect()
        } else {
            Vec::new()
        };

        Ok(SchemaSnapshot {
            tables,
            indexes,
            schema_versions,
        })
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
