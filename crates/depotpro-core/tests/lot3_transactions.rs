use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

use depotpro_core::application::{cash, inventory, products, purchases, sales};
use depotpro_core::infrastructure::db::DepotDb;
use depotpro_core::CoreError;

fn temp_db_path(tag: &str) -> PathBuf {
    std::env::temp_dir()
        .join(format!("depotpro_lot3_{tag}_{}", uuid::Uuid::new_v4()))
        .join("depotpro.db")
}

async fn setup_fixture(tag: &str) -> (PathBuf, DepotDb, i64, i64, i64, i64) {
    let path = temp_db_path(tag);
    let db = DepotDb::connect(&path).await.expect("connect temp db");

    cash::open_cash_session(
        &db,
        cash::OpenCashInput {
            opening_cash: 20_000,
            request_key: format!("lot3-open-{tag}"),
        },
    )
    .await
    .unwrap();

    let cat = products::create_category(&db, "Boissons Lot 3", None)
        .await
        .unwrap();

    let supplier = purchases::create_supplier(
        &db,
        purchases::CreateSupplierInput {
            name: "Fournisseur Lot 3".to_string(),
            company_name: Some("SOLIBRA Lot 3".to_string()),
            phone: "+225 07 00 00 00 33".to_string(),
            address: None,
            email: None,
            contact_person: None,
            payment_terms_days: Some(30),
        },
    )
    .await
    .unwrap();

    let prod = products::create_product(
        &db,
        products::CreateProductInput {
            name: "Eau Minérale Lot 3".to_string(),
            brand: None,
            brand_id: None,
            brewery_id: None,
            variant_name: None,
            volume_ml: None,
            container_type: None,
            alcohol_degree: None,
            bottle_profile_id: None,
            crate_type_id: None,
            compatibility_group_id: None,
            barcode: None,
            category_id: cat.id,
            supplier_id: Some(supplier.id),
            description: None,
            base_unit: "bouteille".to_string(),
            initial_stock: Some("100".to_string()),
            min_stock: Some("5".to_string()),
            max_stock: None,
            purchase_price: Some(250),
            wholesale_price: Some(300),
            semi_wholesale_price: Some(350),
            retail_price: Some(400),
            image_path: None,
            packagings: Some(vec![products::PackagingInput {
                id: None,
                name: "casier".to_string(),
                coefficient: "1".to_string(),
                purchase_price: Some(250),
                wholesale_price: Some(300),
                semi_wholesale_price: Some(350),
                retail_price: Some(400),
                barcode: None,
                allow_fraction: Some(false),
                is_active: Some(true),
                deposit_mode: Some("none".to_string()),
                components: None,
            }]),
        },
    )
    .await
    .unwrap();
    let pkg_id = prod.packagings[0].id;

    let client = sales::create_client(
        &db,
        sales::CreateClientInput {
            name: "Client Lot 3".to_string(),
            client_type: "professionnel".to_string(),
            phone: None,
            address: None,
            city: None,
            email: None,
            contact_person: None,
            credit_policy: "limited".to_string(),
            credit_limit: Some(500_000),
            payment_terms_days: Some(15),
        },
    )
    .await
    .unwrap();

    (path, db, prod.id, pkg_id, supplier.id, client.id)
}

