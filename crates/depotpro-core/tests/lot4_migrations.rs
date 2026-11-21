use depotpro_core::application::reports;
use depotpro_core::infrastructure::db::{
    split_sql_statements, DepotDb, SchemaSnapshot, MIGRATIONS, V3_SCHEMA_SQL,
};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::path::PathBuf;

const EXPECTED_SCHEMA_V19_JSON: &str =
    include_str!("../../../migrations/sqlite/expected_schema_v19.json");

fn temp_db_path(tag: &str) -> PathBuf {
    std::env::temp_dir().join(format!("depotpro_lot4_{tag}_{}.db", uuid::Uuid::new_v4()))
}

fn legacy_v3_sql_without_optional_cols() -> String {
    V3_SCHEMA_SQL
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            !trimmed.starts_with("logo_path ") && !trimmed.starts_with("receipt_path ")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn normalize_snapshot(mut snap: SchemaSnapshot) -> SchemaSnapshot {
    // Sort tables by name
    snap.tables.sort_by(|a, b| a.name.cmp(&b.name));
    for table in &mut snap.tables {
        table.columns.sort_by(|a, b| a.name.cmp(&b.name));
    }
    // Sort indexes by name
    snap.indexes.sort_by(|a, b| a.name.cmp(&b.name));
    // Sort schema versions by version
    snap.schema_versions.sort_by_key(|sv| sv.version);
    snap
}

#[tokio::test]
async fn lot4_fresh_db_neutral_defaults_and_schema_parity_with_node() {
    let db_path = temp_db_path("fresh_parity");
    let db = DepotDb::connect(&db_path).await.expect("connect fresh db");

    // 1. Vérifier les versions 1..5 appliquées dans l'ordre
    let snapshot = DepotDb::extract_schema_snapshot(&db.pool)
        .await
        .expect("extract schema");
    let expected: SchemaSnapshot =
        serde_json::from_str(EXPECTED_SCHEMA_V19_JSON).expect("parse expected_schema_v19.json");
    assert_eq!(
        normalize_snapshot(snapshot),
        normalize_snapshot(expected),
        "Le schéma Rust doit correspondre exactement au schéma Node attendu"
    );

    // 2. Aucune donnée commerciale fictive
    for tbl in [
        "suppliers",
        "products",
        "product_packagings",
        "clients",
        "client_credit_settings",
        "returnable_packaging_types",
        "returnable_stock_balances",
        "stock_movements",
        "document_sequences",
    ] {
        let query = format!("SELECT COUNT(*) FROM {tbl}");
        let count: i64 = sqlx::query_scalar(&query)
            .fetch_one(&db.pool)
            .await
            .unwrap();
        assert_eq!(count, 0, "{tbl} doit être vide en production");
    }

    // 3. Paramètres neutres et références génériques par défaut
    let settings = reports::get_settings(&db).await.expect("get settings");
    assert_eq!(settings.company_name, "Mon Dépôt");
    assert_eq!(settings.company_legal_name, None);
    assert_eq!(settings.address, None);
    assert_eq!(settings.phone, None);
    assert_eq!(settings.email, None);
    assert_eq!(settings.city, None);
    assert_eq!(settings.country, None);
    assert_eq!(settings.currency, "FCFA");
    assert_eq!(settings.setup_completed, 0);

    let pm_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM payment_methods")
        .fetch_one(&db.pool)
        .await
        .unwrap();
    let exp_cat_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM expense_categories")
        .fetch_one(&db.pool)
        .await
        .unwrap();
    let cat_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM categories")
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(pm_count, 6);
    assert_eq!(exp_cat_count, 6);
    assert_eq!(cat_count, 14);

    // 4. L'assistant de configuration met à jour setup_completed = 1
    let updated = reports::update_settings(
        &db,
        reports::UpdateSettingsInput {
            company_name: Some("Dépôt Test Configuré".to_string()),
            phone: Some("+22507070707".to_string()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(updated.settings.company_name, "Dépôt Test Configuré");
    assert_eq!(updated.settings.setup_completed, 1);

    // 5. Rejeu idempotent
    let replay = DepotDb::apply_migrations(&db.pool).await.unwrap();
    assert!(replay.applied_versions.is_empty());
    assert_eq!(replay.latest_version, 18);

    let _ = std::fs::remove_file(&db_path);
    let _ = std::fs::remove_file(format!("{}-wal", db_path.display()));
    let _ = std::fs::remove_file(format!("{}-shm", db_path.display()));
}

#[tokio::test]
async fn lot4_existing_columns_and_missing_columns_upgrade_cleanly() {
    // Cas A : Base avec logo_path & receipt_path déjà présentes, mais schema_version = [1] seulement
    let existing_cols_path = temp_db_path("existing_cols");
    let opts = SqliteConnectOptions::new()
        .filename(&existing_cols_path)
        .create_if_missing(true)
        .foreign_keys(true);
    let pool_a = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await
        .unwrap();
    for stmt in split_sql_statements(V3_SCHEMA_SQL) {
        sqlx::query(&stmt).execute(&pool_a).await.unwrap();
    }
    sqlx::query("INSERT INTO schema_version (version, name) VALUES (1, '0001_initial_v3')")
        .execute(&pool_a)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO app_settings (id, company_name, logo_path) VALUES (1, 'Dépôt Logo', 'data:image/png;base64,AAAA')",
    )
    .execute(&pool_a)
    .await
    .unwrap();
    sqlx::query("INSERT INTO payment_methods (code, label, is_cash, active) VALUES ('cash', 'Espèces', 1, 1)")
        .execute(&pool_a)
        .await
        .unwrap();
    sqlx::query("INSERT INTO cash_sessions (reference, opening_key, status, opening_cash) VALUES ('CAI-A', 'ka', 'open', 1000)")
        .execute(&pool_a)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO expenses (reference, request_key, category, amount, method_code, session_id, receipt_path) VALUES ('DEP-A', 'rka', 'Divers', 500, 'cash', 1, 'data:image/png;base64,BBBB')",
    )
    .execute(&pool_a)
    .await
    .unwrap();
    pool_a.close().await;

    let db_a = DepotDb::connect(&existing_cols_path).await.unwrap();
    let settings_a = reports::get_settings(&db_a).await.unwrap();
    assert_eq!(settings_a.company_name, "Dépôt Logo");
    assert_eq!(
        settings_a.logo_path.as_deref(),
        Some("data:image/png;base64,AAAA")
    );
    assert_eq!(settings_a.setup_completed, 0);
    let receipt_a: Option<String> =
        sqlx::query_scalar("SELECT receipt_path FROM expenses WHERE id = 1")
            .fetch_one(&db_a.pool)
            .await
            .unwrap();
    assert_eq!(receipt_a.as_deref(), Some("data:image/png;base64,BBBB"));

    // Cas B : Base legacy sans colonnes logo_path / receipt_path / setup_completed
    let missing_cols_path = temp_db_path("missing_cols");
    let opts_b = SqliteConnectOptions::new()
        .filename(&missing_cols_path)
        .create_if_missing(true)
        .foreign_keys(true);
    let pool_b = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts_b)
        .await
        .unwrap();
    for stmt in split_sql_statements(&legacy_v3_sql_without_optional_cols()) {
        sqlx::query(&stmt).execute(&pool_b).await.unwrap();
    }
    sqlx::query("INSERT INTO schema_version (version, name) VALUES (1, '0001_initial_v3')")
        .execute(&pool_b)
        .await
        .unwrap();
    sqlx::query("INSERT INTO app_settings (id, company_name, phone) VALUES (1, 'Dépôt Legacy', '+22501010101')")
        .execute(&pool_b)
        .await
        .unwrap();
    pool_b.close().await;

    let db_b = DepotDb::connect(&missing_cols_path).await.unwrap();
    let settings_b = reports::get_settings(&db_b).await.unwrap();
    assert_eq!(settings_b.company_name, "Dépôt Legacy");
    assert_eq!(settings_b.phone.as_deref(), Some("+22501010101"));
    assert_eq!(settings_b.logo_path, None);
    assert_eq!(settings_b.setup_completed, 0);

    let snap_b = DepotDb::extract_schema_snapshot(&db_b.pool).await.unwrap();
    let expected: SchemaSnapshot = serde_json::from_str(EXPECTED_SCHEMA_V19_JSON).unwrap();
    assert_eq!(normalize_snapshot(snap_b), normalize_snapshot(expected));

    let _ = std::fs::remove_file(&existing_cols_path);
    let _ = std::fs::remove_file(&missing_cols_path);
}

#[tokio::test]
async fn lot4_interrupted_migration_rolls_back_and_partial_migration_recovers() {
    let db_path = temp_db_path("interrupted_partial");
    let opts = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(true)
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await
        .unwrap();

    let mut bad_list = MIGRATIONS.to_vec();
    bad_list.push(depotpro_core::infrastructure::db::MigrationDef {
        version: 99,
        name: "0099_bad_interrupted",
        sql:
            "CREATE TABLE partial_should_rollback (id INTEGER PRIMARY KEY); INVALID SQL STATEMENT;",
    });

    let err = DepotDb::apply_migrations_list(&pool, &bad_list).await;
    assert!(err.is_err(), "La migration invalide 99 doit échouer");

    let table_exists: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'partial_should_rollback'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        table_exists, 0,
        "Le rollback atomique doit annuler partial_should_rollback"
    );

    let sv_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM schema_version WHERE version = 99")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(sv_count, 0);
    pool.close().await;

    // Cas migration partiellement appliquée : logo_path ajoutée sans enregistrement v2
    let partial_path = temp_db_path("partial_state");
    let opts_p = SqliteConnectOptions::new()
        .filename(&partial_path)
        .create_if_missing(true)
        .foreign_keys(true);
    let pool_p = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts_p)
        .await
        .unwrap();
    for stmt in split_sql_statements(&legacy_v3_sql_without_optional_cols()) {
        sqlx::query(&stmt).execute(&pool_p).await.unwrap();
    }
    sqlx::query("ALTER TABLE app_settings ADD COLUMN logo_path TEXT NULL")
        .execute(&pool_p)
        .await
        .unwrap();
    sqlx::query("INSERT INTO schema_version (version, name) VALUES (1, '0001_initial_v3')")
        .execute(&pool_p)
        .await
        .unwrap();
    let report = DepotDb::apply_migrations(&pool_p).await.unwrap();
    assert_eq!(
        report.applied_versions,
        vec![2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
    );
    assert_eq!(report.skipped_legacy_columns_for, vec![2]);
    pool_p.close().await;

    let db_recovered = DepotDb::connect(&partial_path).await.unwrap();
    assert!(db_recovered.verify_integrity().await.is_ok());

    let _ = std::fs::remove_file(&db_path);
    let _ = std::fs::remove_file(&partial_path);
}

#[tokio::test]
#[ignore]
async fn extract_schema_for_expected_file() {
    let db_path = temp_db_path("schema_extract");
    let db = DepotDb::connect(&db_path).await.unwrap();
    let snapshot = DepotDb::extract_schema_snapshot(&db.pool).await.unwrap();
    let json = serde_json::to_string_pretty(&snapshot).unwrap();
    println!("{}", json);

    std::fs::remove_file(&db_path).ok();
    std::fs::remove_file(format!("{}-wal", db_path.display())).ok();
    std::fs::remove_file(format!("{}-shm", db_path.display())).ok();
}
