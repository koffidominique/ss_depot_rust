// ============================================================================
// Tests HTTP Axum : Commandes clientèle mixtes, emballages & consignes client
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
async fn axum_orders_mixed_crate_and_deposit_lifecycle() {
    let uid = uuid::Uuid::new_v4();
    let dir = std::env::temp_dir().join(format!("depotpro_axum_orders_{uid}"));
    let db = DepotDb::connect(&dir.join("test.db")).await.unwrap();

    let state = AppState {
        db: Arc::new(RwLock::new(db)),
        backup_dir: dir.join("backups"),
        sessions: Arc::new(RwLock::new(SessionStore::default())),
        auth_limiter: Arc::new(RwLock::new(AuthRateLimiter::default())),
    };
    let app = build_router(state);
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
    let token = serde_json::from_str::<serde_json::Value>(&setup_body).unwrap()["token"]
        .as_str()
        .unwrap()
        .to_string();
    let auth_hdr = format!("Bearer {token}");
    let hdrs = [("Authorization", auth_hdr.as_str())];

    let (st, cat_body) = send_http(
        addr,
        "POST",
        "/api/categories",
        &hdrs,
        Some(r#"{"name":"Bières HTTP"}"#),
    )
    .await;
    assert_eq!(st, 201);
    let cat_id = serde_json::from_str::<serde_json::Value>(&cat_body).unwrap()["id"]
        .as_i64()
        .unwrap();

    let cli_body = serde_json::json!({
        "name": "Maquis HTTP Plateau",
        "client_type": "professionnel",
        "credit_policy": "limited",
        "credit_limit": 200_000,
        "payment_terms_days": 15
    })
    .to_string();
    let (st, cli_res) = send_http(addr, "POST", "/api/clients", &hdrs, Some(&cli_body)).await;
    assert_eq!(st, 201);
    let cli_id = serde_json::from_str::<serde_json::Value>(&cli_res).unwrap()["id"]
        .as_i64()
        .unwrap();

    let mut variant_ids = Vec::new();
    let mut prod_ids = Vec::new();
    for (name, sku) in [("Bock 33cl", "BOCK-HTTP"), ("Drogba 33cl", "DROGBA-HTTP")] {
        let p_payload = serde_json::json!({
            "name": name,
            "category_id": cat_id,
            "base_unit": "bouteille",
            "initial_stock": 100,
            "purchase_price": 300,
            "wholesale_price": 400,
            "retail_price": 400,
            "sku": sku,
            "variant": {
                "name": name,
                "sku": format!("{sku}-VAR"),
                "volume_ml": 330,
                "container_type": "glass_returnable",
                "container_returnable": true
            }
        })
        .to_string();
        let (st, p_res) = send_http(addr, "POST", "/api/products", &hdrs, Some(&p_payload)).await;
        assert_eq!(st, 201);
        let pj: serde_json::Value = serde_json::from_str(&p_res).unwrap();
        let pid = pj["id"].as_i64().unwrap();
        let vid = pj["variant_id"].as_i64().unwrap();
        prod_ids.push(pid);
        variant_ids.push(vid);
    }

    // Vérifier sous-routes catalogue §7.1
    let (st, vars_res) = send_http(
        addr,
        "GET",
        &format!("/api/products/{}/variants", prod_ids[0]),
        &hdrs,
        None,
    )
    .await;
    assert_eq!(st, 200);
    let vars_json: serde_json::Value = serde_json::from_str(&vars_res).unwrap();
    assert_eq!(
        vars_json["items"][0]["compatibility_class"],
        "bottle_33cl_glass"
    );
    assert_eq!(vars_json["items"][0]["native_crate_capacity"], 24);

    let (st, _) = send_http(
        addr,
        "POST",
        &format!("/api/variants/{}/prices", variant_ids[0]),
        &hdrs,
        Some(r#"{"price_type":"RETAIL","price_xof":400}"#),
    )
    .await;
    assert_eq!(st, 201);

    let lines_json = serde_json::json!([
        {
            "variant_id": variant_ids[0],
            "requested_unit": "half_crate",
            "requested_quantity": 1,
            "unit_price_xof": 400
        },
        {
            "variant_id": variant_ids[1],
            "requested_unit": "half_crate",
            "requested_quantity": 1,
            "unit_price_xof": 400
        }
    ]);
    // Prévisualisation mixte 12 + 12 -> 1 casier 24x33cl (1000 FCFA consigne + 9600 CA)
    let preview_payload = serde_json::json!({ "lines": lines_json }).to_string();
    let (st, prev_res) = send_http(
        addr,
        "POST",
        "/api/orders/compose-preview",
        &hdrs,
        Some(&preview_payload),
    )
    .await;
    assert_eq!(st, 200);
    let pj: serde_json::Value = serde_json::from_str(&prev_res).unwrap();
    assert_eq!(pj["allocations"].as_array().unwrap().len(), 1);
    assert_eq!(pj["totals"]["total_xof"], 9600);
    assert_eq!(pj["totals"]["deposit_total_xof"], 1000);
    assert_eq!(pj["totals"]["total_to_collect_xof"], 10600);

    // Création draft + PATCH + confirm + deliver + pay + retour 1 casier
    let create_payload = serde_json::json!({
        "customer_id": cli_id,
        "order_type": "mixte",
        "payment_method": "cash",
        "lines": lines_json
    })
    .to_string();
    let (st, ord_res) = send_http(addr, "POST", "/api/orders", &hdrs, Some(&create_payload)).await;
    assert_eq!(st, 201);
    let ord_json: serde_json::Value = serde_json::from_str(&ord_res).unwrap();
    let oid = ord_json["order"]["id"].as_i64().unwrap();
    let asset_id = ord_json["allocations"][0]["packaging_asset_id"]
        .as_i64()
        .unwrap();
    assert_eq!(ord_json["order"]["status"], "draft");

    let (st, _) = send_http(
        addr,
        "PATCH",
        &format!("/api/orders/{oid}"),
        &hdrs,
        Some(r#"{"payment_method":"mobile_money"}"#),
    )
    .await;
    assert_eq!(st, 200);

    let (st, _) = send_http(
        addr,
        "POST",
        &format!("/api/orders/{oid}/confirm"),
        &hdrs,
        None,
    )
    .await;
    assert_eq!(st, 200);

    let (st, deliv_res) = send_http(
        addr,
        "POST",
        &format!("/api/orders/{oid}/deliver"),
        &hdrs,
        None,
    )
    .await;
    assert_eq!(st, 200);
    let dj: serde_json::Value = serde_json::from_str(&deliv_res).unwrap();
    assert_eq!(dj["customer_deposits"][0]["quantity_held"], 1);

    let (st, _) = send_http(
        addr,
        "POST",
        &format!("/api/orders/{oid}/pay"),
        &hdrs,
        Some(r#"{"amount_xof":10600,"method":"mobile_money"}"#),
    )
    .await;
    assert_eq!(st, 200);

    let ret_body = serde_json::json!({
        "packaging_asset_id": asset_id,
        "quantity": 1,
        "notes": "Retour HTTP"
    })
    .to_string();
    let (st, ret_res) = send_http(
        addr,
        "POST",
        &format!("/api/orders/{oid}/returns"),
        &hdrs,
        Some(&ret_body),
    )
    .await;
    assert_eq!(st, 200);
    let rj: serde_json::Value = serde_json::from_str(&ret_res).unwrap();
    assert_eq!(rj["customer_deposits"][0]["quantity_held"], 0);

    let (st, hist_res) = send_http(
        addr,
        "GET",
        &format!("/api/customers/{cli_id}/deposits/history"),
        &hdrs,
        None,
    )
    .await;
    assert_eq!(st, 200);
    let hist_arr = serde_json::from_str::<serde_json::Value>(&hist_res).unwrap();
    assert_eq!(hist_arr.as_array().unwrap().len(), 2);

    // Création + annulation d'une 2e commande
    let (st, ord2_res) = send_http(addr, "POST", "/api/orders", &hdrs, Some(&create_payload)).await;
    assert_eq!(st, 201);
    let oid2 = serde_json::from_str::<serde_json::Value>(&ord2_res).unwrap()["order"]["id"]
        .as_i64()
        .unwrap();
    let (st, can_res) = send_http(
        addr,
        "POST",
        &format!("/api/orders/{oid2}/cancel"),
        &hdrs,
        None,
    )
    .await;
    assert_eq!(st, 200);
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&can_res).unwrap()["order"]["status"],
        "cancelled"
    );

    // Diagnostic base locale + création et import de sauvegarde
    let (st, db_st_res) = send_http(addr, "GET", "/api/backups/db-status", &hdrs, None).await;
    assert_eq!(st, 200);
    let db_st: serde_json::Value = serde_json::from_str(&db_st_res).unwrap();
    assert_eq!(db_st["integrity"], "ok");
    assert_eq!(db_st["foreignKeyErrors"], 0);

    let (st, bkp_res) = send_http(addr, "POST", "/api/backups", &hdrs, None).await;
    assert_eq!(st, 201);
    let bkp_name = serde_json::from_str::<serde_json::Value>(&bkp_res).unwrap()["name"]
        .as_str()
        .unwrap()
        .to_string();
    let bkp_bytes = std::fs::read(dir.join("backups").join(&bkp_name)).unwrap();
    let imp_payload = serde_json::json!({
        "filename": "desktop_usb.db",
        "bytes": bkp_bytes
    })
    .to_string();
    let (st, imp_res) = send_http(
        addr,
        "POST",
        "/api/backups/import",
        &hdrs,
        Some(&imp_payload),
    )
    .await;
    assert_eq!(st, 201);
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&imp_res).unwrap()["integrity"],
        "ok"
    );

    srv.abort();
    let _ = std::fs::remove_dir_all(&dir);
}
