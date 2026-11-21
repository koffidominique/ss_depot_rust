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
    let cat = products::create_category(&db, "Bières T7", None).await.unwrap();
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
    let line33 = po.lines.iter().find(|l| l.product_id == bock33.id).unwrap().id;
    let line50 = po.lines.iter().find(|l| l.product_id == bock50.id).unwrap().id;

    // Stock d'emballages vides insuffisant pour les 50 cl (12 < requis pour 20+10=attends 10)
    // Cas : on tente de réceptionner 20 x 33 et 10 x 50 → il faut 20 casiers 33 et 10 casiers 50.
    // Le stock 33 = 25 (ok), 50 = 12 (ok).
    let rec = purchases::receive_purchase_order(
        &db,
        po.id,
        purchases::ReceivePurchaseOrderInput {
            request_key: "t7-rec-1".to_string(),
            notes: None,
            lines: vec![
                purchases::ReceiveLineInput {
                    purchase_order_line_id: line33,
                    received_quantity: "20".to_string(),
                    discrepancy_reason: None,
                },
                purchases::ReceiveLineInput {
                    purchase_order_line_id: line50,
                    received_quantity: "10".to_string(),
                    discrepancy_reason: None,
                },
            ],
        },
    )
    .await
    .unwrap();
    assert_eq!(rec.total_amount, 20 * 9000 + 10 * 11000);

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
    let ledger: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM customer_packaging_financial_ledger")
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
}

#[tokio::test]
async fn test7b_stock_emballages_insuffisant_bloque_la_reception() {
    // Règle 9.4 : le système doit signaler une quantité insuffisante avant validation.
    let db = fresh_db("t7b").await;

    let cat = products::create_category(&db, "Bières T7b", None).await.unwrap();
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
    let po = purchases::create_purchase_order(
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
    .unwrap();
    let line_id = po.lines[0].id;

    // Réception de 10 casiers alors que seuls 5 casiers vides sont disponibles → refus.
    let err = purchases::receive_purchase_order(
        &db,
        po.id,
        purchases::ReceivePurchaseOrderInput {
            request_key: "t7b-rec-1".to_string(),
            notes: None,
            lines: vec![purchases::ReceiveLineInput {
                purchase_order_line_id: line_id,
                received_quantity: "10".to_string(),
                discrepancy_reason: None,
            }],
        },
    )
    .await
    .unwrap_err();
    assert!(
        matches!(err, depotpro_core::error::CoreError::InsufficientStock(_)),
        "Signal InsufficientStock attendu, obtenu : {err:?}"
    );

    // Rien n'a bougé (transaction annulée).
    let stock: i64 = sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
        .bind(prod.id)
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(stock, 0, "Aucune réception partielle");
    let bal: i64 = sqlx::query_scalar(
        "SELECT COALESCE(quantity, 0) FROM returnable_stock_balances WHERE packaging_id = ?",
    )
    .bind(cas.id)
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(bal, 5, "Stock d'emballages intacts");
}
