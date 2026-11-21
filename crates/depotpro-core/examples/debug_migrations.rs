//! Debug migrations at runtime.

use depotpro_core::infrastructure::db::{DepotDb, MIGRATIONS};

#[tokio::main]
async fn main() {
    println!("MIGRATIONS count: {}", MIGRATIONS.len());
    for m in MIGRATIONS {
        println!("  v{} - {}", m.version, m.name);
    }

    let db_path = std::env::temp_dir().join(format!("debug_test_{}.db", uuid::Uuid::new_v4()));
    let opts = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(true)
        .foreign_keys(true);
    let _pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await
        .unwrap();

    let db = DepotDb::connect(&db_path).await.expect("connect");

    let versions: Vec<i64> =
        sqlx::query_scalar("SELECT version FROM schema_version ORDER BY version ASC")
            .fetch_all(&db.pool)
            .await
            .unwrap();
    println!("schema_version after connect: {:?}", versions);

    let _ = std::fs::remove_file(&db_path);
}
