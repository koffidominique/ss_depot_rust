use std::path::PathBuf;

use depotpro_core::application::{cash, consignments, products, sales};
use depotpro_core::domain::money::Money;
use depotpro_core::domain::quantity::Quantity;
use depotpro_core::infrastructure::db::DepotDb;

fn temp_db_path(tag: &str) -> PathBuf {
    std::env::temp_dir()
        .join(format!("depotpro_lot2_{tag}_{}", uuid::Uuid::new_v4()))
        .join("depotpro.db")
}

#[test]
fn lot2_domain_exact_money_and_quantity_invariants() {
    assert_eq!(Money::from_non_negative(0, "nul").unwrap().value(), 0);
    assert!(Money::from_positive(0, "strict").is_err());
    assert!(Money::from_non_negative(-5, "neg").is_err());
    assert!(Money(i64::MAX).checked_add(Money(1), "ovf").is_err());
    assert!(Money(1_000_000_000_000).checked_mul(10_000_000, "mul_ovf").is_err());
    assert!(Money(400).checked_sub_non_negative(Money(500), "neg_rem").is_err());

    assert_eq!(Quantity::parse_str("3", "entier").unwrap().milli_units, 3_000);
    assert_eq!(Quantity::parse_str("1.5", "frac").unwrap().milli_units, 1_500);
    assert_eq!(Quantity::parse_str("0,250", "virg").unwrap().milli_units, 250);
    assert!(Quantity::parse_str("1.2345", "4dec").is_err());
    assert!(Quantity::parse_str("1.", "dot").is_err());
    assert!(Quantity::parse_str(".5", "nodot").is_err());
    assert!(Quantity::parse_positive_str("0", "zero").is_err());

    assert_eq!(Quantity::from_milli(500).compute_line_fcfa(100).unwrap(), 50);
    assert!(Quantity::from_milli(333).compute_line_fcfa(100).is_err());
    assert!(Quantity::from_milli(1).multiply_coefficient_to_base(Quantity::from_milli(500)).is_err());
}

