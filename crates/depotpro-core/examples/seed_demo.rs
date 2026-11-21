//! Demo data seeder for DEPOTPRO PREMIUM V3.
//!
//! Usage:
//!   cargo run -p depotpro-core --example seed_demo -- [--force] [--with-company]
//!
//! Refuses to seed if NODE_ENV=production unless --force is passed.
//! Never called during normal application initialization.

use std::path::PathBuf;

use depotpro_core::infrastructure::db::DepotDb;

#[derive(Debug, Default)]
struct SeedSummary {
    seeded: bool,
    suppliers_added: i64,
    products_added: i64,
    returnables_added: i64,
    clients_added: i64,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let force = args.iter().any(|a| a == "--force");
    let include_demo_company = args.iter().any(|a| a == "--with-company");

    if std::env::var("NODE_ENV").unwrap_or_default() == "production" && !force {
        eprintln!(
            "Refus d'injecter des données de démonstration en NODE_ENV=production sans --force."
        );
        std::process::exit(1);
    }

    let db_path = std::env::var("DEPOTPRO_DB_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("./data/depotpro_v3.db"));

    let db = DepotDb::connect(&db_path).await?;

    let existing_suppliers: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM suppliers")
        .fetch_one(&db.pool)
        .await?;
    let existing_products: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM products")
        .fetch_one(&db.pool)
        .await?;

    if existing_suppliers > 0 || existing_products > 0 {
        println!(
            "{}",
            serde_json::json!({
                "status": "skipped",
                "seeded": false,
                "suppliersAdded": 0,
                "productsAdded": 0,
                "returnablesAdded": 0,
                "clientsAdded": 0,
            })
        );
        return Ok(());
    }

    let (_guard, mut tx) = db.begin_write().await?;
    let summary = seed_demo_data(&mut tx, include_demo_company).await?;
    tx.commit().await?;

    println!(
        "{}",
        serde_json::json!({
            "status": "ok",
            "seeded": summary.seeded,
            "suppliersAdded": summary.suppliers_added,
            "productsAdded": summary.products_added,
            "returnablesAdded": summary.returnables_added,
            "clientsAdded": summary.clients_added,
        })
    );

    Ok(())
}

async fn seed_demo_data(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    include_demo_company: bool,
) -> Result<SeedSummary, sqlx::Error> {
    let mut summary = SeedSummary::default();

    if include_demo_company {
        sqlx::query(
            "UPDATE app_settings
             SET company_name = 'DEPOTPRO Démo',
                 company_legal_name = 'Dépôt Boissons Démonstration',
                 address = 'Zone Démonstration',
                 phone = '+225 07 00 00 00 00',
                 city = 'Abidjan',
                 country = 'Côte d''Ivoire',
                 setup_completed = 1
             WHERE id = 1",
        )
        .execute(&mut **tx)
        .await?;
    }

    // --- Categories ---
    sqlx::query("INSERT OR IGNORE INTO categories (name, description) VALUES ('Bières', 'Bières en bouteille, canette ou casier')")
        .execute(&mut **tx).await?;
    let c_biere: i64 = sqlx::query_scalar("SELECT id FROM categories WHERE name = 'Bières'")
        .fetch_one(&mut **tx)
        .await?;

    sqlx::query("INSERT OR IGNORE INTO categories (name, description) VALUES ('Boissons gazeuses', 'Sodas et boissons gazeuses')")
        .execute(&mut **tx).await?;
    let c_soda: i64 =
        sqlx::query_scalar("SELECT id FROM categories WHERE name = 'Boissons gazeuses'")
            .fetch_one(&mut **tx)
            .await?;

    sqlx::query("INSERT OR IGNORE INTO categories (name, description) VALUES ('Eaux minérales', 'Eaux plates et gazeuses')")
        .execute(&mut **tx).await?;
    let c_eau: i64 = sqlx::query_scalar("SELECT id FROM categories WHERE name = 'Eaux minérales'")
        .fetch_one(&mut **tx)
        .await?;

    sqlx::query("INSERT OR IGNORE INTO categories (name, description) VALUES ('Jus & Énergisants', 'Jus de fruits, nectars et boissons énergisantes')")
        .execute(&mut **tx).await?;
    let c_jus: i64 =
        sqlx::query_scalar("SELECT id FROM categories WHERE name = 'Jus & Énergisants'")
            .fetch_one(&mut **tx)
            .await?;

    // --- Suppliers ---
    sqlx::query(
        "INSERT INTO suppliers (code, name, company_name, phone, address, payment_terms_days) VALUES ('FRN-001', 'Brasserie Centrale (SOLIBRA)', 'SOLIBRA SA', '+225 27 21 21 00 00', 'Treichville Zone 3', 30)",
    ).execute(&mut **tx).await?;
    let s_solibra: i64 = sqlx::query_scalar("SELECT id FROM suppliers WHERE code = 'FRN-001'")
        .fetch_one(&mut **tx)
        .await?;

    sqlx::query(
        "INSERT INTO suppliers (code, name, company_name, phone, address, payment_terms_days) VALUES ('FRN-002', 'Sources Minérales Réunies', 'SMR Distribution', '+225 27 22 44 10 00', 'Bonoua Route Principale', 15)",
    ).execute(&mut **tx).await?;
    let _s_celeste: i64 = sqlx::query_scalar("SELECT id FROM suppliers WHERE code = 'FRN-002'")
        .fetch_one(&mut **tx)
        .await?;

    summary.suppliers_added = 2;

    // --- Returnable packaging types ---
    sqlx::query(
        "INSERT INTO returnable_packaging_types (code, name, producer, kind, description, deposit_value) VALUES ('EMB-CAS24', 'Casier plastique 24 trous', 'SOLIBRA', 'crate', 'Casier standard 24 emplacements', 2500)",
    ).execute(&mut **tx).await?;
    let r_casier24: i64 =
        sqlx::query_scalar("SELECT id FROM returnable_packaging_types WHERE code = 'EMB-CAS24'")
            .fetch_one(&mut **tx)
            .await?;

    sqlx::query(
        "INSERT INTO returnable_packaging_types (code, name, producer, kind, description, deposit_value) VALUES ('EMB-BTL65', 'Bouteille verre 65cl', 'SOLIBRA', 'bottle', 'Bouteille verre consignée 65cl', 150)",
    ).execute(&mut **tx).await?;
    let r_btl65: i64 =
        sqlx::query_scalar("SELECT id FROM returnable_packaging_types WHERE code = 'EMB-BTL65'")
            .fetch_one(&mut **tx)
            .await?;

    sqlx::query(
        "INSERT INTO returnable_packaging_types (code, name, producer, kind, description, deposit_value) VALUES ('EMB-CAS12', 'Casier plastique 12 trous', 'SOLIBRA', 'crate', 'Casier standard 12 grandes bouteilles', 2000)",
    ).execute(&mut **tx).await?;
    let _r_casier12: i64 =
        sqlx::query_scalar("SELECT id FROM returnable_packaging_types WHERE code = 'EMB-CAS12'")
            .fetch_one(&mut **tx)
            .await?;

    summary.returnables_added = 3;

    // --- Initial returnable stock ---
    sqlx::query("INSERT INTO returnable_stock_balances (packaging_id, quantity) VALUES (?, 180)")
        .bind(r_casier24)
        .execute(&mut **tx)
        .await?;
    sqlx::query("INSERT INTO returnable_stock_movements (request_key, packaging_id, movement_type, quantity, stock_before, stock_after, reason, reference_document) VALUES ('init-ret-cas24', ?, 'initial', 180, 0, 180, 'Stock initial de démonstration', 'INIT-DEMO')").bind(r_casier24).execute(&mut **tx).await?;

    sqlx::query("INSERT INTO returnable_stock_balances (packaging_id, quantity) VALUES (?, 4320)")
        .bind(r_btl65)
        .execute(&mut **tx)
        .await?;
    sqlx::query("INSERT INTO returnable_stock_movements (request_key, packaging_id, movement_type, quantity, stock_before, stock_after, reason, reference_document) VALUES ('init-ret-btl65', ?, 'initial', 4320, 0, 4320, 'Stock initial de démonstration', 'INIT-DEMO')").bind(r_btl65).execute(&mut **tx).await?;

    sqlx::query("INSERT INTO returnable_stock_balances (packaging_id, quantity) VALUES (?, 95)")
        .bind(_r_casier12)
        .execute(&mut **tx)
        .await?;
    sqlx::query("INSERT INTO returnable_stock_movements (request_key, packaging_id, movement_type, quantity, stock_before, stock_after, reason, reference_document) VALUES ('init-ret-cas12', ?, 'initial', 95, 0, 95, 'Stock initial de démonstration', 'INIT-DEMO')").bind(_r_casier12).execute(&mut **tx).await?;

    // --- Products ---
    // Product 1: Flag 65cl
    sqlx::query(
        "INSERT INTO products (reference, barcode, name, brand, category_id, supplier_id, base_unit, stock_milli, min_stock_milli, max_stock_milli, average_cost_num, average_cost_den, purchase_price, wholesale_price, semi_wholesale_price, retail_price)
         VALUES ('PROD-2026-00001', '3250001001011', 'Bière Flag Spéciale 65cl', 'Flag', ?, ?, 'bouteille', 480000, 120000, 1200000, '450', '1', 450, 500, 550, 600)",
    ).bind(c_biere).bind(s_solibra).execute(&mut **tx).await?;
    let p_flag: i64 =
        sqlx::query_scalar("SELECT id FROM products WHERE reference = 'PROD-2026-00001'")
            .fetch_one(&mut **tx)
            .await?;

    sqlx::query(
        "INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, barcode, allow_fraction)
         VALUES (?, 'bouteille', 'bouteille', 1000, 450, 500, 550, 600, '3250001001011-B', 0)",
    ).bind(p_flag).execute(&mut **tx).await?;
    let pkg_flag_btl: i64 = sqlx::query_scalar(
        "SELECT id FROM product_packagings WHERE product_id = ? AND name = 'bouteille'",
    )
    .bind(p_flag)
    .fetch_one(&mut **tx)
    .await?;

    sqlx::query(
        "INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, barcode, allow_fraction)
         VALUES (?, 'casier', 'bouteille', 24000, 10800, 11800, 12500, 13500, '3250001001011-C', 0)",
    ).bind(p_flag).execute(&mut **tx).await?;
    let pkg_flag_cas: i64 = sqlx::query_scalar(
        "SELECT id FROM product_packagings WHERE product_id = ? AND name = 'casier'",
    )
    .bind(p_flag)
    .fetch_one(&mut **tx)
    .await?;

    sqlx::query(
        "INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, 'deposit')",
    )
    .bind(pkg_flag_btl)
    .execute(&mut **tx)
    .await?;
    sqlx::query("INSERT INTO deposit_packaging_components (packaging_id, returnable_id, pieces_per_pack) VALUES (?, ?, 1)").bind(pkg_flag_btl).bind(r_btl65).execute(&mut **tx).await?;
    sqlx::query(
        "INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, 'deposit')",
    )
    .bind(pkg_flag_cas)
    .execute(&mut **tx)
    .await?;
    sqlx::query("INSERT INTO deposit_packaging_components (packaging_id, returnable_id, pieces_per_pack) VALUES (?, ?, 1)").bind(pkg_flag_cas).bind(r_casier24).execute(&mut **tx).await?;
    sqlx::query("INSERT INTO deposit_packaging_components (packaging_id, returnable_id, pieces_per_pack) VALUES (?, ?, 24)").bind(pkg_flag_cas).bind(r_btl65).execute(&mut **tx).await?;

    // Product 2: Bock 65cl
    sqlx::query(
        "INSERT INTO products (reference, barcode, name, brand, category_id, supplier_id, base_unit, stock_milli, min_stock_milli, max_stock_milli, average_cost_num, average_cost_den, purchase_price, wholesale_price, semi_wholesale_price, retail_price)
         VALUES ('PROD-2026-00002', '3250001001028', 'Bock Solibra 65cl', 'Solibra', ?, ?, 'bouteille', 288000, 72000, 960000, '400', '1', 400, 450, 475, 500)",
    ).bind(c_biere).bind(s_solibra).execute(&mut **tx).await?;
    let p_bock: i64 =
        sqlx::query_scalar("SELECT id FROM products WHERE reference = 'PROD-2026-00002'")
            .fetch_one(&mut **tx)
            .await?;

    sqlx::query(
        "INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, barcode, allow_fraction)
         VALUES (?, 'bouteille', 'bouteille', 1000, 400, 450, 475, 500, '3250001001028-B', 0)",
    ).bind(p_bock).execute(&mut **tx).await?;
    let pkg_bock_btl: i64 = sqlx::query_scalar(
        "SELECT id FROM product_packagings WHERE product_id = ? AND name = 'bouteille'",
    )
    .bind(p_bock)
    .fetch_one(&mut **tx)
    .await?;

    sqlx::query(
        "INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, barcode, allow_fraction)
         VALUES (?, 'casier', 'bouteille', 12000, 4800, 5200, 5500, 6000, '3250001001028-C', 0)",
    ).bind(p_bock).execute(&mut **tx).await?;
    let pkg_bock_cas: i64 = sqlx::query_scalar(
        "SELECT id FROM product_packagings WHERE product_id = ? AND name = 'casier'",
    )
    .bind(p_bock)
    .fetch_one(&mut **tx)
    .await?;

    sqlx::query(
        "INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, 'deposit')",
    )
    .bind(pkg_bock_btl)
    .execute(&mut **tx)
    .await?;
    sqlx::query("INSERT INTO deposit_packaging_components (packaging_id, returnable_id, pieces_per_pack) VALUES (?, ?, 1)").bind(pkg_bock_btl).bind(r_btl65).execute(&mut **tx).await?;
    sqlx::query(
        "INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, 'deposit')",
    )
    .bind(pkg_bock_cas)
    .execute(&mut **tx)
    .await?;
    sqlx::query("INSERT INTO deposit_packaging_components (packaging_id, returnable_id, pieces_per_pack) VALUES (?, ?, 1)").bind(pkg_bock_cas).bind(_r_casier12).execute(&mut **tx).await?;
    sqlx::query("INSERT INTO deposit_packaging_components (packaging_id, returnable_id, pieces_per_pack) VALUES (?, ?, 12)").bind(pkg_bock_cas).bind(r_btl65).execute(&mut **tx).await?;

    // Product 3: Coca-Cola 33cl
    sqlx::query(
        "INSERT INTO products (reference, barcode, name, brand, category_id, supplier_id, base_unit, stock_milli, min_stock_milli, max_stock_milli, average_cost_num, average_cost_den, purchase_price, wholesale_price, semi_wholesale_price, retail_price)
         VALUES ('PROD-2026-00003', '5449000000996', 'Coca-Cola Original 33cl', 'Coca-Cola', ?, ?, 'canette', 720000, 144000, 2400000, '320', '1', 320, 375, 400, 450)",
    ).bind(c_soda).bind(s_solibra).execute(&mut **tx).await?;
    let p_coca: i64 =
        sqlx::query_scalar("SELECT id FROM products WHERE reference = 'PROD-2026-00003'")
            .fetch_one(&mut **tx)
            .await?;

    sqlx::query(
        "INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, barcode, allow_fraction)
         VALUES (?, 'canette', 'canette', 1000, 320, 375, 400, 450, '5449000000996-U', 0)",
    ).bind(p_coca).execute(&mut **tx).await?;
    let pkg_coca_can: i64 = sqlx::query_scalar(
        "SELECT id FROM product_packagings WHERE product_id = ? AND name = 'canette'",
    )
    .bind(p_coca)
    .fetch_one(&mut **tx)
    .await?;

    sqlx::query(
        "INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, barcode, allow_fraction)
         VALUES (?, 'carton', 'canette', 24000, 7680, 8800, 9200, 10000, '5449000000996-K', 0)",
    ).bind(p_coca).execute(&mut **tx).await?;
    let pkg_coca_cart: i64 = sqlx::query_scalar(
        "SELECT id FROM product_packagings WHERE product_id = ? AND name = 'carton'",
    )
    .bind(p_coca)
    .fetch_one(&mut **tx)
    .await?;

    sqlx::query("INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, 'none')")
        .bind(pkg_coca_can)
        .execute(&mut **tx)
        .await?;
    sqlx::query("INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, 'none')")
        .bind(pkg_coca_cart)
        .execute(&mut **tx)
        .await?;

    // Product 4: Eau Céleste 1.5L
    sqlx::query(
        "INSERT INTO products (reference, barcode, name, brand, category_id, supplier_id, base_unit, stock_milli, min_stock_milli, max_stock_milli, average_cost_num, average_cost_den, purchase_price, wholesale_price, semi_wholesale_price, retail_price)
         VALUES ('PROD-2026-00004', '6181100400015', 'Eau Minérale Céleste 1.5L', 'Céleste', ?, ?, 'bouteille', 600000, 120000, 1800000, '225', '1', 225, 250, 275, 300)",
    ).bind(c_eau).bind(_s_celeste).execute(&mut **tx).await?;
    let p_eau: i64 =
        sqlx::query_scalar("SELECT id FROM products WHERE reference = 'PROD-2026-00004'")
            .fetch_one(&mut **tx)
            .await?;

    sqlx::query(
        "INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, barcode, allow_fraction)
         VALUES (?, 'bouteille', 'bouteille', 1000, 225, 250, 275, 300, '6181100400015-B', 0)",
    ).bind(p_eau).execute(&mut **tx).await?;
    let pkg_eau_btl: i64 = sqlx::query_scalar(
        "SELECT id FROM product_packagings WHERE product_id = ? AND name = 'bouteille'",
    )
    .bind(p_eau)
    .fetch_one(&mut **tx)
    .await?;

    sqlx::query(
        "INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, barcode, allow_fraction)
         VALUES (?, 'pack', 'bouteille', 6000, 1350, 1500, 1600, 1800, '6181100400015-P', 0)",
    ).bind(p_eau).execute(&mut **tx).await?;
    let pkg_eau_pack: i64 = sqlx::query_scalar(
        "SELECT id FROM product_packagings WHERE product_id = ? AND name = 'pack'",
    )
    .bind(p_eau)
    .fetch_one(&mut **tx)
    .await?;

    sqlx::query("INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, 'none')")
        .bind(pkg_eau_btl)
        .execute(&mut **tx)
        .await?;
    sqlx::query("INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, 'none')")
        .bind(pkg_eau_pack)
        .execute(&mut **tx)
        .await?;

    // Product 5: Malta Guinness 33cl
    sqlx::query(
        "INSERT INTO products (reference, barcode, name, brand, category_id, supplier_id, base_unit, stock_milli, min_stock_milli, max_stock_milli, average_cost_num, average_cost_den, purchase_price, wholesale_price, semi_wholesale_price, retail_price)
         VALUES ('PROD-2026-00005', '6181100800129', 'Malta Guinness 33cl', 'Guinness', ?, ?, 'canette', 48000, 72000, 720000, '380', '1', 380, 425, 450, 500)",
    ).bind(c_jus).bind(s_solibra).execute(&mut **tx).await?;
    let p_malta: i64 =
        sqlx::query_scalar("SELECT id FROM products WHERE reference = 'PROD-2026-00005'")
            .fetch_one(&mut **tx)
            .await?;

    sqlx::query(
        "INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, barcode, allow_fraction)
         VALUES (?, 'canette', 'canette', 1000, 380, 425, 450, 500, '6181100800129-U', 0)",
    ).bind(p_malta).execute(&mut **tx).await?;
    let pkg_malta_can: i64 = sqlx::query_scalar(
        "SELECT id FROM product_packagings WHERE product_id = ? AND name = 'canette'",
    )
    .bind(p_malta)
    .fetch_one(&mut **tx)
    .await?;

    sqlx::query(
        "INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, barcode, allow_fraction)
         VALUES (?, 'pack', 'canette', 6000, 2280, 2500, 2650, 2900, '6181100800129-P', 0)",
    ).bind(p_malta).execute(&mut **tx).await?;
    let pkg_malta_pack: i64 = sqlx::query_scalar(
        "SELECT id FROM product_packagings WHERE product_id = ? AND name = 'pack'",
    )
    .bind(p_malta)
    .fetch_one(&mut **tx)
    .await?;

    sqlx::query(
        "INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, barcode, allow_fraction)
         VALUES (?, 'carton', 'canette', 24000, 9120, 9800, 10400, 11500, '6181100800129-K', 0)",
    ).bind(p_malta).execute(&mut **tx).await?;
    let pkg_malta_cart: i64 = sqlx::query_scalar(
        "SELECT id FROM product_packagings WHERE product_id = ? AND name = 'carton'",
    )
    .bind(p_malta)
    .fetch_one(&mut **tx)
    .await?;

    sqlx::query("INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, 'none')")
        .bind(pkg_malta_can)
        .execute(&mut **tx)
        .await?;
    sqlx::query("INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, 'none')")
        .bind(pkg_malta_pack)
        .execute(&mut **tx)
        .await?;
    sqlx::query("INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, 'none')")
        .bind(pkg_malta_cart)
        .execute(&mut **tx)
        .await?;

    summary.products_added = 5;

    // --- Document sequences ---
    let year = chrono::Utc::now().format("%Y").to_string();
    sqlx::query(
        "INSERT INTO document_sequences (prefix, year, last_number) VALUES ('PROD', ?, 5)
         ON CONFLICT(prefix, year) DO UPDATE SET last_number = MAX(last_number, 5)",
    )
    .bind(&year)
    .execute(&mut **tx)
    .await?;

    // --- Clients ---
    sqlx::query(
        "INSERT INTO clients (code, name, client_type, phone, address, city) VALUES ('CLI-001', 'Client Comptoir', 'particulier', '', 'Vente directe au dépôt', 'Abidjan')",
    ).execute(&mut **tx).await?;
    let cl_comptoir: i64 = sqlx::query_scalar("SELECT id FROM clients WHERE code = 'CLI-001'")
        .fetch_one(&mut **tx)
        .await?;
    sqlx::query("INSERT INTO client_credit_settings (client_id, policy, credit_limit, payment_terms_days) VALUES (?, 'forbidden', NULL, 0)").bind(cl_comptoir).execute(&mut **tx).await?;

    sqlx::query(
        "INSERT INTO clients (code, name, client_type, phone, address, city) VALUES ('CLI-002', 'Maquis Le Prestige', 'professionnel', '+225 05 44 12 88 90', 'Rue des Jardins, Cocody', 'Abidjan')",
    ).execute(&mut **tx).await?;
    let cl_maquis: i64 = sqlx::query_scalar("SELECT id FROM clients WHERE code = 'CLI-002'")
        .fetch_one(&mut **tx)
        .await?;
    sqlx::query("INSERT INTO client_credit_settings (client_id, policy, credit_limit, payment_terms_days) VALUES (?, 'limited', 500000, 15)").bind(cl_maquis).execute(&mut **tx).await?;

    sqlx::query(
        "INSERT INTO clients (code, name, client_type, phone, address, city) VALUES ('CLI-003', 'Hôtel La Lagune', 'professionnel', '+225 01 02 33 44 55', 'Boulevard de Marseille', 'Abidjan')",
    ).execute(&mut **tx).await?;
    let cl_hotel: i64 = sqlx::query_scalar("SELECT id FROM clients WHERE code = 'CLI-003'")
        .fetch_one(&mut **tx)
        .await?;
    sqlx::query("INSERT INTO client_credit_settings (client_id, policy, credit_limit, payment_terms_days) VALUES (?, 'unlimited', NULL, 30)").bind(cl_hotel).execute(&mut **tx).await?;

    summary.clients_added = 3;
    summary.seeded = true;

    Ok(summary)
}
