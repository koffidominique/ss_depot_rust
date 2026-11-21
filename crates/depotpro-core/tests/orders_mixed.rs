// ============================================================================
// Tests d'intégration : Commandes clientèle mixtes & allocations d'emballages
// Couvre les cas 1 à 7 du §6.4 ainsi que le cycle de vie complet & consignes
// ============================================================================

use std::path::PathBuf;

use depotpro_core::application::{orders, products, sales};
use depotpro_core::infrastructure::db::DepotDb;

fn temp_db_path(tag: &str) -> PathBuf {
    std::env::temp_dir()
        .join(format!(
            "depotpro_orders_mixed_{tag}_{}",
            uuid::Uuid::new_v4()
        ))
        .join("depotpro.db")
}

#[allow(clippy::too_many_arguments)]
async fn make_beverage_variant(
    db: &DepotDb,
    cat_id: i64,
    name: &str,
    sku: &str,
    volume_ml: i64,
    container_type: &str,
    unit_price: i64,
    initial_stock_units: &str,
) -> (i64, i64) {
    let created = products::create_product_v4(
        db,
        products::CreateProductInput {
            name: name.to_string(),
            brand: Some(name.to_string()),
            barcode: None,
            category_id: cat_id,
            supplier_id: None,
            description: None,
            base_unit: "bouteille".to_string(),
            initial_stock: Some(initial_stock_units.to_string()),
            min_stock: Some("0".to_string()),
            max_stock: Some("0".to_string()),
            purchase_price: Some(unit_price - 100),
            wholesale_price: Some(unit_price),
            semi_wholesale_price: Some(unit_price),
            retail_price: Some(unit_price),
            image_path: None,
            packagings: Some(vec![products::PackagingInput {
                id: None,
                name: "bouteille".to_string(),
                coefficient: "1".to_string(),
                purchase_price: Some(unit_price - 100),
                wholesale_price: Some(unit_price),
                semi_wholesale_price: Some(unit_price),
                retail_price: Some(unit_price),
                barcode: None,
                allow_fraction: Some(false),
                is_active: Some(true),
                deposit_mode: Some("none".to_string()),
                components: None,
            }]),
        },
        products::ProductV4CreateExtras {
            sku: Some(sku.to_string()),
            variant: Some(products::InitialVariantInput {
                name: Some(format!("{name} {volume_ml}ml")),
                sku: Some(format!("{sku}-VAR")),
                barcode: None,
                container_type_id: None,
                container_type: Some(container_type.to_string()),
                volume_ml,
                container_material: Some("glass".to_string()),
                container_returnable: Some(true),
                container_recyclable: Some(true),
                container_deposit_amount: Some(0),
            }),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    let var_id = created.variant_id.expect("variant_id créé");
    (created.id, var_id)
}

#[tokio::test]
async fn orders_mixed_cases_1_to_7_and_lifecycle() {
    let db = DepotDb::connect(&temp_db_path("cases")).await.unwrap();
    let cat = products::create_category(&db, "Bières Mixtes", None)
        .await
        .unwrap();

    let (bock_id, bock_var) = make_beverage_variant(
        &db,
        cat.id,
        "Bock 33cl",
        "BOCK-GL-330",
        330,
        "glass_returnable",
        400,
        "200",
    )
    .await;
    let (_drogba_id, drogba_var) = make_beverage_variant(
        &db,
        cat.id,
        "Drogba 33cl",
        "DROGBA-GL-330",
        330,
        "glass_returnable",
        400,
        "200",
    )
    .await;
    let (_guinness_id, guinness_var) = make_beverage_variant(
        &db,
        cat.id,
        "Guinness 33cl",
        "GUIN-GL-330",
        330,
        "glass_returnable",
        600,
        "200",
    )
    .await;
    let (_valpierre_id, valpierre_var) = make_beverage_variant(
        &db,
        cat.id,
        "Valpierre 50cl",
        "VALP-GL-500",
        500,
        "glass_returnable",
        500,
        "200",
    )
    .await;

    let client = sales::create_client(
        &db,
        sales::CreateClientInput {
            name: "Maquis Abidjan".to_string(),
            client_type: "professionnel".to_string(),
            phone: Some("0707070707".to_string()),
            address: None,
            city: Some("Abidjan".to_string()),
            email: None,
            contact_person: None,
            credit_policy: "limited".to_string(),
            credit_limit: Some(500_000),
            payment_terms_days: Some(15),
        },
    )
    .await
    .unwrap();

    // Cas 1 : 12 Bock 33cl + 12 Drogba 33cl -> 1 casier 24x33cl, consigne 1x1000, 2 lignes
    let c1 = orders::compose_preview(
        &db,
        orders::ComposePreviewInput {
            lines: vec![
                orders::OrderLineInput {
                    variant_id: bock_var,
                    requested_unit: "half_crate".into(),
                    requested_quantity: 1,
                    unit_price_xof: Some(400),
                    discount_xof: None,
                    notes: None,
                },
                orders::OrderLineInput {
                    variant_id: drogba_var,
                    requested_unit: "half_crate".into(),
                    requested_quantity: 1,
                    unit_price_xof: Some(400),
                    discount_xof: None,
                    notes: None,
                },
            ],
            discount_xof: None,
            tax_xof: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(c1.lines.len(), 2);
    assert_eq!(c1.allocations.len(), 1);
    assert_eq!(c1.allocations[0].quantity, 1);
    assert_eq!(c1.allocations[0].capacity, 24);
    assert_eq!(c1.totals.subtotal_xof, 9600);
    assert_eq!(c1.totals.deposit_total_xof, 1000);
    assert_eq!(c1.totals.total_xof, 9600);
    assert_eq!(c1.totals.total_to_collect_xof, 10600);

    // Cas 2 : 24 Bock 33cl -> 1 casier 24x33cl, consigne 1000, 1 ligne
    let c2 = orders::compose_preview(
        &db,
        orders::ComposePreviewInput {
            lines: vec![orders::OrderLineInput {
                variant_id: bock_var,
                requested_unit: "crate".into(),
                requested_quantity: 1,
                unit_price_xof: Some(400),
                discount_xof: None,
                notes: None,
            }],
            discount_xof: None,
            tax_xof: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(c2.allocations.len(), 1);
    assert_eq!(c2.allocations[0].quantity, 1);
    assert_eq!(c2.totals.deposit_total_xof, 1000);

    // Cas 3 : 6 Bock 33cl + 6 Drogba 33cl -> 1 casier partiel (warning), consigne 1000
    let c3 = orders::compose_preview(
        &db,
        orders::ComposePreviewInput {
            lines: vec![
                orders::OrderLineInput {
                    variant_id: bock_var,
                    requested_unit: "unit".into(),
                    requested_quantity: 6,
                    unit_price_xof: Some(400),
                    discount_xof: None,
                    notes: None,
                },
                orders::OrderLineInput {
                    variant_id: drogba_var,
                    requested_unit: "unit".into(),
                    requested_quantity: 6,
                    unit_price_xof: Some(400),
                    discount_xof: None,
                    notes: None,
                },
            ],
            discount_xof: None,
            tax_xof: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(c3.allocations.len(), 1);
    assert_eq!(c3.allocations[0].quantity, 1);
    assert_eq!(c3.totals.deposit_total_xof, 1000);
    assert!(!c3.warnings.is_empty());

    // Cas 4 : 12 Bock 33cl + 12 Valpierre 50cl -> 1 casier 24x33cl (partiel) + 1 casier 12x50cl
    let c4 = orders::compose_preview(
        &db,
        orders::ComposePreviewInput {
            lines: vec![
                orders::OrderLineInput {
                    variant_id: bock_var,
                    requested_unit: "unit".into(),
                    requested_quantity: 12,
                    unit_price_xof: Some(400),
                    discount_xof: None,
                    notes: None,
                },
                orders::OrderLineInput {
                    variant_id: valpierre_var,
                    requested_unit: "unit".into(),
                    requested_quantity: 12,
                    unit_price_xof: Some(500),
                    discount_xof: None,
                    notes: None,
                },
            ],
            discount_xof: None,
            tax_xof: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(c4.allocations.len(), 2);
    assert_eq!(c4.totals.deposit_total_xof, 2000);

    // Cas 5 : 30 Bock 33cl -> 1 casier plein + 1 casier partiel (6 >= 6) avec warning
    let c5 = orders::compose_preview(
        &db,
        orders::ComposePreviewInput {
            lines: vec![orders::OrderLineInput {
                variant_id: bock_var,
                requested_unit: "unit".into(),
                requested_quantity: 30,
                unit_price_xof: Some(400),
                discount_xof: None,
                notes: None,
            }],
            discount_xof: None,
            tax_xof: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(c5.allocations[0].quantity, 2);
    assert!(!c5.warnings.is_empty());

    // Cas 6 : 12 Bock + 12 Drogba + 6 Guinness -> 2 casiers 24x33cl (30 btl / 48 slots), 3 lignes
    let c6 = orders::compose_preview(
        &db,
        orders::ComposePreviewInput {
            lines: vec![
                orders::OrderLineInput {
                    variant_id: bock_var,
                    requested_unit: "unit".into(),
                    requested_quantity: 12,
                    unit_price_xof: Some(400),
                    discount_xof: None,
                    notes: None,
                },
                orders::OrderLineInput {
                    variant_id: drogba_var,
                    requested_unit: "unit".into(),
                    requested_quantity: 12,
                    unit_price_xof: Some(400),
                    discount_xof: None,
                    notes: None,
                },
                orders::OrderLineInput {
                    variant_id: guinness_var,
                    requested_unit: "unit".into(),
                    requested_quantity: 6,
                    unit_price_xof: Some(600),
                    discount_xof: None,
                    notes: None,
                },
            ],
            discount_xof: None,
            tax_xof: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(c6.lines.len(), 3);
    assert_eq!(c6.allocations.len(), 1);
    assert_eq!(c6.allocations[0].quantity, 2);
    assert_eq!(c6.totals.deposit_total_xof, 2000);

    // Cas 7 + cycle complet sur Cas 1 (create -> confirm -> deliver -> return 1 casier)
    let created = orders::create_order(
        &db,
        orders::CreateOrderInput {
            customer_id: client.id,
            order_type: Some("mixte".into()),
            payment_method: Some("cash".into()),
            discount_xof: None,
            tax_xof: None,
            delivery_date: None,
            delivery_address: None,
            notes: Some("Casier mixte Bock + Drogba".into()),
            allow_price_override: None,
            lines: vec![
                orders::OrderLineInput {
                    variant_id: bock_var,
                    requested_unit: "half_crate".into(),
                    requested_quantity: 1,
                    unit_price_xof: Some(400),
                    discount_xof: None,
                    notes: None,
                },
                orders::OrderLineInput {
                    variant_id: drogba_var,
                    requested_unit: "half_crate".into(),
                    requested_quantity: 1,
                    unit_price_xof: Some(400),
                    discount_xof: None,
                    notes: None,
                },
            ],
            allocations: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(created.order.status, "draft");
    assert_eq!(created.lines.len(), 2);
    assert_eq!(created.allocations.len(), 1);
    assert_eq!(created.links.len(), 2);
    let linked_sum: i64 = created.links.iter().map(|l| l.units_in_packaging).sum();
    assert_eq!(linked_sum, 24);
    assert_eq!(created.order.total_xof, 9600);
    assert_eq!(created.order.deposit_due_xof, 1000);
    assert_eq!(created.order.total_to_collect_xof, 10600);

    // En draft : aucun mouvement de stock ou solde consigne
    let deps_draft = orders::get_customer_deposits(&db, client.id).await.unwrap();
    assert!(deps_draft.is_empty());

    // Confirm : décrémente le stock en unités de base (200 -> 188)
    let confirmed = orders::confirm_order(&db, created.order.id).await.unwrap();
    assert_eq!(confirmed.order.status, "confirmed");
    let bock_stock: i64 = sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
        .bind(bock_id)
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(bock_stock, 188_000);

    // Deliver : crée mouvement LIVRAISON_CLIENT & incrémente customer_deposit_balances
    let delivered = orders::deliver_order(&db, created.order.id).await.unwrap();
    assert_eq!(delivered.order.status, "delivered");
    assert_eq!(delivered.customer_deposits.len(), 1);
    assert_eq!(delivered.customer_deposits[0].quantity_held, 1);
    assert_eq!(delivered.customer_deposits[0].amount_held_xof, 1000);

    // Retour d'1 casier vide -> décrémente solde consigné & incrémente stock_empty
    let asset_id = created.allocations[0].packaging_asset_id;
    let after_ret = orders::return_order_packaging(
        &db,
        created.order.id,
        orders::OrderReturnInput {
            packaging_asset_id: asset_id,
            quantity: 1,
            notes: Some("Casier rendu".into()),
        },
    )
    .await
    .unwrap();
    assert_eq!(after_ret.customer_deposits[0].quantity_held, 0);
    assert_eq!(after_ret.customer_deposits[0].amount_held_xof, 0);

    let ret_hist = orders::get_customer_deposit_history(&db, client.id)
        .await
        .unwrap();
    assert!(ret_hist
        .iter()
        .any(|m| m.movement_type == "LIVRAISON_CLIENT"));
    assert!(ret_hist.iter().any(|m| m.movement_type == "RETOUR_CLIENT"));

    let stock_empty: i64 =
        sqlx::query_scalar("SELECT stock_empty FROM packaging_assets WHERE id = ?")
            .bind(asset_id)
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert_eq!(stock_empty, 1);
}
