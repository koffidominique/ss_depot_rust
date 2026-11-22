use depotpro_core::application::auth::{self, Role, SessionIdentity};
use depotpro_core::application::commercial_documents::{self, ReviewDecisionInput};
use depotpro_core::infrastructure::db::DepotDb;
use std::path::PathBuf;
use uuid::Uuid;

fn temp_path() -> PathBuf {
    std::env::temp_dir().join(format!("depotpro_commercial_{}.db", Uuid::new_v4()))
}

#[tokio::test]
async fn purchase_order_needs_owner_approval_and_keeps_audit_snapshots() {
    let path = temp_path();
    let db = DepotDb::connect(&path).await.expect("connect");
    sqlx::query("INSERT INTO users (id, username, display_name, role, pin_hash) VALUES (1, 'buyer', 'Buyer', 'stock_manager', 'test-hash'), (2, 'owner', 'Owner', 'owner', 'test-hash')")
        .execute(&db.pool).await.expect("users");
    sqlx::query("INSERT INTO suppliers (id, code, name, phone) VALUES (1, 'SUP-1', 'Fournisseur test', '00000000')")
        .execute(&db.pool).await.expect("supplier");
    sqlx::query("INSERT INTO purchase_orders (id, reference, request_key, supplier_id, status, total_amount) VALUES (1, 'PO-TEST-0001', 'po-test-key', 1, 'confirmed', 125000)")
        .execute(&db.pool).await.expect("purchase order");

    let buyer = SessionIdentity::from_role("1", "buyer", "Buyer", Role::StockManager);
    auth::with_actor(buyer, commercial_documents::submit_for_approval(&db, "purchase_order", 1))
        .await.expect("submit for owner approval");

    let blocked = {
        let (_guard, mut tx) = db.begin_write().await.expect("transaction");
        let result = commercial_documents::require_approval_or_owner("purchase_order", 1, &mut tx).await;
        tx.rollback().await.expect("rollback");
        result
    };
    assert!(blocked.is_err(), "unapproved purchase orders must not be received by staff");

    let owner = SessionIdentity::from_role("2", "owner", "Owner", Role::Owner);
    auth::with_actor(owner, commercial_documents::review_document(
        &db,
        "purchase_order",
        1,
        ReviewDecisionInput { action: "approved".into(), reason: None },
    )).await.expect("owner approval");

    let (_guard, mut tx) = db.begin_write().await.expect("transaction");
    commercial_documents::require_approval_or_owner("purchase_order", 1, &mut tx)
        .await.expect("approved purchase order is eligible for reception");
    tx.rollback().await.expect("rollback");

    let status: String = sqlx::query_scalar("SELECT status FROM commercial_document_workflows WHERE document_type = 'purchase_order' AND document_id = 1")
        .fetch_one(&db.pool).await.expect("workflow status");
    assert_eq!(status, "approved");
    let (event_count, snapshot): (i64, String) = sqlx::query_as(
        "SELECT COUNT(*), MAX(snapshot_json) FROM document_approval_events WHERE document_type = 'purchase_order' AND document_id = 1",
    ).fetch_one(&db.pool).await.expect("event snapshot");
    assert_eq!(event_count, 2);
    assert!(snapshot.contains("PO-TEST-0001"));
    assert!(snapshot.contains("Fournisseur test"));

    db.flush_wal_and_close().await;
    let _ = std::fs::remove_file(path);
}

#[tokio::test]
async fn rejection_requires_a_reason_and_does_not_approve() {
    let path = temp_path();
    let db = DepotDb::connect(&path).await.expect("connect");
    sqlx::query("INSERT INTO users (id, username, display_name, role, pin_hash) VALUES (1, 'buyer', 'Buyer', 'stock_manager', 'test-hash'), (2, 'owner', 'Owner', 'owner', 'test-hash')")
        .execute(&db.pool).await.expect("users");
    sqlx::query("INSERT INTO suppliers (id, code, name, phone) VALUES (1, 'SUP-1', 'Fournisseur test', '00000000')")
        .execute(&db.pool).await.expect("supplier");
    sqlx::query("INSERT INTO purchase_orders (id, reference, request_key, supplier_id, status, total_amount) VALUES (1, 'PO-TEST-0002', 'po-test-key-2', 1, 'confirmed', 50000)")
        .execute(&db.pool).await.expect("purchase order");
    let buyer = SessionIdentity::from_role("1", "buyer", "Buyer", Role::StockManager);
    auth::with_actor(buyer, commercial_documents::submit_for_approval(&db, "purchase_order", 1))
        .await.expect("submit");
    let owner = SessionIdentity::from_role("2", "owner", "Owner", Role::Owner);
    let missing_reason = auth::with_actor(owner.clone(), commercial_documents::review_document(
        &db,
        "purchase_order",
        1,
        ReviewDecisionInput { action: "rejected".into(), reason: None },
    )).await;
    assert!(missing_reason.is_err());
    auth::with_actor(owner, commercial_documents::review_document(
        &db,
        "purchase_order",
        1,
        ReviewDecisionInput { action: "rejected".into(), reason: Some("Prix à vérifier".into()) },
    )).await.expect("rejection with reason");
    let status: String = sqlx::query_scalar("SELECT status FROM commercial_document_workflows WHERE document_type = 'purchase_order' AND document_id = 1")
        .fetch_one(&db.pool).await.expect("workflow status");
    assert_eq!(status, "rejected");
    db.flush_wal_and_close().await;
    let _ = std::fs::remove_file(path);
}
