// ============================================================================
// Facturation, paiement et annulation d'une commande
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::inventory::sync_stock_balance_tx;
use crate::application::sales::{audit_log_tx, require_open_session_tx};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::dtos::{OrderDetailDto, PayOrderInput};
use super::queries::get_order;

pub async fn invoice_order(db: &DepotDb, id: i64) -> CoreResult<OrderDetailDto> {
    require_current_actor_permission(Permission::SalesWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let row: Option<(String, String, i64, i64, i64, i64, i64, i64, Option<String>)> = sqlx::query_as(
        "SELECT order_number, status, customer_id, subtotal_xof, discount_xof, total_xof,
                deposit_due_xof, total_to_collect_xof, notes FROM orders WHERE id = ?",
    ).bind(id).fetch_optional(&mut *tx).await?;
    let (order_number, status, customer_id, subtotal, discount, merchandise_total, deposit, total, notes) =
        row.ok_or_else(|| CoreError::NotFound("Commande introuvable.".into()))?;
    if matches!(status.as_str(), "invoiced" | "paid") {
        tx.rollback().await?;
        return get_order(db, id).await;
    }
    if !matches!(status.as_str(), "confirmed" | "delivered") {
        return Err(CoreError::Validation(
            "La commande doit être confirmée ou livrée pour être facturée.".into(),
        ));
    }
    crate::application::commercial_documents::require_approval_or_owner("customer_order", id, &mut tx).await?;
    let already: Option<i64> = sqlx::query_scalar("SELECT id FROM sales WHERE order_id = ?")
        .bind(id).fetch_optional(&mut *tx).await?;
    if already.is_some() {
        sqlx::query("UPDATE orders SET status = 'invoiced', updated_at = datetime('now') WHERE id = ?")
            .bind(id).execute(&mut *tx).await?;
        tx.commit().await?;
        return get_order(db, id).await;
    }
    let paid: i64 = sqlx::query_scalar("SELECT paid_xof FROM orders WHERE id = ?")
        .bind(id).fetch_one(&mut *tx).await?;
    if paid > total {
        return Err(CoreError::InvalidPayment("Les paiements excèdent le montant de la commande.".into()));
    }
    let balance = total - paid;
    if balance > 0 {
        let credit: Option<(String, Option<i64>)> = sqlx::query_as(
            "SELECT policy, credit_limit FROM client_credit_settings WHERE client_id = ?",
        ).bind(customer_id).fetch_optional(&mut *tx).await?;
        let (policy, limit) = credit.unwrap_or_else(|| ("forbidden".to_string(), None));
        if policy == "forbidden" {
            return Err(CoreError::CreditPolicyViolation("Le solde de cette commande ne peut pas devenir une créance pour ce client.".into()));
        }
        if policy == "limited" {
            let outstanding: i64 = sqlx::query_scalar(
                "SELECT COALESCE(SUM(remaining_amount), 0) FROM customer_receivables WHERE client_id = ? AND status IN ('open', 'partial')",
            ).bind(customer_id).fetch_one(&mut *tx).await?;
            if outstanding.saturating_add(balance) > limit.unwrap_or(0) {
                return Err(CoreError::CreditPolicyViolation("La limite de crédit client serait dépassée par cette facture.".into()));
            }
        }
    }
    let receipt = DepotDb::next_sequence(&mut tx, "REC").await?;
    let request_key = format!("order-invoice:{id}");
    let sale_id = sqlx::query(
        "INSERT INTO sales (reference, request_key, order_id, client_id, sale_type, price_tier,
            subtotal_merchandise, discount_amount, total_merchandise, total_deposit, total_amount, paid_amount, status, notes)
         VALUES (?, ?, ?, ?, ?, 'retail', ?, ?, ?, ?, ?, ?, 'validated', ?)",
    ).bind(&receipt).bind(&request_key).bind(id).bind(customer_id)
     .bind(if paid == total { "cash" } else { "credit" })
     .bind(subtotal).bind(discount).bind(merchandise_total).bind(deposit).bind(total).bind(paid)
     .bind(notes.as_deref().map(|note| format!("Commande {order_number}: {note}" )).or_else(|| Some(format!("Commande {order_number}"))))
     .execute(&mut *tx).await?.last_insert_rowid();
    let lines: Vec<(i64, i64, i64, i64, i64, i64, i64, String, String, String)> = sqlx::query_as(
        "SELECT ol.product_id, ol.variant_id, ol.requested_quantity, ol.base_quantity, ol.unit_price_xof,
                ol.discount_xof, ol.line_total_xof, ol.requested_unit, p.base_unit, p.name
         FROM order_lines ol JOIN products p ON p.id = ol.product_id WHERE ol.order_id = ? ORDER BY ol.id",
    ).bind(id).fetch_all(&mut *tx).await?;
    for (product_id, variant_id, qty, base_qty, base_price, line_discount, line_total, unit, base_unit, product_name) in lines {
        let packaging_name = match unit.as_str() {
            "crate" | "half_crate" => "casier", "carton" => "carton", "pack" => "pack",
            "can" => "canette", _ => "bouteille",
        };
        let packaging: Option<(i64, String)> = sqlx::query_as(
            "SELECT id, name FROM product_packagings WHERE product_id = ? AND is_active = 1
             ORDER BY CASE WHEN name = ? THEN 0 ELSE 1 END, id LIMIT 1",
        ).bind(product_id).bind(packaging_name).fetch_optional(&mut *tx).await?;
        let (packaging_id, actual_packaging_name) = packaging.ok_or_else(|| CoreError::Validation(
            format!("Aucun conditionnement actif pour le produit #{product_id}.")))?;
        let coefficient = base_qty.checked_div(qty).filter(|value| *value > 0)
            .and_then(|value| value.checked_mul(1000))
            .ok_or_else(|| CoreError::Validation("Quantité ou coefficient de commande invalide.".into()))?;
        let unit_price = base_price.checked_mul(coefficient / 1000)
            .ok_or_else(|| CoreError::Validation("Débordement du prix de ligne.".into()))?;
        sqlx::query(
            "INSERT INTO sale_lines (sale_id, product_id, packaging_id, variant_id, product_name, packaging_name,
                base_unit, coefficient_milli, quantity_milli, base_quantity_milli, unit_price, discount_amount, line_total)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(sale_id).bind(product_id).bind(packaging_id).bind(variant_id).bind(product_name)
         .bind(actual_packaging_name).bind(base_unit).bind(coefficient).bind(qty * 1000)
         .bind(base_qty * 1000).bind(unit_price).bind(line_discount).bind(line_total)
         .execute(&mut *tx).await?;
    }
    sqlx::query("UPDATE payments SET sale_id = ?, payment_kind = 'sale' WHERE order_id = ? AND sale_id IS NULL")
        .bind(sale_id).bind(id).execute(&mut *tx).await?;
    if balance > 0 {
        sqlx::query(
            "INSERT INTO customer_receivables (sale_id, client_id, initial_amount, remaining_amount, status)
             VALUES (?, ?, ?, ?, ?)",
        ).bind(sale_id).bind(customer_id).bind(balance).bind(balance)
         .bind(if paid > 0 { "partial" } else { "open" }).execute(&mut *tx).await?;
    }
    sqlx::query("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(if paid == total { "paid" } else { "invoiced" }).bind(id).execute(&mut *tx).await?;
    audit_log_tx(&mut tx, "invoice_order", "order", Some(id.to_string()), &format!("Reçu {receipt} créé à partir de la commande {order_number}; stock déjà décrémenté lors de la confirmation.")).await?;
    tx.commit().await?;
    get_order(db, id).await
}

pub async fn pay_order(db: &DepotDb, id: i64, input: PayOrderInput) -> CoreResult<OrderDetailDto> {
    require_current_actor_permission(Permission::SalesWrite)?;
    if input.amount_xof <= 0 {
        return Err(CoreError::Validation("Montant payé doit être > 0.".into()));
    }
    let request_key = input.request_key.as_deref().map(str::trim).filter(|key| !key.is_empty())
        .map(str::to_owned).unwrap_or_else(|| format!("order-payment:{}", uuid::Uuid::new_v4()));
    let (_guard, mut tx) = db.begin_write().await?;
    if let Some((payment_order_id,)) = sqlx::query_as::<_, (Option<i64>,)>(
        "SELECT order_id FROM payments WHERE request_key = ?",
    ).bind(&request_key).fetch_optional(&mut *tx).await? {
        tx.rollback().await?;
        if payment_order_id != Some(id) {
            return Err(CoreError::DuplicateOperation("Clé de paiement déjà utilisée pour une autre commande.".into()));
        }
        return get_order(db, id).await;
    }
    let row: Option<(String, String, i64, i64, i64)> = sqlx::query_as(
        "SELECT order_number, status, customer_id, paid_xof, total_to_collect_xof FROM orders WHERE id = ?",
    ).bind(id).fetch_optional(&mut *tx).await?;
    let (order_number, status, customer_id, paid, total) = row
        .ok_or_else(|| CoreError::NotFound("Commande introuvable.".into()))?;
    if !matches!(status.as_str(), "confirmed" | "delivered" | "invoiced") {
        return Err(CoreError::Validation("La commande doit être confirmée avant encaissement.".into()));
    }
    let next_paid = paid.checked_add(input.amount_xof)
        .ok_or_else(|| CoreError::InvalidPayment("Débordement du montant payé.".into()))?;
    if next_paid > total {
        return Err(CoreError::InvalidPayment("Le paiement dépasse le solde de la commande.".into()));
    }
    let (session_id, _, _) = require_open_session_tx(&mut tx).await?;
    let requested_method = input.method.trim().to_ascii_lowercase();
    let method_code: Option<String> = if requested_method == "mobile_money" {
        sqlx::query_scalar("SELECT code FROM payment_methods WHERE active = 1 AND code IN ('wave', 'orange_money', 'mtn_money') ORDER BY code LIMIT 1")
            .fetch_optional(&mut *tx).await?
    } else if matches!(requested_method.as_str(), "cash" | "wave" | "orange_money" | "mtn_money" | "transfer" | "cheque") {
        sqlx::query_scalar("SELECT code FROM payment_methods WHERE code = ? AND active = 1")
            .bind(&requested_method).fetch_optional(&mut *tx).await?
    } else { None };
    let method_code = method_code.ok_or_else(|| CoreError::InvalidPayment("Moyen de paiement invalide ou inactif.".into()))?;
    let sale_id: Option<i64> = sqlx::query_scalar("SELECT id FROM sales WHERE order_id = ?")
        .bind(id).fetch_optional(&mut *tx).await?;
    let receivable: Option<(i64, i64)> = if let Some(sale_id) = sale_id {
        sqlx::query_as("SELECT id, remaining_amount FROM customer_receivables WHERE sale_id = ? AND status IN ('open', 'partial')")
            .bind(sale_id).fetch_optional(&mut *tx).await?
    } else { None };
    if receivable.is_some_and(|(_, remaining)| input.amount_xof > remaining) {
        return Err(CoreError::InvalidPayment("Le paiement dépasse le solde de la créance.".into()));
    }
    let payment_kind = if receivable.is_some() { "receivable" } else { "sale" };
    let payment_reference = DepotDb::next_sequence(&mut tx, "REC").await?;
    let payment_id = sqlx::query(
        "INSERT INTO payments (reference, request_key, sale_id, order_id, client_id, payment_kind, total_amount, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(&payment_reference).bind(&request_key).bind(sale_id).bind(id).bind(customer_id)
     .bind(payment_kind).bind(input.amount_xof)
     .bind(format!("Encaissement commande {order_number}" )).execute(&mut *tx).await?.last_insert_rowid();
    let payment_part_id = sqlx::query(
        "INSERT INTO payment_parts (payment_id, method_code, amount) VALUES (?, ?, ?)",
    ).bind(payment_id).bind(&method_code).bind(input.amount_xof).execute(&mut *tx).await?.last_insert_rowid();
    sqlx::query(
        "INSERT INTO cash_movements (session_id, request_key, payment_part_id, kind, method_code, direction, amount, description, reference_document)
         VALUES (?, ?, ?, ?, ?, 'in', ?, ?, ?)",
    ).bind(session_id).bind(format!("order-cash:{request_key}")).bind(payment_part_id).bind(payment_kind).bind(&method_code)
     .bind(input.amount_xof).bind(format!("Encaissement commande {order_number}" )).bind(&order_number)
     .execute(&mut *tx).await?;
    if let (Some(sale_id), Some((receivable_id, remaining))) = (sale_id, receivable) {
        let new_balance = remaining - input.amount_xof;
        sqlx::query("INSERT INTO payment_allocations (payment_id, receivable_id, amount) VALUES (?, ?, ?)")
            .bind(payment_id).bind(receivable_id).bind(input.amount_xof).execute(&mut *tx).await?;
        sqlx::query("UPDATE customer_receivables SET remaining_amount = ?, status = ? WHERE id = ?")
            .bind(new_balance).bind(if new_balance == 0 { "paid" } else { "partial" }).bind(receivable_id)
            .execute(&mut *tx).await?;
        sqlx::query("UPDATE sales SET paid_amount = paid_amount + ? WHERE id = ?")
            .bind(input.amount_xof).bind(sale_id).execute(&mut *tx).await?;
    }
    let pay_status = if next_paid == total { "paid" } else { "partial" };
    let method = if requested_method == "mobile_money" { "mobile_money" } else { "cash" };
    sqlx::query(
        "UPDATE orders SET paid_xof = ?, payment_status = ?, payment_method = ?,
         status = CASE WHEN ? = 'paid' AND status = 'invoiced' THEN 'paid' ELSE status END,
         updated_at = datetime('now') WHERE id = ?",
    ).bind(next_paid).bind(pay_status).bind(method).bind(pay_status).bind(id)
     .execute(&mut *tx).await?;
    audit_log_tx(&mut tx, "pay_order", "order", Some(id.to_string()),
        &format!("Encaissement de {} FCFA ({method_code}) pour {order_number}", input.amount_xof)).await?;
    tx.commit().await?;
    get_order(db, id).await
}

pub async fn cancel_order(db: &DepotDb, id: i64) -> CoreResult<OrderDetailDto> {
    require_current_actor_permission(Permission::SalesCancelReturn)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let row: Option<(String, String, i64)> =
        sqlx::query_as("SELECT order_number, status, paid_xof FROM orders WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let (order_number, status, paid) =
        row.ok_or_else(|| CoreError::NotFound("Commande introuvable.".into()))?;
    if status == "cancelled" {
        return Err(CoreError::Validation("Commande déjà annulée.".into()));
    }
    if matches!(status.as_str(), "delivered" | "invoiced" | "paid") || paid > 0 {
        return Err(CoreError::Validation(
            "Impossible d'annuler une commande déjà livrée ou encaissée; remboursez d'abord les paiements.".into(),
        ));
    }
    if status == "confirmed" {
        let lines: Vec<(i64, i64, i64, i64)> = sqlx::query_as(
            "SELECT id, product_id, variant_id, base_quantity FROM order_lines WHERE order_id = ?",
        )
        .bind(id)
        .fetch_all(&mut *tx)
        .await?;
        for (line_id, product_id, variant_id, base_qty) in lines {
            let (stock_milli, loc_id): (i64, Option<i64>) = sqlx::query_as(
                "SELECT stock_milli, default_location_id FROM products WHERE id = ?",
            )
            .bind(product_id)
            .fetch_one(&mut *tx)
            .await?;
            let qty_milli = base_qty * 1000;
            let next_milli = stock_milli + qty_milli;
            sqlx::query("UPDATE products SET stock_milli = ? WHERE id = ?")
                .bind(next_milli)
                .bind(product_id)
                .execute(&mut *tx)
                .await?;
            sync_stock_balance_tx(&mut tx, product_id, next_milli).await?;
            sqlx::query(
                "INSERT INTO stock_movements (
                    product_id, movement_type, quantity_milli, stock_before_milli,
                    stock_after_milli, reason, reference_document, location_id,
                    variant_id, order_id, order_line_id
                 ) VALUES (?, 'sale_cancel_in', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(product_id)
            .bind(qty_milli)
            .bind(stock_milli)
            .bind(next_milli)
            .bind(format!("Annulation commande {order_number}"))
            .bind(&order_number)
            .bind(loc_id)
            .bind(variant_id)
            .bind(id)
            .bind(line_id)
            .execute(&mut *tx)
            .await?;
        }
    }
    sqlx::query(
        "UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?",
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    get_order(db, id).await
}
