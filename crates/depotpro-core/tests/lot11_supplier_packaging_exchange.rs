//! Test 7 du MAJ.md : réapprovisionnement fournisseur avec échange d'emballages
//! vides par type exact — aucune dette financière d'emballages automatique.

use depotpro_core::application::{consignments, products, purchases};
use depotpro_core::infrastructure::db::DepotDb;

async fn fresh_db(tag: &str) -> DepotDb {
    let path = std::env::temp_dir().join(format!("pkg_sup_{tag}_{}.db", uuid::Uuid::new_v4()));
    DepotDb::connect(&path).await.expect("connect")
}

#[tokio::test]
async fn test7_reappro_fournisseur_echange_emballages_par_type_exact() {
    let db = fresh_db("t7").await;

    // Catégorie + fournisseur
    let cat = products::create_category(&db, "Bières T7", None)
        .await
        .unwrap();
    let sup = purchases::create_supplier(
        &db,
        purchases::CreateSupplierInput {
            name: "SOLIBRA T7".to_string(),
            company_name: None,
            phone: "+2250700000000".to_string(),
            address: None,
            email: None,
            contact_person: None,
            payment_terms_days: Some(30),
        },
    )
    .await
    .unwrap();

    // Deux types d'emballages réutilisables distincts (33 cl ≠ 50 cl).
    let cas33 = consignments::create_returnable_type(
        &db,
        consignments::CreateReturnableTypeInput {
            code: "EMB-CAS33".to_string(),
            name: "Casier 24 x 33 cl".to_string(),
            producer: "SOLIBRA".to_string(),
            kind: "crate".to_string(),
            deposit_value: 3600,
            initial_stock: Some(25),
            description: None,
        },
    )
    .await
    .unwrap();
    let cas50 = consignments::create_returnable_type(
        &db,
        consignments::CreateReturnableTypeInput {
            code: "EMB-CAS50".to_string(),
            name: "Casier 12 x 50 cl".to_string(),
            producer: "SOLIBRA".to_string(),
            kind: "crate".to_string(),
            deposit_value: 4200,
            initial_stock: Some(12),
            description: None,
        },
    )
    .await
    .unwrap();

    // Deux produits avec conditionnements casier liés à leur type d'emballage.
    let bock33 = products::create_product(
        &db,
        products::CreateProductInput {
            name: "Bock 33 cl T7".to_string(),
            brand: Some("Bock".to_string()),
            barcode: None,
            category_id: cat.id,
            supplier_id: Some(sup.id),
            description: None,
            base_unit: "bouteille".to_string(),
            initial_stock: Some("0".to_string()),
            min_stock: None,
            max_stock: None,
            purchase_price: Some(9000),
            wholesale_price: None,
            semi_wholesale_price: None,
            retail_price: Some(12000),
            image_path: None,
            packagings: Some(vec![products::PackagingInput {
                id: None,
                name: "casier".to_string(),
                coefficient: "24".to_string(),
                purchase_price: Some(9000),
                wholesale_price: None,
                semi_wholesale_price: None,
                retail_price: Some(12000),
                barcode: None,
                allow_fraction: Some(false),
                is_active: Some(true),
                deposit_mode: Some("deposit".to_string()),
                components: Some(vec![products::DepositComponentInput {
                    returnable_id: cas33.id,
                    pieces_per_pack: 1,
                }]),
            }]),
        },
    )
    .await
    .unwrap();
    let bock50 = products::create_product(
        &db,
        products::CreateProductInput {
            name: "Bock 50 cl T7".to_string(),
            brand: Some("Bock".to_string()),
            barcode: None,
            category_id: cat.id,
            supplier_id: Some(sup.id),
            description: None,
            base_unit: "bouteille".to_string(),
            initial_stock: Some("0".to_string()),
            min_stock: None,
            max_stock: None,
            purchase_price: Some(11000),
            wholesale_price: None,
            semi_wholesale_price: None,
            retail_price: Some(15000),
            image_path: None,
            packagings: Some(vec![products::PackagingInput {
                id: None,
                name: "casier".to_string(),
                coefficient: "12".to_string(),
                purchase_price: Some(11000),
                wholesale_price: None,
                semi_wholesale_price: None,
                retail_price: Some(15000),
                barcode: None,
                allow_fraction: Some(false),
                is_active: Some(true),
                deposit_mode: Some("deposit".to_string()),
                components: Some(vec![products::DepositComponentInput {
                    returnable_id: cas50.id,
                    pieces_per_pack: 1,
                }]),
            }]),
        },
    )
    .await
    .unwrap();

    let pkg33 = &bock33.packagings[0];
    let pkg50 = &bock50.packagings[0];

    // Commande : 20 casiers Bock 33 + 10 casiers Bock 50.
    let po = purchases::create_purchase_order(
        &db,
        purchases::CreatePurchaseOrderInput {
            request_key: "t7-po-1".to_string(),
            supplier_id: sup.id,
            expected_date: None,
            notes: None,
            lines: vec![
                purchases::PurchaseOrderLineInput {
                    product_id: bock33.id,
                    packaging_id: pkg33.id,
                    quantity: "20".to_string(),
                    unit_price: 9000,
                },
                purchases::PurchaseOrderLineInput {
                    product_id: bock50.id,
                    packaging_id: pkg50.id,
                    quantity: "10".to_string(),
                    unit_price: 11000,
                },
            ],
        },
    )
    .await
    .unwrap();
    let line33 = po
        .lines
        .iter()
        .find(|l| l.product_id == bock33.id)
        .unwrap()
        .id;
    let line50 = po
        .lines
        .iter()
        .find(|l| l.product_id == bock50.id)
        .unwrap()
        .id;
    let line33_dto = po.lines.iter().find(|line| line.id == line33).unwrap();
    let product_snapshot: serde_json::Value = serde_json::from_str(&line33_dto.product_snapshot_json).unwrap();
    let packaging_snapshot: serde_json::Value = serde_json::from_str(&line33_dto.packaging_snapshot_json).unwrap();
    assert_eq!(product_snapshot["brand"], "Bock");
    assert_eq!(packaging_snapshot["depositRegime"], "deposit");
    assert_eq!(packaging_snapshot["components"][0]["requiredPieces"], 20);

    // Modifier le catalogue après le CMD ne doit pas changer son exigence figée.
    sqlx::query("UPDATE deposit_packaging_components SET pieces_per_pack = 9 WHERE packaging_id = ? AND returnable_id = ?")
        .bind(pkg33.id).bind(cas33.id).execute(&db.pool).await.unwrap();

    let balance_before: i64 = sqlx::query_scalar("SELECT quantity FROM returnable_stock_balances WHERE packaging_id = ?")
        .bind(cas33.id).fetch_one(&db.pool).await.unwrap();
    let reserved_before: i64 = sqlx::query_scalar(
        "SELECT SUM(reserved_pieces) FROM purchase_order_packaging_requirements r
         JOIN purchase_order_lines l ON l.id = r.purchase_order_line_id WHERE l.purchase_order_id = ? AND r.returnable_id = ?",
    ).bind(po.id).bind(cas33.id).fetch_one(&db.pool).await.unwrap();
    assert_eq!(balance_before, 25, "Le CMD ne décrémente pas le stock physique");
    assert_eq!(reserved_before, 20, "Le CMD réserve le besoin figé en emballages");
    let beverage_stock_at_cmd: i64 = sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
        .bind(bock33.id).fetch_one(&db.pool).await.unwrap();
    let exchange_movements_at_cmd: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM returnable_stock_movements WHERE movement_type = 'supplier_exchange'",
    ).fetch_one(&db.pool).await.unwrap();
    assert_eq!(beverage_stock_at_cmd, 0, "Le CMD ne réceptionne pas les boissons");
    assert_eq!(exchange_movements_at_cmd, 0, "Le CMD ne remet pas physiquement les emballages");
    let debts_at_cmd: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM supplier_debts")
        .fetch_one(&db.pool).await.unwrap();
    assert_eq!(debts_at_cmd, 0, "Le CMD ne crée pas de dette fournisseur");

    // Les stocks physiques couvrent le CMD (25 casiers 33 cl disponibles, 12 casiers 50 cl).
    // Cette réception partielle porte sur 10 casiers 33 cl et 5 casiers 50 cl.
    let rec_partial = purchases::receive_purchase_order(
        &db,
        po.id,
        purchases::ReceivePurchaseOrderInput {
            request_key: "t7-rec-partial".to_string(),
            notes: None,
            lines: vec![
                purchases::ReceiveLineInput { purchase_order_line_id: line33, received_quantity: "10".to_string(), discrepancy_reason: None },
                purchases::ReceiveLineInput { purchase_order_line_id: line50, received_quantity: "5".to_string(), discrepancy_reason: None },
            ],
        },
    ).await.unwrap();
    assert_eq!(rec_partial.receipt.lines.len(), 2);
    assert_eq!(rec_partial.receipt.packaging_exchanges.iter().map(|e| e.pieces_issued).sum::<i64>(), 15);
    let partial_reserved: i64 = sqlx::query_scalar(
        "SELECT SUM(reserved_pieces) FROM purchase_order_packaging_requirements r
         JOIN purchase_order_lines l ON l.id = r.purchase_order_line_id WHERE l.purchase_order_id = ?",
    ).bind(po.id).fetch_one(&db.pool).await.unwrap();
    assert_eq!(partial_reserved, 15, "Le reliquat reste réservé après réception partielle");

    let rec = purchases::receive_purchase_order(
        &db,
        po.id,
        purchases::ReceivePurchaseOrderInput {
            request_key: "t7-rec-final".to_string(),
            notes: None,
            lines: vec![
                purchases::ReceiveLineInput { purchase_order_line_id: line33, received_quantity: "10".to_string(), discrepancy_reason: None },
                purchases::ReceiveLineInput { purchase_order_line_id: line50, received_quantity: "5".to_string(), discrepancy_reason: None },
            ],
        },
    ).await.unwrap();
    assert_eq!(rec.total_amount, 10 * 9000 + 5 * 11000);
    assert_eq!(rec.order.id, po.id);
    assert_eq!(rec.receipt.lines.len(), 2, "Le REC ne contient que les lignes réellement reçues");
    assert_eq!(rec.receipt.packaging_exchanges.iter().map(|e| e.pieces_issued).sum::<i64>(), 15);
    let reservation_left: i64 = sqlx::query_scalar(
        "SELECT SUM(reserved_pieces) FROM purchase_order_packaging_requirements r
         JOIN purchase_order_lines l ON l.id = r.purchase_order_line_id WHERE l.purchase_order_id = ?",
    ).bind(po.id).fetch_one(&db.pool).await.unwrap();
    assert_eq!(reservation_left, 0);

    // 1. Stocks boissons pleines ajoutés.
    let stock33: i64 = sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
        .bind(bock33.id)
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(stock33, 20 * 24_000, "20 casiers pleins 33 cl ajoutés");
    let stock50: i64 = sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
        .bind(bock50.id)
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(stock50, 10 * 12_000, "10 casiers pleins 50 cl ajoutés");

    // 2. Stocks d'emballages vides déduits par type exact.
    let bal33: i64 = sqlx::query_scalar(
        "SELECT COALESCE(quantity, 0) FROM returnable_stock_balances WHERE packaging_id = ?",
    )
    .bind(cas33.id)
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(bal33, 25 - 20, "Casiers 33 cl : 25 - 20 = 5");
    let bal50: i64 = sqlx::query_scalar(
        "SELECT COALESCE(quantity, 0) FROM returnable_stock_balances WHERE packaging_id = ?",
    )
    .bind(cas50.id)
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(bal50, 12 - 10, "Casiers 50 cl : 12 - 10 = 2");

    // 3. Mouvements tracés en 'supplier_exchange', par type.
    let mov33: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM returnable_stock_movements WHERE packaging_id = ? AND movement_type = 'supplier_exchange'",
    )
    .bind(cas33.id)
    .fetch_one(&db.pool)
    .await
    .unwrap();
    let mov50: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM returnable_stock_movements WHERE packaging_id = ? AND movement_type = 'supplier_exchange'",
    )
    .bind(cas50.id)
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert!(
        mov33 >= 1 && mov50 >= 1,
        "Mouvements d'échange tracés par type"
    );

    // 4. AUCUNE dette financière d'emballages créée automatiquement (règle 9.4).
    let ledger: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM customer_packaging_financial_ledger")
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert_eq!(
        ledger, 0,
        "Aucun compte de dette d'emballages automatique côté fournisseur"
    );
    let conversions: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM packaging_conversions")
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(conversions, 0);

    // Restaurer le catalogue après le test du snapshot figé avant les nouvelles commandes.
    sqlx::query("UPDATE deposit_packaging_components SET pieces_per_pack = 1 WHERE packaging_id = ? AND returnable_id = ?")
        .bind(pkg33.id).bind(cas33.id).execute(&db.pool).await.unwrap();

    // Deux CMD concurrents ne peuvent pas réserver les mêmes casiers; le perdant ne persiste rien.
    let make_concurrent_order = |request_key: &'static str| purchases::create_purchase_order(
        &db,
        purchases::CreatePurchaseOrderInput {
            request_key: request_key.to_string(), supplier_id: sup.id,
            expected_date: None, notes: None,
            lines: vec![purchases::PurchaseOrderLineInput {
                product_id: bock33.id, packaging_id: pkg33.id, quantity: "3".to_string(), unit_price: 9000,
            }],
        },
    );
    let (first, second) = tokio::join!(make_concurrent_order("t7-concurrent-a"), make_concurrent_order("t7-concurrent-b"));
    let (concurrent_order, concurrent_error) = match (first, second) {
        (Ok(order), Err(error)) | (Err(error), Ok(order)) => (order, error),
        _ => panic!("Un seul CMD concurrent doit pouvoir réserver les trois casiers disponibles."),
    };
    assert!(matches!(concurrent_error, depotpro_core::error::CoreError::InsufficientStock(_)));
    let concurrent_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM purchase_orders WHERE request_key IN ('t7-concurrent-a', 't7-concurrent-b')",
    ).fetch_one(&db.pool).await.unwrap();
    assert_eq!(concurrent_count, 1, "Le CMD concurrent perdant est rollbacké");
    purchases::cancel_purchase_order(
        &db, concurrent_order.id,
        purchases::CancelPurchaseOrderInput { reason: "Libération réservation concurrente".to_string() },
    ).await.unwrap();

    // Vérifier ensuite l'annulation d'un nouveau CMD sans mouvement physique.
    let physical_before_cancel: i64 = sqlx::query_scalar(
        "SELECT quantity FROM returnable_stock_balances WHERE packaging_id = ?",
    ).bind(cas33.id).fetch_one(&db.pool).await.unwrap();
    let cancel_order = purchases::create_purchase_order(
        &db,
        purchases::CreatePurchaseOrderInput {
            request_key: "t7-po-cancel".to_string(), supplier_id: sup.id,
            expected_date: None, notes: None,
            lines: vec![purchases::PurchaseOrderLineInput {
                product_id: bock33.id, packaging_id: pkg33.id, quantity: "1".to_string(), unit_price: 9000,
            }],
        },
    ).await.unwrap();
    let cancel_line_id = cancel_order.lines[0].id;
    purchases::cancel_purchase_order(
        &db, cancel_order.id,
        purchases::CancelPurchaseOrderInput { reason: "Test libération réservation".to_string() },
    ).await.unwrap();
    let (reserved, status): (i64, String) = sqlx::query_as(
        "SELECT reserved_pieces, reservation_status FROM purchase_order_packaging_requirements WHERE purchase_order_line_id = ?",
    ).bind(cancel_line_id).fetch_one(&db.pool).await.unwrap();
    let physical_after_cancel: i64 = sqlx::query_scalar(
        "SELECT quantity FROM returnable_stock_balances WHERE packaging_id = ?",
    ).bind(cas33.id).fetch_one(&db.pool).await.unwrap();
    assert_eq!((reserved, status.as_str()), (0, "released"));
    assert_eq!(physical_after_cancel, physical_before_cancel);

    // Un profil explicitement non consigné ne réserve et n'émet aucun emballage fournisseur.
    sqlx::query("UPDATE deposit_packaging_profiles SET mode = 'none' WHERE packaging_id = ?")
        .bind(pkg33.id).execute(&db.pool).await.unwrap();
    let no_deposit_order = purchases::create_purchase_order(
        &db,
        purchases::CreatePurchaseOrderInput {
            request_key: "t7-po-no-deposit".to_string(), supplier_id: sup.id,
            expected_date: None, notes: None,
            lines: vec![purchases::PurchaseOrderLineInput {
                product_id: bock33.id, packaging_id: pkg33.id, quantity: "1".to_string(), unit_price: 9000,
            }],
        },
    ).await.unwrap();
    assert!(no_deposit_order.packaging_requirements.is_empty());
    let movement_count_before: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM returnable_stock_movements WHERE movement_type = 'supplier_exchange'",
    ).fetch_one(&db.pool).await.unwrap();
    let no_deposit_receipt = purchases::receive_purchase_order(
        &db, no_deposit_order.id,
        purchases::ReceivePurchaseOrderInput {
            request_key: "t7-rec-no-deposit".to_string(), notes: None,
            lines: vec![purchases::ReceiveLineInput {
                purchase_order_line_id: no_deposit_order.lines[0].id,
                received_quantity: "1".to_string(), discrepancy_reason: None,
            }],
        },
    ).await.unwrap();
    assert!(no_deposit_receipt.receipt.packaging_exchanges.is_empty());
    let movement_count_after: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM returnable_stock_movements WHERE movement_type = 'supplier_exchange'",
    ).fetch_one(&db.pool).await.unwrap();
    assert_eq!(movement_count_after, movement_count_before);
}

