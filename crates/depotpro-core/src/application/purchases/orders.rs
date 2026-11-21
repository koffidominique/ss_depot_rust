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
