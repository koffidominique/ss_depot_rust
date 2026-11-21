use depotpro_core::application::auth;
use depotpro_core::infrastructure::backup::{
    create_consistent_backup, import_backup_bytes, inspect_local_db, list_backups,
    read_backup_bytes,
};
use depotpro_core::infrastructure::db::{DepotDb, CURRENT_SCHEMA_VERSION, MIGRATIONS};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::path::PathBuf;

fn temp_dir(prefix: &str) -> PathBuf {
    let dir =
        std::env::temp_dir().join(format!("depotpro_local_{prefix}_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[tokio::test]
async fn pre_upgrade_backup_inspect_and_import_work_locally() {
    let dir = temp_dir("upgrade");
    let db_path = dir.join("depotpro_v3.db");
    let backup_dir = dir.join("backups");

    // 1. Créer une base v18 puis ouvrir via connect_with_backup_dir -> pré-sauvegarde auto
    let opts = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(true)
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await
        .unwrap();
    let up_to_18: Vec<_> = MIGRATIONS
        .iter()
        .filter(|m| m.version <= 18)
        .cloned()
        .collect();
    let rep18 = DepotDb::apply_migrations_list(&pool, &up_to_18)
        .await
        .unwrap();
    assert_eq!(rep18.latest_version, 18);
    pool.close().await;

    let db = DepotDb::connect_with_backup_dir(&db_path, &backup_dir)
        .await
        .unwrap();
    let actor = auth::setup_owner_pin(&db, "123456").await.unwrap();

    let loc_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM stock_locations")
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert!(loc_count >= 1);

    let pre_backups = auth::with_actor(actor.clone(), async { list_backups(&backup_dir) })
        .await
        .unwrap();
    assert!(
        pre_backups.iter().any(|b| b.name.contains("_pre18.db")),
        "Une sauvegarde pré-migration v18 doit exister"
    );

    // 2. Diagnostic base locale SQLite
    let status = auth::with_actor(actor.clone(), inspect_local_db(&db, &backup_dir))
        .await
        .unwrap();
    assert_eq!(status.integrity, "ok");
    assert_eq!(status.foreign_key_errors, 0);
    assert_eq!(status.schema_version, CURRENT_SCHEMA_VERSION);
    assert_eq!(status.journal_mode, "WAL");
    assert!(status.db_size_bytes > 0);

    // 3. Rejet d'un fichier invalide + import d'une sauvegarde valide
    let bad = auth::with_actor(
        actor.clone(),
        import_backup_bytes(
            &db,
            &backup_dir,
            "corrupt.db",
            b"not a sqlite file at all...",
        ),
    )
    .await;
    assert!(bad.is_err());

    let exported = auth::with_actor(actor.clone(), create_consistent_backup(&db, &backup_dir))
        .await
        .unwrap();
    let exp_name = exported.file_name().unwrap().to_string_lossy().to_string();
    let (_, raw_bytes) = auth::with_actor(actor.clone(), async {
        read_backup_bytes(&backup_dir, &exp_name)
    })
    .await
    .unwrap();

    let imported = auth::with_actor(
        actor,
        import_backup_bytes(&db, &backup_dir, "usb_copy.db", &raw_bytes),
    )
    .await
    .unwrap();
    assert!(imported.name.ends_with(".db"));
    assert_eq!(imported.integrity.as_deref(), Some("ok"));

    db.flush_wal_and_close().await;
    let _ = std::fs::remove_dir_all(&dir);
}
