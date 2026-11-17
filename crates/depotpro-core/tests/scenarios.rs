use std::path::PathBuf;
use depotpro_core::application::{
    auth, cash, consignments, inventory, products, purchases, reports, sales,
};
use depotpro_core::domain::quantity::Quantity;
use depotpro_core::infrastructure::{backup, db::DepotDb};

fn temp_paths(tag: &str) -> (PathBuf, PathBuf) {
    let base = std::env::temp_dir().join(format!(
        "depotpro_rust_test_{tag}_{}",
        uuid::Uuid::new_v4()
    ));
    let db_path = base.join("depotpro.db");
    let backup_dir = base.join("backups");
    (db_path, backup_dir)
}

#[tokio::test]
async fn rust_core_scenarios_a_through_l() {
    let (db_path, backup_dir) = temp_paths("all");
    let db = DepotDb::connect(&db_path).await.expect("connect temp db");

    // Auth setup & PIN verification + change
    let status = auth::get_auth_status(&db).await.unwrap();
    assert!(status.needs_setup);
    auth::setup_owner_pin(&db, "123456").await.unwrap();
    assert!(auth::verify_owner_pin(&db, "123456").await.is_ok());
    assert!(auth::verify_owner_pin(&db, "000000").await.is_err());
    auth::change_owner_pin(&db, "123456", "654321").await.unwrap();
    assert!(auth::verify_owner_pin(&db, "654321").await.is_ok());

    // Scénario A — Catégorie + Produit + Conditionnements exacts (bouteille=1, pack=6, casier=24)
    let cat = products::create_category(&db, "Bières Test", None)
        .await
        .unwrap();
    let crate_type = consignments::create_returnable_type(
        &db,
        consignments::CreateReturnableTypeInput {
            code: "EMB-TEST-CAS24".to_string(),
            name: "Casier 24 Test".to_string(),
            producer: "SOLIBRA".to_string(),
            kind: "crate".to_string(),
            deposit_value: 2500,
            initial_stock: Some(50),
            description: None,
        },
    )
    .await
    .unwrap();

    let prod = products::create_product(
        &db,
        products::CreateProductInput {
            name: "Flag Spéciale 65cl".to_string(),
            brand: Some("SOLIBRA".to_string()),
            barcode: None,
            category_id: cat.id,
            supplier_id: None,
            description: None,
            base_unit: "bouteille".to_string(),
            initial_stock: Some("0".to_string()),
            min_stock: Some("24".to_string()),
            max_stock: Some("500".to_string()),
            purchase_price: Some(450),
            wholesale_price: Some(550),
            semi_wholesale_price: Some(600),
            retail_price: Some(650),
            packagings: Some(vec![
                products::PackagingInput {
                    id: None,
                    name: "bouteille".to_string(),
                    coefficient: "1".to_string(),
                    purchase_price: Some(450),
                    wholesale_price: Some(550),
                    semi_wholesale_price: Some(600),
                    retail_price: Some(650),
                    barcode: None,
                    allow_fraction: Some(false),
                    is_active: Some(true),
                    deposit_mode: Some("none".to_string()),
                    components: None,
                },
                products::PackagingInput {
                    id: None,
                    name: "pack".to_string(),
                    coefficient: "6".to_string(),
                    purchase_price: Some(2700),
                    wholesale_price: Some(3300),
                    semi_wholesale_price: Some(3600),
                    retail_price: Some(3900),
                    barcode: None,
                    allow_fraction: Some(false),
                    is_active: Some(true),
                    deposit_mode: Some("none".to_string()),
                    components: None,
                },
                products::PackagingInput {
                    id: None,
                    name: "casier".to_string(),
                    coefficient: "24".to_string(),
                    purchase_price: Some(10800),
                    wholesale_price: Some(13200),
                    semi_wholesale_price: Some(14400),
                    retail_price: Some(15600),
                    barcode: None,
                    allow_fraction: Some(false),
                    is_active: Some(true),
                    deposit_mode: Some("deposit".to_string()),
                    components: Some(vec![products::DepositComponentInput {
                        returnable_id: crate_type.id,
                        pieces_per_pack: 1,
                    }]),
                },
            ]),
        },
    )
    .await
    .unwrap();

    let pkg_btl = prod
        .packagings
        .iter()
        .find(|p| p.name == "bouteille")
        .unwrap();
    let pkg_casier = prod
        .packagings
        .iter()
        .find(|p| p.name == "casier")
        .unwrap();
    assert_eq!(pkg_btl.coefficient_milli, 1_000);
    assert_eq!(pkg_casier.coefficient_milli, 24_000);
    assert_eq!(
        Quantity::parse_str("10", "cmd")
            .unwrap()
            .multiply_coefficient_to_base(Quantity::from_milli(pkg_casier.coefficient_milli))
            .unwrap()
            .milli_units,
        240_000
    );

    // Scénario B — Commande 10 casiers puis réception -> +240 bouteilles & dette fournisseur
    let sup = purchases::create_supplier(
        &db,
        purchases::CreateSupplierInput {
            name: "Brasserie Test".to_string(),
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

    let po = purchases::create_purchase_order(
        &db,
        purchases::CreatePurchaseOrderInput {
            request_key: "rust-po-1".to_string(),
            supplier_id: sup.id,
            expected_date: None,
            notes: None,
            lines: vec![purchases::PurchaseOrderLineInput {
                product_id: prod.id,
                packaging_id: pkg_casier.id,
                quantity: "10".to_string(),
                unit_price: 10_800,
            }],
        },
    )
    .await
    .unwrap();
    let po_line_id: i64 = sqlx::query_scalar(
        "SELECT id FROM purchase_order_lines WHERE purchase_order_id = ? LIMIT 1",
    )
    .bind(po.id)
    .fetch_one(&db.pool)
    .await
    .unwrap();

    purchases::receive_purchase_order(
        &db,
        po.id,
        purchases::ReceivePurchaseOrderInput {
            request_key: "rust-rec-1".to_string(),
            notes: None,
            lines: vec![purchases::ReceiveLineInput {
                purchase_order_line_id: po_line_id,
                received_quantity: "10".to_string(),
                discrepancy_reason: None,
            }],
        },
    )
    .await
    .unwrap();

    let stock_after_rec: i64 =
        sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
            .bind(prod.id)
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert_eq!(stock_after_rec, 240_000);

    // Scénario C — Ouverture session caisse puis vente 1 casier + 3 bouteilles (-27 bouteilles)
    let session = cash::open_cash_session(
        &db,
        cash::OpenCashInput {
            opening_cash: 20_000,
            request_key: "rust-cash-open-1".to_string(),
        },
    )
    .await
    .unwrap();

    let client = sales::create_client(
        &db,
        sales::CreateClientInput {
            name: "Maquis Soleil".to_string(),
            client_type: "professionnel".to_string(),
            phone: Some("0701020304".to_string()),
            address: None,
            city: None,
            email: None,
            contact_person: None,
            credit_policy: "limited".to_string(),
            credit_limit: Some(150_000),
            payment_terms_days: Some(15),
        },
    )
    .await
    .unwrap();

    let sale_c = sales::create_sale(
        &db,
        sales::CreateSaleInput {
            request_key: "rust-sale-c".to_string(),
            client_id: Some(client.id),
            sale_type: "cash".to_string(),
            price_tier: "retail".to_string(),
            discount_amount: Some(0),
            notes: None,
            lines: vec![
                sales::CreateSaleLineInput {
                    product_id: prod.id,
                    packaging_id: pkg_casier.id,
                    quantity: "1".to_string(),
                    discount_amount: Some(0),
                },
                sales::CreateSaleLineInput {
                    product_id: prod.id,
                    packaging_id: pkg_btl.id,
                    quantity: "3".to_string(),
                    discount_amount: Some(0),
                },
            ],
            payments: vec![sales::PaymentPartInput {
                method_code: "cash".to_string(),
                amount: 15_600 + 2_500 + 3 * 650,
            }],
            due_date: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(sale_c.sale.total_deposit, 2_500);
    let stock_after_c: i64 = sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
        .bind(prod.id)
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(stock_after_c, 213_000); // 240 - 27

    // Scénario K — Retour emballage consigné (bon état + endommagé -> solde client soldé)
    let ov = consignments::get_overview(&db).await.unwrap();
    assert_eq!(ov.client_balances.len(), 1);
    assert_eq!(ov.client_balances[0].balance_pieces, 1);
    let issue_id = ov.open_issues[0].id;
    consignments::return_client_empties(
        &db,
        consignments::ReturnClientEmptiesInput {
            issue_id,
            pieces: 1,
            condition_state: "damaged".to_string(),
            refund_amount: 0,
            credit_reduction: 0,
            method_code: "cash".to_string(),
            reason: "Casier fendu".to_string(),
            request_key: "rust-ret-empty-1".to_string(),
        },
    )
    .await
    .unwrap();
    let ov_after = consignments::get_overview(&db).await.unwrap();
    assert_eq!(ov_after.client_balances.len(), 0);

    // Scénarios D & E — Crédit client + paiement partiel
    let prod_no_dep = products::create_product(
        &db,
        products::CreateProductInput {
            name: "Eau 1.5L".to_string(),
            brand: None,
            barcode: None,
            category_id: cat.id,
            supplier_id: None,
            description: None,
            base_unit: "bouteille".to_string(),
            initial_stock: Some("100".to_string()),
            min_stock: Some("10".to_string()),
            max_stock: Some("200".to_string()),
            purchase_price: Some(7_000),
            wholesale_price: Some(10_000),
            semi_wholesale_price: Some(10_000),
            retail_price: Some(10_000),
            packagings: None,
        },
    )
    .await
    .unwrap();
    let credit_sale = sales::create_sale(
        &db,
        sales::CreateSaleInput {
            request_key: "rust-sale-d".to_string(),
            client_id: Some(client.id),
            sale_type: "credit".to_string(),
            price_tier: "retail".to_string(),
            discount_amount: Some(0),
            notes: None,
            lines: vec![sales::CreateSaleLineInput {
                product_id: prod_no_dep.id,
                packaging_id: prod_no_dep.packagings[0].id,
                quantity: "10".to_string(),
                discount_amount: Some(0),
            }],
            payments: vec![],
            due_date: Some("2026-12-31".to_string()),
        },
    )
    .await
    .unwrap();
    assert_eq!(credit_sale.sale.total_amount, 100_000);
    let recs = cash::list_receivables(&db).await.unwrap();
    let rec = recs.iter().find(|r| r.sale_id == credit_sale.sale.id).unwrap();
    assert_eq!(rec.remaining_amount, 100_000);

    let paid_rec = cash::pay_receivable(
        &db,
        rec.id,
        cash::PayReceivableInput {
            request_key: "rust-pay-rec-1".to_string(),
            note: Some("Acompte".to_string()),
            parts: vec![sales::PaymentPartInput {
                method_code: "cash".to_string(),
                amount: 20_000,
            }],
        },
    )
    .await
    .unwrap();
    assert_eq!(paid_rec.remaining_amount, 80_000);

    // Scénario F & J — Paiement mixte 50 000 FCFA puis retour partiel AVO-*
    let mix_sale = sales::create_sale(
        &db,
        sales::CreateSaleInput {
            request_key: "rust-sale-f".to_string(),
            client_id: Some(client.id),
            sale_type: "cash".to_string(),
            price_tier: "retail".to_string(),
            discount_amount: Some(0),
            notes: None,
            lines: vec![sales::CreateSaleLineInput {
                product_id: prod_no_dep.id,
                packaging_id: prod_no_dep.packagings[0].id,
                quantity: "5".to_string(),
                discount_amount: Some(0),
            }],
            payments: vec![
                sales::PaymentPartInput {
                    method_code: "cash".to_string(),
                    amount: 10_000,
                },
                sales::PaymentPartInput {
                    method_code: "wave".to_string(),
                    amount: 15_000,
                },
                sales::PaymentPartInput {
                    method_code: "orange_money".to_string(),
                    amount: 25_000,
                },
            ],
            due_date: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(mix_sale.sale.paid_amount, 50_000);

    let returned = sales::create_sale_return(
        &db,
        mix_sale.sale.id,
        sales::CreateSaleReturnInput {
            request_key: "rust-ret-1".to_string(),
            reason: "Bouteille abîmée".to_string(),
            restock_approved: true,
            refund_method_code: "cash".to_string(),
            lines: vec![sales::SaleReturnLineInput {
                sale_line_id: mix_sale.lines[0].id,
                base_quantity: "1".to_string(),
            }],
        },
    )
    .await
    .unwrap();
    assert_eq!(returned.sale.status, "partially_returned");

    // Scénario H — Inventaire avec écart obligatoire motivé
    let inv = inventory::create_inventory(&db, Some("Contrôle Rust"))
        .await
        .unwrap();
    assert!(
        inventory::validate_inventory(
            &db,
            inv.id,
            vec![inventory::ValidateInventoryLineInput {
                product_id: prod_no_dep.id,
                counted_quantity: "80".to_string(),
                reason: None,
            }]
        )
        .await
        .is_err()
    );
    let validated = inventory::validate_inventory(
        &db,
        inv.id,
        vec![inventory::ValidateInventoryLineInput {
            product_id: prod_no_dep.id,
            counted_quantity: "85".to_string(),
            reason: Some("1 bouteille cassée".to_string()),
        }],
    )
    .await
    .unwrap();
    assert_eq!(validated.status, "validated");

    // Scénario I — Sauvegarde & Vérification intégrité
    let bkp = backup::create_backup_summary(&db, &backup_dir)
        .await
        .unwrap();
    let check = backup::verify_backup(&backup_dir, &bkp.name).await.unwrap();
    assert_eq!(check.integrity, "ok");
    assert_eq!(check.foreign_key_errors, 0);

    // Scénario L — Clôture caisse : écart sans justification rejeté, avec justification validé
    let status_before_close = cash::get_cash_status(&db).await.unwrap();
    let theo = status_before_close.theoretical_cash.unwrap();
    assert!(
        cash::close_cash_session(
            &db,
            cash::CloseCashInput {
                session_id: session.id,
                physical_cash: theo - 500,
                closing_notes: None,
                request_key: "rust-close-err".to_string(),
            }
        )
        .await
        .is_err()
    );
    let closed = cash::close_cash_session(
        &db,
        cash::CloseCashInput {
            session_id: session.id,
            physical_cash: theo - 500,
            closing_notes: Some("Erreur rendu monnaie".to_string()),
            request_key: "rust-close-ok".to_string(),
        },
    )
    .await
    .unwrap();
    assert_eq!(closed.status, "closed");
    assert_eq!(closed.difference, Some(-500));

    // Rapports & Paramètres
    let rep = reports::get_reports_overview(&db, None, None).await.unwrap();
    assert!(rep.commercial_count >= 3);
    let bundle = reports::get_settings_bundle(&db).await.unwrap();
    assert!(!bundle.payment_methods.is_empty());

    if let Some(parent) = db_path.parent() {
        let _ = std::fs::remove_dir_all(parent);
    }
}