#[tokio::test]
async fn test7b_stock_emballages_insuffisant_bloque_le_cmd() {
    // Règle 9.4 : le système signale un stock insuffisant et annule le CMD avant toute réception.
    let db = fresh_db("t7b").await;

    let cat = products::create_category(&db, "Bières T7b", None)
        .await
        .unwrap();
    let sup = purchases::create_supplier(
        &db,
        purchases::CreateSupplierInput {
            name: "SOLIBRA T7b".to_string(),
            company_name: None,
            phone: "+2250700000001".to_string(),
            address: None,
            email: None,
            contact_person: None,
            payment_terms_days: Some(30),
        },
    )
    .await
    .unwrap();
    let cas = consignments::create_returnable_type(
        &db,
        consignments::CreateReturnableTypeInput {
            code: "EMB-T7B".to_string(),
            name: "Casier T7b".to_string(),
            producer: "SOLIBRA".to_string(),
            kind: "crate".to_string(),
            deposit_value: 3000,
            initial_stock: Some(5), // seulement 5 casiers vides
            description: None,
        },
    )
    .await
    .unwrap();
    let prod = products::create_product(
        &db,
        products::CreateProductInput {
            name: "Bock T7b".to_string(),
            brand: None,
            barcode: None,
            category_id: cat.id,
            supplier_id: Some(sup.id),
            description: None,
            base_unit: "bouteille".to_string(),
            initial_stock: Some("0".to_string()),
            min_stock: None,
            max_stock: None,
            purchase_price: Some(9000),
            wholesale_price: None,
            semi_wholesale_price: None,
            retail_price: None,
            image_path: None,
            packagings: Some(vec![products::PackagingInput {
                id: None,
                name: "casier".to_string(),
                coefficient: "24".to_string(),
                purchase_price: Some(9000),
                wholesale_price: None,
                semi_wholesale_price: None,
                retail_price: None,
                barcode: None,
                allow_fraction: Some(false),
                is_active: Some(true),
                deposit_mode: Some("deposit".to_string()),
                components: Some(vec![products::DepositComponentInput {
                    returnable_id: cas.id,
                    pieces_per_pack: 1,
                }]),
            }]),
        },
    )
    .await
    .unwrap();
    let pkg = &prod.packagings[0];
    let fractional = purchases::create_purchase_order(
        &db,
        purchases::CreatePurchaseOrderInput {
            request_key: "t7b-fraction".to_string(), supplier_id: sup.id,
            expected_date: None, notes: None,
            lines: vec![purchases::PurchaseOrderLineInput {
                product_id: prod.id, packaging_id: pkg.id, quantity: "0.5".to_string(), unit_price: 9000,
            }],
        },
    ).await.unwrap_err();
    assert!(matches!(fractional, depotpro_core::error::CoreError::Validation(_)));

    let err = purchases::create_purchase_order(
        &db,
        purchases::CreatePurchaseOrderInput {
            request_key: "t7b-po-1".to_string(),
            supplier_id: sup.id,
            expected_date: None,
            notes: None,
            lines: vec![purchases::PurchaseOrderLineInput {
                product_id: prod.id,
                packaging_id: pkg.id,
                quantity: "10".to_string(),
                unit_price: 9000,
            }],
        },
    )
    .await
    .unwrap_err();
    assert!(matches!(err, depotpro_core::error::CoreError::InsufficientStock(_)),
        "Signal InsufficientStock attendu dès la création du CMD : {err:?}");
    let order_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM purchase_orders WHERE request_key = 't7b-po-1'")
        .fetch_one(&db.pool).await.unwrap();
    assert_eq!(order_count, 0, "CMD non réservable annulé intégralement");

    // Rien n'a bougé (transaction annulée).
    let stock: i64 = sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
        .bind(prod.id)
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(stock, 0, "Aucune réception physique");
    let bal: i64 = sqlx::query_scalar(
        "SELECT COALESCE(quantity, 0) FROM returnable_stock_balances WHERE packaging_id = ?",
    )
    .bind(cas.id)
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(bal, 5, "Stock d'emballages intacts");

    sqlx::query("DELETE FROM deposit_packaging_components WHERE packaging_id = ?")
        .bind(pkg.id).execute(&db.pool).await.unwrap();
    let config_error = purchases::create_purchase_order(
        &db,
        purchases::CreatePurchaseOrderInput {
            request_key: "t7b-no-components".to_string(), supplier_id: sup.id,
            expected_date: None, notes: None,
            lines: vec![purchases::PurchaseOrderLineInput {
                product_id: prod.id, packaging_id: pkg.id, quantity: "1".to_string(), unit_price: 9000,
            }],
        },
    ).await.unwrap_err();
    assert!(matches!(config_error, depotpro_core::error::CoreError::Validation(_)));
    let missing_components_order: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM purchase_orders WHERE request_key = 't7b-no-components'",
    ).fetch_one(&db.pool).await.unwrap();
    assert_eq!(missing_components_order, 0);
}