#[tokio::test]
async fn lot2_pos_parity_credit_limits_cash_diff_and_consignments() {
    let db_path = temp_db_path("parity");
    let db = DepotDb::connect(&db_path).await.expect("connect temp db");

    let session = cash::open_cash_session(
        &db,
        cash::OpenCashInput {
            opening_cash: 15_000,
            request_key: "lot2-rs-cash-open".to_string(),
        },
    )
    .await
    .unwrap();

    let cat = products::create_category(&db, "Boissons Lot 2", None)
        .await
        .unwrap();

    let ret_type = consignments::create_returnable_type(
        &db,
        consignments::CreateReturnableTypeInput {
            code: "CAS-RS2".to_string(),
            name: "Casier Lot 2".to_string(),
            producer: "SOLIBRA".to_string(),
            kind: "crate".to_string(),
            deposit_value: 2_400,
            initial_stock: Some(20),
            description: None,
        },
    )
    .await
    .unwrap();

    let prod_int = products::create_product(
        &db,
        products::CreateProductInput {
            name: "Bière Entière Lot 2".to_string(),
            brand: None,
            barcode: None,
            category_id: cat.id,
            supplier_id: None,
            description: None,
            base_unit: "bouteille".to_string(),
            initial_stock: Some("100".to_string()),
            min_stock: Some("5".to_string()),
            max_stock: None,
            purchase_price: Some(400),
            wholesale_price: Some(450),
            semi_wholesale_price: Some(480),
            retail_price: Some(500),
            image_path: None,
            packagings: Some(vec![products::PackagingInput {
                id: None,
                name: "bouteille".to_string(),
                coefficient: "1".to_string(),
                purchase_price: Some(400),
                wholesale_price: Some(450),
                semi_wholesale_price: Some(480),
                retail_price: Some(500),
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
    let int_pkg_id = prod_int.packagings[0].id;

    let prod_frac = products::create_product(
        &db,
        products::CreateProductInput {
            name: "Sirop Vrac Lot 2".to_string(),
            brand: None,
            barcode: None,
            category_id: cat.id,
            supplier_id: None,
            description: None,
            base_unit: "litre".to_string(),
            initial_stock: Some("100".to_string()),
            min_stock: Some("5".to_string()),
            max_stock: None,
            purchase_price: Some(80),
            wholesale_price: Some(90),
            semi_wholesale_price: Some(95),
            retail_price: Some(100),
            image_path: None,
            packagings: Some(vec![products::PackagingInput {
                id: None,
                name: "bouteille".to_string(),
                coefficient: "1".to_string(),
                purchase_price: Some(80),
                wholesale_price: Some(90),
                semi_wholesale_price: Some(95),
                retail_price: Some(100),
                barcode: None,
                allow_fraction: Some(true),
                is_active: Some(true),
                deposit_mode: Some("none".to_string()),
                components: None,
            }]),
        },
    )
    .await
    .unwrap();
    let frac_pkg_id = prod_frac.packagings[0].id;

    let prod_dep = products::create_product(
        &db,
        products::CreateProductInput {
            name: "Casier Consigné Lot 2".to_string(),
            brand: None,
            barcode: None,
            category_id: cat.id,
            supplier_id: None,
            description: None,
            base_unit: "bouteille".to_string(),
            initial_stock: Some("240".to_string()),
            min_stock: Some("24".to_string()),
            max_stock: None,
            purchase_price: Some(400),
            wholesale_price: Some(450),
            semi_wholesale_price: Some(480),
            retail_price: Some(500),
            image_path: None,
            packagings: Some(vec![products::PackagingInput {
                id: None,
                name: "casier".to_string(),
                coefficient: "24".to_string(),
                purchase_price: Some(9_600),
                wholesale_price: Some(11_000),
                semi_wholesale_price: Some(11_500),
                retail_price: Some(12_000),
                barcode: None,
                allow_fraction: Some(false),
                is_active: Some(true),
                deposit_mode: Some("deposit".to_string()),
                components: Some(vec![products::DepositComponentInput {
                    returnable_id: ret_type.id,
                    pieces_per_pack: 1,
                }]),
            }]),
        },
    )
    .await
    .unwrap();
    let dep_pkg_id = prod_dep.packagings[0].id;

    let client = sales::create_client(
        &db,
        sales::CreateClientInput {
            name: "Client Plafonné Rust".to_string(),
            client_type: "professionnel".to_string(),
            phone: None,
            address: None,
            city: None,
            email: None,
            contact_person: None,
            credit_policy: "limited".to_string(),
            credit_limit: Some(10_000),
            payment_terms_days: Some(15),
        },
    )
    .await
    .unwrap();

    // 1. Parité exacte : 0.5*100 + (12000-50) - 50 global + 2400 consigne = 14350 FCFA en paiement mixte
    let sale = sales::create_sale(
        &db,
        sales::CreateSaleInput {
            request_key: "lot2-rs-parity-1".to_string(),
            client_id: Some(client.id),
            sale_type: "cash".to_string(),
            price_tier: "retail".to_string(),
            discount_amount: Some(50),
            notes: None,
            lines: vec![
                sales::CreateSaleLineInput {
                    product_id: prod_frac.id,
                    packaging_id: frac_pkg_id,
                    quantity: "0.5".to_string(),
                    discount_amount: Some(0),
                },
                sales::CreateSaleLineInput {
                    product_id: prod_dep.id,
                    packaging_id: dep_pkg_id,
                    quantity: "1".to_string(),
                    discount_amount: Some(50),
                },
            ],
            payments: vec![
                sales::PaymentPartInput {
                    method_code: "cash".to_string(),
                    amount: 10_000,
                },
                sales::PaymentPartInput {
                    method_code: "wave".to_string(),
                    amount: 4_350,
                },
            ],
            due_date: None,
        },
    )
    .await
    .unwrap();

    assert_eq!(sale.sale.subtotal_merchandise, 12_000);
    assert_eq!(sale.sale.total_merchandise, 11_950);
    assert_eq!(sale.sale.total_deposit, 2_400);
    assert_eq!(sale.sale.total_amount, 14_350);
    assert_eq!(sale.sale.paid_amount, 14_350);

    // 2. Rejets métier exacts
    assert!(sales::create_sale(
        &db,
        sales::CreateSaleInput {
            request_key: "lot2-rs-bad-frac".to_string(),
            client_id: None,
            sale_type: "cash".to_string(),
            price_tier: "retail".to_string(),
            discount_amount: None,
            notes: None,
            lines: vec![sales::CreateSaleLineInput {
                product_id: prod_int.id,
                packaging_id: int_pkg_id,
                quantity: "1.5".to_string(),
                discount_amount: None,
            }],
            payments: vec![sales::PaymentPartInput {
                method_code: "cash".to_string(),
                amount: 750,
            }],
            due_date: None,
        },
    )
    .await
    .is_err());

    assert!(sales::create_sale(
        &db,
        sales::CreateSaleInput {
            request_key: "lot2-rs-bad-fcfa-frac".to_string(),
            client_id: None,
            sale_type: "cash".to_string(),
            price_tier: "retail".to_string(),
            discount_amount: None,
            notes: None,
            lines: vec![sales::CreateSaleLineInput {
                product_id: prod_frac.id,
                packaging_id: frac_pkg_id,
                quantity: "0.333".to_string(),
                discount_amount: None,
            }],
            payments: vec![sales::PaymentPartInput {
                method_code: "cash".to_string(),
                amount: 33,
            }],
            due_date: None,
        },
    )
    .await
    .is_err());

    assert!(sales::create_sale(
        &db,
        sales::CreateSaleInput {
            request_key: "lot2-rs-over-disc".to_string(),
            client_id: None,
            sale_type: "cash".to_string(),
            price_tier: "retail".to_string(),
            discount_amount: Some(600),
            lines: vec![sales::CreateSaleLineInput {
                product_id: prod_int.id,
                packaging_id: int_pkg_id,
                quantity: "1".to_string(),
                discount_amount: None,
            }],
            payments: vec![sales::PaymentPartInput {
                method_code: "cash".to_string(),
                amount: 500,
            }],
            notes: None,
            due_date: None,
        },
    )
    .await
    .is_err());

    assert!(sales::create_sale(
        &db,
        sales::CreateSaleInput {
            request_key: "lot2-rs-underpaid".to_string(),
            client_id: None,
            sale_type: "cash".to_string(),
            price_tier: "retail".to_string(),
            discount_amount: None,
            notes: None,
            lines: vec![sales::CreateSaleLineInput {
                product_id: prod_int.id,
                packaging_id: int_pkg_id,
                quantity: "2".to_string(),
                discount_amount: None,
            }],
            payments: vec![sales::PaymentPartInput {
                method_code: "cash".to_string(),
                amount: 900,
            }],
            due_date: None,
        },
    )
    .await
    .is_err());

    // 3. Crédit avec plafond dépassé
    assert!(sales::create_sale(
        &db,
        sales::CreateSaleInput {
            request_key: "lot2-rs-over-credit".to_string(),
            client_id: Some(client.id),
            sale_type: "credit".to_string(),
            price_tier: "retail".to_string(),
            discount_amount: None,
            notes: None,
            lines: vec![sales::CreateSaleLineInput {
                product_id: prod_int.id,
                packaging_id: int_pkg_id,
                quantity: "21".to_string(),
                discount_amount: None,
            }],
            payments: vec![],
            due_date: None,
        },
    )
    .await
    .is_err());

    // 4. Espèces insuffisantes en caisse pour dépense ou remboursement consigne
    assert!(cash::create_expense(
        &db,
        cash::CreateExpenseInput {
            request_key: "lot2-rs-bad-exp".to_string(),
            category: "Divers".to_string(),
            amount: 30_000,
            method_code: "cash".to_string(),
            beneficiary: None,
            notes: None,
            receipt_path: None,
            expense_date: None,
        },
    )
    .await
    .is_err());

    let deposit_issue_id = sale.deposits[0].id;
    assert!(consignments::return_client_empties(
        &db,
        consignments::ReturnClientEmptiesInput {
            issue_id: deposit_issue_id,
            pieces: 1,
            condition_state: "good".to_string(),
            refund_amount: 3_000,
            credit_reduction: 0,
            method_code: "cash".to_string(),
            reason: "Trop élevé".to_string(),
            request_key: "lot2-rs-dep-overval".to_string(),
        },
    )
    .await
    .is_err());

    // 5. Clôture caisse avec écart (refusée sans note, acceptée avec note)
    assert!(cash::close_cash_session(
        &db,
        cash::CloseCashInput {
            session_id: session.id,
            physical_cash: 24_500,
            closing_notes: Some("   ".to_string()),
            request_key: "lot2-rs-close-nonote".to_string(),
        },
    )
    .await
    .is_err());

    let closed = cash::close_cash_session(
        &db,
        cash::CloseCashInput {
            session_id: session.id,
            physical_cash: 24_500,
            closing_notes: Some("Manquant vérifié".to_string()),
            request_key: "lot2-rs-close-ok".to_string(),
        },
    )
    .await
    .unwrap();
    assert_eq!(closed.theoretical_cash, Some(25_000));
    assert_eq!(closed.physical_cash, Some(24_500));
    assert_eq!(closed.difference, Some(-500));
}
