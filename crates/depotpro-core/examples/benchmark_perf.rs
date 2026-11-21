//! Benchmark for DEPOTPRO PREMIUM V3 — 10k products / 100k sale lines.
//!
//! Usage:
//!   cargo run -p depotpro-core --example benchmark_perf

use std::time::Instant;

use depotpro_core::application::products;
use depotpro_core::application::sales;
use depotpro_core::infrastructure::db::DepotDb;

fn percentile(sorted: &[f64], p: usize) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let idx = ((sorted.len() as f64 * (p as f64 / 100.0)).ceil() as usize).min(sorted.len() - 1);
    sorted[idx]
}

async fn measure<F, Fut>(label: &str, target_ms: f64, mut f: F, iterations: usize) -> bool
where
    F: FnMut(usize) -> Fut,
    Fut: std::future::Future<Output = ()>,
{
    let mut times: Vec<f64> = Vec::with_capacity(iterations);
    for i in 0..iterations {
        let t0 = Instant::now();
        f(i).await;
        times.push(t0.elapsed().as_secs_f64() * 1000.0);
    }
    times.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let p50 = percentile(&times, 50);
    let p95 = percentile(&times, 95);
    let max = times.last().copied().unwrap_or(0.0);
    let pass = p95 < target_ms;
    println!(
        "[BENCH] {:<40} | p50={:.2}ms | p95={:.2}ms | max={:.2}ms | cible <{:.0}ms -> {}",
        label,
        p50,
        p95,
        max,
        target_ms,
        if pass { "PASS" } else { "FAIL" }
    );
    pass
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("=== DEPOTPRO V3 — Benchmark Charge & Latence (Partie 17.4) ===");

    let tmp_dir = std::env::temp_dir().join(format!("depotpro_bench_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&tmp_dir)?;
    let db_path = tmp_dir.join("bench.db");

    let db = DepotDb::connect(&db_path).await?;
    let t_seed = Instant::now();

    let mut sale_ids: Vec<i64> = Vec::with_capacity(100);
    let mut sample_product_ids: Vec<i64> = Vec::with_capacity(100);
    let mut sample_pkg_ids: Vec<i64> = Vec::with_capacity(100);

    // Seed: 10k products, 10k clients, 100k sale lines
    {
        let (_guard, mut tx) = db.begin_write().await?;

        let cat_id: i64 = sqlx::query_scalar("SELECT id FROM categories LIMIT 1")
            .fetch_one(&mut *tx)
            .await?;

        // 10,000 products
        for i in 1..=10_000 {
            let ref_ = format!("PRD-B-{:05}", i);
            let name = if i % 250 == 0 {
                format!("Flag Spéciale Lot {}", i)
            } else {
                format!("Boisson Référence {}", i)
            };
            let prod_id: i64 = sqlx::query(
                "INSERT INTO products (reference, name, brand, category_id, base_unit, stock_milli, min_stock_milli, average_cost_num, average_cost_den, purchase_price, wholesale_price, semi_wholesale_price, retail_price)
                 VALUES (?, ?, ?, ?, 'bouteille', 500000, 24000, '500', '1', 500, 580, 600, 650)",
            )
            .bind(&ref_)
            .bind(&name)
            .bind("SOLIBRA")
            .bind(cat_id)
            .execute(&mut *tx)
            .await?
            .last_insert_rowid();

            let pkg_id: i64 = sqlx::query(
                "INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, allow_fraction)
                 VALUES (?, 'bouteille', 'bouteille', 1000, 500, 580, 600, 650, 0)",
            )
            .bind(prod_id)
            .execute(&mut *tx)
            .await?
            .last_insert_rowid();

            sqlx::query(
                "INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, 'none')",
            )
            .bind(pkg_id)
            .execute(&mut *tx)
            .await?;

            if i <= 100 {
                sample_product_ids.push(prod_id);
                sample_pkg_ids.push(pkg_id);
            }
        }

        // 10,000 clients
        for i in 1..=10_000 {
            let code = format!("CLI-B-{:05}", i);
            let name = format!("Client Dépôt {}", i);
            let phone = format!("+22507{:08}", i);
            let cid: i64 = sqlx::query(
                "INSERT INTO clients (code, name, client_type, phone) VALUES (?, ?, 'particulier', ?)",
            )
            .bind(&code)
            .bind(&name)
            .bind(&phone)
            .execute(&mut *tx)
            .await?
            .last_insert_rowid();

            sqlx::query(
                "INSERT INTO client_credit_settings (client_id, policy, credit_limit, payment_terms_days) VALUES (?, 'limited', 500000, 15)",
            )
            .bind(cid)
            .execute(&mut *tx)
            .await?;
        }

        // Cash session
        sqlx::query(
            "INSERT INTO cash_sessions (reference, opening_key, status, opening_cash) VALUES ('CAI-BENCH-01', 'bench-open-1', 'open', 100000)",
        )
        .execute(&mut *tx)
        .await?;

        // 20,000 sales x 5 lines = 100,000 sale lines
        for s in 1..=20_000 {
            let ref_ = format!("VTE-B-{:06}", s);
            let sid: i64 = sqlx::query(
                "INSERT INTO sales (reference, request_key, sale_type, price_tier, subtotal_merchandise, discount_amount, total_merchandise, total_deposit, total_amount, paid_amount, status)
                 VALUES (?, ?, 'cash', 'retail', 6500, 0, 6500, 0, 6500, 6500, 'validated')",
            )
            .bind(&ref_)
            .bind(format!("bench-seed-sale-{}", s))
            .execute(&mut *tx)
            .await?
            .last_insert_rowid();

            if s <= 100 || s > 19_900 {
                sale_ids.push(sid);
            }
            for l in 0..5 {
                let idx = (s + l) % sample_product_ids.len();
                sqlx::query(
                    "INSERT INTO sale_lines (sale_id, product_id, packaging_id, product_name, packaging_name, base_unit, coefficient_milli, quantity_milli, base_quantity_milli, unit_price, discount_amount, line_total, cost_num, cost_den)
                     VALUES (?, ?, ?, 'Boisson Bench', 'bouteille', 'bouteille', 1000, 10000, 10000, 650, 0, 6500, '500', '1')",
                )
                .bind(sid)
                .bind(sample_product_ids[idx])
                .bind(sample_pkg_ids[idx])
                .execute(&mut *tx)
                .await?;

                sqlx::query(
                    "INSERT INTO stock_movements (product_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, reason, reference_document)
                     VALUES (?, 'sale_out', -10000, 500000, 490000, 'Bench seed', ?)",
                )
                .bind(sample_product_ids[idx])
                .bind(&ref_)
                .execute(&mut *tx)
                .await?;
            }
        }

        sqlx::query("ANALYZE").execute(&mut *tx).await?;
        tx.commit().await?;
    }

    let seed_secs = t_seed.elapsed().as_secs_f64();
    println!(
        "Base injectée en {:.2}s : 10 000 produits, 10 000 clients, 100 000 lignes de vente, 100 000 mouvements stock.",
        seed_secs
    );

    // Benchmark 1: Product search (p50 < 300ms)
    let r1 = measure(
        "Recherche produit paginée (10k prods)",
        300.0,
        |i| {
            let db = db.clone();
            let search = if i % 2 == 0 {
                Some("Flag Spéciale")
            } else {
                Some("Boisson Référence 99")
            };
            async move {
                let _ = products::list_products(&db, search, None, false, false, 1, 25).await;
            }
        },
        50,
    )
    .await;

    // Benchmark 2: Sale detail (p50 < 150ms)
    let r2 = measure(
        "Détail vente complet (100k lignes)",
        150.0,
        |i| {
            let db = db.clone();
            let sid = sale_ids[i % sale_ids.len()];
            async move {
                let _ = sales::get_sale_detail(&db, sid).await;
            }
        },
        50,
    )
    .await;

    // Benchmark 3: Atomic sale creation (p50 < 500ms)
    let r3 = measure(
        "Validation vente atomique (TX + stock)",
        500.0,
        |i| {
            let db = db.clone();
            let idx = i % sample_product_ids.len();
            let req_key = format!("bench-live-sale-{}", i);
            let pid = sample_product_ids[idx];
            let pkgid = sample_pkg_ids[idx];
            async move {
                let _ = sales::create_sale(
                    &db,
                    sales::CreateSaleInput {
                        request_key: req_key,
                        client_id: None,
                        sale_type: "cash".into(),
                        price_tier: "retail".into(),
                        discount_amount: None,
                        notes: None,
                        lines: vec![sales::CreateSaleLineInput {
                            product_id: pid,
                            packaging_id: pkgid,
                            quantity: "2".into(),
                            discount_amount: None,
                        }],
                        payments: vec![sales::PaymentPartInput {
                            method_code: "cash".into(),
                            amount: 1300,
                        }],
                        due_date: None,
                    },
                )
                .await;
            }
        },
        50,
    )
    .await;

    let all_passed = r1 && r2 && r3;
    if !all_passed {
        std::process::exit(1);
    }

    // Cleanup
    let _ = std::fs::remove_dir_all(&tmp_dir);
    Ok(())
}