#[tokio::test]
async fn lot3_concurrent_sales_receptions_receivables_cash_close_and_stock_moves() {
    let (_path, db, prod_id, pkg_id, supplier_id, client_id) =
        setup_fixture("concurrent_ops").await;

    // 1. Deux ventes simultanées (60 + 60 sur stock 100 -> exactement 1 succès et 1 rejet stock insuffisant)
    let (s1, s2) = tokio::join!(
        sales::create_sale(
            &db,
            sales::CreateSaleInput {
                request_key: "lot3-sale-1".to_string(),
                client_id: None,
                sale_type: "cash".to_string(),
                price_tier: "retail".to_string(),
                discount_amount: None,
                notes: None,
                lines: vec![sales::CreateSaleLineInput {
                    product_id: prod_id,
                    packaging_id: pkg_id,
                    quantity: "60".to_string(),
                    discount_amount: None,
                }],
                payments: vec![sales::PaymentPartInput {
                    method_code: "cash".to_string(),
                    amount: 24_000,
                }],
                due_date: None,
            },
        ),
        sales::create_sale(
            &db,
            sales::CreateSaleInput {
                request_key: "lot3-sale-2".to_string(),
                client_id: None,
                sale_type: "cash".to_string(),
                price_tier: "retail".to_string(),
                discount_amount: None,
                notes: None,
                lines: vec![sales::CreateSaleLineInput {
                    product_id: prod_id,
                    packaging_id: pkg_id,
                    quantity: "60".to_string(),
                    discount_amount: None,
                }],
                payments: vec![sales::PaymentPartInput {
                    method_code: "cash".to_string(),
                    amount: 24_000,
                }],
                due_date: None,
            },
        ),
    );
    assert_eq!(usize::from(s1.is_ok()) + usize::from(s2.is_ok()), 1);
    let stock_after_sales: i64 =
        sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
            .bind(prod_id)
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert_eq!(stock_after_sales, 40_000);

    // 2. Deux réceptions simultanées sur un même BC de 10 unités (8 + 8 -> exactement 1 succès, aucun dépassement)
    let po = purchases::create_purchase_order(
        &db,
        purchases::CreatePurchaseOrderInput {
            request_key: "lot3-po-1".to_string(),
            supplier_id,
            expected_date: None,
            notes: None,
            lines: vec![purchases::PurchaseOrderLineInput {
                product_id: prod_id,
                packaging_id: pkg_id,
                quantity: "10".to_string(),
                unit_price: 250,
            }],
        },
    )
    .await
    .unwrap();
    let po_line_id = po.lines[0].id;

    let (r1, r2) = tokio::join!(
        purchases::receive_purchase_order(
            &db,
            po.id,
            purchases::ReceivePurchaseOrderInput {
                request_key: "lot3-rec-1".to_string(),
                notes: None,
                lines: vec![purchases::ReceiveLineInput {
                    purchase_order_line_id: po_line_id,
                    received_quantity: "8".to_string(),
                    discrepancy_reason: None,
                }],
            },
        ),
        purchases::receive_purchase_order(
            &db,
            po.id,
            purchases::ReceivePurchaseOrderInput {
                request_key: "lot3-rec-2".to_string(),
                notes: None,
                lines: vec![purchases::ReceiveLineInput {
                    purchase_order_line_id: po_line_id,
                    received_quantity: "8".to_string(),
                    discrepancy_reason: None,
                }],
            },
        ),
    );
    assert_eq!(usize::from(r1.is_ok()) + usize::from(r2.is_ok()), 1);
    let stock_after_rec: i64 = sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
        .bind(prod_id)
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(stock_after_rec, 48_000);

    // 3. Deux mouvements de stock concurrents (+12 et -5 -> solde exact 55)
    let (m1, m2) = tokio::join!(
        inventory::adjust_stock(
            &db,
            inventory::AdjustStockInput {
                product_id: prod_id,
                direction: "in".to_string(),
                quantity: "12".to_string(),
                reason: "Ajustement entrée Lot 3".to_string(),
                request_key: "lot3-adj-in".to_string(),
            },
        ),
        inventory::adjust_stock(
            &db,
            inventory::AdjustStockInput {
                product_id: prod_id,
                direction: "out".to_string(),
                quantity: "5".to_string(),
                reason: "Ajustement sortie Lot 3".to_string(),
                request_key: "lot3-adj-out".to_string(),
            },
        ),
    );
    assert!(m1.is_ok() && m2.is_ok());
    let stock_after_adj: i64 = sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
        .bind(prod_id)
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(stock_after_adj, 55_000);

    // 4. Vente et paiement de créance simultanés
    let credit_sale = sales::create_sale(
        &db,
        sales::CreateSaleInput {
            request_key: "lot3-credit-sale".to_string(),
            client_id: Some(client_id),
            sale_type: "credit".to_string(),
            price_tier: "retail".to_string(),
            discount_amount: None,
            notes: None,
            lines: vec![sales::CreateSaleLineInput {
                product_id: prod_id,
                packaging_id: pkg_id,
                quantity: "10".to_string(),
                discount_amount: None,
            }],
            payments: vec![],
            due_date: None,
        },
    )
    .await
    .unwrap();
    let rec_id = credit_sale.receivable_id.expect("receivable created");

    let (cash_sale_res, pay_rec_res) = tokio::join!(
        sales::create_sale(
            &db,
            sales::CreateSaleInput {
                request_key: "lot3-sale-concurrent-rec".to_string(),
                client_id: None,
                sale_type: "cash".to_string(),
                price_tier: "retail".to_string(),
                discount_amount: None,
                notes: None,
                lines: vec![sales::CreateSaleLineInput {
                    product_id: prod_id,
                    packaging_id: pkg_id,
                    quantity: "5".to_string(),
                    discount_amount: None,
                }],
                payments: vec![sales::PaymentPartInput {
                    method_code: "cash".to_string(),
                    amount: 2_000,
                }],
                due_date: None,
            },
        ),
        cash::pay_receivable(
            &db,
            rec_id,
            cash::PayReceivableInput {
                request_key: "lot3-pay-rec-1".to_string(),
                note: Some("Acompte simultané".to_string()),
                parts: vec![sales::PaymentPartInput {
                    method_code: "cash".to_string(),
                    amount: 1_500,
                }],
            },
        ),
    );
    assert!(cash_sale_res.is_ok() && pay_rec_res.is_ok());

    // 5. Vente et clôture de caisse simultanées (aucune vente enregistrée sur une caisse déjà fermée)
    let status = cash::get_cash_status(&db).await.unwrap();
    let sid = status.active_session.unwrap().id;

    let (race_sale, race_close) = tokio::join!(
        sales::create_sale(
            &db,
            sales::CreateSaleInput {
                request_key: "lot3-sale-vs-close".to_string(),
                client_id: None,
                sale_type: "cash".to_string(),
                price_tier: "retail".to_string(),
                discount_amount: None,
                notes: None,
                lines: vec![sales::CreateSaleLineInput {
                    product_id: prod_id,
                    packaging_id: pkg_id,
                    quantity: "2".to_string(),
                    discount_amount: None,
                }],
                payments: vec![sales::PaymentPartInput {
                    method_code: "cash".to_string(),
                    amount: 800,
                }],
                due_date: None,
            },
        ),
        cash::close_cash_session(
            &db,
            cash::CloseCashInput {
                session_id: sid,
                physical_cash: 48_300,
                closing_notes: Some("Clôture concurrente Lot 3".to_string()),
                request_key: "lot3-close-vs-sale".to_string(),
            },
        ),
    );

    assert!(race_close.is_ok());
    let closed_dto = race_close.unwrap();
    if race_sale.is_ok() {
        // Si la vente a été exécutée avant la clôture, son encaissement (800) doit être dans theoretical_cash (47500 + 800 = 48300)
        assert_eq!(closed_dto.theoretical_cash, Some(48_300));
    } else {
        // Si la clôture a gagné le verrou, la vente doit être rejetée pour session fermée et theoretical_cash reste 47500
        assert!(matches!(race_sale, Err(CoreError::SessionNotOpen(_))));
        assert_eq!(closed_dto.theoretical_cash, Some(47_500));
    }

    db.verify_integrity().await.unwrap();
}

