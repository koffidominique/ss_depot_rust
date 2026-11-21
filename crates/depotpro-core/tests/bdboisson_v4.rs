// ============================================================================
// Tests d'intégration BDBoisson V4 : brasseries, marques, unités multi-niveaux,
// tarification gros/demi-gros/détail, consignes séparées & archivage sécurisé
// ============================================================================

use std::path::PathBuf;

use depotpro_core::application::{cash, catalogue, products, purchases, sales};
use depotpro_core::error::CoreError;
use depotpro_core::infrastructure::db::DepotDb;

fn temp_db_path(tag: &str) -> PathBuf {
    std::env::temp_dir()
        .join(format!("depotpro_bdboisson_{tag}_{}", uuid::Uuid::new_v4()))
        .join("depotpro.db")
}

#[tokio::test]
async fn bdboisson_v4_end_to_end_catalog_and_pos() {
    let db = DepotDb::connect(&temp_db_path("e2e")).await.unwrap();

    // 1. Vérifier les brasseries seedées + création marque rattachée à SOLIBRA
    let breweries = catalogue::list_breweries(
        &db,
        catalogue::PaginatedQuery {
            page: 1,
            page_size: 20,
            search: None,
            include_archived: None,
        },
    )
    .await
    .unwrap();
    let solibra = breweries
        .items
        .iter()
        .find(|b| b.code == "BRW-SOLIBRA")
        .expect("BRW-SOLIBRA seedée");
    let brassivoire = breweries
        .items
        .iter()
        .find(|b| b.code == "BRW-BRASSIVOIRE")
        .expect("BRW-BRASSIVOIRE seedée");

    let brand_bock = catalogue::create_brand(
        &db,
        catalogue::CreateBrandInput {
            code: "BRD-BOCK".to_string(),
            name: "Bock".to_string(),
            brewery_id: Some(solibra.id),
            country_of_origin: Some("Côte d'Ivoire".to_string()),
            description: None,
            is_active: Some(true),
        },
    )
    .await
    .unwrap();

    // 2. Catégorie hiérarchique
    let parent_cat =
        products::create_category(&db, "Bières V4", Some("Bières blondes et brunes"))
            .await
            .unwrap();
    let sub_cat = products::create_category_with_parent(
        &db,
        "Blondes 65cl",
        Some("Grand format"),
        Some(parent_cat.id),
    )
    .await
    .unwrap();
    assert_eq!(sub_cat.parent_id, Some(parent_cat.id));

    // 3. Fournisseur
    let sup = purchases::create_supplier(
        &db,
        purchases::CreateSupplierInput {
            name: "Dépôt SOLIBRA Abidjan".to_string(),
            company_name: Some("SOLIBRA CI".to_string()),
            phone: "0102030405".to_string(),
            address: None,
            email: None,
            contact_person: None,
            payment_terms_days: Some(30),
        },
    )
    .await
    .unwrap();

    // 4. Cohérence brasserie / marque refusée en cas d'incohérence
    let mismatch = products::create_product_v4(
        &db,
        products::CreateProductInput {
            name: "Bock Incohérente".to_string(),
            brand: None,
            barcode: None,
            category_id: parent_cat.id,
            supplier_id: None,
            description: None,
            base_unit: "bouteille".to_string(),
            initial_stock: Some("0".to_string()),
            min_stock: Some("12".to_string()),
            max_stock: None,
            purchase_price: Some(400),
            wholesale_price: None,
            semi_wholesale_price: None,
            retail_price: Some(600),
            image_path: None,
            packagings: None,
        },
        products::ProductV4CreateExtras {
            brewery_id: Some(brassivoire.id),
            brand_id: Some(brand_bock.id),
            ..Default::default()
        },
    )
    .await;
    assert!(matches!(mismatch, Err(CoreError::Validation(_))));

    // 5. Création produit V4 complet (variante, conditionnements, unités de vente, fournisseur)
    let prod = products::create_product_v4(
        &db,
        products::CreateProductInput {
            name: "Bock Solibra 65cl".to_string(),
            brand: None,
            barcode: Some("6181100009991".to_string()),
            category_id: parent_cat.id,
            supplier_id: Some(sup.id),
            description: Some("Bière blonde ivoirienne".to_string()),
            base_unit: "bouteille".to_string(),
            initial_stock: Some("72".to_string()),
            min_stock: Some("24".to_string()),
            max_stock: Some("240".to_string()),
            purchase_price: Some(450),
            wholesale_price: Some(500),
            semi_wholesale_price: Some(550),
            retail_price: Some(650),
            image_path: None,
            packagings: Some(vec![
                products::PackagingInput {
                    id: None,
                    name: "casier".to_string(),
                    coefficient: "12".to_string(),
                    purchase_price: Some(5_400),
                    wholesale_price: Some(6_000),
                    semi_wholesale_price: Some(6_600),
                    retail_price: Some(7_200),
                    barcode: Some("6181100009992".to_string()),
                    allow_fraction: Some(true),
                    is_active: Some(true),
                    deposit_mode: Some("none".to_string()),
                    components: None,
                },
                products::PackagingInput {
                    id: None,
                    name: "bouteille".to_string(),
                    coefficient: "1".to_string(),
                    purchase_price: Some(450),
                    wholesale_price: Some(500),
                    semi_wholesale_price: Some(550),
                    retail_price: Some(650),
                    barcode: None,
                    allow_fraction: Some(false),
                    is_active: Some(true),
                    deposit_mode: Some("none".to_string()),
                    components: None,
                },
            ]),
        },
        products::ProductV4CreateExtras {
            brewery_id: Some(solibra.id),
            brand_id: Some(brand_bock.id),
            sku: Some("SOL-BOCK-65CL".to_string()),
            subcategory_id: Some(sub_cat.id),
            is_alcoholic: Some(true),
            alcohol_degree_milli: Some(4_800),
            allow_unit_sale: Some(true),
            allow_credit_sale: Some(false),
            variant: Some(products::InitialVariantInput {
                name: Some("Bock 65cl Verre".to_string()),
                sku: Some("VAR-BOCK-65".to_string()),
                barcode: None,
                container_type_id: None,
                container_type: Some("verre consigné".to_string()),
                volume_ml: 650,
                container_material: Some("verre".to_string()),
                container_returnable: Some(true),
                container_recyclable: Some(true),
                container_deposit_amount: Some(150),
            }),
            packaging_extras: Some(vec![products::PackagingV4Extras {
                package_deposit_amount: Some(1_000),
                bottle_deposit_amount: Some(1_800),
                is_returnable: Some(true),
                is_reusable: Some(true),
                is_default_sale: Some(true),
                ..Default::default()
            }]),
            sales_units: Some(vec![products::InitialSalesUnitInput {
                label: "Demi-casier 6 btl".to_string(),
                unit_type: "half_crate".to_string(),
                conversion_factor: 6,
                is_virtual: Some(true),
                allow_fraction: Some(false),
                purchase_price: Some(2_700),
                wholesale_price: Some(3_100),
                semi_wholesale_price: Some(3_300),
                retail_price: Some(3_600),
                min_selling_price: Some(3_000),
                bottle_deposit_amount: Some(900),
                crate_deposit_amount: Some(500),
                barcode: None,
                is_default_sale: Some(false),
                is_default_purchase: Some(false),
            }]),
            product_suppliers: Some(vec![products::InitialProductSupplierInput {
                supplier_id: sup.id,
                supplier_product_code: Some("SOL-650-BOCK".to_string()),
                preferred_supplier: Some(true),
                purchase_unit: Some("casier".to_string()),
                units_per_purchase_package: Some(12),
                last_purchase_price: Some(5_400),
            }]),
            ..Default::default()
        },
    )
    .await
    .unwrap();

    assert_eq!(prod.reference, "SOL-BOCK-65CL");
    assert_eq!(prod.brewery_id, Some(solibra.id));
    assert_eq!(prod.variants.len(), 1);
    assert_eq!(prod.sales_units.len(), 1);
    assert_eq!(prod.stock_milli, 72_000);

    // 6. Ouverture session caisse + vente multi-unités (bouteille + demi-casier tarif gros)
    cash::open_cash_session(
        &db,
        cash::OpenCashInput {
            opening_cash: 25_000,
            request_key: "v4-open-1".to_string(),
        },
    )
    .await
    .unwrap();

    let pkg_casier = prod.packagings.iter().find(|p| p.name == "casier").unwrap();
    let pkg_bouteille = prod
        .packagings
        .iter()
        .find(|p| p.name == "bouteille")
        .unwrap();
    let su_demi = &prod.sales_units[0];

    // Vente de 2 bouteilles + 1 demi-casier en tarif gros (3_100 + 1_400 consigne)
    let sale = sales::create_sale_v4(
        &db,
        sales::CreateSaleV4Input {
            request_key: "v4-sale-multi-1".to_string(),
            client_id: None,
            sale_type: "cash".to_string(),
            price_tier: "wholesale".to_string(),
            discount_amount: None,
            notes: None,
            lines: vec![
                sales::CreateSaleLineV4Input {
                    product_id: prod.id,
                    packaging_id: pkg_bouteille.id,
                    sales_unit_id: None,
                    quantity: "2".to_string(),
                    discount_amount: None,
                },
                sales::CreateSaleLineV4Input {
                    product_id: prod.id,
                    packaging_id: pkg_casier.id,
                    sales_unit_id: Some(su_demi.id),
                    quantity: "1".to_string(),
                    discount_amount: None,
                },
            ],
            payments: vec![sales::PaymentPartInput {
                method_code: "cash".to_string(),
                amount: 5_500, // 2*500 (1000) + 1*3100 (3100) + (900+500) consigne = 5500
            }],
            due_date: None,
        },
    )
    .await
    .unwrap();

    assert_eq!(sale.sale.total_merchandise, 4_100);
    assert_eq!(sale.sale.total_deposit, 1_400);
    assert_eq!(sale.sale.total_amount, 5_500);

    // 7. Produit avec vente utilisée -> archivage au lieu de suppression ; produit vierge -> suppression
    let archived = products::delete_or_archive_product(&db, prod.id)
        .await
        .unwrap();
    assert!(!archived);

    let unused = products::create_product(
        &db,
        products::CreateProductInput {
            name: "Eau Test Temp".to_string(),
            brand: None,
            barcode: None,
            category_id: parent_cat.id,
            supplier_id: None,
            description: None,
            base_unit: "bouteille".to_string(),
            initial_stock: Some("0".to_string()),
            min_stock: Some("0".to_string()),
            max_stock: None,
            purchase_price: Some(200),
            wholesale_price: None,
            semi_wholesale_price: None,
            retail_price: Some(300),
            image_path: None,
            packagings: None,
        },
    )
    .await
    .unwrap();
    let deleted = products::delete_or_archive_product(&db, unused.id)
        .await
        .unwrap();
    assert!(deleted);
}
