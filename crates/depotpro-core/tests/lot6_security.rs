use std::path::PathBuf;
use std::sync::Arc;

use chrono::{Duration, Utc};
use depotpro_core::application::auth::{
    self, CreateUserInput, Permission, Role, SessionConfig, SessionIdentity, SessionStore,
};
use depotpro_core::application::{cash, products, reports, sales};
use depotpro_core::error::CoreError;
use depotpro_core::infrastructure::{backup, db::DepotDb};
use tokio::sync::RwLock;

struct TempDirGuard(PathBuf);

impl TempDirGuard {
    fn new(label: &str) -> Self {
        let dir = std::env::temp_dir().join(format!(
            "depotpro_lot6_rust_{}_{}",
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
async fn lot6_session_expiry_idle_max_ttl_and_revocation() {
    let t0 = Utc::now();
    let cfg = SessionConfig {
        idle_timeout: Duration::seconds(60),
        max_lifetime: Duration::seconds(300),
    };
    let mut store = SessionStore::with_config(cfg);

    let s1 = store.issue_session_at(SessionIdentity::owner(), t0);
    let s2 = store.issue_session_at(
        SessionIdentity::from_role("2", "caisse1", "Caissier 1", Role::Cashier),
        t0,
    );
    assert_eq!(store.active_count(), 2);

    // Commande sans token -> erreur Unauthorized
    assert!(matches!(
        store.validate_and_touch("", t0),
        Err(CoreError::Unauthorized(_))
    ));

    // Activité régulière maintient la session s1 active
    let t_30 = t0 + Duration::seconds(30);
    assert!(store.validate_and_touch(&s1.token, t_30).is_ok());

    // Expiration d'inactivité pour s2 après > 60s sans activité
    let t_65 = t0 + Duration::seconds(65);
    assert!(matches!(
        store.validate_and_touch(&s2.token, t_65),
        Err(CoreError::Unauthorized(_))
    ));
    assert_eq!(store.active_count(), 1);

    // Expiration TTL maximale même avec activité continue
    let mut cursor = t_30;
    for _ in 0..5 {
        cursor += Duration::seconds(45);
        assert!(store.validate_and_touch(&s1.token, cursor).is_ok());
    }
    let t_over_max = t0 + Duration::seconds(301);
    assert!(matches!(
        store.validate_and_touch(&s1.token, t_over_max),
        Err(CoreError::Unauthorized(_))
    ));
    assert_eq!(store.active_count(), 0);

    // Révocation immédiate au verrouillage
    let s3 = store.issue_session_at(SessionIdentity::owner(), t_over_max);
    assert!(store.revoke(&s3.token));
    assert!(matches!(
        store.validate_and_touch(&s3.token, t_over_max + Duration::seconds(1)),
        Err(CoreError::Unauthorized(_))
    ));
}

#[tokio::test]
async fn lot6_concurrent_pin_attempts_lockout_and_unlock() {
    let dir = TempDirGuard::new("pin_concurrency");
    let db_path = dir.0.join("lot6_pin.db");
    let db = Arc::new(DepotDb::connect(&db_path).await.unwrap());

    auth::setup_owner_pin(&db, "246810").await.unwrap();
    assert!(auth::verify_owner_pin(&db, "246810").await.is_ok());

    // 8 tentatives concurrentes avec PIN incorrect -> compteur atomique à 5 + RateLimited
    let mut handles = Vec::new();
    for _ in 0..8 {
        let db_clone = Arc::clone(&db);
        handles.push(tokio::spawn(async move {
            auth::verify_owner_pin(&db_clone, "000000").await
        }));
    }
    let mut rate_limited = 0usize;
    let mut unauthorized = 0usize;
    for h in handles {
        match h.await.unwrap() {
            Err(CoreError::RateLimited(_)) => rate_limited += 1,
            Err(CoreError::Unauthorized(_)) => unauthorized += 1,
            other => panic!("Résultat inattendu lors d'attaques concurrentes : {other:?}"),
        }
    }
    assert_eq!(
        unauthorized, 5,
        "Exactement 5 tentatives doivent incrémenter jusqu'au verrou"
    );
    assert_eq!(
        rate_limited, 3,
        "Les 3 tentatives suivantes doivent être bloquées par le verrou"
    );

    let (attempts,): (i64,) =
        sqlx::query_as("SELECT failed_attempts FROM owner_security WHERE id = 1")
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert_eq!(attempts, 5);

    // Même un PIN valide échoue pendant le verrou
    assert!(matches!(
        auth::verify_owner_pin(&db, "246810").await,
        Err(CoreError::RateLimited(_))
    ));

    // Expiration du verrou -> déverrouillage & remise à zéro
    sqlx::query(
        "UPDATE owner_security SET locked_until = datetime('now', '-5 seconds') WHERE id = 1",
    )
    .execute(&db.pool)
    .await
    .unwrap();
    assert!(auth::verify_owner_pin(&db, "246810").await.is_ok());

    let (reset_attempts, locked_until): (i64, Option<String>) =
        sqlx::query_as("SELECT failed_attempts, locked_until FROM owner_security WHERE id = 1")
            .fetch_one(&db.pool)
            .await
            .unwrap();
    assert_eq!(reset_attempts, 0);
    assert_eq!(locked_until, None);
}

#[tokio::test]
async fn lot6_rbac_six_roles_permissions_and_audit_identity() {
    let dir = TempDirGuard::new("rbac");
    let db_path = dir.0.join("lot6_rbac.db");
    let db = DepotDb::connect(&db_path).await.unwrap();
    let owner = auth::setup_owner_pin(&db, "246810").await.unwrap();

    // Création des autres rôles
    let cashier_dto = auth::with_actor(
        owner.clone(),
        auth::create_user(
            &db,
            CreateUserInput {
                username: "caisse_r".to_string(),
                display_name: "Fatou Caisse".to_string(),
                role: Role::Cashier,
                pin: "112233".to_string(),
            },
        ),
    )
    .await
    .unwrap();
    let stock_dto = auth::with_actor(
        owner.clone(),
        auth::create_user(
            &db,
            CreateUserInput {
                username: "stock_r".to_string(),
                display_name: "Moussa Stock".to_string(),
                role: Role::StockManager,
                pin: "334455".to_string(),
            },
        ),
    )
    .await
    .unwrap();

    let cashier = auth::verify_user_login(&db, Some("caisse_r"), "112233")
        .await
        .unwrap();
    let stock_mgr = auth::verify_user_login(&db, Some("stock_r"), "334455")
        .await
        .unwrap();
    let accountant =
        SessionIdentity::from_role("99", "compta_r", "Aissata Compta", Role::Accountant);
    let admin = SessionIdentity::from_role("98", "admin_r", "Karim Admin", Role::Admin);
    let manager = SessionIdentity::from_role("97", "resp_r", "Ibrahim Resp", Role::Manager);

    assert_eq!(cashier.role, Role::Cashier);
    assert_eq!(stock_mgr.role, Role::StockManager);
    assert!(admin.has_permission(Permission::SecurityManageUsers));
    assert!(!admin.has_permission(Permission::SecurityChangeOwnerPin));
    assert!(!admin.has_permission(Permission::CatalogDelete));
    assert!(owner.has_permission(Permission::CatalogDelete));
    assert!(manager.has_permission(Permission::BackupsCreate));
    assert!(!manager.has_permission(Permission::BackupsRestore));

    // Création produit puis vérification suppression réservée au Owner
    let cat_ok = auth::with_actor(
        owner.clone(),
        products::create_category(&db, "Bières Lot6", None),
    )
    .await
    .unwrap();
    let prod_del_target = auth::with_actor(
        owner.clone(),
        products::create_product(
            &db,
            products::CreateProductInput {
                name: "Lot6 Suppression Test".to_string(),
                brand: None,
                barcode: None,
                category_id: cat_ok.id,
                supplier_id: None,
                description: None,
                base_unit: "bouteille".to_string(),
                initial_stock: Some("0".to_string()),
                min_stock: Some("0".to_string()),
                max_stock: None,
                purchase_price: Some(300),
                wholesale_price: Some(400),
                semi_wholesale_price: Some(450),
                retail_price: Some(500),
                image_path: None,
                packagings: None,
            },
        ),
    )
    .await
    .unwrap();

    let denied_del_admin = auth::with_actor(
        admin.clone(),
        products::delete_product(&db, prod_del_target.id),
    )
    .await;
    assert!(matches!(denied_del_admin, Err(CoreError::Forbidden(_))));

    let denied_del_stock = auth::with_actor(
        stock_mgr.clone(),
        products::delete_product(&db, prod_del_target.id),
    )
    .await;
    assert!(matches!(denied_del_stock, Err(CoreError::Forbidden(_))));

    let owner_del = auth::with_actor(
        owner.clone(),
        products::delete_product(&db, prod_del_target.id),
    )
    .await
    .unwrap();
    assert!(owner_del.deleted);
    let del_actor_role: Option<String> = sqlx::query_scalar(
        "SELECT actor_role FROM audit_logs WHERE action = 'DELETE_PRODUCT' ORDER BY id DESC LIMIT 1",
    )
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(del_actor_role.as_deref(), Some("owner"));

    // Utilisateur sans permission -> CoreError::Forbidden
    let denied_settings = auth::with_actor(
        cashier.clone(),
        reports::update_settings(&db, Default::default()),
    )
    .await;
    assert!(matches!(denied_settings, Err(CoreError::Forbidden(_))));

    // Le logo partagé de l'application et des documents est réservé au propriétaire,
    // même si un administrateur dispose de SettingsWrite pour les autres paramètres.
    let test_logo = "data:image/png;base64,AAAA".to_string();
    let denied_logo_admin = auth::with_actor(
        admin.clone(),
        reports::update_settings(
            &db,
            reports::UpdateSettingsInput {
                logo_path: Some(Some(test_logo.clone())),
                ..Default::default()
            },
        ),
    )
    .await;
    assert!(matches!(denied_logo_admin, Err(CoreError::Forbidden(_))));
    let owner_logo = auth::with_actor(
        owner.clone(),
        reports::update_settings(
            &db,
            reports::UpdateSettingsInput {
                logo_path: Some(Some(test_logo)),
                ..Default::default()
            },
        ),
    )
    .await
    .unwrap();
    assert!(owner_logo.settings.logo_path.is_some());

    let denied_sale_for_stock = auth::with_actor(
        stock_mgr.clone(),
        sales::create_client(
            &db,
            sales::CreateClientInput {
                name: "Refusé".to_string(),
                client_type: "particulier".to_string(),
                phone: None,
                address: None,
                city: None,
                email: None,
                contact_person: None,
                credit_policy: "forbidden".to_string(),
                credit_limit: None,
                payment_terms_days: None,
            },
        ),
    )
    .await;
    assert!(matches!(
        denied_sale_for_stock,
        Err(CoreError::Forbidden(_))
    ));

    let denied_cat_for_accountant = auth::with_actor(
        accountant.clone(),
        products::create_category(&db, "Refusé", None),
    )
    .await;
    assert!(matches!(
        denied_cat_for_accountant,
        Err(CoreError::Forbidden(_))
    ));

    // Accès autorisé pour le bon rôle + traçabilité audit_logs
    auth::with_actor(
        cashier.clone(),
        cash::open_cash_session(
            &db,
            cash::OpenCashInput {
                opening_cash: 15_000,
                request_key: "lot6-rust-cash-1".to_string(),
            },
        ),
    )
    .await
    .unwrap();

    let (actor_id, actor_name, actor_role): (Option<String>, Option<String>, Option<String>) =
        sqlx::query_as(
            "SELECT actor_user_id, actor_name, actor_role
             FROM audit_logs
             WHERE action = 'OPEN_CASH'
             ORDER BY id DESC LIMIT 1",
        )
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(actor_id.as_deref(), Some(cashier.user_id.as_str()));
    assert_eq!(actor_name.as_deref(), Some("Fatou Caisse"));
    assert_eq!(actor_role.as_deref(), Some("cashier"));

    // Désactivation utilisateur
    let toggled = auth::with_actor(owner, auth::set_user_active(&db, cashier_dto.id, false))
        .await
        .unwrap();
    assert!(!toggled.active);
    assert!(stock_dto.active);
    assert!(matches!(
        auth::verify_user_login(&db, Some("caisse_r"), "112233").await,
        Err(CoreError::Unauthorized(_))
    ));
}

#[tokio::test]
async fn lot6_encrypted_backup_verify_and_restore_roundtrip() {
    let dir = TempDirGuard::new("encrypted_backup");
    let db_path = dir.0.join("lot6_main.db");
    let backup_dir = dir.0.join("backups");
    let db = DepotDb::connect(&db_path).await.unwrap();
    let owner = auth::setup_owner_pin(&db, "246810").await.unwrap();

    auth::with_actor(
        owner.clone(),
        sales::create_client(
            &db,
            sales::CreateClientInput {
                name: "Client Témoin Avant Sauvegarde".to_string(),
                client_type: "particulier".to_string(),
                phone: None,
                address: None,
                city: None,
                email: None,
                contact_person: None,
                credit_policy: "forbidden".to_string(),
                credit_limit: None,
                payment_terms_days: None,
            },
        ),
    )
    .await
    .unwrap();

    let enc = auth::with_actor(
        owner.clone(),
        backup::create_encrypted_backup(&db, &backup_dir, "CleDepotPro!2026"),
    )
    .await
    .unwrap();
    assert!(enc.encrypted);
    assert!(enc.name.ends_with(".dpbkp"));

    // Mauvaise clé -> erreur
    let bad_verify = auth::with_actor(
        owner.clone(),
        backup::verify_encrypted_backup(&backup_dir, &enc.name, "MauvaiseCle2026"),
    )
    .await;
    assert!(bad_verify.is_err());

    // Bonne clé -> OK
    let good_verify = auth::with_actor(
        owner.clone(),
        backup::verify_encrypted_backup(&backup_dir, &enc.name, "CleDepotPro!2026"),
    )
    .await
    .unwrap();
    assert_eq!(good_verify.integrity, "ok");
    assert_eq!(good_verify.foreign_key_errors, 0);
    assert!(good_verify.compatible);

    // Modification ultérieure de la base
    auth::with_actor(
        owner.clone(),
        sales::create_client(
            &db,
            sales::CreateClientInput {
                name: "Client À Annuler Par Restauration".to_string(),
                client_type: "particulier".to_string(),
                phone: None,
                address: None,
                city: None,
                email: None,
                contact_person: None,
                credit_policy: "forbidden".to_string(),
                credit_limit: None,
                payment_terms_days: None,
            },
        ),
    )
    .await
    .unwrap();

    let lock = Arc::new(RwLock::new(db));
    let restored = auth::with_actor(
        owner,
        backup::restore_encrypted_backup_and_reconnect(
            &lock,
            &backup_dir,
            &enc.name,
            "CleDepotPro!2026",
        ),
    )
    .await
    .unwrap();
    assert_eq!(restored.restored, enc.name);
    assert_eq!(restored.integrity, "ok");

    let db_guard = lock.read().await;
    let count_before: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM clients WHERE name = 'Client Témoin Avant Sauvegarde'",
    )
    .fetch_one(&db_guard.pool)
    .await
    .unwrap();
    let count_after: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM clients WHERE name = 'Client À Annuler Par Restauration'",
    )
    .fetch_one(&db_guard.pool)
    .await
    .unwrap();
    assert_eq!(count_before, 1);
    assert_eq!(count_after, 0);
}
