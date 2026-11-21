use std::path::PathBuf;
use std::sync::Arc;

use depotpro_core::application::{cash, consignments, products, purchases, sales};
use depotpro_core::infrastructure::backup::{self, RestoreFailureHook};
use depotpro_core::infrastructure::db::DepotDb;
use tokio::sync::RwLock;

struct TempDirGuard(PathBuf);

impl TempDirGuard {
    fn new(label: &str) -> Self {
        let dir = std::env::temp_dir().join(format!(
            "depotpro_lot5_rust_{}_{}",
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

async fn seed_all_14_entities(db: &DepotDb) {
    let sup = purchases::create_supplier(
        db,
        purchases::CreateSupplierInput {
            name: "Fournisseur Rust Lot 5".to_string(),
            company_name: None,
            phone: "+2250102030405".to_string(),
            address: None,
            email: None,
            contact_person: None,
            payment_terms_days: Some(30),
        },
    )
    .await
    .unwrap();

    let prod = products::create_product(
        db,
        products::CreateProductInput {
            name: "Bière Rust Lot 5".to_string(),
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
            category_id: 1,
            supplier_id: Some(sup.id),
            description: None,
            base_unit: "bouteille".to_string(),
            initial_stock: Some("100".to_string()),
            min_stock: Some("10".to_string()),
            max_stock: None,
            purchase_price: Some(500),
            wholesale_price: Some(650),
            semi_wholesale_price: None,
            retail_price: Some(700),
            image_path: None,
            packagings: None,
        },
    )
    .await
    .unwrap();

    let pkg_id = prod.packagings[0].id;

    let cli = sales::create_client(
        db,
        sales::CreateClientInput {
            name: "Maquis Rust Lot 5".to_string(),
            client_type: "professionnel".to_string(),
            phone: None,
            address: None,
            city: None,
            email: None,
            contact_person: None,
            credit_policy: "limited".to_string(),
            credit_limit: Some(200_000),
            payment_terms_days: Some(15),
        },
    )
    .await
    .unwrap();

    cash::open_cash_session(
        db,
        cash::OpenCashInput {
            opening_cash: 100_000,
            request_key: "rust-lot5-cash-open".to_string(),
        },
    )
    .await
    .unwrap();

    // Achat + Réception + Règlement dette fournisseur
    let po = purchases::create_purchase_order(
        db,
        purchases::CreatePurchaseOrderInput {
            request_key: "rust-lot5-po".to_string(),
            supplier_id: sup.id,
            expected_date: None,
            notes: None,
            lines: vec![purchases::PurchaseOrderLineInput {
                product_id: prod.id,
                packaging_id: pkg_id,
                quantity: "10".to_string(),
                unit_price: 500,
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
        db,
        po.id,
        purchases::ReceivePurchaseOrderInput {
            request_key: "rust-lot5-rec".to_string(),
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

    let debts = purchases::list_supplier_debts(db).await.unwrap();
    purchases::pay_supplier_debt(
        db,
        debts[0].id,
        purchases::PaySupplierDebtInput {
            method_code: "cash".to_string(),
            amount: 2_500,
            request_key: "rust-lot5-pay-debt".to_string(),
            note: None,
        },
    )
    .await
    .unwrap();

    // Consignations
    let ret_type = consignments::create_returnable_type(
        db,
        consignments::CreateReturnableTypeInput {
            code: "CAS-RL5".to_string(),
            name: "Casier Rust Lot 5".to_string(),
            producer: "SOLIBRA".to_string(),
            kind: "crate".to_string(),
            deposit_value: 3_500,
            initial_stock: Some(15),
            description: None,
        },
    )
    .await
    .unwrap();
    consignments::adjust_returnable_stock(
        db,
        consignments::AdjustReturnableStockInput {
            packaging_id: ret_type.id,
            movement_type: "entry".to_string(),
            quantity: 5,
            reason: "Approvisionnement Rust Lot 5".to_string(),
            request_key: "rust-lot5-cons".to_string(),
        },
    )
    .await
    .unwrap();

    // Vente comptant + retour partiel
    let sale_cash = sales::create_sale(
        db,
        sales::CreateSaleInput {
            request_key: "rust-lot5-sale-cash".to_string(),
            client_id: None,
            sale_type: "cash".to_string(),
            price_tier: "retail".to_string(),
            discount_amount: None,
            notes: None,
            lines: vec![sales::CreateSaleLineInput {
                product_id: prod.id,
                packaging_id: pkg_id,
                quantity: "4".to_string(),
                discount_amount: None,
            }],
            payments: vec![sales::PaymentPartInput {
                method_code: "cash".to_string(),
                amount: 2_800,
            }],
            due_date: None,
        },
    )
    .await
    .unwrap();

    sales::create_sale_return(
        db,
        sale_cash.sale.id,
        sales::CreateSaleReturnInput {
            request_key: "rust-lot5-ret".to_string(),
            reason: "Retour partiel Lot 5".to_string(),
            restock_approved: true,
            refund_method_code: "cash".to_string(),
            lines: vec![sales::SaleReturnLineInput {
                sale_line_id: sale_cash.lines[0].id,
                base_quantity: "1".to_string(),
            }],
        },
    )
    .await
    .unwrap();

    // Vente à crédit + règlement partiel créance
    let sale_credit = sales::create_sale(
        db,
        sales::CreateSaleInput {
            request_key: "rust-lot5-sale-credit".to_string(),
            client_id: Some(cli.id),
            sale_type: "credit".to_string(),
            price_tier: "retail".to_string(),
            discount_amount: None,
            notes: None,
            lines: vec![sales::CreateSaleLineInput {
                product_id: prod.id,
                packaging_id: pkg_id,
                quantity: "8".to_string(),
                discount_amount: None,
            }],
            payments: vec![],
            due_date: None,
        },
    )
    .await
    .unwrap();

    let recs = cash::list_receivables(db).await.unwrap();
    let rec = recs
        .into_iter()
        .find(|r| r.sale_id == sale_credit.sale.id)
        .unwrap();
    cash::pay_receivable(
        db,
        rec.id,
        cash::PayReceivableInput {
            request_key: "rust-lot5-pay-rec".to_string(),
            note: None,
            parts: vec![sales::PaymentPartInput {
                method_code: "wave".to_string(),
                amount: 1_500,
            }],
        },
    )
    .await
    .unwrap();

    // Dépense
    cash::create_expense(
        db,
        cash::CreateExpenseInput {
            request_key: "rust-lot5-exp".to_string(),
            category: "Carburant".to_string(),
            amount: 1_000,
            method_code: "cash".to_string(),
            beneficiary: None,
            notes: Some("Dépense Rust Lot 5".to_string()),
            receipt_path: None,
            expense_date: None,
        },
    )
    .await
    .unwrap();
}

#[tokio::test]
async fn lot5_read_only_verify_sha256_compatibility_and_path_security() {
    let dir = TempDirGuard::new("verify_sec");
    let db_path = dir.0.join("active.db");
    let backup_dir = dir.0.join("Sauvegardes");

    let db = DepotDb::connect(&db_path).await.unwrap();
    seed_all_14_entities(&db).await;

    let bkp = backup::create_backup_summary(&db, &backup_dir)
        .await
        .unwrap();
    let (_, bkp_path) = backup::resolve_safe_backup_path(&backup_dir, &bkp.name).unwrap();
    let sha_before = backup::sha256_file(&bkp_path).unwrap();
    assert_eq!(bkp.sha256.as_deref(), Some(sha_before.as_str()));

    // Lecture seule réelle : toute tentative d'écriture échoue
    let ro_pool = backup::open_backup_read_only(&bkp_path).await.unwrap();
    let write_res = sqlx::query("UPDATE app_settings SET company_name = 'HACK' WHERE id = 1")
        .execute(&ro_pool)
        .await;
    assert!(write_res.is_err());
    ro_pool.close().await;

    let check = backup::verify_backup(&backup_dir, &bkp.name).await.unwrap();
    assert_eq!(check.integrity, "ok");
    assert_eq!(check.foreign_key_errors, 0);
    assert!(check.compatible);
    assert_eq!(check.compatibility_reason, None);
    assert_eq!(check.sha256, sha_before);

    let counts = check.counts.unwrap();
    assert!(counts.products >= 1);
    assert!(counts.stock_movements >= 1);
    assert!(counts.clients >= 1);
    assert!(counts.suppliers >= 1);
    assert!(counts.sales >= 2);
    assert!(counts.sales_returns >= 1);
    assert!(counts.customer_receivables >= 1);
    assert!(counts.purchase_orders >= 1);
    assert!(counts.purchase_receipts >= 1);
    assert!(counts.supplier_debts >= 1);
    assert!(counts.returnable_stock_movements >= 1);
    assert!(counts.cash_movements >= 1);
    assert!(counts.expenses >= 1);
    assert!(counts.audit_logs >= 1);

    // SHA-256 strictement identique avant/après + zéro sidecar WAL/SHM
    assert_eq!(backup::sha256_file(&bkp_path).unwrap(), sha_before);
    assert!(!backup_dir.join(format!("{}-wal", bkp.name)).exists());
    assert!(!backup_dir.join(format!("{}-shm", bkp.name)).exists());

    // Archive corrompue (mauvais en-tête + pages corrompues)
    let bad_hdr = "depotpro_backup_20261117020202_badhdr.db";
    std::fs::write(backup_dir.join(bad_hdr), b"NOT_SQLITE").unwrap();
    assert!(backup::verify_backup(&backup_dir, bad_hdr).await.is_err());
    let db_lock = Arc::new(RwLock::new(db.clone()));
    assert!(
        backup::restore_and_reconnect(&db_lock, &backup_dir, bad_hdr)
            .await
            .is_err()
    );

    let corrupt_name = "depotpro_backup_20261117020203_corrup.db";
    let corrupt_path = backup_dir.join(corrupt_name);
    let mut raw = std::fs::read(&bkp_path).unwrap();
    let end = raw.len().min(16384);
    if end > 4096 {
        raw[4096..end].fill(0xFF);
    }
    std::fs::write(&corrupt_path, &raw).unwrap();
    let v_corrupt = backup::verify_backup(&backup_dir, corrupt_name).await;
    if let Ok(dto) = &v_corrupt {
        assert!(!dto.compatible);
    }
    assert!(
        backup::restore_and_reconnect(&db_lock, &backup_dir, corrupt_name)
            .await
            .is_err()
    );

    // Archive incompatible (schema_version futur = 99)
    let future_name = "depotpro_backup_20261117020204_future.db";
    let future_path = backup_dir.join(future_name);
    std::fs::copy(&bkp_path, &future_path).unwrap();
    let fdb = DepotDb::connect(&future_path).await.unwrap();
    sqlx::query("INSERT INTO schema_version (version, name) VALUES (99, 'future_v99')")
        .execute(&fdb.pool)
        .await
        .unwrap();
    fdb.pool.close().await;
    let v_future = backup::verify_backup(&backup_dir, future_name)
        .await
        .unwrap();
    assert!(!v_future.compatible);
    assert_eq!(v_future.schema_version, 99);
    assert!(
        backup::restore_and_reconnect(&db_lock, &backup_dir, future_name)
            .await
            .is_err()
    );

    // Chemins non autorisés et liens symboliques
    for invalid in [
        "../active.db",
        "sub/depotpro_backup_20261117020204_aaaaaa.db",
        "active.db",
    ] {
        assert!(backup::resolve_safe_backup_path(&backup_dir, invalid).is_err());
        assert!(backup::verify_backup(&backup_dir, invalid).await.is_err());
        assert!(backup::read_backup_bytes(&backup_dir, invalid).is_err());
        assert!(
            backup::restore_and_reconnect(&db_lock, &backup_dir, invalid)
                .await
                .is_err()
        );
    }

    #[cfg(unix)]
    {
        let sym_name = "depotpro_backup_20261117020205_symlnk.db";
        let sym_path = backup_dir.join(sym_name);
        std::os::unix::fs::symlink(&db_path, &sym_path).unwrap();
        assert!(backup::verify_backup(&backup_dir, sym_name).await.is_err());
        assert!(backup::read_backup_bytes(&backup_dir, sym_name).is_err());
        assert!(
            backup::restore_and_reconnect(&db_lock, &backup_dir, sym_name)
                .await
                .is_err()
        );
        let listed = backup::list_backups(&backup_dir).unwrap();
        assert!(!listed.iter().any(|x| x.name == sym_name));
    }

    db_lock.read().await.pool.close().await;
}

#[tokio::test]
async fn lot5_atomic_restore_failure_recovery_and_restart_persistence() {
    let dir = TempDirGuard::new("restore_recovery");
    let db_path = dir.0.join("active.db");
    let backup_dir = dir.0.join("Sauvegardes");

    let db = DepotDb::connect(&db_path).await.unwrap();
    seed_all_14_entities(&db).await;

    let bkp_t0 = backup::create_backup_summary(&db, &backup_dir)
        .await
        .unwrap();
    let v_t0 = backup::verify_backup(&backup_dir, &bkp_t0.name)
        .await
        .unwrap();
    let counts_t0 = v_t0.counts.unwrap();

    // Mutation post-T0
    products::create_product(
        &db,
        products::CreateProductInput {
            name: "Produit Post-T0 Rust".to_string(),
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
            category_id: 1,
            supplier_id: None,
            description: None,
            base_unit: "bouteille".to_string(),
            initial_stock: Some("12".to_string()),
            min_stock: Some("2".to_string()),
            max_stock: None,
            purchase_price: Some(400),
            wholesale_price: None,
            semi_wholesale_price: None,
            retail_price: Some(600),
            image_path: None,
            packagings: None,
        },
    )
    .await
    .unwrap();

    let db_lock = Arc::new(RwLock::new(db));

    // Simuler interruption avant remplacement, échec reconnexion et échec post-verify :
    // le pool actif DOIT toujours être réouvert automatiquement et les données pré-restauration intactes.
    for hook in [
        RestoreFailureHook::BeforeAtomicReplace,
        RestoreFailureHook::BeforeReconnect,
        RestoreFailureHook::AfterReconnectPostVerify,
    ] {
        let err =
            backup::restore_and_reconnect_with_hook(&db_lock, &backup_dir, &bkp_t0.name, hook)
                .await;
        assert!(err.is_err());

        let guard = db_lock.read().await;
        assert!(
            !guard.pool.is_closed(),
            "Le pool ne doit jamais rester fermé"
        );
        let after_fail = products::list_products(
            &guard,
            Some("Produit Post-T0 Rust"),
            None,
            false,
            false,
            1,
            20,
        )
        .await
        .unwrap();
        assert_eq!(after_fail.items.len(), 1);
    }

    // Restauration normale réussie
    let restored = backup::restore_and_reconnect(&db_lock, &backup_dir, &bkp_t0.name)
        .await
        .unwrap();
    assert_eq!(restored.restored, bkp_t0.name);
    assert_eq!(restored.integrity, "ok");
    assert_eq!(restored.foreign_key_errors, 0);
    assert_eq!(restored.counts.products, counts_t0.products);
    assert_eq!(restored.counts.sales, counts_t0.sales);
    assert_eq!(restored.counts.audit_logs, counts_t0.audit_logs + 1);

    // La sauvegarde de sécurité est conservée et contient bien Produit Post-T0 Rust
    let safety_v = backup::verify_backup(&backup_dir, &restored.safety_backup)
        .await
        .unwrap();
    assert!(safety_v.compatible);
    assert_eq!(safety_v.counts.unwrap().products, counts_t0.products + 1);

    {
        let guard = db_lock.read().await;
        let post_check = products::list_products(
            &guard,
            Some("Produit Post-T0 Rust"),
            None,
            false,
            false,
            1,
            20,
        )
        .await
        .unwrap();
        assert_eq!(post_check.items.len(), 0);
        guard.pool.close().await;
    }

    // Simulation de redémarrage complet sur le même fichier DB
    let reopened = DepotDb::connect(&db_path).await.unwrap();
    reopened.verify_integrity().await.unwrap();
    let reopened_counts = backup::collect_entity_counts(&reopened.pool).await.unwrap();
    assert_eq!(reopened_counts, restored.counts);
    reopened.pool.close().await;
}
