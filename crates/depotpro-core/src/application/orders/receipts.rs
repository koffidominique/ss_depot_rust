// ============================================================================
// Accusé de commande clientèle : émission idempotente et snapshot immuable
// ============================================================================

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::application::auth::{current_actor, require_current_actor_permission, Permission, Role};
use crate::application::reports::get_settings;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::queries::get_order;
use super::receipt_pdf_input::build_receipt_pdf_input;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct CustomerOrderReceiptSnapshotDto {
    pub id: i64,
    pub order_id: i64,
    pub version: i64,
    pub receipt_number: String,
    pub snapshot_json: String,
    pub issued_at: String,
    pub issued_by_user_id: Option<String>,
    pub issued_by_name: String,
    pub issued_by_role: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateCustomerOrderReceiptRevisionInput {
    pub reason: String,
}

#[derive(Debug, FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ReceiptPaymentSnapshot {
    pub(super) reference: String,
    pub(super) payment_note: Option<String>,
    pub(super) paid_at: String,
    pub(super) method_code: String,
    pub(super) method_label: String,
    pub(super) amount_xof: i64,
}

pub async fn issue_or_get_customer_order_receipt(
    db: &DepotDb,
    order_id: i64,
) -> CoreResult<CustomerOrderReceiptSnapshotDto> {
    require_current_actor_permission(Permission::SalesRead)?;
    let actor = current_actor().ok_or_else(|| {
        CoreError::Forbidden("Une session utilisateur est requise pour émettre le reçu.".into())
    })?;
    // Sérialise l'émission avec les écritures de commande/retour/paiement pour figer un état cohérent.
    let (_write_guard, mut tx) = db.begin_write().await?;

    if let Some(existing) = sqlx::query_as::<_, CustomerOrderReceiptSnapshotDto>(
        "SELECT id, order_id, version, receipt_number, snapshot_json, issued_at,
                issued_by_user_id, issued_by_name, issued_by_role
         FROM customer_order_receipt_snapshots WHERE order_id = ? AND version = 1",
    )
    .bind(order_id)
    .fetch_optional(&mut *tx)
    .await?
    {
        return Ok(existing);
    }

    let order = get_order(db, order_id).await?;
    if order.order.status == "draft"
        || order.order.status == "cancelled"
        || order.order.approval_status.as_deref() == Some("pending_owner_approval")
    {
        return Err(CoreError::Validation(
            "Le reçu ne peut être émis qu’après confirmation et avant annulation de la commande.".into(),
        ));
    }
    let settings = get_settings(db).await?;
    let customer: Option<(i64, String, String, String, Option<String>, Option<String>, Option<String>, Option<String>)> =
        sqlx::query_as(
            "SELECT id, code, name, client_type, phone, address, city, contact_person
             FROM clients WHERE id = ?",
        )
        .bind(order.order.customer_id)
        .fetch_optional(&db.pool)
        .await?;
    let (customer_id, customer_code, customer_name, customer_type, customer_phone, customer_address, customer_city, customer_contact) =
        customer.ok_or_else(|| CoreError::NotFound("Client de la commande introuvable.".into()))?;

    let payments: Vec<ReceiptPaymentSnapshot> = sqlx::query_as(
        "SELECT p.reference, p.note AS payment_note, p.created_at AS paid_at,
                pp.method_code, COALESCE(pm.label, pp.method_code) AS method_label, pp.amount AS amount_xof
         FROM payments p
         JOIN payment_parts pp ON pp.payment_id = p.id
         LEFT JOIN payment_methods pm ON pm.code = pp.method_code
         WHERE p.order_id = ? ORDER BY p.created_at ASC, p.id ASC, pp.id ASC",
    )
    .bind(order_id)
    .fetch_all(&db.pool)
    .await?;

    let receipt_number = format!("REC-{}", order.order.order_number);
    let now: String = sqlx::query_scalar("SELECT datetime('now')")
        .fetch_one(&db.pool)
        .await?;
    let pdf_document = build_receipt_pdf_input(
        &order,
        &customer_code,
        &customer_name,
        customer_phone.as_deref(),
        customer_address.as_deref(),
        customer_city.as_deref(),
        &actor.display_name,
        &receipt_number,
        &now,
        &payments,
    );
    let snapshot = serde_json::json!({
        "documentType": "BON DE COMMANDE CLIENT – ACCUSÉ DE RÉCEPTION",
        "receiptNumber": receipt_number,
        "issuedAt": now,
        "issuer": {
            "userId": actor.user_id,
            "name": actor.display_name,
            "role": actor.role.as_str(),
        },
        "company": settings,
        "customer": {
            "id": customer_id,
            "code": customer_code,
            "name": customer_name,
            "clientType": customer_type,
            "phone": customer_phone,
            "address": customer_address,
            "city": customer_city,
            "contactPerson": customer_contact,
        },
        "orderDetail": order,
        "payments": payments,
        "pdfDocument": pdf_document,
    });
    let snapshot_json = serde_json::to_string(&snapshot)
        .map_err(|e| CoreError::Internal(format!("Sérialisation du reçu impossible : {e}")))?;

    // INSERT OR IGNORE rend l'émission idempotente en cas de double clic ou d'appels concurrents.
    // La contrainte UNIQUE (order_id, version) garantit qu'une réimpression ne remplace jamais l'original.
    sqlx::query(
        "INSERT OR IGNORE INTO customer_order_receipt_snapshots
            (order_id, version, receipt_number, snapshot_json, issued_at,
             issued_by_user_id, issued_by_name, issued_by_role)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?)",
    )
    .bind(order_id)
    .bind(&receipt_number)
    .bind(snapshot_json)
    .bind(&now)
    .bind(&actor.user_id)
    .bind(&actor.display_name)
    .bind(actor.role.as_str())
    .execute(&mut *tx)
    .await?;

    let receipt = sqlx::query_as::<_, CustomerOrderReceiptSnapshotDto>(
        "SELECT id, order_id, version, receipt_number, snapshot_json, issued_at,
                issued_by_user_id, issued_by_name, issued_by_role
         FROM customer_order_receipt_snapshots WHERE order_id = ? AND version = 1",
    )
    .bind(order_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| CoreError::NotFound("Snapshot du reçu de commande introuvable après émission.".into()))?;
    tx.commit().await?;
    Ok(receipt)
}

