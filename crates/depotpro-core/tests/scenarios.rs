use depotpro_core::application::{
    auth, cash, consignments, inventory, pdf, products, purchases, reports, sales,
};
use depotpro_core::domain::quantity::Quantity;
use depotpro_core::infrastructure::{backup, db::DepotDb};
use std::path::PathBuf;

fn temp_paths(tag: &str) -> (PathBuf, PathBuf) {
    let base =
        std::env::temp_dir().join(format!("depotpro_rust_test_{tag}_{}", uuid::Uuid::new_v4()));
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
    auth::change_owner_pin(&db, "123456", "654321")
        .await
        .unwrap();
    assert!(auth::verify_owner_pin(&db, "654321").await.is_ok());

    // Scénario A — Catégorie + Produit + Conditionnement casier uniquement (casier=24)
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
            image_path: Some("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==".to_string()),
            packagings: Some(vec![products::PackagingInput {
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
            }]),
        },
    )
    .await
    .unwrap();

    // Les cinq unités de vente prévues sont acceptées ; les formats inconnus restent rejetés.
    for forbidden_pkg in ["palette", "fût"] {
        assert!(products::upsert_packaging(
            &db,
            prod.id,
            products::PackagingInput {
                id: None,
                name: forbidden_pkg.to_string(),
                coefficient: "1".to_string(),
                purchase_price: None,
                wholesale_price: None,
                semi_wholesale_price: None,
                retail_price: Some(500),
                barcode: None,
                allow_fraction: Some(false),
                is_active: Some(true),
                deposit_mode: Some("none".to_string()),
                components: None,
            },
        )
        .await
        .is_err());
    }

    let pkg_casier = prod.packagings.iter().find(|p| p.name == "casier").unwrap();
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

    let stock_after_rec: i64 = sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
        .bind(prod.id)
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(stock_after_rec, 240_000);

    // Scénario C — Ouverture session caisse puis vente 1 casier (-24 bouteilles)
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
            lines: vec![sales::CreateSaleLineInput {
                product_id: prod.id,
                packaging_id: pkg_casier.id,
                quantity: "1".to_string(),
                discount_amount: Some(0),
            }],
            payments: vec![sales::PaymentPartInput {
                method_code: "cash".to_string(),
                amount: 15_600 + 2_500,
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
    assert_eq!(stock_after_c, 216_000); // 240 - 24

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
            image_path: None,
            packagings: None,
        },
    )
    .await
    .unwrap();

    // Vérification image_path : conservation, rejet SVG et suppression explicite
    assert!(prod.image_path.is_some());
    assert!(products::update_product(
        &db,
        prod.id,
        products::UpdateProductInput {
            name: None,
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
            category_id: None,
            supplier_id: None,
            description: None,
            min_stock: None,
            max_stock: None,
            purchase_price: None,
            wholesale_price: None,
            semi_wholesale_price: None,
            retail_price: None,
            image_path: Some(Some(
                "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=".to_string()
            )),
            is_active: None,
        }
    )
    .await
    .is_err());
    let cleared = products::update_product(
        &db,
        prod.id,
        products::UpdateProductInput {
            name: None,
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
            category_id: None,
            supplier_id: None,
            description: None,
            min_stock: None,
            max_stock: None,
            purchase_price: None,
            wholesale_price: None,
            semi_wholesale_price: None,
            retail_price: None,
            image_path: Some(None),
            is_active: None,
        },
    )
    .await
    .unwrap();
    assert!(cleared.image_path.is_none());
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
    let rec = recs
        .iter()
        .find(|r| r.sale_id == credit_sale.sale.id)
        .unwrap();
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
    assert!(inventory::validate_inventory(
        &db,
        inv.id,
        vec![inventory::ValidateInventoryLineInput {
            product_id: prod_no_dep.id,
            counted_quantity: "80".to_string(),
            reason: None,
        }]
    )
    .await
    .is_err());
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
    let theo = status_before_close
        .summary
        .as_ref()
        .unwrap()
        .theoretical_cash;
    assert!(cash::close_cash_session(
        &db,
        cash::CloseCashInput {
            session_id: session.id,
            physical_cash: theo - 500,
            closing_notes: None,
            request_key: "rust-close-err".to_string(),
        }
    )
    .await
    .is_err());
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

    // Rapports, Dashboard, PDF & Paramètres
    let dash = reports::get_dashboard_data(&db).await.unwrap();
    assert!(dash.kpis.sales_count >= 3);
    let rep = reports::get_reports_overview(&db, None, None)
        .await
        .unwrap();
    assert!(rep.commercial.count >= 3);
    assert!(!rep.payment_breakdown.is_empty());
    let rep_empty_period =
        reports::get_reports_overview(&db, Some("2099-01-01"), Some("2099-01-31"))
            .await
            .unwrap();
    assert_eq!(rep_empty_period.profitability.expenses_total, 0);
    assert!(rep_empty_period
        .payment_breakdown
        .iter()
        .all(|m| m.total_in == 0));

    let (_bkp_name, bkp_bytes) = backup::read_backup_bytes(&backup_dir, &bkp.name).unwrap();
    assert!(!bkp_bytes.is_empty());

    let (pdf_name, pdf_bytes) = pdf::generate_document_pdf(
        &db,
        pdf::DocumentPdfInput {
            doc_type: "FACTURE".to_string(),
            reference: sale_c.sale.reference.clone(),
            date: sale_c.sale.created_at.clone(),
            status_label: Some("Validée".to_string()),
            party_title: Some("Client".to_string()),
            party_name: Some(sale_c.sale.client_name.clone()),
            party_details: None,
            lines: vec![pdf::DocumentPdfLine {
                label: "Flag Spéciale 65cl".to_string(),
                sublabel: Some("casier".to_string()),
                quantity: "1".to_string(),
                unit_price: Some(15_600),
                total: Some(15_600),
            }],
            summary_rows: vec![pdf::DocumentPdfSummaryRow {
                label: "Total TTC".to_string(),
                value: "18 100 FCFA".to_string(),
                bold: true,
                tone: Some("success".to_string()),
            }],
            payments: None,
            notes: None,
        },
    )
    .await
    .unwrap();
    assert!(pdf_name.ends_with(".pdf"));
    assert!(pdf_bytes.starts_with(b"%PDF-1.4"));

    let bundle = reports::get_settings_bundle(&db).await.unwrap();
    assert!(!bundle.payment_methods.is_empty());

    // Scénario R — Ajustement manuel du stock audité (validation, sortie fractionnaire, idempotence, entrée)
    assert!(inventory::adjust_stock(
        &db,
        inventory::AdjustStockInput {
            product_id: prod.id,
            direction: "out".to_string(),
            quantity: "1".to_string(),
            reason: "ok".to_string(),
            request_key: "rust-adj-bad".to_string(),
        }
    )
    .await
    .is_err());
    let adj_out = inventory::adjust_stock(
        &db,
        inventory::AdjustStockInput {
            product_id: prod.id,
            direction: "out".to_string(),
            quantity: "0.5".to_string(),
            reason: "Casse bouteille rust test".to_string(),
            request_key: "rust-adj-1".to_string(),
        },
    )
    .await
    .unwrap();
    assert_eq!(adj_out.movement_type, "manual_adjust");
    assert_eq!(adj_out.quantity_milli, -500);
    assert!(adj_out
        .reference_document
        .as_deref()
        .unwrap_or("")
        .starts_with("ADJ-"));

    let adj_replay = inventory::adjust_stock(
        &db,
        inventory::AdjustStockInput {
            product_id: prod.id,
            direction: "out".to_string(),
            quantity: "0.5".to_string(),
            reason: "Casse bouteille rust test".to_string(),
            request_key: "rust-adj-1".to_string(),
        },
    )
    .await
    .unwrap();
    assert_eq!(adj_replay.id, adj_out.id);

    let adj_in = inventory::adjust_stock(
        &db,
        inventory::AdjustStockInput {
            product_id: prod.id,
            direction: "in".to_string(),
            quantity: "0.5".to_string(),
            reason: "Correction surplus rust test".to_string(),
            request_key: "rust-adj-2".to_string(),
        },
    )
    .await
    .unwrap();
    assert_eq!(adj_in.stock_after_milli, adj_out.stock_before_milli);

    // Scénario S — Édition complète Client, Fournisseur, Conditionnement existant & nouveaux PDF rapports
    let upd_cli = sales::update_client(
        &db,
        client.id,
        sales::UpdateClientInput {
            name: Some("Maquis Cocody Plus".to_string()),
            client_type: None,
            phone: Some(Some("+225 07 77 88 99".to_string())),
            address: Some(Some("Riviera 2".to_string())),
            city: Some(Some("Abidjan".to_string())),
            email: Some(Some("cocody@maquis.ci".to_string())),
            contact_person: Some(Some("Mme Soro".to_string())),
            is_active: Some(true),
        },
    )
    .await
    .unwrap();
    assert_eq!(upd_cli.name, "Maquis Cocody Plus");
    assert_eq!(upd_cli.email.as_deref(), Some("cocody@maquis.ci"));

    let upd_sup = purchases::update_supplier(
        &db,
        sup.id,
        purchases::UpdateSupplierInput {
            name: Some("Brasserie Abidjan".to_string()),
            company_name: Some(Some("Brasserie SA".to_string())),
            phone: Some("+225 27 21 99 88 77".to_string()),
            address: Some(Some("Zone 4".to_string())),
            email: Some(Some("fournisseur@brasserie.ci".to_string())),
            contact_person: Some(Some("M. Koffi".to_string())),
            payment_terms_days: Some(45),
            is_active: Some(true),
        },
    )
    .await
    .unwrap();
    assert_eq!(upd_sup.payment_terms_days, 45);
    assert_eq!(upd_sup.address.as_deref(), Some("Zone 4"));

    let first_pkg = prod.packagings.first().unwrap();
    let upd_pkg = products::upsert_packaging(
        &db,
        prod.id,
        products::PackagingInput {
            id: Some(first_pkg.id),
            name: first_pkg.name.clone(),
            coefficient: (first_pkg.coefficient_milli / 1000).to_string(),
            purchase_price: Some(480),
            wholesale_price: Some(580),
            semi_wholesale_price: Some(620),
            retail_price: Some(680),
            barcode: Some("333999111222".to_string()),
            allow_fraction: Some(true),
            is_active: Some(true),
            deposit_mode: first_pkg.deposit_mode.clone(),
            components: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(upd_pkg.retail_price, Some(680));
    assert_eq!(upd_pkg.allow_fraction, 1);

    for dt in [
        "BILAN COMMERCIAL & FINANCES",
        "ÉTAT DES DETTES FOURNISSEURS",
        "ÉTAT DES CONSIGNATIONS",
    ] {
        let (_fname, bytes) = pdf::generate_document_pdf(
            &db,
            pdf::DocumentPdfInput {
                doc_type: dt.to_string(),
                reference: "RAP-S-TEST".to_string(),
                date: "2026-11-17T12:00:00Z".to_string(),
                status_label: None,
                party_title: None,
                party_name: None,
                party_details: None,
                lines: vec![],
                summary_rows: vec![],
                payments: None,
                notes: None,
            },
        )
        .await
        .unwrap();
        assert!(bytes.starts_with(b"%PDF-1.4"));
    }

    if let Some(parent) = db_path.parent() {
        let _ = std::fs::remove_dir_all(parent);
    }
}

#[tokio::test]
async fn scenario_t_company_logo_and_wave_refund() {
    let (db_path, _backup_dir) = temp_paths("scen_t");
    let db = DepotDb::connect(&db_path).await.expect("connect temp db");

    let valid_logo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=".to_string();

    assert!(reports::update_settings(
        &db,
        reports::UpdateSettingsInput {
            logo_path: Some(Some("https://evil.example/logo.png".to_string())),
            ..Default::default()
        },
    )
    .await
    .is_err());

    let saved = reports::update_settings(
        &db,
        reports::UpdateSettingsInput {
            logo_path: Some(Some(valid_logo.clone())),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(
        saved.settings.logo_path.as_deref(),
        Some(valid_logo.as_str())
    );

    let cleared = reports::update_settings(
        &db,
        reports::UpdateSettingsInput {
            logo_path: Some(None),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(cleared.settings.logo_path, None);

    let _sess = cash::open_cash_session(
        &db,
        cash::OpenCashInput {
            opening_cash: 5000,
            request_key: "open-t".to_string(),
        },
    )
    .await
    .unwrap();

    let cat_t = products::create_category(&db, "Boissons T", None)
        .await
        .unwrap();

    let prod = products::create_product(
        &db,
        products::CreateProductInput {
            name: "Boisson Wave T".to_string(),
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
            category_id: cat_t.id,
            supplier_id: None,
            description: None,
            base_unit: "bouteille".to_string(),
            initial_stock: Some("10".to_string()),
            min_stock: Some("2".to_string()),
            max_stock: None,
            purchase_price: Some(400),
            wholesale_price: Some(500),
            semi_wholesale_price: Some(550),
            retail_price: Some(600),
            image_path: None,
            packagings: None,
        },
    )
    .await
    .unwrap();
    let pkg = prod.packagings.first().unwrap();

    let sale = sales::create_sale(
        &db,
        sales::CreateSaleInput {
            request_key: "sale-t-wave".to_string(),
            client_id: None,
            sale_type: "cash".to_string(),
            price_tier: "retail".to_string(),
            discount_amount: Some(0),
            notes: None,
            lines: vec![sales::CreateSaleLineInput {
                product_id: prod.id,
                packaging_id: pkg.id,
                quantity: "2".to_string(),
                discount_amount: Some(0),
            }],
            payments: vec![sales::PaymentPartInput {
                method_code: "wave".to_string(),
                amount: 1200,
            }],
            due_date: None,
        },
    )
    .await
    .unwrap();

    let cancelled = sales::cancel_sale(
        &db,
        sale.sale.id,
        sales::CancelSaleInput {
            reason: "Remboursement Wave".to_string(),
            refund_method_code: Some("wave".to_string()),
            request_key: "cancel-t-wave".to_string(),
        },
    )
    .await
    .unwrap();
    assert_eq!(cancelled.sale.status, "cancelled");

    let status = cash::get_cash_status(&db).await.unwrap();
    let summary = status.summary.unwrap();
    let mov = summary
        .movements
        .iter()
        .find(|m| {
            m.reference_document.as_deref() == Some(sale.sale.reference.as_str())
                && m.direction == "out"
        })
        .unwrap();
    assert_eq!(mov.method_code, "wave");
    assert_eq!(mov.amount, 1200);

    if let Some(parent) = db_path.parent() {
        let _ = std::fs::remove_dir_all(parent);
    }
}

#[tokio::test]
async fn scenario_u_cancel_po_and_overdue_kpis() {
    let (db_path, _backup_dir) = temp_paths("scen_u");
    let db = DepotDb::connect(&db_path).await.expect("connect temp db");

    let cat = products::create_category(&db, "Boissons U", None)
        .await
        .unwrap();
    let prod = products::create_product(
        &db,
        products::CreateProductInput {
            name: "Produit U".to_string(),
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
            supplier_id: None,
            description: None,
            base_unit: "bouteille".to_string(),
            initial_stock: Some("10".to_string()),
            min_stock: Some("2".to_string()),
            max_stock: None,
            purchase_price: Some(400),
            wholesale_price: Some(500),
            semi_wholesale_price: Some(550),
            retail_price: Some(600),
            image_path: None,
            packagings: None,
        },
    )
    .await
    .unwrap();
    let pkg = prod.packagings.first().unwrap();

    let sup = purchases::create_supplier(
        &db,
        purchases::CreateSupplierInput {
            name: "Fournisseur U".to_string(),
            company_name: None,
            phone: "+225 07 00 11 22 33".to_string(),
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
            request_key: "po-u-cancel".to_string(),
            supplier_id: sup.id,
            expected_date: None,
            notes: Some("Commande initiale".to_string()),
            lines: vec![purchases::PurchaseOrderLineInput {
                product_id: prod.id,
                packaging_id: pkg.id,
                quantity: "5".to_string(),
                unit_price: 400,
            }],
        },
    )
    .await
    .unwrap();

    // Motif vide refusé
    assert!(purchases::cancel_purchase_order(
        &db,
        po.id,
        purchases::CancelPurchaseOrderInput {
            reason: "   ".to_string(),
        },
    )
    .await
    .is_err());

    let cancelled_po = purchases::cancel_purchase_order(
        &db,
        po.id,
        purchases::CancelPurchaseOrderInput {
            reason: "Rupture fournisseur".to_string(),
        },
    )
    .await
    .unwrap();
    assert_eq!(cancelled_po.status, "cancelled");
    assert!(cancelled_po
        .notes
        .as_deref()
        .unwrap_or("")
        .contains("Rupture fournisseur"));

    // Double annulation refusée
    assert!(purchases::cancel_purchase_order(
        &db,
        po.id,
        purchases::CancelPurchaseOrderInput {
            reason: "Deuxième tentative".to_string(),
        },
    )
    .await
    .is_err());

    // Commande déjà réceptionnée ne peut plus être annulée
    let po_rec = purchases::create_purchase_order(
        &db,
        purchases::CreatePurchaseOrderInput {
            request_key: "po-u-rec".to_string(),
            supplier_id: sup.id,
            expected_date: None,
            notes: None,
            lines: vec![purchases::PurchaseOrderLineInput {
                product_id: prod.id,
                packaging_id: pkg.id,
                quantity: "4".to_string(),
                unit_price: 400,
            }],
        },
    )
    .await
    .unwrap();
    purchases::receive_purchase_order(
        &db,
        po_rec.id,
        purchases::ReceivePurchaseOrderInput {
            request_key: "rec-u-1".to_string(),
            notes: None,
            lines: vec![purchases::ReceiveLineInput {
                purchase_order_line_id: po_rec.lines[0].id,
                received_quantity: "2".to_string(),
                discrepancy_reason: None,
            }],
        },
    )
    .await
    .unwrap();
    assert!(purchases::cancel_purchase_order(
        &db,
        po_rec.id,
        purchases::CancelPurchaseOrderInput {
            reason: "Trop tard".to_string(),
        },
    )
    .await
    .is_err());

    // Échéance dépassée remontée sur les KPIs Dashboard
    let _sess = cash::open_cash_session(
        &db,
        cash::OpenCashInput {
            opening_cash: 1000,
            request_key: "open-u".to_string(),
        },
    )
    .await
    .unwrap();
    let cli = sales::create_client(
        &db,
        sales::CreateClientInput {
            name: "Client Échu U".to_string(),
            client_type: "professionnel".to_string(),
            phone: None,
            address: None,
            city: None,
            email: None,
            contact_person: None,
            credit_policy: "limited".to_string(),
            credit_limit: Some(50_000),
            payment_terms_days: Some(15),
        },
    )
    .await
    .unwrap();
    let _sale = sales::create_sale(
        &db,
        sales::CreateSaleInput {
            request_key: "sale-u-overdue".to_string(),
            client_id: Some(cli.id),
            sale_type: "credit".to_string(),
            price_tier: "retail".to_string(),
            discount_amount: Some(0),
            notes: None,
            lines: vec![sales::CreateSaleLineInput {
                product_id: prod.id,
                packaging_id: pkg.id,
                quantity: "3".to_string(),
                discount_amount: Some(0),
            }],
            payments: vec![],
            due_date: Some("2024-01-15".to_string()),
        },
    )
    .await
    .unwrap();

    let dash = reports::get_dashboard_kpis(&db).await.unwrap();
    assert_eq!(dash.overdue_receivables_count, 1);
    assert_eq!(dash.overdue_receivables_total, 1800);

    // Scénario V — Justificatif de dépense (expenses.receipt_path) : validation et persistance
    let valid_png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    assert!(cash::create_expense(
        &db,
        cash::CreateExpenseInput {
            request_key: "exp-v-bad".to_string(),
            category: "Divers".to_string(),
            amount: 500,
            method_code: "cash".to_string(),
            beneficiary: None,
            notes: None,
            receipt_path: Some("https://evil.example/a.png".to_string()),
            expense_date: None,
        },
    )
    .await
    .is_err());
    cash::create_expense(
        &db,
        cash::CreateExpenseInput {
            request_key: "exp-v-ok".to_string(),
            category: "Carburant & Livraison".to_string(),
            amount: 500,
            method_code: "cash".to_string(),
            beneficiary: Some("Station Shell".to_string()),
            notes: Some("Justificatif test V".to_string()),
            receipt_path: Some(valid_png.to_string()),
            expense_date: None,
        },
    )
    .await
    .unwrap();
    let exps = cash::list_expenses(&db).await.unwrap();
    let exp_v = exps
        .items
        .iter()
        .find(|e| e.notes.as_deref() == Some("Justificatif test V"))
        .expect("Dépense V introuvable");
    assert_eq!(exp_v.receipt_path.as_deref(), Some(valid_png));

    // Scénario W : filtrage par plage de dates (from / to) sur list_sales
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let today_sales = sales::list_sales(&db, None, None, Some(&today), Some(&today), 50, 0)
        .await
        .unwrap();
    assert!(today_sales.total >= 1);
    assert!(today_sales
        .items
        .iter()
        .all(|s| s.created_at.starts_with(&today)));

    let empty_past = sales::list_sales(
        &db,
        None,
        None,
        Some("2020-01-01"),
        Some("2020-12-31"),
        50,
        0,
    )
    .await
    .unwrap();
    assert_eq!(empty_past.total, 0);

    // Scénario X : Panachage deux demi-casiers 33cl -> 1 casier consigné + correspondance bouteilles
    let crate_33 = consignments::create_returnable_type(
        &db,
        consignments::CreateReturnableTypeInput {
            code: "EMB-PAN-CAS24".to_string(),
            name: "Casier 24x33cl".to_string(),
            producer: "SOLIBRA".to_string(),
            kind: "crate".to_string(),
            deposit_value: 2_000,
            initial_stock: Some(30),
            description: None,
        },
    )
    .await
    .unwrap();
    let btl_33 = consignments::create_returnable_type(
        &db,
        consignments::CreateReturnableTypeInput {
            code: "EMB-PAN-BTL33".to_string(),
            name: "Bouteille 33cl".to_string(),
            producer: "SOLIBRA".to_string(),
            kind: "bottle".to_string(),
            deposit_value: 100,
            initial_stock: Some(200),
            description: None,
        },
    )
    .await
    .unwrap();
    let prod_bock = products::create_product(
        &db,
        products::CreateProductInput {
            name: "Bock 33cl".to_string(),
            brand: Some("SOLIBRA".to_string()),
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
            supplier_id: None,
            description: None,
            base_unit: "bouteille".to_string(),
            initial_stock: Some("48".to_string()),
            min_stock: Some("0".to_string()),
            max_stock: Some("200".to_string()),
            purchase_price: Some(9_000),
            wholesale_price: None,
            semi_wholesale_price: None,
            retail_price: Some(12_000),
            image_path: None,
            packagings: Some(vec![products::PackagingInput {
                id: None,
                name: "casier".to_string(),
                coefficient: "24".to_string(),
                purchase_price: Some(9_000),
                wholesale_price: None,
                semi_wholesale_price: None,
                retail_price: Some(12_000),
                barcode: None,
                allow_fraction: Some(true),
                is_active: Some(true),
                deposit_mode: Some("deposit".to_string()),
                components: Some(vec![
                    products::DepositComponentInput {
                        returnable_id: crate_33.id,
                        pieces_per_pack: 1,
                    },
                    products::DepositComponentInput {
                        returnable_id: btl_33.id,
                        pieces_per_pack: 24,
                    },
                ]),
            }]),
        },
    )
    .await
    .unwrap();
    let prod_doppel = products::create_product(
        &db,
        products::CreateProductInput {
            name: "Doppel 33cl".to_string(),
            brand: Some("SOLIBRA".to_string()),
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
            supplier_id: None,
            description: None,
            base_unit: "bouteille".to_string(),
            initial_stock: Some("48".to_string()),
            min_stock: Some("0".to_string()),
            max_stock: Some("200".to_string()),
            purchase_price: Some(10_500),
            wholesale_price: None,
            semi_wholesale_price: None,
            retail_price: Some(14_000),
            image_path: None,
            packagings: Some(vec![products::PackagingInput {
                id: None,
                name: "casier".to_string(),
                coefficient: "24".to_string(),
                purchase_price: Some(10_500),
                wholesale_price: None,
                semi_wholesale_price: None,
                retail_price: Some(14_000),
                barcode: None,
                allow_fraction: Some(true),
                is_active: Some(true),
                deposit_mode: Some("deposit".to_string()),
                components: Some(vec![
                    products::DepositComponentInput {
                        returnable_id: crate_33.id,
                        pieces_per_pack: 1,
                    },
                    products::DepositComponentInput {
                        returnable_id: btl_33.id,
                        pieces_per_pack: 24,
                    },
                ]),
            }]),
        },
    )
    .await
    .unwrap();

    // Demi-casier isolé refusé (panachage incomplet)
    assert!(sales::create_sale(
        &db,
        sales::CreateSaleInput {
            request_key: "rust-sale-panachage-bad".to_string(),
            client_id: Some(cli.id),
            sale_type: "cash".to_string(),
            price_tier: "retail".to_string(),
            discount_amount: Some(0),
            notes: None,
            lines: vec![sales::CreateSaleLineInput {
                product_id: prod_bock.id,
                packaging_id: prod_bock.packagings[0].id,
                quantity: "0.5".to_string(),
                discount_amount: Some(0),
            }],
            payments: vec![sales::PaymentPartInput {
                method_code: "cash".to_string(),
                amount: 9_200,
            }],
            due_date: None,
        },
    )
    .await
    .is_err());

    // Deux demi-casiers de produits différents = 1 casier consigné + bouteilles par produit
    let panachage_sale = sales::create_sale(
        &db,
        sales::CreateSaleInput {
            request_key: "rust-sale-panachage-ok".to_string(),
            client_id: Some(cli.id),
            sale_type: "cash".to_string(),
            price_tier: "retail".to_string(),
            discount_amount: Some(0),
            notes: None,
            lines: vec![
                sales::CreateSaleLineInput {
                    product_id: prod_bock.id,
                    packaging_id: prod_bock.packagings[0].id,
                    quantity: "0.5".to_string(),
                    discount_amount: Some(0),
                },
                sales::CreateSaleLineInput {
                    product_id: prod_doppel.id,
                    packaging_id: prod_doppel.packagings[0].id,
                    quantity: "0.5".to_string(),
                    discount_amount: Some(0),
                },
            ],
            payments: vec![sales::PaymentPartInput {
                method_code: "cash".to_string(),
                amount: 17_400,
            }],
            due_date: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(panachage_sale.sale.total_merchandise, 13_000);
    assert_eq!(panachage_sale.sale.total_deposit, 4_400);
    assert_eq!(panachage_sale.sale.total_amount, 17_400);
    assert_eq!(panachage_sale.deposits.len(), 3);
    let crate_dep = panachage_sale
        .deposits
        .iter()
        .find(|d| d.returnable_id == crate_33.id)
        .unwrap();
    assert_eq!(crate_dep.pieces, 1);
    assert_eq!(crate_dep.amount, 2_000);
    assert_eq!(
        crate_dep.expected_products.as_deref(),
        Some("Bock 33cl (12 bouteille) + Doppel 33cl (12 bouteille)")
    );
    let ov_pan = consignments::get_overview(&db).await.unwrap();
    let open_crate = ov_pan
        .open_issues
        .iter()
        .find(|i| i.id == crate_dep.id)
        .unwrap();
    assert_eq!(
        open_crate.expected_products.as_deref(),
        Some("Bock 33cl (12 bouteille) + Doppel 33cl (12 bouteille)")
    );

    if let Some(parent) = db_path.parent() {
        let _ = std::fs::remove_dir_all(parent);
    }
}