#[tokio::test]
async fn lot3_rollback_fk_violation_temp_block_and_busy_timeout_expiration() {
    let (path, db, prod_id, _pkg_id, _sup_id, _client_id) =
        setup_fixture("lock_and_rollback").await;

    let initial_stock: i64 = sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
        .bind(prod_id)
        .fetch_one(&db.pool)
        .await
        .unwrap();

    // 1. Rollback après erreur + vérification clés étrangères (violation FK annulée proprement)
    {
        let (_guard, mut tx) = db.begin_write().await.unwrap();
        sqlx::query("UPDATE products SET stock_milli = stock_milli + 99000 WHERE id = ?")
            .bind(prod_id)
            .execute(&mut *tx)
            .await
            .unwrap();

        let fk_err = sqlx::query(
            "INSERT INTO stock_movements (product_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, reason)
             VALUES (9999999, 'manual_adjust', 1000, 0, 1000, 'Test violation FK')",
        )
        .execute(&mut *tx)
        .await;
        assert!(fk_err.is_err());
        tx.rollback().await.unwrap();
    }

    let stock_after_rollback: i64 =
        sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
            .bind(prod_id)
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert_eq!(stock_after_rollback, initial_stock);

    // 2. Rollback implicite via Drop sur erreur précoce (sans fuite de connexion ni de verrou)
    {
        let (_guard, mut tx) = db.begin_write().await.unwrap();
        sqlx::query("UPDATE products SET stock_milli = stock_milli + 50000 WHERE id = ?")
            .bind(prod_id)
            .execute(&mut *tx)
            .await
            .unwrap();
        // Drop sans commit()
    }
    let stock_after_drop: i64 = sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
        .bind(prod_id)
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(stock_after_drop, initial_stock);

    // 3. Blocage temporaire d'une connexion (db2 bloque 120ms pendant que db attend puis réussit via busy_timeout 5000ms)
    let db_wait = DepotDb::connect_with_busy_timeout(&path, 5_000)
        .await
        .unwrap();
    let (tx_guard, mut holder_tx) = db.begin_write().await.unwrap();
    sqlx::query("UPDATE products SET stock_milli = stock_milli + 1000 WHERE id = ?")
        .bind(prod_id)
        .execute(&mut *holder_tx)
        .await
        .unwrap();

    let waiter = tokio::spawn(async move {
        inventory::adjust_stock(
            &db_wait,
            inventory::AdjustStockInput {
                product_id: prod_id,
                direction: "in".to_string(),
                quantity: "2".to_string(),
                reason: "Après blocage temporaire".to_string(),
                request_key: "lot3-after-temp-block".to_string(),
            },
        )
        .await
    });

    tokio::time::sleep(Duration::from_millis(120)).await;
    holder_tx.commit().await.unwrap();
    drop(tx_guard);

    let waiter_res = waiter.await.unwrap();
    assert!(
        waiter_res.is_ok(),
        "Attente busy_timeout aurait dû réussir : {waiter_res:?}"
    );

    // 4. Expiration du délai busy_timeout (db_short a busy_timeout=60ms tandis que db bloque 300ms -> CoreError::DatabaseBusy)
    let db_short = DepotDb::connect_with_busy_timeout(&path, 60).await.unwrap();
    assert_eq!(db_short.busy_timeout_ms(), 60);

    let (tx_guard2, mut holder_tx2) = db.begin_write().await.unwrap();
    sqlx::query("UPDATE products SET stock_milli = stock_milli + 1000 WHERE id = ?")
        .bind(prod_id)
        .execute(&mut *holder_tx2)
        .await
        .unwrap();

    let busy_res = db_short.begin_write().await;
    assert!(
        matches!(busy_res, Err(CoreError::DatabaseBusy(_))),
        "Attendu DatabaseBusy après expiration busy_timeout"
    );

    holder_tx2.commit().await.unwrap();
    drop(tx_guard2);

    // Après libération, db_short reste parfaitement opérationnel
    let recovery = inventory::adjust_stock(
        &db_short,
        inventory::AdjustStockInput {
            product_id: prod_id,
            direction: "in".to_string(),
            quantity: "3".to_string(),
            reason: "Reprise après SQLITE_BUSY".to_string(),
            request_key: "lot3-after-busy".to_string(),
        },
    )
    .await;
    assert!(recovery.is_ok());

    db.verify_integrity().await.unwrap();
}

