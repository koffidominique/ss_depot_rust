// ============================================================================
// Exécution transactionnelle des migrations SQLite V3
// ============================================================================

use crate::error::CoreResult;
use sqlx::{Sqlite, SqlitePool, Transaction};
use std::collections::HashSet;

pub use super::sql_defs::{
    MigrationDef, MigrationRunReport, CURRENT_SCHEMA_VERSION, MIGRATIONS,
    MIN_SUPPORTED_SCHEMA_VERSION, V3_MIGRATION_0002_SQL, V3_MIGRATION_0003_SQL,
    V3_MIGRATION_0004_SQL, V3_MIGRATION_0005_SQL, V3_MIGRATION_0006_SQL, V3_MIGRATION_0007_SQL,
    V3_MIGRATION_0008_SQL, V3_MIGRATION_0009_SQL, V3_MIGRATION_0010_SQL, V3_MIGRATION_0011_SQL,
    V3_MIGRATION_0012_SQL, V3_MIGRATION_0013_SQL, V3_MIGRATION_0014_SQL, V3_MIGRATION_0015_SQL,
    V3_MIGRATION_0016_SQL, V3_MIGRATION_0017_SQL, V3_MIGRATION_0018_SQL, V3_MIGRATION_0019_SQL,
    V3_SCHEMA_SQL,
};
use super::DepotDb;

pub fn split_sql_statements(sql: &str) -> Vec<String> {
    let mut statements = Vec::new();
    let mut current = String::new();
    let chars: Vec<char> = sql.chars().collect();
    let mut i = 0;
    let mut in_single_quote = false;
    let mut in_line_comment = false;

    while i < chars.len() {
        let ch = chars[i];
        let next = if i + 1 < chars.len() {
            chars[i + 1]
        } else {
            '\0'
        };

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
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?")
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
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?")
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
}
