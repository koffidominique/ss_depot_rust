// ============================================================================
// Tests de sécurité Axum : allowlist Origin, rate-limiting & RBAC
// ============================================================================

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::RwLock;

use depotpro_core::application::auth::SessionStore;
use depotpro_core::infrastructure::db::DepotDb;

use crate::router::build_router;
use crate::security::is_allowed_origin;
use crate::state::{AppState, AuthRateLimiter};

use super::send_http;

#[test]
fn origin_allowlist_blocks_prefix_spoof_and_untrusted_proxy_headers() {
    assert!(is_allowed_origin(
        "http://localhost:3000",
        "127.0.0.1:3000",
        None,
        false,
        ""
    ));
    assert!(is_allowed_origin(
        "http://127.0.0.1:3100",
        "127.0.0.1:3000",
        None,
        false,
        ""
    ));
    assert!(is_allowed_origin(
        "http://[::1]:3000",
        "127.0.0.1:3000",
        None,
        false,
        ""
    ));
    assert!(!is_allowed_origin(
        "https://evil.example",
        "127.0.0.1:3000",
        None,
        false,
        ""
    ));
    // Contre les contournements de préfixe
    assert!(!is_allowed_origin(
        "http://localhost:3000.evil.com",
        "localhost:3000",
        None,
        false,
        ""
    ));
    assert!(!is_allowed_origin(
        "http://127.0.0.1.evil.com",
        "127.0.0.1:3000",
        None,
        false,
        ""
    ));
    assert!(!is_allowed_origin(
        "http://user@localhost:3000",
        "localhost:3000",
        None,
        false,
        ""
    ));
    // En-têtes proxy ignorés si DEPOTPRO_TRUST_PROXY=false
    assert!(!is_allowed_origin(
        "https://erp.example.com",
        "erp.example.com",
        Some("erp.example.com"),
        false,
        ""
    ));
    assert!(is_allowed_origin(
        "https://erp.example.com",
        "127.0.0.1:3000",
        Some("erp.example.com"),
        true,
        ""
    ));
    assert!(is_allowed_origin(
        "https://preview.depotpro.local",
        "127.0.0.1:3000",
        None,
        false,
        "https://preview.depotpro.local"
    ));
}

#[test]
fn auth_rate_limiter_enforces_window_and_resets() {
    let mut limiter = AuthRateLimiter::default();
    let t0 = Instant::now();
    for _ in 0..25 {
        assert!(limiter.check("local", t0));
    }
    assert!(!limiter.check("local", t0));
    assert!(limiter.check("local", t0 + Duration::from_secs(61)));
}

#[tokio::test]
async fn axum_enforces_session_expiry_revocation_origin_and_rbac() {
    let uid = uuid::Uuid::new_v4();
    let dir = std::env::temp_dir().join(format!("depotpro_axum_sec_{uid}"));
    let db_path = dir.join("test.db");
    let backup_dir = dir.join("backups");
    let db = DepotDb::connect(&db_path).await.unwrap();

    let state = AppState {
        db: Arc::new(RwLock::new(db)),
        backup_dir,
        sessions: Arc::new(RwLock::new(SessionStore::default())),
        auth_limiter: Arc::new(RwLock::new(AuthRateLimiter::default())),
    };
    let app = build_router(state.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let srv = tokio::spawn(async move {
        axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .await
        .unwrap();
    });

    // 1. Setup PIN
    let (st, setup_body) = send_http(
        addr,
        "POST",
        "/api/auth/setup",
        &[],
        Some(r#"{"pin":"246810"}"#),
    )
    .await;
    assert_eq!(st, 200);
    let setup_json: serde_json::Value = serde_json::from_str(&setup_body).unwrap();
    let owner_token = setup_json["token"].as_str().unwrap().to_string();

    // 2. Sans token -> 401
    let (st, _) = send_http(addr, "GET", "/api/dashboard", &[], None).await;
    assert_eq!(st, 401);

    // 3. Origine malveillante ou contournement préfixe -> 403
    let (st, _) = send_http(
        addr,
        "POST",
        "/api/categories",
        &[
            ("Authorization", &format!("Bearer {owner_token}")),
            ("Origin", "http://127.0.0.1.evil.com"),
        ],
        Some(r#"{"name":"Test"}"#),
    )
    .await;
    assert_eq!(st, 403);

    // 4. Créer un utilisateur Caissier et tester RBAC (403 sur /api/settings PUT, 200 sur /api/sales GET)
    let (st, _) = send_http(
        addr,
        "POST",
        "/api/auth/users",
        &[("Authorization", &format!("Bearer {owner_token}"))],
        Some(
            r#"{"username":"caisse1","displayName":"Awa Caisse","role":"cashier","pin":"112233"}"#,
        ),
    )
    .await;
    assert_eq!(st, 201);

    let (st, login_cashier) = send_http(
        addr,
        "POST",
        "/api/auth/login",
        &[],
        Some(r#"{"username":"caisse1","pin":"112233"}"#),
    )
    .await;
    assert_eq!(st, 200);
    let cashier_json: serde_json::Value = serde_json::from_str(&login_cashier).unwrap();
    let cashier_token = cashier_json["token"].as_str().unwrap().to_string();

    let (st, _) = send_http(
        addr,
        "PUT",
        "/api/settings",
        &[("Authorization", &format!("Bearer {cashier_token}"))],
        Some(r#"{"company_name":"Hack"}"#),
    )
    .await;
    assert_eq!(st, 403);

    let (st, _) = send_http(
        addr,
        "GET",
        "/api/sales",
        &[("Authorization", &format!("Bearer {cashier_token}"))],
        None,
    )
    .await;
    assert_eq!(st, 200);

    // 5. Révocation via /api/auth/lock -> 401 ensuite
    let (st, _) = send_http(
        addr,
        "POST",
        "/api/auth/lock",
        &[("Authorization", &format!("Bearer {cashier_token}"))],
        None,
    )
    .await;
    assert_eq!(st, 200);

    let (st, _) = send_http(
        addr,
        "GET",
        "/api/sales",
        &[("Authorization", &format!("Bearer {cashier_token}"))],
        None,
    )
    .await;
    assert_eq!(st, 401);

    // 6. Suppression définitive de produit réservée strictement au Owner (Admin -> 403)
    let (st, _) = send_http(
        addr,
        "POST",
        "/api/auth/users",
        &[("Authorization", &format!("Bearer {owner_token}"))],
        Some(
            r#"{"username":"admin_sec","displayName":"Karim Admin","role":"admin","pin":"778899"}"#,
        ),
    )
    .await;
    assert_eq!(st, 201);
    let (st, login_admin) = send_http(
        addr,
        "POST",
        "/api/auth/login",
        &[],
        Some(r#"{"username":"admin_sec","pin":"778899"}"#),
    )
    .await;
    assert_eq!(st, 200);
    let admin_token = serde_json::from_str::<serde_json::Value>(&login_admin).unwrap()["token"]
        .as_str()
        .unwrap()
        .to_string();

    let (st, _) = send_http(
        addr,
        "DELETE",
        "/api/products/1",
        &[("Authorization", &format!("Bearer {admin_token}"))],
        None,
    )
    .await;
    assert_eq!(st, 403);

    srv.abort();
    let _ = std::fs::remove_dir_all(&dir);
}