#[tokio::test]
async fn lot3_multi_process_child_entrypoint() {
    let Ok(db_path_str) = std::env::var("DEPOTPRO_LOT3_CHILD_DB") else {
        return;
    };
    let prod_id: i64 = std::env::var("DEPOTPRO_LOT3_PROD_ID")
        .unwrap()
        .parse()
        .unwrap();
    let worker_tag = std::env::var("DEPOTPRO_LOT3_WORKER_TAG").unwrap();

    let db = DepotDb::connect_with_busy_timeout(&PathBuf::from(db_path_str), 5_000)
        .await
        .unwrap();

    for i in 0..5 {
        inventory::adjust_stock(
            &db,
            inventory::AdjustStockInput {
                product_id: prod_id,
                direction: "in".to_string(),
                quantity: "1".to_string(),
                reason: format!("Process {worker_tag} step {i}"),
                request_key: format!("lot3-mp-{worker_tag}-{i}"),
            },
        )
        .await
        .unwrap();
    }
    db.verify_integrity().await.unwrap();
}

#[tokio::test]
async fn lot3_two_processes_same_sqlite_file() {
    let (path, db, prod_id, _pkg_id, _sup_id, _client_id) = setup_fixture("multiprocess").await;
    let exe = std::env::current_exe().expect("current test exe");

    let mut c1 = Command::new(&exe)
        .args([
            "--exact",
            "lot3_multi_process_child_entrypoint",
            "--nocapture",
        ])
        .env("DEPOTPRO_LOT3_CHILD_DB", &path)
        .env("DEPOTPRO_LOT3_PROD_ID", prod_id.to_string())
        .env("DEPOTPRO_LOT3_WORKER_TAG", "p1")
        .spawn()
        .expect("spawn worker p1");

    let mut c2 = Command::new(&exe)
        .args([
            "--exact",
            "lot3_multi_process_child_entrypoint",
            "--nocapture",
        ])
        .env("DEPOTPRO_LOT3_CHILD_DB", &path)
        .env("DEPOTPRO_LOT3_PROD_ID", prod_id.to_string())
        .env("DEPOTPRO_LOT3_WORKER_TAG", "p2")
        .spawn()
        .expect("spawn worker p2");

    for i in 0..5 {
        inventory::adjust_stock(
            &db,
            inventory::AdjustStockInput {
                product_id: prod_id,
                direction: "in".to_string(),
                quantity: "1".to_string(),
                reason: format!("Parent step {i}"),
                request_key: format!("lot3-mp-parent-{i}"),
            },
        )
        .await
        .unwrap();
    }

    let s1 = c1.wait().expect("wait worker p1");
    let s2 = c2.wait().expect("wait worker p2");
    assert!(s1.success(), "worker p1 failed with {s1}");
    assert!(s2.success(), "worker p2 failed with {s2}");

    // 100 init + 5 (p1) + 5 (p2) + 5 (parent) = 115
    let final_stock: i64 = sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
        .bind(prod_id)
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(final_stock, 115_000);
    db.verify_integrity().await.unwrap();
}
