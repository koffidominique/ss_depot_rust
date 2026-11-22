//! Generate expected schema JSON for migration tests.

use depotpro_core::infrastructure::db::DepotDb;

#[tokio::main]
async fn main() {
    let db_path = std::env::temp_dir().join(format!("gen_schema_{}.db", uuid::Uuid::new_v4()));
    let db = DepotDb::connect(&db_path).await.expect("connect");
    let snap = DepotDb::extract_schema_snapshot(&db.pool)
        .await
        .expect("extract schema");
    let json = serde_json::to_string_pretty(&snap).expect("serialize");
    std::fs::write("migrations/sqlite/expected_schema_v23.json", json).expect("write");
    println!("Generated expected_schema_v23.json");
    let _ = std::fs::remove_file(&db_path);
}
