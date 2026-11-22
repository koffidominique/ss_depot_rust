// ============================================================================
// Bons de commande fournisseurs : création et annulation
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::sales::audit_log_tx;
use crate::domain::money::Money;
use crate::domain::quantity::Quantity;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{
    list_purchase_orders, CancelPurchaseOrderInput, CreatePurchaseOrderInput, PurchaseOrderDto,
};

pub async fn create_purchase_order(
    db: &DepotDb,
    input: CreatePurchaseOrderInput,
) -> CoreResult<PurchaseOrderDto> {
    require_current_actor_permission(Permission::PurchasesWrite)?;
    let request_key = input.request_key.trim().to_string();
    if request_key.is_empty() {
        return Err(CoreError::Validation(
            "Clé d'idempotence requise.".to_string(),
        ));
    }
    if input.lines.is_empty() {
        return Err(CoreError::Validation(
            "Ajoutez au moins une ligne de commande.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    if let Some((existing_id,)) =
        sqlx::query_as::<_, (i64,)>("SELECT id FROM purchase_orders WHERE request_key = ?")
            .bind(&request_key)
            .fetch_optional(&mut *tx)
            .await?
    {
        tx.rollback().await?;
        return list_purchase_orders(db)
            .await?
            .into_iter()
            .find(|o| o.id == existing_id)
            .ok_or_else(|| CoreError::Internal("Commande introuvable.".to_string()));
    }

    let sup: Option<(i64,)> = sqlx::query_as("SELECT id FROM suppliers WHERE id = ?")
        .bind(input.supplier_id)
        .fetch_optional(&mut *tx)
        .await?;
    if sup.is_none() {
        return Err(CoreError::Validation(
            "Fournisseur introuvable.".to_string(),
        ));
    }

    type PreparedPurchaseOrderLine = (i64, i64, String, String, String, i64, i64, i64, i64);
    let mut total_amount = Money::ZERO;
    let mut prepared: Vec<PreparedPurchaseOrderLine> = Vec::new();

    for l in &input.lines {
        let prod: Option<(i64, String, String)> =
            sqlx::query_as("SELECT id, name, base_unit FROM products WHERE id = ?")
                .bind(l.product_id)
                .fetch_optional(&mut *tx)
                .await?;
        let (pid, pname, base_unit) =
            prod.ok_or_else(|| CoreError::Validation("Produit introuvable.".to_string()))?;

        let pkg: Option<(i64, String, i64)> = sqlx::query_as(
            "SELECT id, name, coefficient_milli FROM product_packagings WHERE id = ? AND product_id = ?",
        )
        .bind(l.packaging_id)
        .bind(pid)
        .fetch_optional(&mut *tx)
        .await?;
        let (pkg_id, pkg_name, coeff_milli) =
            pkg.ok_or_else(|| CoreError::Validation("Conditionnement introuvable.".to_string()))?;

        let qty = Quantity::parse_str(&l.quantity, &format!("Quantité commandée ({pname})"))?;
        if qty.milli_units <= 0 {
            return Err(CoreError::Validation(
                "La quantité commandée doit être > 0.".to_string(),
            ));
        }
        let unit_price = Money::from_non_negative(l.unit_price, &format!("Prix achat ({pname})"))?;
        let line_total = Money(qty.compute_line_fcfa(unit_price.value())?);
        total_amount = total_amount.checked_add(line_total, "Total commande")?;

        prepared.push((
            pid,
            pkg_id,
            pname,
            pkg_name,
            base_unit,
            coeff_milli,
            qty.milli_units,
            unit_price.value(),
            line_total.value(),
        ));
    }

    let reference = DepotDb::next_sequence(&mut tx, "CMD").await?;
    let expected_date = input
        .expected_date
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let po_id = sqlx::query(
        "INSERT INTO purchase_orders (reference, request_key, supplier_id, status, total_amount, expected_date, notes)
         VALUES (?, ?, ?, 'confirmed', ?, ?, ?)",
    )
    .bind(&reference)
    .bind(&request_key)
    .bind(input.supplier_id)
    .bind(total_amount.value())
    .bind(expected_date)
    .bind(input.notes.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    for p in prepared {
        sqlx::query(
            "INSERT INTO purchase_order_lines (purchase_order_id, product_id, packaging_id, product_name, packaging_name, base_unit, coefficient_milli, ordered_quantity_milli, unit_price, line_total)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(po_id)
        .bind(p.0)
        .bind(p.1)
        .bind(&p.2)
        .bind(&p.3)
        .bind(&p.4)
        .bind(p.5)
        .bind(p.6)
        .bind(p.7)
        .bind(p.8)
        .execute(&mut *tx)
        .await?;
    }

    audit_log_tx(
        &mut tx,
        "CREATE_PO",
        "purchase_orders",
        Some(po_id.to_string()),
        &format!("Commande {reference} — {} FCFA", total_amount.value()),
    )
    .await?;
    tx.commit().await?;

    list_purchase_orders(db)
        .await?
        .into_iter()
        .find(|o| o.id == po_id)
        .ok_or_else(|| CoreError::Internal("Commande créée introuvable.".to_string()))
}

pub async fn update_purchase_order(
    db: &DepotDb,
    purchase_order_id: i64,
    input: super::UpdatePurchaseOrderInput,
) -> CoreResult<PurchaseOrderDto> {
    require_current_actor_permission(Permission::PurchasesWrite)?;
    if purchase_order_id <= 0 || input.lines.is_empty() {
        return Err(CoreError::Validation("Bon invalide : ajoutez au moins une ligne.".into()));
    }
    let (_guard, mut tx) = db.begin_write().await?;
    let state: Option<(String, i64)> = sqlx::query_as(
        "SELECT w.status, po.received_amount FROM purchase_orders po
         LEFT JOIN commercial_document_workflows w ON w.document_type = 'purchase_order' AND w.document_id = po.id
         WHERE po.id = ? AND po.status = 'confirmed'",
    ).bind(purchase_order_id).fetch_optional(&mut *tx).await?;
    let (approval_status, received_amount) = state
        .ok_or_else(|| CoreError::HistoricalImmutable("Seuls les bons confirmés peuvent être corrigés.".into()))?;
    if approval_status != "changes_requested" || received_amount != 0 {
        return Err(CoreError::Forbidden("La modification est réservée aux bons renvoyés pour correction et non réceptionnés.".into()));
    }
    let receipt_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM purchase_receipts WHERE purchase_order_id = ?",
    ).bind(purchase_order_id).fetch_one(&mut *tx).await?;
    if receipt_count > 0 {
        return Err(CoreError::HistoricalImmutable("Un bon ayant une réception ne peut plus être modifié.".into()));
    }
    let supplier_exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM suppliers WHERE id = ? AND is_active = 1")
        .bind(input.supplier_id).fetch_one(&mut *tx).await?;
    if supplier_exists == 0 {
        return Err(CoreError::Validation("Fournisseur absent ou inactif.".into()));
    }
    let mut total = Money::ZERO;
    let mut prepared = Vec::with_capacity(input.lines.len());
    for line in &input.lines {
        let product: Option<(String, String)> = sqlx::query_as(
            "SELECT name, base_unit FROM products WHERE id = ? AND is_active = 1",
        ).bind(line.product_id).fetch_optional(&mut *tx).await?;
        let (product_name, base_unit) = product.ok_or_else(|| CoreError::Validation("Produit absent ou inactif.".into()))?;
        let packaging: Option<(String, i64)> = sqlx::query_as(
            "SELECT name, coefficient_milli FROM product_packagings WHERE id = ? AND product_id = ? AND is_active = 1",
        ).bind(line.packaging_id).bind(line.product_id).fetch_optional(&mut *tx).await?;
        let (packaging_name, coefficient) = packaging.ok_or_else(|| CoreError::Validation("Conditionnement invalide ou inactif.".into()))?;
        let quantity = Quantity::parse_str(&line.quantity, &format!("Quantité ({product_name})"))?;
        if quantity.milli_units <= 0 { return Err(CoreError::Validation("La quantité doit être supérieure à zéro.".into())); }
        let price = Money::from_non_negative(line.unit_price, &format!("Prix ({product_name})"))?;
        let line_total = Money(quantity.compute_line_fcfa(price.value())?);
        total = total.checked_add(line_total, "Total du bon")?;
        prepared.push((line.product_id, line.packaging_id, product_name, packaging_name, base_unit, coefficient, quantity.milli_units, price.value(), line_total.value()));
    }
    let reference: String = sqlx::query_scalar("SELECT reference FROM purchase_orders WHERE id = ?")
        .bind(purchase_order_id).fetch_one(&mut *tx).await?;
    sqlx::query("UPDATE purchase_orders SET supplier_id = ?, total_amount = ? WHERE id = ?")
        .bind(input.supplier_id).bind(total.value()).bind(purchase_order_id).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM purchase_order_lines WHERE purchase_order_id = ?")
        .bind(purchase_order_id).execute(&mut *tx).await?;
    for line in prepared {
        sqlx::query(
            "INSERT INTO purchase_order_lines (purchase_order_id, product_id, packaging_id, product_name, packaging_name, base_unit, coefficient_milli, ordered_quantity_milli, unit_price, line_total)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(purchase_order_id).bind(line.0).bind(line.1).bind(line.2).bind(line.3).bind(line.4)
         .bind(line.5).bind(line.6).bind(line.7).bind(line.8).execute(&mut *tx).await?;
    }
    let actor = crate::application::auth::current_actor()
        .ok_or_else(|| CoreError::Forbidden("Session authentifiée requise pour soumettre la correction.".into()))?;
    let submitter = actor.user_id.parse::<i64>().ok();
    let supplier_name: String = sqlx::query_scalar("SELECT name FROM suppliers WHERE id = ?")
        .bind(input.supplier_id).fetch_one(&mut *tx).await?;
    let snapshot_lines: Vec<(String, String, i64, i64, i64)> = sqlx::query_as(
        "SELECT product_name, packaging_name, ordered_quantity_milli, unit_price, line_total
         FROM purchase_order_lines WHERE purchase_order_id = ? ORDER BY id",
    ).bind(purchase_order_id).fetch_all(&mut *tx).await?;
    let snapshot = serde_json::json!({
        "documentType": "purchase_order", "id": purchase_order_id, "number": reference,
        "counterparty": supplier_name, "status": "confirmed", "totalXof": total.value(),
        "items": snapshot_lines.into_iter().map(|(product, packaging, quantity, unit_price, line_total)| serde_json::json!({
            "product": product, "packaging": packaging, "quantityMilli": quantity,
            "unitPriceXof": unit_price, "lineTotalXof": line_total
        })).collect::<Vec<_>>()
    });
    sqlx::query(
        "UPDATE commercial_document_workflows SET status = 'pending_owner_approval', submitted_by = ?,
         submitted_at = datetime('now'), reviewed_by = NULL, reviewed_at = NULL, review_reason = NULL,
         updated_at = datetime('now') WHERE document_type = 'purchase_order' AND document_id = ? AND status = 'changes_requested'",
    ).bind(submitter).bind(purchase_order_id).execute(&mut *tx).await?;
    sqlx::query(
        "INSERT INTO document_approval_events (document_type, document_id, action, actor_user_id, actor_role, reason, snapshot_json)
         VALUES ('purchase_order', ?, 'submitted', ?, ?, 'Correction resoumise après demande Owner', ?)",
    ).bind(purchase_order_id).bind(submitter).bind(actor.role.as_str()).bind(snapshot.to_string())
     .execute(&mut *tx).await?;
    audit_log_tx(&mut tx, "UPDATE_PO_AFTER_CORRECTION", "purchase_orders", Some(purchase_order_id.to_string()),
        &format!("Bon {reference} corrigé et resoumis pour approbation Owner; montant {} FCFA.", total.value())).await?;
    tx.commit().await?;
    list_purchase_orders(db).await?.into_iter().find(|po| po.id == purchase_order_id)
        .ok_or_else(|| CoreError::Internal("Bon corrigé introuvable.".into()))
}

pub async fn cancel_purchase_order(
    db: &DepotDb,
    purchase_order_id: i64,
    input: CancelPurchaseOrderInput,
) -> CoreResult<PurchaseOrderDto> {
    require_current_actor_permission(Permission::PurchasesWrite)?;
    if purchase_order_id <= 0 {
        return Err(CoreError::Validation(
            "Bon de commande invalide.".to_string(),
        ));
    }
    let reason = input.reason.trim();
    if reason.is_empty() {
        return Err(CoreError::Validation(
            "Le motif d'annulation est obligatoire.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    let po: Option<(String, String, i64, Option<String>)> = sqlx::query_as(
        "SELECT reference, status, received_amount, notes FROM purchase_orders WHERE id = ?",
    )
    .bind(purchase_order_id)
    .fetch_optional(&mut *tx)
    .await?;
    let (po_ref, status, received_amount, prev_notes) =
        po.ok_or_else(|| CoreError::Validation("Bon de commande introuvable.".to_string()))?;

    if status == "cancelled" {
        return Err(CoreError::HistoricalImmutable(
            "Ce bon de commande est déjà annulé.".to_string(),
        ));
    }
    let receipt_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM purchase_receipts WHERE purchase_order_id = ?")
            .bind(purchase_order_id)
            .fetch_one(&mut *tx)
            .await?;

    if status == "partial" || status == "received" || received_amount > 0 || receipt_count > 0 {
        return Err(CoreError::HistoricalImmutable(
            "Impossible d'annuler un bon de commande ayant déjà fait l'objet d'une réception."
                .to_string(),
        ));
    }

    let next_notes = match prev_notes {
        Some(n) if !n.trim().is_empty() => format!("{n} · [Annulé : {reason}]"),
        _ => format!("[Annulé : {reason}]"),
    };

    sqlx::query("UPDATE purchase_orders SET status = 'cancelled', notes = ? WHERE id = ?")
        .bind(&next_notes)
        .bind(purchase_order_id)
        .execute(&mut *tx)
        .await?;

    audit_log_tx(
        &mut tx,
        "CANCEL_PURCHASE_ORDER",
        "purchase_orders",
        Some(purchase_order_id.to_string()),
        &format!("Annulation {po_ref} — {reason}"),
    )
    .await?;
    tx.commit().await?;

    list_purchase_orders(db)
        .await?
        .into_iter()
        .find(|o| o.id == purchase_order_id)
        .ok_or_else(|| {
            CoreError::Internal("Bon de commande introuvable après annulation.".to_string())
        })
}
