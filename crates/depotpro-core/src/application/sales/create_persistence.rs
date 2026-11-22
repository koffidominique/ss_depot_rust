// ============================================================================
// Persistance des lignes de vente, consignes, paiements et créances
// ============================================================================

use sqlx::{Sqlite, Transaction};

use crate::domain::money::Money;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::create_helpers::PreparedSaleLine;

pub(crate) struct SalePersistCtx<'a> {
    pub sale_id: i64,
    pub sale_ref: &'a str,
    pub request_key: &'a str,
    pub session_id: i64,
    pub client_id: Option<i64>,
    pub payment_terms_days: i64,
    pub due_date: Option<&'a str>,
    pub paid_amount: Money,
    pub credit_amount: i64,
}

pub(crate) async fn persist_sale_lines_and_deposits_tx(
    tx: &mut Transaction<'_, Sqlite>,
    ctx: &SalePersistCtx<'_>,
    lines: &[PreparedSaleLine],
) -> CoreResult<()> {
    for line in lines {
        let (brand, brewery_name, variant_name, volume_ml): (Option<String>, Option<String>, Option<String>, Option<i64>) = sqlx::query_as(
            "SELECT COALESCE(p.brand, br.name), b.name, pv.name, pv.volume_ml FROM products p
             LEFT JOIN brands br ON br.id = p.brand_id
             LEFT JOIN breweries b ON b.id = COALESCE(p.brewery_id, br.brewery_id)
             LEFT JOIN product_variants pv ON pv.id = ? WHERE p.id = ?",
        ).bind(line.variant_id).bind(line.product_id).fetch_one(&mut **tx).await?;
        let mut deposit_component_snapshots = Vec::with_capacity(line.deposit_items.len());
        for (returnable_id, pieces, unit_value, amount) in &line.deposit_items {
            let (code, name, kind): (String, String, String) = sqlx::query_as(
                "SELECT code, name, kind FROM returnable_packaging_types WHERE id = ?",
            ).bind(returnable_id).fetch_one(&mut **tx).await?;
            deposit_component_snapshots.push(serde_json::json!({
                "returnableId": returnable_id, "code": code, "name": name, "kind": kind,
                "pieces": pieces, "unitValueXof": unit_value, "amountXof": amount
            }));
        }
        let product_snapshot_json = serde_json::json!({
            "id": line.product_id, "name": line.product_name, "brand": brand,
            "brewery": brewery_name, "variantId": line.variant_id, "variant": variant_name,
            "volumeMl": volume_ml, "baseUnit": line.base_unit
        }).to_string();
        let packaging_snapshot_json = serde_json::json!({
            "id": line.packaging_id, "name": line.packaging_name,
            "salesUnit": line.sales_unit_label, "coefficientMilli": line.coeff_milli,
            "quantityMilli": line.qty_milli, "baseQuantityMilli": line.base_qty_milli,
            "unitPriceXof": line.unit_price, "discountXof": line.line_discount,
            "lineTotalXof": line.line_total, "depositRegime": line.deposit_mode,
            "depositItems": deposit_component_snapshots
        }).to_string();
        let line_id = sqlx::query(
            "INSERT INTO sale_lines (sale_id, product_id, packaging_id, variant_id, sales_unit_id, sales_unit_label, product_name, packaging_name, base_unit, coefficient_milli, quantity_milli, base_quantity_milli, unit_price, discount_amount, line_total, cost_num, cost_den, product_snapshot_json, packaging_snapshot_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(ctx.sale_id)
        .bind(line.product_id)
        .bind(line.packaging_id)
        .bind(line.variant_id)
        .bind(line.sales_unit_id)
        .bind(&line.sales_unit_label)
        .bind(&line.product_name)
        .bind(&line.packaging_name)
        .bind(&line.base_unit)
        .bind(line.coeff_milli)
        .bind(line.qty_milli)
        .bind(line.base_qty_milli)
        .bind(line.unit_price)
        .bind(line.line_discount)
        .bind(line.line_total)
        .bind(&line.cost_num)
        .bind(&line.cost_den)
        .bind(&product_snapshot_json)
        .bind(&packaging_snapshot_json)
        .execute(&mut **tx)
        .await?
        .last_insert_rowid();

        let cur_stock: i64 = sqlx::query_scalar("SELECT stock_milli FROM products WHERE id = ?")
            .bind(line.product_id)
            .fetch_one(&mut **tx)
            .await?;
        let next_stock = cur_stock.checked_sub(line.base_qty_milli).ok_or_else(|| {
            CoreError::Validation("Débordement stock lors de la vente.".to_string())
        })?;
        sqlx::query("UPDATE products SET stock_milli = ? WHERE id = ?")
            .bind(next_stock)
            .bind(line.product_id)
            .execute(&mut **tx)
            .await?;

        crate::application::inventory::sync_stock_balance_tx(tx, line.product_id, next_stock)
            .await?;

        sqlx::query(
            "INSERT INTO stock_movements (product_id, variant_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, reason, reference_document)
             VALUES (?, ?, 'sale_out', ?, ?, ?, ?, ?)",
        )
        .bind(line.product_id)
        .bind(line.variant_id)
        .bind(-line.base_qty_milli)
        .bind(cur_stock)
        .bind(next_stock)
        .bind(format!(
            "Vente {} ({})",
            ctx.sale_ref,
            line.sales_unit_label
                .as_deref()
                .unwrap_or(&line.packaging_name)
        ))
        .bind(ctx.sale_ref)
        .execute(&mut **tx)
        .await?;

        for (rid, pieces, unit_val, amt) in &line.deposit_items {
            let (policy_id, return_delay_days): (Option<i64>, i64) = sqlx::query_as(
                "SELECT id, return_delay_days FROM packaging_policies
                 WHERE is_active = 1
                   AND ((client_id = ? AND returnable_id = ?)
                     OR (client_id = ? AND returnable_id IS NULL)
                     OR (client_id IS NULL AND returnable_id = ?)
                     OR (client_id IS NULL AND returnable_id IS NULL))
                 ORDER BY (client_id = ?) DESC, (returnable_id = ?) DESC
                 LIMIT 1",
            )
            .bind(ctx.client_id)
            .bind(rid)
            .bind(ctx.client_id)
            .bind(rid)
            .bind(ctx.client_id)
            .bind(rid)
            .fetch_optional(&mut **tx)
            .await?
            .unwrap_or((None, 30));
            let due_date = (chrono::Utc::now() + chrono::Duration::days(return_delay_days))
                .format("%Y-%m-%d")
                .to_string();
            sqlx::query(
                "INSERT INTO deposit_issues (sale_id, sale_line_id, client_id, returnable_id, pieces, unit_value, amount, due_date, policy_id, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')",
            )
            .bind(ctx.sale_id)
            .bind(line_id)
            .bind(ctx.client_id)
            .bind(rid)
            .bind(pieces)
            .bind(unit_val)
            .bind(amt)
            .bind(&due_date)
            .bind(policy_id)
            .execute(&mut **tx)
            .await?;

            if let Some(cid) = ctx.client_id {
                sqlx::query(
                    "INSERT INTO customer_packaging_accounts (client_id, returnable_id, balance_pieces, deposit_held_amount)
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT(client_id, returnable_id) DO UPDATE SET
                       balance_pieces = balance_pieces + excluded.balance_pieces,
                       deposit_held_amount = deposit_held_amount + excluded.deposit_held_amount",
                )
                .bind(cid)
                .bind(rid)
                .bind(pieces)
                .bind(amt)
                .execute(&mut **tx)
                .await?;
            }
        }
    }
    Ok(())
}

pub(crate) async fn persist_sale_payments_and_receivable_tx(
    tx: &mut Transaction<'_, Sqlite>,
    ctx: &SalePersistCtx<'_>,
    normalized_payments: &[(String, i64)],
) -> CoreResult<()> {
    if ctx.paid_amount.value() > 0 {
        let pay_ref = DepotDb::next_sequence(tx, "PAY").await?;
        let payment_id = sqlx::query(
            "INSERT INTO payments (reference, request_key, sale_id, client_id, payment_kind, total_amount, note)
             VALUES (?, ?, ?, ?, 'sale', ?, ?)",
        )
        .bind(&pay_ref)
        .bind(format!("pay-sale:{}", ctx.request_key))
        .bind(ctx.sale_id)
        .bind(ctx.client_id)
        .bind(ctx.paid_amount.value())
        .bind(format!("Encaissement vente {}", ctx.sale_ref))
        .execute(&mut **tx)
        .await?
        .last_insert_rowid();

        for (idx, (method_code, amt)) in normalized_payments.iter().enumerate() {
            let part_id = sqlx::query(
                "INSERT INTO payment_parts (payment_id, method_code, amount) VALUES (?, ?, ?)",
            )
            .bind(payment_id)
            .bind(method_code)
            .bind(amt)
            .execute(&mut **tx)
            .await?
            .last_insert_rowid();

            sqlx::query(
                "INSERT INTO cash_movements (session_id, request_key, payment_part_id, kind, method_code, direction, amount, description, reference_document)
                 VALUES (?, ?, ?, 'sale', ?, 'in', ?, ?, ?)",
            )
            .bind(ctx.session_id)
            .bind(format!("cm-sale:{}:{idx}", ctx.request_key))
            .bind(part_id)
            .bind(method_code)
            .bind(amt)
            .bind(format!("Encaissement {}", ctx.sale_ref))
            .bind(ctx.sale_ref)
            .execute(&mut **tx)
            .await?;
        }
    }

    if ctx.credit_amount > 0 {
        if let Some(cid) = ctx.client_id {
            let due_date = ctx
                .due_date
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .or_else(|| {
                    if ctx.payment_terms_days > 0 {
                        Some(
                            (chrono::Utc::now() + chrono::Duration::days(ctx.payment_terms_days))
                                .format("%Y-%m-%d")
                                .to_string(),
                        )
                    } else {
                        None
                    }
                });
            sqlx::query(
                "INSERT INTO customer_receivables (sale_id, client_id, initial_amount, remaining_amount, due_date, status)
                 VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind(ctx.sale_id)
            .bind(cid)
            .bind(ctx.credit_amount)
            .bind(ctx.credit_amount)
            .bind(due_date)
            .bind(if ctx.paid_amount.value() > 0 {
                "partial"
            } else {
                "open"
            })
            .execute(&mut **tx)
            .await?;
        }
    }
    Ok(())
}
