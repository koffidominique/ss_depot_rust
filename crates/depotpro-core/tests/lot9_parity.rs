use std::path::PathBuf;
use std::sync::Arc;

use depotpro_core::application::auth::{self, SessionIdentity};
use depotpro_core::application::{cash, consignments, inventory, products};
use depotpro_core::application::{purchases, reports, sales};
use depotpro_core::error::CoreError;
use depotpro_core::infrastructure::{backup, db::DepotDb};
use tokio::sync::RwLock;

struct TempDirGuard(PathBuf);

impl TempDirGuard {
    fn new(label: &str) -> Self {
        let dir = std::env::temp_dir().join(format!(
            "depotpro_lot9_rust_{}_{}",
            label,
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }
}

impl Drop for TempDirGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[tokio::test]
#[allow(clippy::too_many_lines)]
async fn lot9_22_scenarios_business_parity() {
    let dir = TempDirGuard::new("parity22");
    let db_path = dir.0.join("active.db");
    let backup_dir = dir.0.join("Sauvegardes");
    let db = DepotDb::connect(&db_path).await.unwrap();

    auth::with_actor(SessionIdentity::owner(), async move {
        // Scénario 1 — Création client & politique de crédit
        let bad_cli = sales::create_client(
            &db,
            sales::CreateClientInput {
                name: "Client Invalide".to_string(),
                client_type: "particulier".to_string(),
                phone: None,
                address: None,
                city: None,
                email: None,
                contact_person: None,
                credit_policy: "invalid".to_string(),
                credit_limit: None,
                payment_terms_days: Some(0),
            },
        )
        .await;
        assert!(matches!(bad_cli, Err(CoreError::Validation(_))));

        let cli_retail = sales::create_client(
            &db,
            sales::CreateClientInput {
                name: "Koffi Comptoir".to_string(),
                client_type: "particulier".to_string(),
                phone: Some("+2250701020304".to_string()),
                address: None,
                city: Some("Abidjan".to_string()),
                email: None,
                contact_person: None,
                credit_policy: "forbidden".to_string(),
                credit_limit: None,
                payment_terms_days: Some(0),
            },
        )
        .await
        .unwrap();
        assert_eq!(cli_retail.credit_policy.as_deref(), Some("forbidden"));

        let cli_pro = sales::create_client(
            &db,
            sales::CreateClientInput {
                name: "Maquis Le Plateau".to_string(),
                client_type: "professionnel".to_string(),
                phone: Some("+2250506070809".to_string()),
                address: Some("Rue du Commerce".to_string()),
                city: Some("Abidjan".to_string()),
                email: None,
                contact_person: Some("Awa Koné".to_string()),
                credit_policy: "limited".to_string(),
                credit_limit: Some(50_000),
                payment_terms_days: Some(15),
            },
        )
        .await
        .unwrap();
        assert_eq!(cli_pro.credit_limit, Some(50_000));

        let bad_pol = sales::update_client_credit_policy(
            &db,
            cli_pro.id,
            sales::UpdateCreditPolicyInput {
                credit_policy: "limited".to_string(),
                credit_limit: Some(-100),
                payment_terms_days: Some(10),
            },
        )
        .await;
        assert!(matches!(bad_pol, Err(CoreError::Validation(_))));

        let pol = sales::update_client_credit_policy(
            &db,
            cli_pro.id,
            sales::UpdateCreditPolicyInput {
                credit_policy: "limited".to_string(),
                credit_limit: Some(80_000),
                payment_terms_days: Some(30),
            },
        )
        .await
        .unwrap();
        assert_eq!(pol.credit_limit, Some(80_000));
        assert_eq!(pol.payment_terms_days, 30);

        // Scénario 2 — Création fournisseur
        let bad_sup = purchases::create_supplier(
            &db,
            purchases::CreateSupplierInput {
                name: "Sans Tel".to_string(),
                company_name: None,
                phone: "   ".to_string(),
                address: None,
                email: None,
                contact_person: None,
                payment_terms_days: Some(30),
            },
        )
        .await;
        assert!(matches!(bad_sup, Err(CoreError::Validation(_))));

        let sup = purchases::create_supplier(
            &db,
            purchases::CreateSupplierInput {
                name: "SOLIBRA Abidjan".to_string(),
                company_name: Some("Société de Limonaderies et Brasseries".to_string()),
                phone: "+2252721000001".to_string(),
                address: Some("Zone 3 Treichville".to_string()),
                email: None,
                contact_person: Some("M. Touré".to_string()),
                payment_terms_days: Some(30),
            },
        )
        .await
        .unwrap();
        assert!(sup.code.starts_with("FRN-"));
        assert_eq!(sup.balance_due, 0);

        // Scénario 3 — Création produit
        let cat = products::create_category(&db, "Bières 65cl Lot 9", None)
            .await
            .unwrap();
        let bad_prod = products::create_product(
            &db,
            products::CreateProductInput {
                name: "Produit Prix Négatif".to_string(),
                brand: None,
                barcode: None,
                category_id: cat.id,
                supplier_id: None,
                description: None,
                base_unit: "bouteille".to_string(),
                initial_stock: Some("10".to_string()),
                min_stock: Some("2".to_string()),
                max_stock: None,
                purchase_price: None,
                wholesale_price: None,
                semi_wholesale_price: None,
                retail_price: Some(-100),
                image_path: None,
                packagings: None,
            },
        )
        .await;
        assert!(matches!(bad_prod, Err(CoreError::Validation(_))));

        let prod = products::create_product(
            &db,
            products::CreateProductInput {
                name: "Flag Spéciale 65cl".to_string(),
                brand: Some("SOLIBRA".to_string()),
                barcode: Some("6181100000651".to_string()),
                category_id: cat.id,
                supplier_id: Some(sup.id),
                description: Some("Bière blonde 65cl".to_string()),
                base_unit: "bouteille".to_string(),
                initial_stock: Some("10".to_string()),
                min_stock: Some("24".to_string()),
                max_stock: Some("500".to_string()),
                purchase_price: Some(450),
                wholesale_price: Some(550),
                semi_wholesale_price: Some(600),
                retail_price: Some(650),
                image_path: None,
                packagings: None,
            },
        )
        .await
        .unwrap();
        assert_eq!(prod.stock_milli, 10_000);
        assert_eq!(prod.min_stock_milli, 24_000);
        assert_eq!(prod.max_stock_milli, 500_000);
        assert_eq!(prod.average_cost_fcfa, Some(450));
        let pkg_bouteille_id = prod.packagings[0].id;

        // Scénario 4 — Création conditionnements (pack=6, casier=24 consigné, doublon)
        let dup_pkg = products::upsert_packaging(
            &db,
            prod.id,
            products::PackagingInput {
                id: None,
                name: "bouteille".to_string(),
                coefficient: "1".to_string(),
                purchase_price: None,
                wholesale_price: None,
                semi_wholesale_price: None,
                retail_price: Some(650),
                barcode: None,
                allow_fraction: None,
                is_active: None,
                deposit_mode: None,
                components: None,
            },
        )
        .await;
        assert!(matches!(dup_pkg, Err(CoreError::DuplicateOperation(_))));

        let ret_type = consignments::create_returnable_type(
            &db,
            consignments::CreateReturnableTypeInput {
                code: "CAS-24".to_string(),
                name: "Casier Plastique 24 alvéoles".to_string(),
                producer: "SOLIBRA".to_string(),
                kind: "crate".to_string(),
                deposit_value: 2_500,
                initial_stock: Some(20),
                description: None,
            },
        )
        .await
        .unwrap();

        let _pkg_pack = products::upsert_packaging(
            &db,
            prod.id,
            products::PackagingInput {
                id: None,
                name: "pack".to_string(),
                coefficient: "6".to_string(),
                purchase_price: Some(2_700),
                wholesale_price: Some(3_300),
                semi_wholesale_price: Some(3_600),
                retail_price: Some(3_750),
                barcode: Some("6181100000656".to_string()),
                allow_fraction: Some(false),
                is_active: Some(true),
                deposit_mode: Some("none".to_string()),
                components: None,
            },
        )
        .await
        .unwrap();

        let pkg_casier = products::upsert_packaging(
            &db,
            prod.id,
            products::PackagingInput {
                id: None,
                name: "casier".to_string(),
                coefficient: "24".to_string(),
                purchase_price: Some(10_800),
                wholesale_price: Some(13_200),
                semi_wholesale_price: Some(14_400),
                retail_price: Some(15_600),
                barcode: Some("6181100000654".to_string()),
                allow_fraction: Some(false),
                is_active: Some(true),
                deposit_mode: Some("deposit".to_string()),
                components: Some(vec![products::DepositComponentInput {
                    returnable_id: ret_type.id,
                    pieces_per_pack: 1,
                }]),
            },
        )
        .await
        .unwrap();
        assert_eq!(pkg_casier.coefficient_milli, 24_000);
        assert_eq!(pkg_casier.deposit_mode.as_deref(), Some("deposit"));
        assert_eq!(pkg_casier.components.len(), 1);

        // Scénario 5 — Ajustement stock (+100 bouteilles)
        let adj_over = inventory::adjust_stock(
            &db,
            inventory::AdjustStockInput {
                product_id: prod.id,
                direction: "out".to_string(),
                quantity: "100".to_string(),
                reason: "Sortie excessive".to_string(),
                request_key: "lot9-rs-adj-over".to_string(),
            },
        )
        .await;
        assert!(matches!(adj_over, Err(CoreError::InsufficientStock(_))));

        let adj = inventory::adjust_stock(
            &db,
            inventory::AdjustStockInput {
                product_id: prod.id,
                direction: "in".to_string(),
                quantity: "100".to_string(),
                reason: "Inventaire initial complet".to_string(),
                request_key: "lot9-rs-adj-1".to_string(),
            },
        )
        .await
        .unwrap();
        assert_eq!(adj.stock_after_milli, 110_000);

        let adj_replay = inventory::adjust_stock(
            &db,
            inventory::AdjustStockInput {
                product_id: prod.id,
                direction: "in".to_string(),
                quantity: "100".to_string(),
                reason: "Inventaire initial complet".to_string(),
                request_key: "lot9-rs-adj-1".to_string(),
            },
        )
        .await
        .unwrap();
        assert_eq!(adj_replay.id, adj.id);

        // Scénario 6 — Ouverture caisse (session obligatoire)
        let no_sess_sale = sales::create_sale(
            &db,
            sales::CreateSaleInput {
                request_key: "lot9-rs-no-sess".to_string(),
                client_id: None,
                sale_type: "cash".to_string(),
                price_tier: "retail".to_string(),
                discount_amount: None,
                notes: None,
                lines: vec![sales::CreateSaleLineInput {
                    product_id: prod.id,
                    packaging_id: pkg_bouteille_id,
                    quantity: "1".to_string(),
                    discount_amount: None,
                }],
                payments: vec![sales::PaymentPartInput {
                    method_code: "cash".to_string(),
                    amount: 650,
                }],
                due_date: None,
            },
        )
        .await;
        assert!(matches!(no_sess_sale, Err(CoreError::SessionNotOpen(_))));

        let sess1 = cash::open_cash_session(
            &db,
            cash::OpenCashInput {
                opening_cash: 25_000,
                request_key: "lot9-rs-cash-open-1".to_string(),
            },
        )
        .await
        .unwrap();
        let sess1_replay = cash::open_cash_session(
            &db,
            cash::OpenCashInput {
                opening_cash: 25_000,
                request_key: "lot9-rs-cash-open-1".to_string(),
            },
        )
        .await
        .unwrap();
        assert_eq!(sess1_replay.id, sess1.id);

        let sess_dup = cash::open_cash_session(
            &db,
            cash::OpenCashInput {
                opening_cash: 10_000,
                request_key: "lot9-rs-cash-open-dup".to_string(),
            },
        )
        .await;
        assert!(matches!(sess_dup, Err(CoreError::SessionAlreadyOpen(_))));
        let mut expected_cash: i64 = 25_000;

        // Scénario 7 — Vente comptant (1 casier consigné + 3 bouteilles = 20 050 FCFA)
        let cash_sale = sales::create_sale(
            &db,
            sales::CreateSaleInput {
                request_key: "lot9-rs-sale-cash-1".to_string(),
                client_id: Some(cli_retail.id),
                sale_type: "cash".to_string(),
                price_tier: "retail".to_string(),
                discount_amount: None,
                notes: Some("Vente comptant Lot 9".to_string()),
                lines: vec![
                    sales::CreateSaleLineInput {
                        product_id: prod.id,
                        packaging_id: pkg_casier.id,
                        quantity: "1".to_string(),
                        discount_amount: None,
                    },
                    sales::CreateSaleLineInput {
                        product_id: prod.id,
                        packaging_id: pkg_bouteille_id,
                        quantity: "3".to_string(),
                        discount_amount: None,
                    },
                ],
                payments: vec![sales::PaymentPartInput {
                    method_code: "cash".to_string(),
                    amount: 20_050,
                }],
                due_date: None,
            },
        )
        .await
        .unwrap();
        expected_cash += 20_050;
        assert_eq!(cash_sale.sale.total_merchandise, 17_550);
        assert_eq!(cash_sale.sale.total_deposit, 2_500);
        assert_eq!(cash_sale.sale.total_amount, 20_050);
        assert_eq!(cash_sale.sale.paid_amount, 20_050);
        assert_eq!(cash_sale.sale.remaining_amount, 0);

        let st = inventory::get_stock_overview(&db).await.unwrap();
        assert_eq!(st.products[0].stock_milli, 83_000);
        let cons = consignments::get_overview(&db).await.unwrap();
        assert_eq!(cons.types[0].stock_quantity, 20);

        // Scénario 8 — Vente à crédit (politique & plafond)
        let forbidden_credit = sales::create_sale(
            &db,
            sales::CreateSaleInput {
                request_key: "lot9-rs-cred-forbid".to_string(),
                client_id: Some(cli_retail.id),
                sale_type: "credit".to_string(),
                price_tier: "retail".to_string(),
                discount_amount: None,
                notes: None,
                lines: vec![sales::CreateSaleLineInput {
                    product_id: prod.id,
                    packaging_id: pkg_bouteille_id,
                    quantity: "2".to_string(),
                    discount_amount: None,
                }],
                payments: vec![],
                due_date: None,
            },
        )
        .await;
        assert!(matches!(
            forbidden_credit,
            Err(CoreError::CreditPolicyViolation(_))
        ));

        let credit_sale = sales::create_sale(
            &db,
            sales::CreateSaleInput {
                request_key: "lot9-rs-sale-credit-1".to_string(),
                client_id: Some(cli_pro.id),
                sale_type: "credit".to_string(),
                price_tier: "wholesale".to_string(),
                discount_amount: None,
                notes: Some("Livraison Maquis Lot 9".to_string()),
                lines: vec![sales::CreateSaleLineInput {
                    product_id: prod.id,
                    packaging_id: pkg_casier.id,
                    quantity: "2".to_string(),
                    discount_amount: None,
                }],
                payments: vec![sales::PaymentPartInput {
                    method_code: "cash".to_string(),
                    amount: 1_400,
                }],
                due_date: None,
            },
        )
        .await
        .unwrap();
        expected_cash += 1_400;
        assert_eq!(credit_sale.sale.total_merchandise, 26_400);
        assert_eq!(credit_sale.sale.total_deposit, 5_000);
        assert_eq!(credit_sale.sale.total_amount, 31_400);
        assert_eq!(credit_sale.sale.paid_amount, 1_400);
        assert_eq!(credit_sale.sale.remaining_amount, 30_000);
        assert!(credit_sale.due_date.is_some());
        let receivable_id = credit_sale.receivable_id.unwrap();

        // Scénario 9 — Paiement mixte (13 000 = 3 000 cash + 4 000 wave + 6 000 om)
        let mixed_sale = sales::create_sale(
            &db,
            sales::CreateSaleInput {
                request_key: "lot9-rs-sale-mixed-1".to_string(),
                client_id: None,
                sale_type: "cash".to_string(),
                price_tier: "retail".to_string(),
                discount_amount: None,
                notes: None,
                lines: vec![sales::CreateSaleLineInput {
                    product_id: prod.id,
                    packaging_id: pkg_bouteille_id,
                    quantity: "20".to_string(),
                    discount_amount: None,
                }],
                payments: vec![
                    sales::PaymentPartInput {
                        method_code: "cash".to_string(),
                        amount: 3_000,
                    },
                    sales::PaymentPartInput {
                        method_code: "wave".to_string(),
                        amount: 4_000,
                    },
                    sales::PaymentPartInput {
                        method_code: "orange_money".to_string(),
                        amount: 6_000,
                    },
                ],
                due_date: None,
            },
        )
        .await
        .unwrap();
        expected_cash += 3_000;
        assert_eq!(mixed_sale.payments.len(), 3);
        let mixed_line_id = mixed_sale.lines[0].id;

        // Scénario 10 — Retour de vente partiel (4 bouteilles -> AVO-*)
        let ret_sale = sales::create_sale_return(
            &db,
            mixed_sale.sale.id,
            sales::CreateSaleReturnInput {
                request_key: "lot9-rs-ret-1".to_string(),
                reason: "4 bouteilles défectueuses".to_string(),
                restock_approved: true,
                refund_method_code: "cash".to_string(),
                lines: vec![sales::SaleReturnLineInput {
                    sale_line_id: mixed_line_id,
                    base_quantity: "4".to_string(),
                }],
            },
        )
        .await
        .unwrap();
        expected_cash -= 2_600;
        assert_eq!(ret_sale.returns.len(), 1);
        assert_eq!(ret_sale.returns[0].refund_amount, 2_600);
        assert!(ret_sale.returns[0].credit_note_ref.starts_with("AVO-"));

        let cross_ret = sales::create_sale_return(
            &db,
            cash_sale.sale.id,
            sales::CreateSaleReturnInput {
                request_key: "lot9-rs-ret-1".to_string(),
                reason: "Collision clé".to_string(),
                restock_approved: true,
                refund_method_code: "cash".to_string(),
                lines: vec![sales::SaleReturnLineInput {
                    sale_line_id: cash_sale.lines[0].id,
                    base_quantity: "1".to_string(),
                }],
            },
        )
        .await;
        assert!(matches!(cross_ret, Err(CoreError::DuplicateOperation(_))));

        // Scénario 11 — Annulation de vente
        let cancel_after_ret = sales::cancel_sale(
            &db,
            mixed_sale.sale.id,
            sales::CancelSaleInput {
                reason: "Annulation après retour".to_string(),
                refund_method_code: Some("cash".to_string()),
                request_key: "lot9-rs-cancel-fail".to_string(),
            },
        )
        .await;
        assert!(matches!(
            cancel_after_ret,
            Err(CoreError::HistoricalImmutable(_))
        ));

        let cancel_target = sales::create_sale(
            &db,
            sales::CreateSaleInput {
                request_key: "lot9-rs-sale-to-cancel".to_string(),
                client_id: None,
                sale_type: "cash".to_string(),
                price_tier: "retail".to_string(),
                discount_amount: None,
                notes: None,
                lines: vec![sales::CreateSaleLineInput {
                    product_id: prod.id,
                    packaging_id: pkg_bouteille_id,
                    quantity: "2".to_string(),
                    discount_amount: None,
                }],
                payments: vec![sales::PaymentPartInput {
                    method_code: "wave".to_string(),
                    amount: 1_300,
                }],
                due_date: None,
            },
        )
        .await
        .unwrap();

        let cancelled = sales::cancel_sale(
            &db,
            cancel_target.sale.id,
            sales::CancelSaleInput {
                reason: "Erreur caisse".to_string(),
                refund_method_code: Some("wave".to_string()),
                request_key: "lot9-rs-cancel-1".to_string(),
            },
        )
        .await
        .unwrap();
        assert_eq!(cancelled.sale.status, "cancelled");
        let canc = cancelled.cancellation.unwrap();
        assert_eq!(canc.refunded_amount, 1_300);
        assert_eq!(canc.refund_method_code.as_deref(), Some("wave"));

        let st_after_s11 = inventory::get_stock_overview(&db).await.unwrap();
        assert_eq!(st_after_s11.products[0].stock_milli, 19_000);

        // Scénario 12 — Paiement de créance
        let rec_over = cash::pay_receivable(
            &db,
            receivable_id,
            cash::PayReceivableInput {
                request_key: "lot9-rs-rec-over".to_string(),
                note: None,
                parts: vec![sales::PaymentPartInput {
                    method_code: "cash".to_string(),
                    amount: 35_000,
                }],
            },
        )
        .await;
        assert!(matches!(rec_over, Err(CoreError::InvalidPayment(_))));

        let rec_paid = cash::pay_receivable(
            &db,
            receivable_id,
            cash::PayReceivableInput {
                request_key: "lot9-rs-pay-rec-1".to_string(),
                note: Some("Règlement partiel".to_string()),
                parts: vec![
                    sales::PaymentPartInput {
                        method_code: "cash".to_string(),
                        amount: 10_000,
                    },
                    sales::PaymentPartInput {
                        method_code: "wave".to_string(),
                        amount: 5_000,
                    },
                ],
            },
        )
        .await
        .unwrap();
        expected_cash += 10_000;
        assert_eq!(rec_paid.status, "partial");
        assert_eq!(rec_paid.remaining_amount, 15_000);

        // Scénario 13 — Création commande d'achat (10 casiers @ 10 800)
        let po = purchases::create_purchase_order(
            &db,
            purchases::CreatePurchaseOrderInput {
                request_key: "lot9-rs-po-1".to_string(),
                supplier_id: sup.id,
                expected_date: None,
                notes: Some("Réappro Flag".to_string()),
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
        assert_eq!(po.total_amount, 108_000);
        assert_eq!(po.status, "confirmed");
        let po_line_id = po.lines[0].id;

        // Scénario 14 — Réception partielle (4 casiers -> +96 btl, dette 43 200)
        let rec1 = purchases::receive_purchase_order(
            &db,
            po.id,
            purchases::ReceivePurchaseOrderInput {
                request_key: "lot9-rs-rec-1".to_string(),
                notes: Some("Livraison partielle".to_string()),
                lines: vec![purchases::ReceiveLineInput {
                    purchase_order_line_id: po_line_id,
                    received_quantity: "4".to_string(),
                    discrepancy_reason: None,
                }],
            },
        )
        .await
        .unwrap();
        assert_eq!(rec1.total_amount, 43_200);

        let pos_mid = purchases::list_purchase_orders(&db).await.unwrap();
        let po_mid = pos_mid.iter().find(|o| o.id == po.id).unwrap();
        assert_eq!(po_mid.status, "partial");
        assert_eq!(po_mid.debts.len(), 1);
        let debt1_id = po_mid.debts[0].id;

        // Scénario 15 — Réception totale (6 casiers restants -> +144 btl, stock 259, CUMP 450)
        let rec_over = purchases::receive_purchase_order(
            &db,
            po.id,
            purchases::ReceivePurchaseOrderInput {
                request_key: "lot9-rs-rec-over".to_string(),
                notes: None,
                lines: vec![purchases::ReceiveLineInput {
                    purchase_order_line_id: po_line_id,
                    received_quantity: "7".to_string(),
                    discrepancy_reason: None,
                }],
            },
        )
        .await;
        assert!(matches!(rec_over, Err(CoreError::Validation(_))));

        let rec2 = purchases::receive_purchase_order(
            &db,
            po.id,
            purchases::ReceivePurchaseOrderInput {
                request_key: "lot9-rs-rec-2".to_string(),
                notes: Some("Solde livraison".to_string()),
                lines: vec![purchases::ReceiveLineInput {
                    purchase_order_line_id: po_line_id,
                    received_quantity: "6".to_string(),
                    discrepancy_reason: None,
                }],
            },
        )
        .await
        .unwrap();
        assert_eq!(rec2.total_amount, 64_800);

        let st_after_s15 = inventory::get_stock_overview(&db).await.unwrap();
        assert_eq!(st_after_s15.products[0].stock_milli, 259_000);
        assert_eq!(st_after_s15.products[0].average_cost_fcfa, Some(450));

        // Scénario 16 — Règlement fournisseur (23 200 FCFA espèces -> reste 20 000)
        let cross_sup = purchases::pay_supplier_debt(
            &db,
            debt1_id,
            purchases::PaySupplierDebtInput {
                method_code: "cash".to_string(),
                amount: 1_000,
                request_key: "lot9-rs-pay-rec-1".to_string(),
                note: None,
            },
        )
        .await;
        assert!(matches!(cross_sup, Err(CoreError::DuplicateOperation(_))));

        let sup_paid = purchases::pay_supplier_debt(
            &db,
            debt1_id,
            purchases::PaySupplierDebtInput {
                method_code: "cash".to_string(),
                amount: 23_200,
                request_key: "lot9-rs-sup-pay-1".to_string(),
                note: Some("Acompte SOLIBRA".to_string()),
            },
        )
        .await
        .unwrap();
        expected_cash -= 23_200;
        assert_eq!(sup_paid.status, "partial");
        assert_eq!(sup_paid.remaining_amount, 20_000);

        // Scénario 17 — Retour de consignation & mouvement stock vides
        let cons_before = consignments::get_overview(&db).await.unwrap();
        let credit_issue = cons_before
            .open_issues
            .iter()
            .find(|i| i.sale_id == credit_sale.sale.id)
            .unwrap();
        let dep_ret = consignments::return_client_empties(
            &db,
            consignments::ReturnClientEmptiesInput {
                issue_id: credit_issue.id,
                pieces: 1,
                condition_state: "good".to_string(),
                refund_amount: 1_000,
                credit_reduction: 1_500,
                method_code: "cash".to_string(),
                reason: "Retour partiel 1 casier".to_string(),
                request_key: "lot9-rs-dep-ret-1".to_string(),
            },
        )
        .await
        .unwrap();
        expected_cash -= 1_000;
        assert_eq!(dep_ret.refund_amount, 1_000);
        assert_eq!(dep_ret.credit_reduction, 1_500);

        let adj_empty = consignments::adjust_returnable_stock(
            &db,
            consignments::AdjustReturnableStockInput {
                packaging_id: ret_type.id,
                movement_type: "entry".to_string(),
                quantity: 5,
                reason: "Achat casiers neufs".to_string(),
                request_key: "lot9-rs-empty-adj-1".to_string(),
            },
        )
        .await
        .unwrap();
        assert_eq!(adj_empty.stock_after, 26);

        // Scénario 18 — Inventaire physique (-2 bouteilles)
        let inv = inventory::create_inventory(&db, Some("Inventaire Lot 9"))
            .await
            .unwrap();
        let bad_inv_unmot = inventory::validate_inventory(
            &db,
            inv.id,
            vec![inventory::ValidateInventoryLineInput {
                product_id: prod.id,
                counted_quantity: "257".to_string(),
                reason: None,
            }],
        )
        .await;
        assert!(matches!(bad_inv_unmot, Err(CoreError::Validation(_))));

        let bad_inv_dup = inventory::validate_inventory(
            &db,
            inv.id,
            vec![
                inventory::ValidateInventoryLineInput {
                    product_id: prod.id,
                    counted_quantity: "259".to_string(),
                    reason: None,
                },
                inventory::ValidateInventoryLineInput {
                    product_id: prod.id,
                    counted_quantity: "259".to_string(),
                    reason: None,
                },
            ],
        )
        .await;
        assert!(matches!(bad_inv_dup, Err(CoreError::Validation(_))));

        let inv_val = inventory::validate_inventory(
            &db,
            inv.id,
            vec![inventory::ValidateInventoryLineInput {
                product_id: prod.id,
                counted_quantity: "257".to_string(),
                reason: Some("Casse constatée".to_string()),
            }],
        )
        .await
        .unwrap();
        assert_eq!(inv_val.status, "validated");

        let inv_reval = inventory::validate_inventory(
            &db,
            inv.id,
            vec![inventory::ValidateInventoryLineInput {
                product_id: prod.id,
                counted_quantity: "257".to_string(),
                reason: Some("Doublon".to_string()),
            }],
        )
        .await;
        assert!(matches!(inv_reval, Err(CoreError::HistoricalImmutable(_))));

        // Scénario 19 — Dépense (5 000 FCFA espèces)
        let exp_fail = cash::create_expense(
            &db,
            cash::CreateExpenseInput {
                request_key: "lot9-rs-exp-over".to_string(),
                category: "Carburant".to_string(),
                amount: 900_000,
                method_code: "cash".to_string(),
                beneficiary: None,
                notes: None,
                receipt_path: None,
                expense_date: None,
            },
        )
        .await;
        assert!(matches!(exp_fail, Err(CoreError::InvalidPayment(_))));

        let exp = cash::create_expense(
            &db,
            cash::CreateExpenseInput {
                request_key: "lot9-rs-exp-1".to_string(),
                category: "Carburant".to_string(),
                amount: 5_000,
                method_code: "cash".to_string(),
                beneficiary: Some("Station Total".to_string()),
                notes: Some("Livraison client".to_string()),
                receipt_path: None,
                expense_date: None,
            },
        )
        .await
        .unwrap();
        expected_cash -= 5_000;
        assert_eq!(exp.amount, 5_000);

        // Scénario 20 — Clôture de caisse (écart -500 justifié, collision 409)
        let cs = cash::get_cash_status(&db).await.unwrap();
        assert_eq!(cs.summary.as_ref().unwrap().theoretical_cash, expected_cash);

        let close_unmot = cash::close_cash_session(
            &db,
            cash::CloseCashInput {
                session_id: sess1.id,
                physical_cash: expected_cash - 500,
                closing_notes: Some("   ".to_string()),
                request_key: "lot9-rs-close-unmot".to_string(),
            },
        )
        .await;
        assert!(matches!(close_unmot, Err(CoreError::Validation(_))));

        let closed1 = cash::close_cash_session(
            &db,
            cash::CloseCashInput {
                session_id: sess1.id,
                physical_cash: expected_cash - 500,
                closing_notes: Some("Billet de 500 FCFA manquant".to_string()),
                request_key: "lot9-rs-cash-close-1".to_string(),
            },
        )
        .await
        .unwrap();
        assert_eq!(closed1.difference, Some(-500));

        let sess2 = cash::open_cash_session(
            &db,
            cash::OpenCashInput {
                opening_cash: 10_000,
                request_key: "lot9-rs-cash-open-2".to_string(),
            },
        )
        .await
        .unwrap();
        let close_coll = cash::close_cash_session(
            &db,
            cash::CloseCashInput {
                session_id: sess2.id,
                physical_cash: 10_000,
                closing_notes: None,
                request_key: "lot9-rs-cash-close-1".to_string(),
            },
        )
        .await;
        assert!(matches!(close_coll, Err(CoreError::DuplicateOperation(_))));

        let _closed2 = cash::close_cash_session(
            &db,
            cash::CloseCashInput {
                session_id: sess2.id,
                physical_cash: 10_000,
                closing_notes: None,
                request_key: "lot9-rs-cash-close-2".to_string(),
            },
        )
        .await
        .unwrap();

        // Scénario 21 — Rapports, KPIs & Sauvegarde lecture seule
        let rep = reports::get_reports_overview(&db, None, None)
            .await
            .unwrap();
        assert_eq!(rep.commercial.count, 3);
        assert_eq!(rep.commercial.merchandise_revenue, 56_950);
        assert_eq!(rep.commercial.deposit_billed, 7_500);
        assert_eq!(rep.stock.known_valuation_fcfa, 115_650);
        assert_eq!(rep.profitability.expenses_total, 5_000);
        assert_eq!(rep.profitability.known_cost_total, 42_750);
        assert_eq!(rep.profitability.known_gross_margin, 14_200);
        assert_eq!(rep.profitability.net_known_result, 9_200);

        let bkp = backup::create_backup_summary(&db, &backup_dir)
            .await
            .unwrap();
        let verify = backup::verify_backup(&backup_dir, &bkp.name).await.unwrap();
        assert!(verify.compatible);
        assert_eq!(verify.integrity, "ok");
        assert_eq!(verify.foreign_key_errors, 0);
        let pre_counts = verify.counts.unwrap();

        // Scénario 22 — Restauration contrôlée
        products::create_product(
            &db,
            products::CreateProductInput {
                name: "Produit Éphémère Rust".to_string(),
                brand: None,
                barcode: None,
                category_id: cat.id,
                supplier_id: None,
                description: None,
                base_unit: "bouteille".to_string(),
                initial_stock: Some("5".to_string()),
                min_stock: Some("1".to_string()),
                max_stock: None,
                purchase_price: None,
                wholesale_price: None,
                semi_wholesale_price: None,
                retail_price: Some(500),
                image_path: None,
                packagings: None,
            },
        )
        .await
        .unwrap();

        let db_lock = Arc::new(RwLock::new(db));
        let restored = backup::restore_and_reconnect(&db_lock, &backup_dir, &bkp.name)
            .await
            .unwrap();
        assert_eq!(restored.integrity, "ok");
        assert_eq!(restored.foreign_key_errors, 0);
        assert_eq!(restored.counts.products, pre_counts.products);
        assert_eq!(restored.counts.sales, pre_counts.sales);
        assert_eq!(restored.counts.audit_logs, pre_counts.audit_logs + 1);

        let db_after = db_lock.read().await;
        let prods_after = products::list_products(&db_after, None, None, false, false, 1, 50)
            .await
            .unwrap();
        assert_eq!(prods_after.total, 1);
        assert_eq!(prods_after.items[0].stock_milli, 257_000);
        drop(db_after);
        db_lock.read().await.pool.close().await;
    })
    .await;
}
