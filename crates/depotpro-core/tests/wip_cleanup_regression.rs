//! Regression tests for the WIP cleanup.
//!
//! `import_products_csv` inserts an initial-stock movement for every imported
//! product whose `stock` column is > 0. A broken WIP edit had injected a stray
//! `}` inside that INSERT string, producing invalid SQL that only failed at
//! runtime (never at compile time). These tests lock the correct behaviour so a
//! regression is caught by `cargo test`.

use depotpro_core::application::products;
use depotpro_core::infrastructure::db::DepotDb;
use std::path::PathBuf;

fn temp_db_path(tag: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "depotpro_wip_cleanup_{tag}_{}",
        uuid::Uuid::new_v4()
    ))
}

#[tokio::test]
async fn csv_import_with_initial_stock_creates_movements() {
    let db = DepotDb::connect(&temp_db_path("csv_stock"))
        .await
        .expect("connect temp db");

    // Header deliberately exercises the code path that had the broken SQL:
    // a positive `stock` triggers a stock_movements INSERT per product.
    let csv = "\
name,base_unit,category,stock,min_stock,purchase_price,retail_price
Beaufort 33cl,bouteille,Bières,24,6,300,500
Drogba 50cl,bouteille,Bières,12,0,400,650
";

    let created = products::import_products_csv(&db, csv)
        .await
        .expect("csv import must succeed with valid SQL");

    assert_eq!(created, 2, "two products should be imported");

    // Every product must be persisted with the exact milli-unit stock (x1000).
    let stocks: Vec<i64> = sqlx::query_scalar("SELECT stock_milli FROM products ORDER BY id")
        .fetch_all(&db.pool)
        .await
        .unwrap();
    assert_eq!(stocks, vec![24_000, 12_000]);

    // One initial-stock movement per imported product, all with the fixed reason.
    // This is the exact statement that was broken by the stray `}`.
    let movement_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM stock_movements WHERE reason = 'Import initial CSV'",
    )
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(
        movement_count, 2,
        "one initial movement per stocked product"
    );

    let bad_after: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM stock_movements WHERE stock_before_milli != 0 OR stock_after_milli <= 0",
    )
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(
        bad_after, 0,
        "initial movements must go from 0 to the imported stock"
    );
}

#[tokio::test]
async fn csv_import_requires_header_and_rows() {
    let db = DepotDb::connect(&temp_db_path("csv_validation"))
        .await
        .expect("connect temp db");

    let only_header = "name,base_unit\n";
    let err = products::import_products_csv(&db, only_header)
        .await
        .expect_err("header-only CSV must be rejected");
    assert!(
        err.to_string()
            .to_lowercase()
            .contains("au moins une ligne")
            || err.to_string().contains("en-tête"),
        "unexpected error message: {err}"
    );
}
