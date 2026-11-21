// ============================================================================
// Tests HTTP Axum : parité JSON et codes d'erreur Lot 9
// ============================================================================

use std::net::SocketAddr;
use std::sync::Arc;

use tokio::sync::RwLock;

use depotpro_core::application::auth::SessionStore;
use depotpro_core::infrastructure::db::DepotDb;

use crate::router::build_router;
use crate::state::{AppState, AuthRateLimiter};

use super::send_http;

#[tokio::test]
async fn axum_lot9_http_json_and_error_code_parity() {
    let uid = uuid::Uuid::new_v4();
    let dir = std::env::temp_dir().join(format!("depotpro_axum_lot9_{uid}"));
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
    let token = setup_json["token"].as_str().unwrap().to_string();
    let auth_hdr = format!("Bearer {token}");

    // Catégorie + client + politique crédit
    let (st, cat_body) = send_http(
        addr,
        "POST",
        "/api/categories",
        &[("Authorization", &auth_hdr)],
        Some(r#"{"name":"Bières Lot 9"}"#),
    )
    .await;
    assert_eq!(st, 201);
    let cat_id = serde_json::from_str::<serde_json::Value>(&cat_body).unwrap()["id"]
        .as_i64()
        .unwrap();

    let (st, bad_cli) = send_http(
        addr,
        "POST",
        "/api/clients",
        &[("Authorization", &auth_hdr)],
        Some(r#"{"name":"Bad","client_type":"particulier","credit_policy":"invalid"}"#),
    )
    .await;
    assert_eq!(st, 400);
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&bad_cli).unwrap()["code"],
        "VALIDATION_ERROR"
    );

    let cli_payload = serde_json::json!({
        "name": "Maquis Axum",
        "client_type": "professionnel",
        "credit_policy": "limited",
        "credit_limit": 50_000,
        "payment_terms_days": 15
    })
    .to_string();
    let (st, cli_body) = send_http(
        addr,
        "POST",
        "/api/clients",
        &[("Authorization", &auth_hdr)],
        Some(&cli_payload),
    )
    .await;
    assert_eq!(st, 201);
    let cli_id = serde_json::from_str::<serde_json::Value>(&cli_body).unwrap()["id"]
        .as_i64()
        .unwrap();

    let (st, pol_body) = send_http(
        addr,
        "PUT",
        &format!("/api/clients/{cli_id}/credit"),
        &[("Authorization", &auth_hdr)],
        Some(r#"{"credit_policy":"limited","credit_limit":80000,"payment_terms_days":30}"#),
    )
    .await;
    assert_eq!(st, 200);
    let pol_json: serde_json::Value = serde_json::from_str(&pol_body).unwrap();
    assert_eq!(pol_json["client_id"], cli_id);
    assert_eq!(pol_json["credit_limit"], 80_000);
    assert_eq!(pol_json["payment_terms_days"], 30);

    // Produit (quantités numériques acceptées) + conditionnement doublon 409 + bool int 0/1
    let prod_payload = serde_json::json!({
        "name": "Flag Axum 65cl",
        "category_id": cat_id,
        "base_unit": "bouteille",
        "initial_stock": 10,
        "min_stock": 2,
        "purchase_price": 450,
        "retail_price": 650
    })
    .to_string();
    let (st, prod_body) = send_http(
        addr,
        "POST",
        "/api/products",
        &[("Authorization", &auth_hdr)],
        Some(&prod_payload),
    )
    .await;
    assert_eq!(st, 201);
    let prod_json: serde_json::Value = serde_json::from_str(&prod_body).unwrap();
    let prod_id = prod_json["id"].as_i64().unwrap();
    let pkg_id = prod_json["packagings"][0]["id"].as_i64().unwrap();
    assert_eq!(prod_json["stock_milli"], 10_000);
    assert_eq!(prod_json["average_cost_fcfa"], 450);

    let (st, dup_pkg) = send_http(
        addr,
        "POST",
        &format!("/api/products/{prod_id}/packagings"),
        &[("Authorization", &auth_hdr)],
        Some(r#"{"name":"casier","coefficient":1,"retail_price":700}"#),
    )
    .await;
    assert_eq!(st, 409);
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&dup_pkg).unwrap()["code"],
        "DUPLICATE_OPERATION"
    );

    let invalid_payload = serde_json::json!({
        "name": "palette",
        "coefficient": 48,
        "retail_price": 24000,
        "allow_fraction": 0,
        "is_active": 1
    })
    .to_string();
    let (st, _) = send_http(
        addr,
        "POST",
        &format!("/api/products/{prod_id}/packagings"),
        &[("Authorization", &auth_hdr)],
        Some(&invalid_payload),
    )
    .await;
    assert_eq!(st, 400);

    let pack_payload = serde_json::json!({
        "name": "pack",
        "coefficient": 6,
        "retail_price": 3750,
        "allow_fraction": 0,
        "is_active": 1
    })
    .to_string();
    let (st, _) = send_http(
        addr,
        "POST",
        &format!("/api/products/{prod_id}/packagings"),
        &[("Authorization", &auth_hdr)],
        Some(&pack_payload),
    )
    .await;
    assert_eq!(st, 200);

    let casier_payload = serde_json::json!({
        "id": pkg_id,
        "name": "casier",
        "coefficient": 1,
        "retail_price": 650,
        "allow_fraction": 0,
        "is_active": 1
    })
    .to_string();
    let (st, pack_body) = send_http(
        addr,
        "POST",
        &format!("/api/products/{prod_id}/packagings"),
        &[("Authorization", &auth_hdr)],
        Some(&casier_payload),
    )
    .await;
    assert_eq!(st, 200);
    let pack_json: serde_json::Value = serde_json::from_str(&pack_body).unwrap();
    assert_eq!(pack_json["allow_fraction"], 0);
    assert_eq!(pack_json["is_active"], 1);

    // Caisse + vente + annulation + collision 409 + backup/restore camelCase
    let (st, _) = send_http(
        addr,
        "POST",
        "/api/cash/open",
        &[("Authorization", &auth_hdr)],
        Some(r#"{"opening_cash":25000,"request_key":"axum-lot9-open"}"#),
    )
    .await;
    assert_eq!(st, 201);

    let (st, open_dup) = send_http(
        addr,
        "POST",
        "/api/cash/open",
        &[("Authorization", &auth_hdr)],
        Some(r#"{"opening_cash":1000,"request_key":"axum-lot9-open-dup"}"#),
    )
    .await;
    assert_eq!(st, 400);
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&open_dup).unwrap()["code"],
        "SESSION_ALREADY_OPEN"
    );

    let sale_payload = serde_json::json!({
        "request_key": "axum-lot9-sale-1",
        "sale_type": "cash",
        "price_tier": "retail",
        "lines": [{"product_id": prod_id, "packaging_id": pkg_id, "quantity": 2}],
        "payments": [{"method_code": "wave", "amount": 1300}]
    })
    .to_string();
    let (st, sale_body) = send_http(
        addr,
        "POST",
        "/api/sales",
        &[("Authorization", &auth_hdr)],
        Some(&sale_payload),
    )
    .await;
    assert_eq!(st, 201);
    let sale_id = serde_json::from_str::<serde_json::Value>(&sale_body).unwrap()["id"]
        .as_i64()
        .unwrap();

    let cancel_payload = serde_json::json!({
        "reason": "Test Axum",
        "refund_method_code": "wave",
        "request_key": "axum-lot9-cancel-1"
    })
    .to_string();
    let (st, cancel_body) = send_http(
        addr,
        "POST",
        &format!("/api/sales/{sale_id}/cancel"),
        &[("Authorization", &auth_hdr)],
        Some(&cancel_payload),
    )
    .await;
    assert_eq!(st, 200);
    let cancel_json: serde_json::Value = serde_json::from_str(&cancel_body).unwrap();
    assert_eq!(cancel_json["status"], "cancelled");
    assert_eq!(cancel_json["cancellation"]["refund_method_code"], "wave");

    let (st, bkp_body) = send_http(
        addr,
        "POST",
        "/api/backups",
        &[("Authorization", &auth_hdr)],
        None,
    )
    .await;
    assert_eq!(st, 201);
    let bkp_name = serde_json::from_str::<serde_json::Value>(&bkp_body).unwrap()["name"]
        .as_str()
        .unwrap()
        .to_string();

    let (st, rest_body) = send_http(
        addr,
        "POST",
        &format!("/api/backups/{bkp_name}/restore"),
        &[("Authorization", &auth_hdr)],
        None,
    )
    .await;
    assert_eq!(st, 200);
    let rest_json: serde_json::Value = serde_json::from_str(&rest_body).unwrap();
    assert_eq!(rest_json["integrity"], "ok");
    assert_eq!(rest_json["foreignKeyErrors"], 0);
    assert!(rest_json["safetyBackup"].as_str().is_some());

    // Catalogue prédéfini brasseries SOLIBRA / BRASSIVOIRE (60 références)
    let (st, presets_body) = send_http(
        addr,
        "GET",
        "/api/products/presets",
        &[("Authorization", &auth_hdr)],
        None,
    )
    .await;
    assert_eq!(st, 200);
    let presets_json: serde_json::Value = serde_json::from_str(&presets_body).unwrap();
    let items = presets_json["items"].as_array().unwrap();
    assert_eq!(items.len(), 60);
    let first_key = items[0]["key"].as_str().unwrap();

    let apply_payload = serde_json::json!({
        "keys": [first_key],
        "activate": true
    })
    .to_string();
    let (st, apply_body) = send_http(
        addr,
        "POST",
        "/api/products/presets/apply",
        &[("Authorization", &auth_hdr)],
        Some(&apply_payload),
    )
    .await;
    assert_eq!(st, 200);
    let apply_json: serde_json::Value = serde_json::from_str(&apply_body).unwrap();
    assert_eq!(apply_json["created"], 1);
    assert_eq!(apply_json["products"][0]["is_active"], 1);
    let applied_id = apply_json["products"][0]["id"].as_i64().unwrap();

    // Suppression produit : refusé si lié à des mouvements/ventes, autorisé si vierge (Owner)
    let (st_hist, hist_body) = send_http(
        addr,
        "DELETE",
        &format!("/api/products/{prod_id}"),
        &[("Authorization", &auth_hdr)],
        None,
    )
    .await;
    assert_eq!(st_hist, 400);
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&hist_body).unwrap()["code"],
        "HISTORICAL_IMMUTABLE"
    );

    let (st_del, del_body) = send_http(
        addr,
        "DELETE",
        &format!("/api/products/{applied_id}"),
        &[("Authorization", &auth_hdr)],
        None,
    )
    .await;
    assert_eq!(st_del, 200);
    let del_json: serde_json::Value = serde_json::from_str(&del_body).unwrap();
    assert_eq!(del_json["deleted"], true);
    assert_eq!(del_json["id"], applied_id);

    srv.abort();
    let _ = std::fs::remove_dir_all(&dir);
}
