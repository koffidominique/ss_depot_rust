// Commercial document register and owner approval workflow.
// Existing sales/orders/purchases tables are the source of truth for business data.
use crate::application::auth::{self, Permission, Role};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CommercialDocumentDto {
    pub document_type: String,
    pub document_id: i64,
    pub document_number: String,
    pub counterparty: String,
    pub status: String,
    pub approval_status: Option<String>,
    pub amount_xof: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CommercialDocumentsQuery {
    pub search: Option<String>,
    pub document_type: Option<String>,
    pub status: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub sort: Option<String>,
    pub page: Option<u32>,
    pub page_size: Option<u32>,
    pub approvals_only: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommercialDocumentsPage {
    pub rows: Vec<CommercialDocumentDto>,
    pub total: usize,
    pub pending_count: usize,
    pub page: u32,
    pub page_size: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommercialDocumentDetail {
    pub document_type: String,
    pub document_id: i64,
    pub document_number: String,
    pub counterparty: String,
    pub status: String,
    pub amount_xof: i64,
    pub created_at: String,
    pub notes: Option<String>,
    pub lines: Vec<CommercialDocumentDetailLine>,
    pub payments: Vec<CommercialDocumentDetailPayment>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommercialDocumentDetailLine {
    pub label: String,
    pub detail: Option<String>,
    pub quantity_milli: i64,
    pub unit: String,
    pub unit_price_xof: i64,
    pub amount_xof: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommercialDocumentDetailPayment {
    pub label: String,
    pub amount_xof: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewDecisionInput {
    pub action: String,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalEventDto {
    pub id: i64,
    pub document_type: String,
    pub document_id: i64,
    pub action: String,
    pub actor_user_id: Option<i64>,
    pub actor_role: Option<String>,
    pub reason: Option<String>,
    pub snapshot_json: String,
    pub created_at: String,
}

fn authenticated_actor() -> CoreResult<auth::SessionIdentity> {
    auth::current_actor().ok_or_else(|| CoreError::Forbidden("Session authentifiée requise.".into()))
}

fn actor_db_id(actor: &auth::SessionIdentity) -> Option<i64> {
    actor.user_id.parse::<i64>().ok()
}

fn check_document_type(document_type: &str) -> CoreResult<()> {
    if matches!(document_type, "customer_order" | "purchase_order") {
        Ok(())
    } else {
        Err(CoreError::Validation("Type de document non approuvable.".into()))
    }
}

async fn document_snapshot(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    document_type: &str,
    document_id: i64,
) -> CoreResult<serde_json::Value> {
    match document_type {
        "customer_order" => {
            let header: Option<(String, String, i64, i64, i64, Option<String>, String)> = sqlx::query_as(
                "SELECT o.order_number, c.name, o.subtotal_xof, o.discount_xof, o.total_to_collect_xof, o.notes, o.status
                 FROM orders o JOIN clients c ON c.id = o.customer_id WHERE o.id = ?",
            )
            .bind(document_id)
            .fetch_optional(&mut **tx)
            .await?;
            let (number, party, subtotal, discount, total, notes, status) = header
                .ok_or_else(|| CoreError::NotFound("Commande client introuvable.".into()))?;
            let lines: Vec<(String, String, i64, i64, i64)> = sqlx::query_as(
                "SELECT p.name, v.name, ol.base_quantity, ol.unit_price_xof, ol.line_total_xof
                 FROM order_lines ol JOIN products p ON p.id = ol.product_id
                 JOIN product_variants v ON v.id = ol.variant_id
                 WHERE ol.order_id = ? ORDER BY ol.id",
            )
            .bind(document_id)
            .fetch_all(&mut **tx)
            .await?;
            Ok(serde_json::json!({
                "documentType": document_type, "id": document_id, "number": number,
                "counterparty": party, "status": status, "subtotalXof": subtotal,
                "discountXof": discount, "totalXof": total, "notes": notes,
                "items": lines.into_iter().map(|(product, variant, quantity, unit_price, line_total)| serde_json::json!({
                    "product": product, "variant": variant, "quantity": quantity,
                    "unitPriceXof": unit_price, "lineTotalXof": line_total
                })).collect::<Vec<_>>()
            }))
        }
        "purchase_order" => {
            let header: Option<(String, String, i64, Option<String>, String)> = sqlx::query_as(
                "SELECT po.reference, s.name, po.total_amount, po.notes, po.status
                 FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE po.id = ?",
            )
            .bind(document_id)
            .fetch_optional(&mut **tx)
            .await?;
            let (number, party, total, notes, status) = header
                .ok_or_else(|| CoreError::NotFound("Bon fournisseur introuvable.".into()))?;
            let lines: Vec<(String, String, i64, i64, i64)> = sqlx::query_as(
                "SELECT product_name, packaging_name, ordered_quantity_milli, unit_price, line_total
                 FROM purchase_order_lines WHERE purchase_order_id = ? ORDER BY id",
            )
            .bind(document_id)
            .fetch_all(&mut **tx)
            .await?;
            Ok(serde_json::json!({
                "documentType": document_type, "id": document_id, "number": number,
                "counterparty": party, "status": status, "totalXof": total, "notes": notes,
                "items": lines.into_iter().map(|(product, packaging, quantity_milli, unit_price, line_total)| serde_json::json!({
                    "product": product, "packaging": packaging, "quantityMilli": quantity_milli,
                    "unitPriceXof": unit_price, "lineTotalXof": line_total
                })).collect::<Vec<_>>()
            }))
        }
        _ => Err(CoreError::Validation("Type de document non approuvable.".into())),
    }
}

pub async fn list_documents(db: &DepotDb) -> CoreResult<Vec<CommercialDocumentDto>> {
    let scope = if let Some(actor) = auth::current_actor() {
        let sales = actor.has_permission(Permission::SalesRead);
        let purchases = actor.has_permission(Permission::PurchasesRead);
        let reports = actor.has_permission(Permission::ReportsRead);
        if !sales && !purchases && !reports {
            return Err(CoreError::Forbidden("Consultation des documents commerciaux refusée.".into()));
        }
        (sales || reports, purchases || reports)
    } else {
        (true, true)
    };
    let rows = sqlx::query_as::<_, CommercialDocumentDto>(
        "SELECT * FROM (
            SELECT 'customer_order' AS document_type, o.id AS document_id, o.order_number AS document_number,
                   c.name AS counterparty, o.status AS status, w.status AS approval_status,
                   o.total_to_collect_xof AS amount_xof, o.created_at AS created_at
            FROM orders o JOIN clients c ON c.id = o.customer_id
            LEFT JOIN commercial_document_workflows w ON w.document_type = 'customer_order' AND w.document_id = o.id
            UNION ALL
            SELECT 'sales_receipt', s.id, s.reference, COALESCE(c.name, 'Client comptoir'), s.status, NULL,
                   s.total_amount, s.created_at
            FROM sales s LEFT JOIN clients c ON c.id = s.client_id
            UNION ALL
            SELECT 'purchase_order', po.id, po.reference, sp.name, po.status, w.status,
                   po.total_amount, po.created_at
            FROM purchase_orders po JOIN suppliers sp ON sp.id = po.supplier_id
            LEFT JOIN commercial_document_workflows w ON w.document_type = 'purchase_order' AND w.document_id = po.id
            UNION ALL
            SELECT 'supplier_reception', pr.id, pr.reference, sp.name, 'received', NULL,
                   pr.total_amount, pr.created_at
            FROM purchase_receipts pr JOIN purchase_orders po ON po.id = pr.purchase_order_id
            JOIN suppliers sp ON sp.id = po.supplier_id
            UNION ALL
            SELECT 'payment_receipt', p.id, p.reference, COALESCE(c.name, 'Règlement fournisseur'), p.payment_kind, NULL,
                   p.total_amount, p.created_at
            FROM payments p LEFT JOIN clients c ON c.id = p.client_id
            UNION ALL
            SELECT 'credit_note', sr.id, sr.credit_note_ref, COALESCE(c.name, 'Client comptoir'), sr.reason, NULL,
                   sr.total_amount, sr.created_at
            FROM sales_returns sr JOIN sales s ON s.id = sr.sale_id LEFT JOIN clients c ON c.id = s.client_id
            UNION ALL
            SELECT 'cancellation', sc.id, s.reference, COALESCE(c.name, 'Client comptoir'), 'cancelled', NULL,
                   sc.refunded_amount, sc.created_at
            FROM sales_cancellations sc JOIN sales s ON s.id = sc.sale_id LEFT JOIN clients c ON c.id = s.client_id
         ) ORDER BY created_at DESC, document_id DESC",
    )
    .fetch_all(&db.pool)
    .await?;
    Ok(rows
        .into_iter()
        .filter(|row| match row.document_type.as_str() {
            "customer_order" | "sales_receipt" | "credit_note" | "cancellation" => scope.0,
            "purchase_order" | "supplier_reception" => scope.1,
            "payment_receipt" => scope.0 || scope.1,
            _ => false,
        })
        .collect())
}

const DOCUMENT_UNION_SQL: &str = "SELECT 'customer_order' AS document_type, o.id AS document_id,
    o.order_number AS document_number, c.name AS counterparty, o.status AS status,
    w.status AS approval_status, o.total_to_collect_xof AS amount_xof, o.created_at AS created_at
    FROM orders o JOIN clients c ON c.id = o.customer_id
    LEFT JOIN commercial_document_workflows w ON w.document_type = 'customer_order' AND w.document_id = o.id
    UNION ALL
    SELECT 'sales_receipt', s.id, s.reference, COALESCE(c.name, 'Client comptoir'), s.status, NULL,
        s.total_amount, s.created_at FROM sales s LEFT JOIN clients c ON c.id = s.client_id
    UNION ALL
    SELECT 'purchase_order', po.id, po.reference, sp.name, po.status, w.status, po.total_amount, po.created_at
    FROM purchase_orders po JOIN suppliers sp ON sp.id = po.supplier_id
    LEFT JOIN commercial_document_workflows w ON w.document_type = 'purchase_order' AND w.document_id = po.id
    UNION ALL
    SELECT 'supplier_reception', pr.id, pr.reference, sp.name, 'received', NULL, pr.total_amount, pr.created_at
    FROM purchase_receipts pr JOIN purchase_orders po ON po.id = pr.purchase_order_id
    JOIN suppliers sp ON sp.id = po.supplier_id
    UNION ALL
    SELECT 'payment_receipt', p.id, p.reference, COALESCE(c.name, 'Règlement fournisseur'), p.payment_kind, NULL,
        p.total_amount, p.created_at FROM payments p LEFT JOIN clients c ON c.id = p.client_id
    UNION ALL
    SELECT 'credit_note', sr.id, sr.credit_note_ref, COALESCE(c.name, 'Client comptoir'), sr.reason, NULL,
        sr.total_amount, sr.created_at FROM sales_returns sr JOIN sales s ON s.id = sr.sale_id
    LEFT JOIN clients c ON c.id = s.client_id
    UNION ALL
    SELECT 'cancellation', sc.id, s.reference, COALESCE(c.name, 'Client comptoir'), 'cancelled', NULL,
        sc.refunded_amount, sc.created_at FROM sales_cancellations sc JOIN sales s ON s.id = sc.sale_id
    LEFT JOIN clients c ON c.id = s.client_id";

pub async fn get_document_detail(
    db: &DepotDb,
    document_type: &str,
    document_id: i64,
) -> CoreResult<CommercialDocumentDetail> {
    if document_id <= 0 {
        return Err(CoreError::Validation("Identifiant de document invalide.".into()));
    }
    let actor = auth::current_actor();
    let required = match document_type {
        "customer_order" | "sales_receipt" | "credit_note" | "cancellation" => {
            Permission::SalesRead
        }
        "purchase_order" | "supplier_reception" => Permission::PurchasesRead,
        "payment_receipt" => {
            let kind: Option<String> = sqlx::query_scalar("SELECT payment_kind FROM payments WHERE id = ?")
                .bind(document_id)
                .fetch_optional(&db.pool)
                .await?;
            match kind.as_deref() {
                Some("supplier_debt") => Permission::PurchasesRead,
                Some(_) => Permission::SalesRead,
                None => return Err(CoreError::NotFound("Règlement introuvable.".into())),
            }
        }
        _ => return Err(CoreError::Validation("Type de document invalide.".into())),
    };
    if let Some(actor) = actor.as_ref() {
        auth::require_permission(actor, required)?;
    }

    let header = sqlx::query_as::<_, CommercialDocumentDto>(&format!(
        "SELECT d.* FROM ({DOCUMENT_UNION_SQL}) d WHERE d.document_type = ? AND d.document_id = ?"
    ))
    .bind(document_type)
    .bind(document_id)
    .fetch_optional(&db.pool)
    .await?
    .ok_or_else(|| CoreError::NotFound("Document introuvable.".into()))?;
    let mut lines = Vec::new();
    let mut payments = Vec::new();
    let mut notes = None;

    match document_type {
        "customer_order" => {
            notes = sqlx::query_scalar("SELECT notes FROM orders WHERE id = ?")
                .bind(document_id).fetch_one(&db.pool).await?;
            lines = sqlx::query_as::<_, (String, String, i64, String, i64, i64)>(
                "SELECT p.name, v.name, ol.requested_quantity, ol.requested_unit,
                        ol.unit_price_xof, ol.line_total_xof
                 FROM order_lines ol JOIN products p ON p.id = ol.product_id
                 JOIN product_variants v ON v.id = ol.variant_id
                 WHERE ol.order_id = ? ORDER BY ol.id",
            )
            .bind(document_id).fetch_all(&db.pool).await?
            .into_iter().map(|(label, variant, quantity, unit, price, amount)| CommercialDocumentDetailLine {
                label, detail: Some(variant), quantity_milli: quantity, unit, unit_price_xof: price, amount_xof: amount,
            }).collect();
        }
        "sales_receipt" => {
            notes = sqlx::query_scalar("SELECT notes FROM sales WHERE id = ?")
                .bind(document_id).fetch_one(&db.pool).await?;
            lines = sqlx::query_as::<_, (String, String, i64, String, i64, i64)>(
                "SELECT product_name, packaging_name, quantity_milli,
                        COALESCE(sales_unit_label, base_unit), unit_price, line_total
                 FROM sale_lines WHERE sale_id = ? ORDER BY id",
            )
            .bind(document_id).fetch_all(&db.pool).await?
            .into_iter().map(|(label, detail, quantity, unit, price, amount)| CommercialDocumentDetailLine {
                label, detail: Some(detail), quantity_milli: quantity, unit, unit_price_xof: price, amount_xof: amount,
            }).collect();
            payments = sqlx::query_as::<_, (String, i64)>(
                "SELECT pm.label || ' · ' || p.reference, pp.amount
                 FROM payments p JOIN payment_parts pp ON pp.payment_id = p.id
                 JOIN payment_methods pm ON pm.code = pp.method_code
                 WHERE p.sale_id = ? ORDER BY p.id, pp.id",
            )
            .bind(document_id).fetch_all(&db.pool).await?
            .into_iter().map(|(label, amount_xof)| CommercialDocumentDetailPayment { label, amount_xof }).collect();
        }
        "purchase_order" => {
            notes = sqlx::query_scalar("SELECT notes FROM purchase_orders WHERE id = ?")
                .bind(document_id).fetch_one(&db.pool).await?;
            lines = sqlx::query_as::<_, (String, String, i64, String, i64, i64)>(
                "SELECT product_name, packaging_name, ordered_quantity_milli, base_unit, unit_price, line_total
                 FROM purchase_order_lines WHERE purchase_order_id = ? ORDER BY id",
            )
            .bind(document_id).fetch_all(&db.pool).await?
            .into_iter().map(|(label, detail, quantity, unit, price, amount)| CommercialDocumentDetailLine {
                label, detail: Some(detail), quantity_milli: quantity, unit, unit_price_xof: price, amount_xof: amount,
            }).collect();
        }
        "supplier_reception" => {
            let receipt_notes: Option<String> = sqlx::query_scalar("SELECT notes FROM purchase_receipts WHERE id = ?")
                .bind(document_id).fetch_one(&db.pool).await?;
            notes = receipt_notes;
            lines = sqlx::query_as::<_, (String, String, i64, String, i64, i64, Option<String>)>(
                "SELECT pol.product_name, pol.packaging_name, prl.base_quantity_milli, pol.base_unit,
                        prl.unit_price, prl.amount, prl.discrepancy_reason
                 FROM purchase_receipt_lines prl
                 JOIN purchase_order_lines pol ON pol.id = prl.purchase_order_line_id
                 WHERE prl.receipt_id = ? ORDER BY prl.id",
            )
            .bind(document_id).fetch_all(&db.pool).await?
            .into_iter().map(|(label, packaging, quantity, unit, price, amount, discrepancy)| CommercialDocumentDetailLine {
                label, detail: discrepancy.or(Some(packaging)), quantity_milli: quantity, unit, unit_price_xof: price, amount_xof: amount,
            }).collect();
        }
        "payment_receipt" => {
            notes = sqlx::query_scalar("SELECT note FROM payments WHERE id = ?")
                .bind(document_id).fetch_one(&db.pool).await?;
            payments = sqlx::query_as::<_, (String, i64)>(
                "SELECT pm.label, pp.amount FROM payment_parts pp
                 JOIN payment_methods pm ON pm.code = pp.method_code
                 WHERE pp.payment_id = ? ORDER BY pp.id",
            )
            .bind(document_id).fetch_all(&db.pool).await?
            .into_iter().map(|(label, amount_xof)| CommercialDocumentDetailPayment { label, amount_xof }).collect();
        }
        "credit_note" => {
            notes = sqlx::query_scalar("SELECT reason FROM sales_returns WHERE id = ?")
                .bind(document_id).fetch_one(&db.pool).await?;
            lines = sqlx::query_as::<_, (String, String, i64, String, i64, i64)>(
                "SELECT sl.product_name, sl.packaging_name, srl.base_quantity_milli,
                        sl.base_unit, sl.unit_price, srl.amount
                 FROM sales_return_lines srl JOIN sale_lines sl ON sl.id = srl.sale_line_id
                 WHERE srl.return_id = ? ORDER BY srl.id",
            )
            .bind(document_id).fetch_all(&db.pool).await?
            .into_iter().map(|(label, detail, quantity, unit, price, amount)| CommercialDocumentDetailLine {
                label, detail: Some(detail), quantity_milli: quantity, unit, unit_price_xof: price, amount_xof: amount,
            }).collect();
        }
        "cancellation" => {
            notes = sqlx::query_scalar("SELECT reason FROM sales_cancellations WHERE id = ?")
                .bind(document_id).fetch_one(&db.pool).await?;
            lines = sqlx::query_as::<_, (String, String, i64, String, i64, i64)>(
                "SELECT product_name, packaging_name, quantity_milli,
                        COALESCE(sales_unit_label, base_unit), unit_price, line_total
                 FROM sale_lines WHERE sale_id = (SELECT sale_id FROM sales_cancellations WHERE id = ?)
                 ORDER BY id",
            )
            .bind(document_id).fetch_all(&db.pool).await?
            .into_iter().map(|(label, detail, quantity, unit, price, amount)| CommercialDocumentDetailLine {
                label, detail: Some(detail), quantity_milli: quantity, unit, unit_price_xof: price, amount_xof: amount,
            }).collect();
            let refund: i64 = sqlx::query_scalar("SELECT refunded_amount FROM sales_cancellations WHERE id = ?")
                .bind(document_id).fetch_one(&db.pool).await?;
            if refund > 0 {
                payments.push(CommercialDocumentDetailPayment { label: "Montant remboursé".into(), amount_xof: refund });
            }
        }
        _ => unreachable!("validated document type above"),
    }

    Ok(CommercialDocumentDetail {
        document_type: header.document_type,
        document_id: header.document_id,
        document_number: header.document_number,
        counterparty: header.counterparty,
        status: header.status,
        amount_xof: header.amount_xof,
        created_at: header.created_at,
        notes,
        lines,
        payments,
    })
}

pub async fn list_documents_page(
    db: &DepotDb,
    query: CommercialDocumentsQuery,
) -> CoreResult<CommercialDocumentsPage> {
    let (sales_scope, purchases_scope) = if let Some(actor) = auth::current_actor() {
        let sales = actor.has_permission(Permission::SalesRead);
        let purchases = actor.has_permission(Permission::PurchasesRead);
        let reports = actor.has_permission(Permission::ReportsRead);
        if !sales && !purchases && !reports {
            return Err(CoreError::Forbidden("Consultation des documents commerciaux refusée.".into()));
        }
        (sales || reports, purchases || reports)
    } else {
        (true, true)
    };
    let access = "((? = 1 AND d.document_type IN ('customer_order','sales_receipt','credit_note','cancellation'))
        OR (? = 1 AND d.document_type IN ('purchase_order','supplier_reception'))
        OR ((? = 1 OR ? = 1) AND d.document_type = 'payment_receipt'))";
    let search = query.search.as_deref().unwrap_or("").trim().to_lowercase();
    let doc_type = query.document_type.as_deref().filter(|value| !value.is_empty() && *value != "all").unwrap_or("");
    let status = query.status.as_deref().filter(|value| !value.is_empty() && *value != "all").unwrap_or("");
    let from = query.from.as_deref().filter(|value| !value.is_empty()).unwrap_or("");
    let to = query.to.as_deref().filter(|value| !value.is_empty()).unwrap_or("");
    let approvals_only = query.approvals_only.unwrap_or(false);
    let where_clause = format!("{access}
        AND (? = '' OR d.document_type = ?)
        AND (? = '' OR LOWER(d.document_number || ' ' || d.counterparty || ' ' || d.document_type || ' ' || d.status) LIKE '%' || ? || '%')
        AND (? = '' OR d.status = ? OR d.approval_status = ?)
        AND (? = '' OR d.created_at >= ?)
        AND (? = '' OR d.created_at < datetime(?, '+1 day'))
        AND (? = 0 OR d.approval_status = 'pending_owner_approval')");
    let count_sql = format!("SELECT COUNT(*) FROM ({DOCUMENT_UNION_SQL}) d WHERE {where_clause}");
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
    count_query = count_query
        .bind(if sales_scope { 1_i64 } else { 0 })
        .bind(if purchases_scope { 1_i64 } else { 0 })
        .bind(if sales_scope { 1_i64 } else { 0 })
        .bind(if purchases_scope { 1_i64 } else { 0 })
        .bind(doc_type).bind(doc_type)
        .bind(&search).bind(&search)
        .bind(status).bind(status).bind(status)
        .bind(from).bind(from)
        .bind(to).bind(to)
        .bind(if approvals_only { 1_i64 } else { 0 });
    let total = count_query.fetch_one(&db.pool).await?.max(0) as usize;

    let pending_sql = format!("SELECT COUNT(*) FROM ({DOCUMENT_UNION_SQL}) d WHERE {access} AND d.approval_status = 'pending_owner_approval'");
    let mut pending_query = sqlx::query_scalar::<_, i64>(&pending_sql);
    pending_query = pending_query
        .bind(if sales_scope { 1_i64 } else { 0 })
        .bind(if purchases_scope { 1_i64 } else { 0 })
        .bind(if sales_scope { 1_i64 } else { 0 })
        .bind(if purchases_scope { 1_i64 } else { 0 });
    let pending_count = pending_query.fetch_one(&db.pool).await?.max(0) as usize;

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 200);
    let offset = i64::from(page.saturating_sub(1)).saturating_mul(i64::from(page_size));
    let order_by = match query.sort.as_deref() {
        Some("oldest") => "d.created_at ASC, d.document_id ASC",
        Some("amount") => "d.amount_xof DESC, d.created_at DESC, d.document_id DESC",
        _ => "d.created_at DESC, d.document_id DESC",
    };
    let rows_sql = format!(
        "SELECT d.* FROM ({DOCUMENT_UNION_SQL}) d WHERE {where_clause} ORDER BY {order_by} LIMIT ? OFFSET ?"
    );
    let mut rows_query = sqlx::query_as::<_, CommercialDocumentDto>(&rows_sql)
        .bind(if sales_scope { 1_i64 } else { 0 })
        .bind(if purchases_scope { 1_i64 } else { 0 })
        .bind(if sales_scope { 1_i64 } else { 0 })
        .bind(if purchases_scope { 1_i64 } else { 0 })
        .bind(doc_type).bind(doc_type)
        .bind(&search).bind(&search)
        .bind(status).bind(status).bind(status)
        .bind(from).bind(from)
        .bind(to).bind(to)
        .bind(if approvals_only { 1_i64 } else { 0 })
        .bind(i64::from(page_size)).bind(offset);
    let rows = rows_query.fetch_all(&db.pool).await?;
    Ok(CommercialDocumentsPage { rows, total, pending_count, page, page_size })
}

pub async fn approval_events(
    db: &DepotDb,
    document_type: &str,
    document_id: i64,
) -> CoreResult<Vec<ApprovalEventDto>> {
    check_document_type(document_type)?;
    if let Some(actor) = auth::current_actor() {
        let required = if document_type == "customer_order" { Permission::SalesRead } else { Permission::PurchasesRead };
        if !actor.has_permission(Permission::ReportsRead) {
            auth::require_permission(&actor, required)?;
        }
    }
    Ok(sqlx::query_as::<_, ApprovalEventDto>(
        "SELECT id, document_type, document_id, action, actor_user_id, actor_role, reason, snapshot_json, created_at
         FROM document_approval_events WHERE document_type = ? AND document_id = ? ORDER BY id DESC",
    )
    .bind(document_type)
    .bind(document_id)
    .fetch_all(&db.pool)
    .await?)
}

pub async fn submit_for_approval(
    db: &DepotDb,
    document_type: &str,
    document_id: i64,
) -> CoreResult<()> {
    check_document_type(document_type)?;
    let actor = authenticated_actor()?;
    let permission = if document_type == "customer_order" { Permission::SalesWrite } else { Permission::PurchasesWrite };
    auth::require_permission(&actor, permission)?;
    if document_id <= 0 {
        return Err(CoreError::Validation("Identifiant de document invalide.".into()));
    }
    let (_guard, mut tx) = db.begin_write().await?;
    let exists: i64 = match document_type {
        "customer_order" => sqlx::query_scalar("SELECT COUNT(*) FROM orders WHERE id = ? AND status = 'draft'")
            .bind(document_id).fetch_one(&mut *tx).await?,
        "purchase_order" => sqlx::query_scalar("SELECT COUNT(*) FROM purchase_orders WHERE id = ? AND status NOT IN ('cancelled', 'received')")
            .bind(document_id).fetch_one(&mut *tx).await?,
        _ => 0,
    };
    if exists == 0 {
        return Err(CoreError::Validation("Le document n'existe pas ou n'est plus modifiable.".into()));
    }
    let current: Option<String> = sqlx::query_scalar(
        "SELECT status FROM commercial_document_workflows WHERE document_type = ? AND document_id = ?",
    ).bind(document_type).bind(document_id).fetch_optional(&mut *tx).await?;
    if matches!(current.as_deref(), Some("pending_owner_approval" | "approved")) {
        return Err(CoreError::Validation("Ce document est déjà soumis ou approuvé.".into()));
    }
    let snapshot = document_snapshot(&mut tx, document_type, document_id).await?;
    let submitted_by = actor_db_id(&actor);
    sqlx::query(
        "INSERT INTO commercial_document_workflows (document_type, document_id, status, submitted_by, submitted_at, reviewed_by, reviewed_at, review_reason, updated_at)
         VALUES (?, ?, 'pending_owner_approval', ?, datetime('now'), NULL, NULL, NULL, datetime('now'))
         ON CONFLICT(document_type, document_id) DO UPDATE SET status = 'pending_owner_approval', submitted_by = excluded.submitted_by,
         submitted_at = excluded.submitted_at, reviewed_by = NULL, reviewed_at = NULL, review_reason = NULL, updated_at = datetime('now')",
    ).bind(document_type).bind(document_id).bind(submitted_by).execute(&mut *tx).await?;
    sqlx::query(
        "INSERT INTO document_approval_events (document_type, document_id, action, actor_user_id, actor_role, snapshot_json)
         VALUES (?, ?, 'submitted', ?, ?, ?)",
    ).bind(document_type).bind(document_id).bind(submitted_by).bind(actor.role.as_str()).bind(snapshot.to_string()).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn review_document(
    db: &DepotDb,
    document_type: &str,
    document_id: i64,
    input: ReviewDecisionInput,
) -> CoreResult<()> {
    check_document_type(document_type)?;
    let actor = authenticated_actor()?;
    if actor.role != Role::Owner {
        return Err(CoreError::Forbidden("Seul le propriétaire peut statuer sur une approbation.".into()));
    }
    let action = input.action.trim();
    if !matches!(action, "approved" | "rejected" | "changes_requested") {
        return Err(CoreError::Validation("Décision invalide.".into()));
    }
    let reason = input.reason.as_deref().map(str::trim).filter(|s| !s.is_empty());
    if action != "approved" && reason.is_none() {
        return Err(CoreError::Validation("Un motif est obligatoire pour un rejet ou une demande de modification.".into()));
    }
    let (_guard, mut tx) = db.begin_write().await?;
    let status: Option<String> = sqlx::query_scalar(
        "SELECT status FROM commercial_document_workflows WHERE document_type = ? AND document_id = ?",
    ).bind(document_type).bind(document_id).fetch_optional(&mut *tx).await?;
    if status.as_deref() != Some("pending_owner_approval") {
        return Err(CoreError::Validation("Le document n'est pas en attente d'approbation.".into()));
    }
    let snapshot = document_snapshot(&mut tx, document_type, document_id).await?;
    let reviewer = actor_db_id(&actor);
    sqlx::query(
        "UPDATE commercial_document_workflows SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), review_reason = ?, updated_at = datetime('now')
         WHERE document_type = ? AND document_id = ? AND status = 'pending_owner_approval'",
    ).bind(action).bind(reviewer).bind(reason).bind(document_type).bind(document_id).execute(&mut *tx).await?;
    sqlx::query(
        "INSERT INTO document_approval_events (document_type, document_id, action, actor_user_id, actor_role, reason, snapshot_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(document_type).bind(document_id).bind(action).bind(reviewer).bind(actor.role.as_str()).bind(reason).bind(snapshot.to_string()).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn require_approval_or_owner(document_type: &str, document_id: i64, tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>) -> CoreResult<()> {
    let Some(actor) = auth::current_actor() else {
        // Internal maintenance and isolated domain tests retain their existing trusted behavior.
        return Ok(());
    };
    if actor.role == Role::Owner {
        return Ok(());
    }
    let status: Option<String> = sqlx::query_scalar(
        "SELECT status FROM commercial_document_workflows WHERE document_type = ? AND document_id = ?",
    ).bind(document_type).bind(document_id).fetch_optional(&mut **tx).await?;
    if status.as_deref() == Some("approved") {
        Ok(())
    } else {
        Err(CoreError::Forbidden("Validation du propriétaire requise avant l'opération.".into()))
    }
}

pub async fn record_owner_direct_approval(
    document_type: &str,
    document_id: i64,
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
) -> CoreResult<()> {
    let Some(actor) = auth::current_actor() else { return Ok(()); };
    if actor.role != Role::Owner { return Ok(()); }
    let current: Option<String> = sqlx::query_scalar(
        "SELECT status FROM commercial_document_workflows WHERE document_type = ? AND document_id = ?",
    )
    .bind(document_type)
    .bind(document_id)
    .fetch_optional(&mut **tx)
    .await?;
    if current.as_deref() == Some("approved") {
        return Ok(());
    }
    let snapshot = document_snapshot(tx, document_type, document_id).await?;
    let user_id = actor_db_id(&actor);
    sqlx::query(
        "INSERT INTO commercial_document_workflows (document_type, document_id, status, submitted_by, submitted_at, reviewed_by, reviewed_at, review_reason, updated_at)
         VALUES (?, ?, 'approved', ?, datetime('now'), ?, datetime('now'), 'Approbation directe par le propriétaire', datetime('now'))
         ON CONFLICT(document_type, document_id) DO UPDATE SET status = 'approved', reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at, review_reason = excluded.review_reason, updated_at = datetime('now')",
    ).bind(document_type).bind(document_id).bind(user_id).bind(user_id).execute(&mut **tx).await?;
    sqlx::query(
        "INSERT INTO document_approval_events (document_type, document_id, action, actor_user_id, actor_role, reason, snapshot_json)
         VALUES (?, ?, 'approved', ?, ?, 'Approbation directe par le propriétaire', ?)",
    ).bind(document_type).bind(document_id).bind(user_id).bind(actor.role.as_str()).bind(snapshot.to_string()).execute(&mut **tx).await?;
    Ok(())
}
