use std::path::PathBuf;

use depotpro_core::application::{cash, products, purchases, sales};
use depotpro_core::infrastructure::db::DepotDb;

fn temp_db_path(tag: &str) -> PathBuf {
    std::env::temp_dir()
        .join(format!("depotpro_lot1_{tag}_{}", uuid::Uuid::new_v4()))
        .join("depotpro.db")
}

#[tokio::test]
async fn lot1_sale_returns_prevent_duplicates_and_preserve_atomicity() {
    let db_path = temp_db_path("returns");
    let db = DepotDb::connect(&db_path).await.expect("connect temp db");

    cash::open_cash_session(
        &db,
        cash::OpenCashInput {
            opening_cash: 200_000,
            request_key: "lot1-rs-cash-open".to_string(),
        },
    )
    .await
    .unwrap();

    let cat = products::create_category(&db, "Boissons Lot 1", None)
        .await
        .unwrap();

    let prod_a = products::create_product(
        &db,
        products::CreateProductInput {
            name: "Bière Lot 1".to_string(),
            brand: None,
            barcode: None,
            category_id: cat.id,
            supplier_id: None,
            description: None,
            base_unit: "bouteille".to_string(),
            initial_stock: Some("100".to_string()),
            min_stock: Some("10".to_string()),
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

    let prod_b = products::create_product(
        &db,
        products::CreateProductInput {
            name: "Jus Lot 1".to_string(),
            brand: None,
            barcode: None,
            category_id: cat.id,
            supplier_id: None,
            description: None,
            base_unit: "bouteille".to_string(),
            initial_stock: Some("100".to_string()),
            min_stock: Some("10".to_string()),
            max_stock: None,
            purchase_price: Some(800),
            wholesale_price: Some(900),
            semi_wholesale_price: Some(950),
            retail_price: Some(1_000),
            image_path: None,
            packagings: None,
        },
    )
    .await
    .unwrap();

    let client = sales::create_client(
        &db,
        sales::CreateClientInput {
            name: "Client Lot 1".to_string(),
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

    let sale = sales::create_sale(
        &db,
        sales::CreateSaleInput {
            request_key: "lot1-rs-sale-1".to_string(),
            client_id: None,
            sale_type: "cash".to_string(),
            price_tier: "retail".to_string(),
            discount_amount: Some(0),
            notes: None,
            lines: vec![
                sales::CreateSaleLineInput {
                    product_id: prod_a.id,
                    packaging_id: prod_a.packagings[0].id,
                    quantity: "5".to_string(),
                    discount_amount: Some(0),
                },
                sales::CreateSaleLineInput {
                    product_id: prod_b.id,
                    packaging_id: prod_b.packagings[0].id,
                    quantity: "4".to_string(),
                    discount_amount: Some(0),
                },
            ],
            payments: vec![sales::PaymentPartInput {
                method_code: "cash".to_string(),
                amount: 7_000,
            }],
            due_date: None,
        },
    )
    .await
    .unwrap();

    let line_a_id = sale.lines.iter().find(|l| l.product_id == prod_a.id).unwrap().id;
    let line_b_id = sale.lines.iter().find(|l| l.product_id == prod_b.id).unwrap().id;

    // Deux occurrences du même sale_line_id dans la même requête -> rejet explicite
    let dup_err = sales::create_sale_return(
        &db,
        sale.sale.id,
        sales::CreateSaleReturnInput {
            request_key: "lot1-rs-ret-dup".to_string(),
            reason: "Doublon ligne".to_string(),
            restock_approved: true,
            refund_method_code: "cash".to_string(),
            lines: vec![
                sales::SaleReturnLineInput {
                    sale_line_id: line_a_id,
                    base_quantity: "2".to_string(),
                },
                sales::SaleReturnLineInput {
                    sale_line_id: line_a_id,
                    base_quantity: "2".to_string(),
                },
            ],
        },
    )
    .await;
    assert!(dup_err.is_err());

    // Retour partiel normal (2 sur 5)
    let ret1 = sales::create_sale_return(
        &db,
        sale.sale.id,
        sales::CreateSaleReturnInput {
            request_key: "lot1-rs-ret-1".to_string(),
            reason: "Retour partiel 2".to_string(),
            restock_approved: true,
            refund_method_code: "cash".to_string(),
            lines: vec![sales::SaleReturnLineInput {
                sale_line_id: line_a_id,
                base_quantity: "2".to_string(),
            }],
        },
    )
    .await
    .unwrap();
    assert_eq!(ret1.sale.status, "partially_returned");
    assert_eq!(ret1.returns[0].total_amount, 1_200);
    assert_eq!(
        ret1.returns[0].refund_amount + ret1.returns[0].credit_reduction,
        ret1.returns[0].total_amount
    );

    // Rejeu idempotent avec même request_key
    let ret1_replay = sales::create_sale_return(
        &db,
        sale.sale.id,
        sales::CreateSaleReturnInput {
            request_key: "lot1-rs-ret-1".to_string(),
            reason: "Retour partiel 2".to_string(),
            restock_approved: true,
            refund_method_code: "cash".to_string(),
            lines: vec![sales::SaleReturnLineInput {
                sale_line_id: line_a_id,
                base_quantity: "2".to_string(),
            }],
        },
    )
    .await
    .unwrap();
    assert_eq!(ret1_replay.returns.len(), 1);

    // Dépassement du solde (reste 3, demande 4)
    assert!(sales::create_sale_return(
        &db,
        sale.sale.id,
        sales::CreateSaleReturnInput {
            request_key: "lot1-rs-ret-over".to_string(),
            reason: "Dépassement".to_string(),
            restock_approved: true,
            refund_method_code: "cash".to_string(),
            lines: vec![sales::SaleReturnLineInput {
                sale_line_id: line_a_id,
                base_quantity: "4".to_string(),
            }],
        },
    )
    .await
    .is_err());

    // Erreur multi-lignes (A valide + B invalide) -> aucune modification partielle sur A
    let stock_a_before: i64 =
        sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
            .bind(prod_a.id)
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert!(sales::create_sale_return(
        &db,
        sale.sale.id,
        sales::CreateSaleReturnInput {
            request_key: "lot1-rs-ret-atomic".to_string(),
            reason: "Doit rollback".to_string(),
            restock_approved: true,
            refund_method_code: "cash".to_string(),
            lines: vec![
                sales::SaleReturnLineInput {
                    sale_line_id: line_a_id,
                    base_quantity: "1".to_string(),
                },
                sales::SaleReturnLineInput {
                    sale_line_id: line_b_id,
                    base_quantity: "5".to_string(),
                },
            ],
        },
    )
    .await
    .is_err());
    let stock_a_after: i64 =
        sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
            .bind(prod_a.id)
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert_eq!(stock_a_after, stock_a_before);

    // Retour multi-lignes du solde restant complet (A: 3, B: 4) -> status = returned
    let ret2 = sales::create_sale_return(
        &db,
        sale.sale.id,
        sales::CreateSaleReturnInput {
            request_key: "lot1-rs-ret-rest".to_string(),
            reason: "Solde complet".to_string(),
            restock_approved: true,
            refund_method_code: "cash".to_string(),
            lines: vec![
                sales::SaleReturnLineInput {
                    sale_line_id: line_a_id,
                    base_quantity: "3".to_string(),
                },
                sales::SaleReturnLineInput {
                    sale_line_id: line_b_id,
                    base_quantity: "4".to_string(),
                },
            ],
        },
    )
    .await
    .unwrap();
    assert_eq!(ret2.sale.status, "returned");

    // Retour sur ligne déjà complètement retournée -> rejet
    assert!(sales::create_sale_return(
        &db,
        sale.sale.id,
        sales::CreateSaleReturnInput {
            request_key: "lot1-rs-ret-full".to_string(),
            reason: "Déjà retournée".to_string(),
            restock_approved: true,
            refund_method_code: "cash".to_string(),
            lines: vec![sales::SaleReturnLineInput {
                sale_line_id: line_a_id,
                base_quantity: "1".to_string(),
            }],
        },
    )
    .await
    .is_err());

    // Retour sur vente annulée -> rejet
    let cancelled_sale = sales::create_sale(
        &db,
        sales::CreateSaleInput {
            request_key: "lot1-rs-sale-cancel".to_string(),
            client_id: None,
            sale_type: "cash".to_string(),
            price_tier: "retail".to_string(),
            discount_amount: Some(0),
            notes: None,
            lines: vec![sales::CreateSaleLineInput {
                product_id: prod_b.id,
                packaging_id: prod_b.packagings[0].id,
                quantity: "2".to_string(),
                discount_amount: Some(0),
            }],
            payments: vec![sales::PaymentPartInput {
                method_code: "cash".to_string(),
                amount: 2_000,
            }],
            due_date: None,
        },
    )
    .await
    .unwrap();
    sales::cancel_sale(
        &db,
        cancelled_sale.sale.id,
        sales::CancelSaleInput {
            reason: "Annulation test".to_string(),
            refund_method_code: Some("cash".to_string()),
            request_key: "lot1-rs-cancel".to_string(),
        },
    )
    .await
    .unwrap();
    assert!(sales::create_sale_return(
        &db,
        cancelled_sale.sale.id,
        sales::CreateSaleReturnInput {
            request_key: "lot1-rs-ret-on-cancel".to_string(),
            reason: "Interdit".to_string(),
            restock_approved: true,
            refund_method_code: "cash".to_string(),
            lines: vec![sales::SaleReturnLineInput {
                sale_line_id: cancelled_sale.lines[0].id,
                base_quantity: "1".to_string(),
            }],
        },
    )
    .await
    .is_err());

    // Vente à crédit avec échec remboursement -> rollback créance garanti
    let credit_sale = sales::create_sale(
        &db,
        sales::CreateSaleInput {
            request_key: "lot1-rs-credit-sale".to_string(),
            client_id: Some(client.id),
            sale_type: "credit".to_string(),
            price_tier: "retail".to_string(),
            discount_amount: Some(0),
            notes: None,
            lines: vec![sales::CreateSaleLineInput {
                product_id: prod_b.id,
                packaging_id: prod_b.packagings[0].id,
                quantity: "10".to_string(),
                discount_amount: Some(0),
            }],
            payments: vec![sales::PaymentPartInput {
                method_code: "cash".to_string(),
                amount: 2_000,
            }],
            due_date: None,
        },
    )
    .await
    .unwrap();
    assert!(sales::create_sale_return(
        &db,
        credit_sale.sale.id,
        sales::CreateSaleReturnInput {
            request_key: "lot1-rs-ret-bad-method".to_string(),
            reason: "Moyen invalide".to_string(),
            restock_approved: true,
            refund_method_code: "unknown_method".to_string(),
            lines: vec![sales::SaleReturnLineInput {
                sale_line_id: credit_sale.lines[0].id,
                base_quantity: "9".to_string(),
            }],
        },
    )
    .await
    .is_err());
    let detail_after_fail = sales::get_sale_detail(&db, credit_sale.sale.id)
        .await
        .unwrap();
    assert_eq!(detail_after_fail.sale.remaining_amount, 8_000);
    assert!(detail_after_fail.returns.is_empty());

    // Réutilisation de request_key d'une autre vente -> rejet
    assert!(sales::create_sale_return(
        &db,
        credit_sale.sale.id,
        sales::CreateSaleReturnInput {
            request_key: "lot1-rs-ret-1".to_string(),
            reason: "Rejeu cross-vente interdit".to_string(),
            restock_approved: true,
            refund_method_code: "cash".to_string(),
            lines: vec![sales::SaleReturnLineInput {
                sale_line_id: credit_sale.lines[0].id,
                base_quantity: "1".to_string(),
            }],
        },
    )
    .await
    .is_err());

    if let Some(parent) = db_path.parent() {
        let _ = std::fs::remove_dir_all(parent);
    }
}

#[tokio::test]
async fn lot1_purchase_receipts_prevent_duplicates_concurrency_and_partial_writes() {
    let db_path = temp_db_path("purchases");
    let db = DepotDb::connect(&db_path).await.expect("connect temp db");

    let cat = products::create_category(&db, "Boissons Achats Lot 1", None)
        .await
        .unwrap();
    let sup = purchases::create_supplier(
        &db,
        purchases::CreateSupplierInput {
            name: "Brasserie Lot 1".to_string(),
            company_name: None,
            phone: "+2250701010101".to_string(),
            address: None,
            email: None,
            contact_person: None,
            payment_terms_days: Some(30),
        },
    )
    .await
    .unwrap();

    let prod_a = products::create_product(
        &db,
        products::CreateProductInput {
            name: "Flag Lot 1".to_string(),
            brand: None,
            barcode: None,
            category_id: cat.id,
            supplier_id: Some(sup.id),
            description: None,
            base_unit: "bouteille".to_string(),
            initial_stock: Some("0".to_string()),
            min_stock: Some("24".to_string()),
            max_stock: None,
            purchase_price: Some(400),
            wholesale_price: Some(500),
            semi_wholesale_price: Some(550),
            retail_price: Some(600),
            image_path: None,
            packagings: Some(vec![products::PackagingInput {
                id: None,
                name: "casier".to_string(),
                coefficient: "24".to_string(),
                purchase_price: Some(9_600),
                wholesale_price: Some(12_000),
                semi_wholesale_price: Some(13_200),
                retail_price: Some(14_400),
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

    let prod_b = products::create_product(
        &db,
        products::CreateProductInput {
            name: "Eau Lot 1".to_string(),
            brand: None,
            barcode: None,
            category_id: cat.id,
            supplier_id: Some(sup.id),
            description: None,
            base_unit: "bouteille".to_string(),
            initial_stock: Some("10".to_string()),
            min_stock: Some("2".to_string()),
            max_stock: None,
            purchase_price: Some(500),
            wholesale_price: Some(600),
            semi_wholesale_price: Some(650),
            retail_price: Some(700),
            image_path: None,
            packagings: None,
        },
    )
    .await
    .unwrap();

    let pkg_a_casier = prod_a
        .packagings
        .iter()
        .find(|p| p.name == "casier")
        .unwrap();
    let pkg_b_btl = &prod_b.packagings[0];

    let po = purchases::create_purchase_order(
        &db,
        purchases::CreatePurchaseOrderInput {
            request_key: "lot1-rs-po-1".to_string(),
            supplier_id: sup.id,
            expected_date: None,
            notes: None,
            lines: vec![
                purchases::PurchaseOrderLineInput {
                    product_id: prod_a.id,
                    packaging_id: pkg_a_casier.id,
                    quantity: "10".to_string(),
                    unit_price: 9_600,
                },
                purchases::PurchaseOrderLineInput {
                    product_id: prod_b.id,
                    packaging_id: pkg_b_btl.id,
                    quantity: "10".to_string(),
                    unit_price: 700,
                },
            ],
        },
    )
    .await
    .unwrap();

    let line_a_id = po.lines.iter().find(|l| l.product_id == prod_a.id).unwrap().id;
    let line_b_id = po.lines.iter().find(|l| l.product_id == prod_b.id).unwrap().id;

    // 1. Ligne répétée dans une même demande -> rejet explicite
    assert!(purchases::receive_purchase_order(
        &db,
        po.id,
        purchases::ReceivePurchaseOrderInput {
            request_key: "lot1-rs-rec-dup".to_string(),
            notes: None,
            lines: vec![
                purchases::ReceiveLineInput {
                    purchase_order_line_id: line_a_id,
                    received_quantity: "6".to_string(),
                    discrepancy_reason: None,
                },
                purchases::ReceiveLineInput {
                    purchase_order_line_id: line_a_id,
                    received_quantity: "6".to_string(),
                    discrepancy_reason: None,
                },
            ],
        },
    )
    .await
    .is_err());

    // 2. Réception partielle (3 casiers A)
    let rec1 = purchases::receive_purchase_order(
        &db,
        po.id,
        purchases::ReceivePurchaseOrderInput {
            request_key: "lot1-rs-rec-1".to_string(),
            notes: None,
            lines: vec![purchases::ReceiveLineInput {
                purchase_order_line_id: line_a_id,
                received_quantity: "3".to_string(),
                discrepancy_reason: None,
            }],
        },
    )
    .await
    .unwrap();
    assert_eq!(rec1.total_amount, 28_800);

    // 3. Rejeu idempotent
    let rec1_replay = purchases::receive_purchase_order(
        &db,
        po.id,
        purchases::ReceivePurchaseOrderInput {
            request_key: "lot1-rs-rec-1".to_string(),
            notes: None,
            lines: vec![purchases::ReceiveLineInput {
                purchase_order_line_id: line_a_id,
                received_quantity: "3".to_string(),
                discrepancy_reason: None,
            }],
        },
    )
    .await
    .unwrap();
    assert_eq!(rec1_replay.id, rec1.id);

    // 4. Échec transactionnel multi-ligne (B valide + A dépassement) -> aucun effet partiel sur B
    assert!(purchases::receive_purchase_order(
        &db,
        po.id,
        purchases::ReceivePurchaseOrderInput {
            request_key: "lot1-rs-rec-fail".to_string(),
            notes: None,
            lines: vec![
                purchases::ReceiveLineInput {
                    purchase_order_line_id: line_b_id,
                    received_quantity: "2".to_string(),
                    discrepancy_reason: None,
                },
                purchases::ReceiveLineInput {
                    purchase_order_line_id: line_a_id,
                    received_quantity: "8".to_string(),
                    discrepancy_reason: None,
                },
            ],
        },
    )
    .await
    .is_err());
    let stock_b_after_fail: i64 =
        sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
            .bind(prod_b.id)
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert_eq!(stock_b_after_fail, 10_000);

    // 5. Deuxième réception partielle (3 casiers A) -> reliquat = 4
    purchases::receive_purchase_order(
        &db,
        po.id,
        purchases::ReceivePurchaseOrderInput {
            request_key: "lot1-rs-rec-2".to_string(),
            notes: None,
            lines: vec![purchases::ReceiveLineInput {
                purchase_order_line_id: line_a_id,
                received_quantity: "3".to_string(),
                discrepancy_reason: None,
            }],
        },
    )
    .await
    .unwrap();

    // 6. Deux requêtes concurrentes de 3 sur reliquat 4 -> une seule réussit
    let (r_conc_1, r_conc_2) = tokio::join!(
        purchases::receive_purchase_order(
            &db,
            po.id,
            purchases::ReceivePurchaseOrderInput {
                request_key: "lot1-rs-conc-1".to_string(),
                notes: None,
                lines: vec![purchases::ReceiveLineInput {
                    purchase_order_line_id: line_a_id,
                    received_quantity: "3".to_string(),
                    discrepancy_reason: None,
                }],
            },
        ),
        purchases::receive_purchase_order(
            &db,
            po.id,
            purchases::ReceivePurchaseOrderInput {
                request_key: "lot1-rs-conc-2".to_string(),
                notes: None,
                lines: vec![purchases::ReceiveLineInput {
                    purchase_order_line_id: line_a_id,
                    received_quantity: "3".to_string(),
                    discrepancy_reason: None,
                }],
            },
        )
    );
    assert!(r_conc_1.is_ok() ^ r_conc_2.is_ok());

    // 7. Solde restant (1 casier A + 10 bouteilles B) -> statut received + CUMP B = 600
    purchases::receive_purchase_order(
        &db,
        po.id,
        purchases::ReceivePurchaseOrderInput {
            request_key: "lot1-rs-rec-final".to_string(),
            notes: None,
            lines: vec![
                purchases::ReceiveLineInput {
                    purchase_order_line_id: line_a_id,
                    received_quantity: "1".to_string(),
                    discrepancy_reason: None,
                },
                purchases::ReceiveLineInput {
                    purchase_order_line_id: line_b_id,
                    received_quantity: "10".to_string(),
                    discrepancy_reason: None,
                },
            ],
        },
    )
    .await
    .unwrap();

    let stock_a_final: i64 = sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
        .bind(prod_a.id)
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(stock_a_final, 240_000);

    let (stock_b_final, avg_num, avg_den): (i64, Option<String>, Option<String>) =
        sqlx::query_as(
            "SELECT stock_milli, average_cost_num, average_cost_den FROM products WHERE id = ?",
        )
        .bind(prod_b.id)
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(stock_b_final, 20_000);
    let num: i64 = avg_num.unwrap().parse().unwrap();
    let den: i64 = avg_den.unwrap().parse().unwrap();
    assert_eq!(num / den, 600);

    let po_after = purchases::list_purchase_orders(&db)
        .await
        .unwrap()
        .into_iter()
        .find(|o| o.id == po.id)
        .unwrap();
    assert_eq!(po_after.status, "received");
    assert_eq!(po_after.received_amount, 103_000);

    let debts = purchases::list_supplier_debts(&db).await.unwrap();
    let total_debt: i64 = debts.iter().map(|d| d.initial_amount).sum();
    assert_eq!(total_debt, 103_000);

    // Rejeu request_key sur un autre bon de commande -> rejet
    let po2 = purchases::create_purchase_order(
        &db,
        purchases::CreatePurchaseOrderInput {
            request_key: "lot1-rs-po-2".to_string(),
            supplier_id: sup.id,
            expected_date: None,
            notes: None,
            lines: vec![purchases::PurchaseOrderLineInput {
                product_id: prod_b.id,
                packaging_id: pkg_b_btl.id,
                quantity: "2".to_string(),
                unit_price: 700,
            }],
        },
    )
    .await
    .unwrap();
    assert!(purchases::receive_purchase_order(
        &db,
        po2.id,
        purchases::ReceivePurchaseOrderInput {
            request_key: "lot1-rs-rec-1".to_string(),
            notes: None,
            lines: vec![purchases::ReceiveLineInput {
                purchase_order_line_id: po2.lines[0].id,
                received_quantity: "1".to_string(),
                discrepancy_reason: None,
            }],
        },
    )
    .await
    .is_err());

    if let Some(parent) = db_path.parent() {
        let _ = std::fs::remove_dir_all(parent);
    }
}