pub async fn list_customer_order_receipt_snapshots(
    db: &DepotDb,
    order_id: i64,
) -> CoreResult<Vec<CustomerOrderReceiptSnapshotDto>> {
    require_current_actor_permission(Permission::SalesRead)?;
    let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM orders WHERE id = ?")
        .bind(order_id)
        .fetch_one(&db.pool)
        .await?;
    if exists == 0 {
        return Err(CoreError::NotFound("Commande introuvable.".into()));
    }
    Ok(sqlx::query_as::<_, CustomerOrderReceiptSnapshotDto>(
        "SELECT id, order_id, version, receipt_number, snapshot_json, issued_at,
                issued_by_user_id, issued_by_name, issued_by_role
         FROM customer_order_receipt_snapshots WHERE order_id = ? ORDER BY version DESC",
    )
    .bind(order_id)
    .fetch_all(&db.pool)
    .await?)
}

/// Crée une nouvelle version explicite du reçu après correction; l'original n'est jamais modifié.
pub async fn create_customer_order_receipt_revision(
    db: &DepotDb,
    order_id: i64,
    reason: String,
) -> CoreResult<CustomerOrderReceiptSnapshotDto> {
    require_current_actor_permission(Permission::SalesWrite)?;
    let actor = current_actor().ok_or_else(|| {
        CoreError::Forbidden("Une session utilisateur est requise pour corriger le reçu.".into())
    })?;
    if actor.role != Role::Owner {
        return Err(CoreError::Forbidden(
            "Seul le propriétaire peut émettre une version corrigée du reçu.".into(),
        ));
    }
    let reason = reason.trim().to_string();
    if reason.len() < 8 || reason.len() > 500 {
        return Err(CoreError::Validation(
            "Le motif de correction doit contenir entre 8 et 500 caractères.".into(),
        ));
    }

    // Garantit une version originale avant de créer toute révision.
    let original = issue_or_get_customer_order_receipt(db, order_id).await?;
    let (_write_guard, mut tx) = db.begin_write().await?;
    let current_version: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(version), 0) FROM customer_order_receipt_snapshots WHERE order_id = ?",
    )
    .bind(order_id)
    .fetch_one(&mut *tx)
    .await?;
    let version = current_version + 1;
    let order = get_order(db, order_id).await?;
    if order.order.status == "draft"
        || order.order.status == "cancelled"
        || order.order.approval_status.as_deref() == Some("pending_owner_approval")
    {
        return Err(CoreError::Validation(
            "Une version corrigée n'est possible que pour une commande confirmée et non annulée.".into(),
        ));
    }
    let original_snapshot: serde_json::Value = serde_json::from_str(&original.snapshot_json)
        .map_err(|e| CoreError::Internal(format!("Lecture du reçu original impossible : {e}")))?;
    let company_snapshot = original_snapshot.get("company").cloned().ok_or_else(|| {
        CoreError::Validation("L’identité société du reçu original est introuvable; correction refusée.".into())
    })?;
    let customer: Option<(i64, String, String, String, Option<String>, Option<String>, Option<String>, Option<String>)> =
        sqlx::query_as(
            "SELECT id, code, name, client_type, phone, address, city, contact_person
             FROM clients WHERE id = ?",
        )
        .bind(order.order.customer_id)
        .fetch_optional(&db.pool)
        .await?;
    let (customer_id, customer_code, customer_name, customer_type, customer_phone, customer_address, customer_city, customer_contact) =
        customer.ok_or_else(|| CoreError::NotFound("Client de la commande introuvable.".into()))?;
    let payments: Vec<ReceiptPaymentSnapshot> = sqlx::query_as(
        "SELECT p.reference, p.note AS payment_note, p.created_at AS paid_at,
                pp.method_code, COALESCE(pm.label, pp.method_code) AS method_label, pp.amount AS amount_xof
         FROM payments p
         JOIN payment_parts pp ON pp.payment_id = p.id
         LEFT JOIN payment_methods pm ON pm.code = pp.method_code
         WHERE p.order_id = ? ORDER BY p.created_at ASC, p.id ASC, pp.id ASC",
    )
    .bind(order_id)
    .fetch_all(&db.pool)
    .await?;

    let receipt_number = format!("REC-{}-V{}", order.order.order_number, version);
    let now: String = sqlx::query_scalar("SELECT datetime('now')")
        .fetch_one(&db.pool)
        .await?;
    let mut pdf_document = build_receipt_pdf_input(
        &order,
        &customer_code,
        &customer_name,
        customer_phone.as_deref(),
        customer_address.as_deref(),
        customer_city.as_deref(),
        &actor.display_name,
        &receipt_number,
        &now,
        &payments,
    );
    pdf_document.notes = Some(format!(
        "{}\nVERSION CORRIGÉE · Motif : {reason}",
        pdf_document.notes.as_deref().unwrap_or("")
    ));
    let snapshot = serde_json::json!({
        "documentType": "BON DE COMMANDE CLIENT – ACCUSÉ DE RÉCEPTION",
        "receiptNumber": receipt_number,
        "version": version,
        "issuedAt": now,
        "issuer": {
            "userId": actor.user_id,
            "name": actor.display_name,
            "role": actor.role.as_str(),
        },
        "revisionReason": reason,
        "supersedesReceiptNumber": original.receipt_number,
        "company": company_snapshot,
        "customer": {
            "id": customer_id,
            "code": customer_code,
            "name": customer_name,
            "clientType": customer_type,
            "phone": customer_phone,
            "address": customer_address,
            "city": customer_city,
            "contactPerson": customer_contact,
        },
        "orderDetail": order,
        "payments": payments,
        "pdfDocument": pdf_document,
    });
    let snapshot_json = serde_json::to_string(&snapshot)
        .map_err(|e| CoreError::Internal(format!("Sérialisation de la correction impossible : {e}")))?;
    sqlx::query(
        "INSERT INTO customer_order_receipt_snapshots
            (order_id, version, receipt_number, snapshot_json, issued_at,
             issued_by_user_id, issued_by_name, issued_by_role)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(order_id)
    .bind(version)
    .bind(&receipt_number)
    .bind(snapshot_json)
    .bind(&now)
    .bind(&actor.user_id)
    .bind(&actor.display_name)
    .bind(actor.role.as_str())
    .execute(&mut *tx)
    .await?;
    let receipt = sqlx::query_as::<_, CustomerOrderReceiptSnapshotDto>(
        "SELECT id, order_id, version, receipt_number, snapshot_json, issued_at,
                issued_by_user_id, issued_by_name, issued_by_role
         FROM customer_order_receipt_snapshots WHERE order_id = ? AND version = ?",
    )
    .bind(order_id)
    .bind(version)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(receipt)
}
