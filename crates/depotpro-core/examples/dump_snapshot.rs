use depotpro_core::infrastructure::db::DepotDb;

#[tokio::main]
async fn main() {
    let path = std::env::args().nth(1).expect("db path");
    let db = DepotDb::connect(std::path::Path::new(&path))
        .await
        .expect("connect");
    let snap = DepotDb::extract_schema_snapshot(&db.pool)
        .await
        .expect("snapshot");
    println!("{}", serde_json::to_string(&snap).unwrap());
}
