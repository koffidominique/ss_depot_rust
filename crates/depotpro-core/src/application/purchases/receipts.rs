// ============================================================================
// Réception des bons de commande fournisseurs
// ============================================================================

use std::collections::HashSet;

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::sales::audit_log_tx;
use crate::domain::money::Money;
use crate::domain::quantity::Quantity;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::receipt_helpers::{apply_receipt_stock_and_cost_tx, exchange_supplier_packaging_tx};
use super::{PurchaseReceiptDto, ReceivePurchaseOrderInput};

pub async fn receive_purchase_order(
    db: &DepotDb,
    purchase_order_id: i64,
    input: ReceivePurchaseOrderInput,
) -> CoreResult<PurchaseReceiptDto> {
    require_current_actor_permission(Permission::PurchasesWrite)?;
    if purchase_order_id <= 0 {
        return Err(CoreError::Validation(
            "Identifiant de bon de commande invalide.".to_string(),
        ));
    }
    let request_key = input.request_key.trim().to_string();
    if request_key.is_empty() {
        return Err(CoreError::Validation(
            "Clé d'idempotence requise.".to_string(),
        ));
    }
    if input.lines.is_empty() {
        return Err(CoreError::Validation(
            "Saisissez au moins une ligne reçue.".to_string(),
        ));
    }

    let mut seen_po_lines: HashSet<i64> = HashSet::with_capacity(input.lines.len());
    let mut normalized_lines: Vec<(i64, Quantity, Option<String>)> =
        Vec::with_capacity(input.lines.len());
    for l in &input.lines {
        if l.purchase_order_line_id <= 0 {
            return Err(CoreError::Validation(
                "Identifiant de ligne de commande invalide.".to_string(),
            ));
        }
        if !seen_po_lines.insert(l.purchase_order_line_id) {
            return Err(CoreError::Validation(format!(
                "Ligne de commande #{} dupliquée dans la même demande de réception. Regroupez les quantités sur une seule ligne.",
                l.purchase_order_line_id
            )));
        }
        let qty = Quantity::parse_str(&l.received_quantity, "Quantité réceptionnée")?;
        if qty.milli_units <= 0 {
            return Err(CoreError::Validation(
                "La quantité reçue doit être > 0.".to_string(),
            ));
        }
        let disc_reason = l
            .discrepancy_reason
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        normalized_lines.push((l.purchase_order_line_id, qty, disc_reason));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    if let Some(existing) = sqlx::query_as::<_, PurchaseReceiptDto>(
        "SELECT id, reference, purchase_order_id, total_amount, notes, created_at FROM purchase_receipts WHERE request_key = ?",
    )
    .bind(&request_key)
    .fetch_optional(&mut *tx)
    .await?
    {
        tx.rollback().await?;
        if existing.purchase_order_id != purchase_order_id {
            return Err(CoreError::DuplicateOperation(
                "Cette clé d'idempotence a déjà été utilisée pour un autre bon de commande."
                    .to_string(),
            ));
        }
        return Ok(existing);
    }

    let po: Option<(i64, String, i64, String)> = sqlx::query_as(
        "SELECT id, reference, supplier_id, status FROM purchase_orders WHERE id = ?",
    )
    .bind(purchase_order_id)
    .fetch_optional(&mut *tx)
    .await?;
    let (_po_id, po_ref, supplier_id, po_status) =
        po.ok_or_else(|| CoreError::Validation("Bon de commande introuvable.".to_string()))?;
    if matches!(po_status.as_str(), "cancelled" | "received") {
        return Err(CoreError::HistoricalImmutable(
            "Ce bon de commande est déjà clôturé ou annulé.".to_string(),
        ));
    }
    crate::application::commercial_documents::require_approval_or_owner(
        "purchase_order",
        purchase_order_id,
        &mut tx,
    )
    .await?;
    crate::application::commercial_documents::record_owner_direct_approval(
        "purchase_order",
        purchase_order_id,
        &mut tx,
    )
    .await?;

    let payment_terms_days: i64 =
        sqlx::query_scalar("SELECT payment_terms_days FROM suppliers WHERE id = ?")
            .bind(supplier_id)
            .fetch_one(&mut *tx)
            .await?;

    type PreparedReceiptLine = (i64, i64, i64, i64, i64, i64, i64, Option<String>);
    let mut receipt_total = Money::ZERO;
    let mut prepared: Vec<PreparedReceiptLine> = Vec::with_capacity(normalized_lines.len());

    for (po_line_id, qty, disc_reason) in &normalized_lines {
        let pol: Option<(i64, i64, i64, i64, i64, i64, i64)> = sqlx::query_as(
            "SELECT id, product_id, packaging_id, coefficient_milli, ordered_quantity_milli, received_quantity_milli, unit_price
             FROM purchase_order_lines WHERE id = ? AND purchase_order_id = ?",
        )
        .bind(po_line_id)
        .bind(purchase_order_id)
        .fetch_optional(&mut *tx)
        .await?;
        let (pol_id, pid, pkg_id, coeff_milli, ordered_milli, received_milli, unit_price) =
            pol.ok_or_else(|| CoreError::Validation("Ligne de commande introuvable.".to_string()))?;

        if received_milli >= ordered_milli {
            return Err(CoreError::Validation(format!(
                "La ligne de commande #{pol_id} a déjà été intégralement réceptionnée."
            )));
        }
        let cum_received = received_milli.checked_add(qty.milli_units).ok_or_else(|| {
            CoreError::Validation("Débordement quantité réceptionnée.".to_string())
        })?;
        if cum_received > ordered_milli {
            return Err(CoreError::Validation(
                "La quantité reçue dépasse la quantité commandée restante.".to_string(),
            ));
        }
        let base_qty = qty.multiply_coefficient_to_base(Quantity::from_milli(coeff_milli))?;
        let amount = Money(qty.compute_line_fcfa(unit_price)?);
        receipt_total = receipt_total.checked_add(amount, "Total réception")?;
        prepared.push((
            pol_id,
            pid,
            pkg_id,
            qty.milli_units,
            base_qty.milli_units,
            unit_price,
            amount.value(),
            disc_reason.clone(),
        ));
    }

    let rec_ref = DepotDb::next_sequence(&mut tx, "REC").await?;
    let receipt_id = sqlx::query(
        "INSERT INTO purchase_receipts (reference, request_key, purchase_order_id, total_amount, notes)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&rec_ref)
    .bind(&request_key)
    .bind(purchase_order_id)
    .bind(receipt_total.value())
    .bind(input.notes.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    for (pol_id, pid, pkg_id, qty_milli, base_qty_milli, unit_price, amount, disc_reason) in
        &prepared
    {
        let updated = sqlx::query(
            "UPDATE purchase_order_lines
             SET received_quantity_milli = received_quantity_milli + ?
             WHERE id = ? AND purchase_order_id = ? AND received_quantity_milli + ? <= ordered_quantity_milli",
        )
        .bind(qty_milli)
        .bind(pol_id)
        .bind(purchase_order_id)
        .bind(qty_milli)
        .execute(&mut *tx)
        .await?;
        if updated.rows_affected() != 1 {
            return Err(CoreError::Validation(
                "La quantité reçue dépasse la quantité commandée restante.".to_string(),
            ));
        }

        sqlx::query(
            "INSERT INTO purchase_receipt_lines (receipt_id, purchase_order_line_id, quantity_milli, base_quantity_milli, unit_price, amount, discrepancy_reason)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(receipt_id)
        .bind(pol_id)
        .bind(qty_milli)
        .bind(base_qty_milli)
        .bind(unit_price)
        .bind(amount)
        .bind(disc_reason.as_deref())
        .execute(&mut *tx)
        .await?;

        exchange_supplier_packaging_tx(
            &mut tx,
            *pkg_id,
            *qty_milli,
            *pol_id,
            &request_key,
            &rec_ref,
            &po_ref,
        )
        .await?;
        apply_receipt_stock_and_cost_tx(&mut tx, *pid, *base_qty_milli, *amount, &rec_ref, &po_ref)
            .await?;
    }

    let due_date = if payment_terms_days > 0 {
        Some(
            (chrono::Utc::now() + chrono::Duration::days(payment_terms_days))
                .format("%Y-%m-%d")
                .to_string(),
        )
    } else {
        None
    };

    sqlx::query(
        "INSERT INTO supplier_debts (receipt_id, supplier_id, initial_amount, remaining_amount, due_date, status)
         VALUES (?, ?, ?, ?, ?, 'open')",
    )
    .bind(receipt_id)
    .bind(supplier_id)
    .bind(receipt_total.value())
    .bind(receipt_total.value())
    .bind(due_date)
    .execute(&mut *tx)
    .await?;

    let rem: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(ordered_quantity_milli - received_quantity_milli), 0) FROM purchase_order_lines WHERE purchase_order_id = ?",
    )
    .bind(purchase_order_id)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        "UPDATE purchase_orders SET received_amount = received_amount + ?, status = ? WHERE id = ?",
    )
    .bind(receipt_total.value())
    .bind(if rem == 0 { "received" } else { "partial" })
    .bind(purchase_order_id)
    .execute(&mut *tx)
    .await?;

    audit_log_tx(
        &mut tx,
        "RECEIVE_PO",
        "purchase_receipts",
        Some(receipt_id.to_string()),
        &format!(
            "Réception {rec_ref} sur {po_ref} — {} FCFA",
            receipt_total.value()
        ),
    )
    .await?;
    tx.commit().await?;

    let rec = sqlx::query_as::<_, PurchaseReceiptDto>(
        "SELECT id, reference, purchase_order_id, total_amount, notes, created_at FROM purchase_receipts WHERE id = ?",
    )
    .bind(receipt_id)
    .fetch_one(&db.pool)
    .await?;
    Ok(rec)
}
