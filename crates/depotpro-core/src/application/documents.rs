// ============================================================================
// Archive immuable des reçus de vente et bons de commande clientèle
// ============================================================================

use crate::application::auth::{current_actor, require_current_actor_permission, Permission};
use crate::application::orders;
use crate::application::sales;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::FromRow;

type CustomerSnapshotRow = (
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
);

fn default_page() -> i64 {
    1
}
fn default_page_size() -> i64 {
    25
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentArchiveFilter {
    pub search: Option<String>,
    pub document_type: Option<String>,
    pub source_status: Option<String>,
    pub payment_status: Option<String>,
    pub customer_id: Option<i64>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub min_total_xof: Option<i64>,
    pub max_total_xof: Option<i64>,
    #[serde(default = "default_page")]
    pub page: i64,
    #[serde(default = "default_page_size")]
    pub page_size: i64,
}

impl Default for DocumentArchiveFilter {
    fn default() -> Self {
        Self {
            search: None,
            document_type: None,
            source_status: None,
            payment_status: None,
            customer_id: None,
            from: None,
            to: None,
            min_total_xof: None,
            max_total_xof: None,
            page: 1,
            page_size: 25,
        }
    }
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DocumentArchiveSummaryDto {
    pub id: i64,
    pub document_type: String,
    pub source_type: String,
    pub source_id: i64,
    pub source_reference: String,
    pub document_reference: String,
    pub customer_id: Option<i64>,
    pub customer_name: String,
    pub customer_phone: Option<String>,
    pub source_status: String,
    pub payment_status: String,
    pub subtotal_xof: i64,
    pub deposit_xof: i64,
    pub total_to_collect_xof: i64,
    pub paid_xof: i64,
    pub balance_xof: i64,
    pub document_date: String,
    pub generated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentArchiveDetailDto {
    pub document: DocumentArchiveSummaryDto,
    pub snapshot: Value,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DocumentArchiveTotalsDto {
    pub document_count: i64,
    pub total_to_collect_xof: i64,
    pub deposit_xof: i64,
    pub paid_xof: i64,
    pub balance_xof: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentArchivePageDto {
    pub items: Vec<DocumentArchiveSummaryDto>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
    pub total_pages: i64,
    pub summary: DocumentArchiveTotalsDto,
}

#[derive(Debug, FromRow)]
struct ArchiveRow {
    id: i64,
    document_type: String,
    source_type: String,
    source_id: i64,
    source_reference: String,
    document_reference: String,
    customer_id: Option<i64>,
    customer_name: String,
    customer_phone: Option<String>,
    source_status: String,
    payment_status: String,
    subtotal_xof: i64,
    deposit_xof: i64,
    total_to_collect_xof: i64,
    paid_xof: i64,
    balance_xof: i64,
    document_date: String,
    snapshot_json: String,
    generated_at: String,
}

impl ArchiveRow {
    fn into_detail(self) -> CoreResult<DocumentArchiveDetailDto> {
        let snapshot = serde_json::from_str(&self.snapshot_json)
            .map_err(|e| CoreError::Database(format!("Instantané documentaire invalide : {e}")))?;
        Ok(DocumentArchiveDetailDto {
            document: DocumentArchiveSummaryDto {
                id: self.id,
                document_type: self.document_type,
                source_type: self.source_type,
                source_id: self.source_id,
                source_reference: self.source_reference,
                document_reference: self.document_reference,
                customer_id: self.customer_id,
                customer_name: self.customer_name,
                customer_phone: self.customer_phone,
                source_status: self.source_status,
                payment_status: self.payment_status,
                subtotal_xof: self.subtotal_xof,
                deposit_xof: self.deposit_xof,
                total_to_collect_xof: self.total_to_collect_xof,
                paid_xof: self.paid_xof,
                balance_xof: self.balance_xof,
                document_date: self.document_date,
                generated_at: self.generated_at,
            },
            snapshot,
        })
    }
}

async fn load_archive_row(db: &DepotDb, id: i64) -> CoreResult<ArchiveRow> {
    sqlx::query_as::<_, ArchiveRow>(
        "SELECT id, document_type, source_type, source_id, source_reference, document_reference,
                customer_id, customer_name, customer_phone, source_status, payment_status,
                subtotal_xof, deposit_xof, total_to_collect_xof, paid_xof, balance_xof,
                document_date, snapshot_json, generated_at
         FROM document_archive WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&db.pool)
    .await?
    .ok_or_else(|| CoreError::NotFound("Document archivé introuvable.".to_string()))
}

async fn customer_snapshot(
    db: &DepotDb,
    customer_id: Option<i64>,
    fallback_name: &str,
    fallback_phone: Option<&str>,
) -> CoreResult<Value> {
    let Some(id) = customer_id else {
        return Ok(json!({
            "id": null,
            "code": null,
            "name": if fallback_name.trim().is_empty() { "Client Comptoir" } else { fallback_name },
            "phone": fallback_phone,
            "address": null,
            "city": null,
            "email": null
        }));
    };
    let row: Option<CustomerSnapshotRow> =
        sqlx::query_as("SELECT name, phone, address, city, email FROM clients WHERE id = ?")
            .bind(id)
            .fetch_optional(&db.pool)
            .await?;
    if let Some((name, phone, address, city, email)) = row {
        let code: Option<String> = sqlx::query_scalar("SELECT code FROM clients WHERE id = ?")
            .bind(id)
            .fetch_optional(&db.pool)
            .await?;
        Ok(json!({
            "id": id, "code": code, "name": name,
            "phone": phone.or_else(|| fallback_phone.map(str::to_string)),
            "address": address, "city": city, "email": email
        }))
    } else {
        Ok(json!({
            "id": id, "code": null, "name": fallback_name,
            "phone": fallback_phone, "address": null, "city": null, "email": null
        }))
    }
}

struct ArchiveRecord<'a> {
    document_type: &'a str,
    source_type: &'a str,
    source_id: i64,
    source_reference: &'a str,
    customer_id: Option<i64>,
    customer_name: &'a str,
    customer_phone: Option<&'a str>,
    source_status: &'a str,
    payment_status: &'a str,
    subtotal_xof: i64,
    deposit_xof: i64,
    total_to_collect_xof: i64,
    paid_xof: i64,
    balance_xof: i64,
    document_date: &'a str,
    snapshot: &'a Value,
}

async fn persist_archive(
    db: &DepotDb,
    record: ArchiveRecord<'_>,
) -> CoreResult<DocumentArchiveDetailDto> {
    let snapshot_json = serde_json::to_string(record.snapshot)
        .map_err(|e| CoreError::Database(format!("Sérialisation document impossible : {e}")))?;
    let actor_id = current_actor().and_then(|a| a.user_id.parse::<i64>().ok());

    let (_guard, mut tx) = db.begin_write().await?;
    let existing_id: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM document_archive
         WHERE document_type = ? AND source_type = ? AND source_id = ?",
    )
    .bind(record.document_type)
    .bind(record.source_type)
    .bind(record.source_id)
    .fetch_optional(&mut *tx)
    .await?;
    let id = if let Some(id) = existing_id {
        id
    } else {
        sqlx::query(
            "INSERT INTO document_archive (
                document_type, source_type, source_id, source_reference, document_reference,
                customer_id, customer_name, customer_phone, source_status, payment_status,
                subtotal_xof, deposit_xof, total_to_collect_xof, paid_xof, balance_xof,
                document_date, snapshot_json, generated_by_user_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(record.document_type)
        .bind(record.source_type)
        .bind(record.source_id)
        .bind(record.source_reference)
        .bind(record.source_reference)
        .bind(record.customer_id)
        .bind(record.customer_name)
        .bind(record.customer_phone)
        .bind(record.source_status)
        .bind(record.payment_status)
        .bind(record.subtotal_xof.max(0))
        .bind(record.deposit_xof.max(0))
        .bind(record.total_to_collect_xof.max(0))
        .bind(record.paid_xof.max(0))
        .bind(record.balance_xof.max(0))
        .bind(record.document_date)
        .bind(snapshot_json)
        .bind(actor_id)
        .execute(&mut *tx)
        .await?
        .last_insert_rowid()
    };
    tx.commit().await?;
    load_archive_row(db, id).await?.into_detail()
}

fn payment_status(paid: i64, balance: i64) -> &'static str {
    if balance <= 0 {
        "paid"
    } else if paid > 0 {
        "partial"
    } else {
        "unpaid"
    }
}

pub async fn archive_sale_document(
    db: &DepotDb,
    sale_id: i64,
) -> CoreResult<DocumentArchiveDetailDto> {
    require_current_actor_permission(Permission::SalesWrite)?;
    let sale_detail = sales::get_sale_detail(db, sale_id).await?;
    let sale = &sale_detail.sale;
    let document_type = if sale.sale_type == "credit" {
        "sales_invoice"
    } else {
        "sales_receipt"
    };
    let customer = customer_snapshot(
        db,
        sale.client_id,
        &sale.client_name,
        sale_detail.client_phone.as_deref(),
    )
    .await?;
    let customer_name = customer
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("Client Comptoir")
        .to_string();
    let customer_phone = customer
        .get("phone")
        .and_then(Value::as_str)
        .map(str::to_string);
    let snapshot = json!({
        "version": 1,
        "documentType": document_type,
        "sourceType": "sale",
        "sale": sale_detail,
        "customer": customer
    });
    persist_archive(
        db,
        ArchiveRecord {
            document_type,
            source_type: "sale",
            source_id: sale_id,
            source_reference: &sale.reference,
            customer_id: sale.client_id,
            customer_name: &customer_name,
            customer_phone: customer_phone.as_deref(),
            source_status: &sale.status,
            payment_status: payment_status(sale.paid_amount, sale.remaining_amount),
            subtotal_xof: sale.subtotal_merchandise,
            deposit_xof: sale.total_deposit,
            total_to_collect_xof: sale.total_amount,
            paid_xof: sale.paid_amount,
            balance_xof: sale.remaining_amount,
            document_date: &sale.created_at,
            snapshot: &snapshot,
        },
    )
    .await
}

pub async fn archive_order_document(
    db: &DepotDb,
    order_id: i64,
) -> CoreResult<DocumentArchiveDetailDto> {
    require_current_actor_permission(Permission::SalesWrite)?;
    let order_detail = orders::get_order(db, order_id).await?;
    let order = &order_detail.order;
    let customer =
        customer_snapshot(db, Some(order.customer_id), &order.customer_name, None).await?;
    let customer_name = customer
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or(&order.customer_name)
        .to_string();
    let customer_phone = customer
        .get("phone")
        .and_then(Value::as_str)
        .map(str::to_string);
    let snapshot = json!({
        "version": 1,
        "documentType": "order_confirmation",
        "sourceType": "order",
        "orderDetail": order_detail,
        "customer": customer
    });
    persist_archive(
        db,
        ArchiveRecord {
            document_type: "order_confirmation",
            source_type: "order",
            source_id: order_id,
            source_reference: &order.order_number,
            customer_id: Some(order.customer_id),
            customer_name: &customer_name,
            customer_phone: customer_phone.as_deref(),
            source_status: &order.status,
            payment_status: &order.payment_status,
            subtotal_xof: order.subtotal_xof,
            deposit_xof: order.deposit_due_xof,
            total_to_collect_xof: order.total_to_collect_xof,
            paid_xof: order.paid_xof,
            balance_xof: (order.total_to_collect_xof - order.paid_xof).max(0),
            document_date: &order.created_at,
            snapshot: &snapshot,
        },
    )
    .await
}

pub async fn get_document_archive(db: &DepotDb, id: i64) -> CoreResult<DocumentArchiveDetailDto> {
    require_current_actor_permission(Permission::SalesRead)?;
    load_archive_row(db, id).await?.into_detail()
}

pub async fn list_document_archive(
    db: &DepotDb,
    filter: DocumentArchiveFilter,
) -> CoreResult<DocumentArchivePageDto> {
    require_current_actor_permission(Permission::SalesRead)?;
    let page = filter.page.max(1);
    let page_size = filter.page_size.clamp(1, 100);
    let offset = (page - 1) * page_size;
    let search = filter.search.unwrap_or_default().trim().to_string();
    let pattern = format!("%{search}%");
    let document_type = filter
        .document_type
        .filter(|v| v != "all")
        .unwrap_or_default();
    let source_status = filter
        .source_status
        .filter(|v| v != "all")
        .unwrap_or_default();
    let payment = filter
        .payment_status
        .filter(|v| v != "all")
        .unwrap_or_default();
    let customer_id = filter.customer_id.unwrap_or(0);
    let from = filter.from.unwrap_or_default();
    let to = filter.to.unwrap_or_default();
    let min_total = filter.min_total_xof.unwrap_or(-1);
    let max_total = filter.max_total_xof.unwrap_or(-1);

    let where_sql = "
         WHERE (? = '' OR document_type = ?)
           AND (? = '' OR source_status = ?)
           AND (? = '' OR payment_status = ?)
           AND (? = 0 OR customer_id = ?)
           AND (? = '' OR document_reference LIKE ? OR source_reference LIKE ?
                OR customer_name LIKE ? OR COALESCE(customer_phone, '') LIKE ?
                OR snapshot_json LIKE ?)
           AND (? = '' OR date(document_date) >= date(?))
           AND (? = '' OR date(document_date) <= date(?))
           AND (? < 0 OR total_to_collect_xof >= ?)
           AND (? < 0 OR total_to_collect_xof <= ?)";
    let count_sql = format!("SELECT COUNT(*) FROM document_archive {where_sql}");
    let total: i64 = sqlx::query_scalar(&count_sql)
        .bind(&document_type)
        .bind(&document_type)
        .bind(&source_status)
        .bind(&source_status)
        .bind(&payment)
        .bind(&payment)
        .bind(customer_id)
        .bind(customer_id)
        .bind(&search)
        .bind(&pattern)
        .bind(&pattern)
        .bind(&pattern)
        .bind(&pattern)
        .bind(&pattern)
        .bind(&from)
        .bind(&from)
        .bind(&to)
        .bind(&to)
        .bind(min_total)
        .bind(min_total)
        .bind(max_total)
        .bind(max_total)
        .fetch_one(&db.pool)
        .await?;

    let list_sql = format!(
        "SELECT id, document_type, source_type, source_id, source_reference, document_reference,
                customer_id, customer_name, customer_phone, source_status, payment_status,
                subtotal_xof, deposit_xof, total_to_collect_xof, paid_xof, balance_xof,
                document_date, generated_at
         FROM document_archive {where_sql}
         ORDER BY document_date DESC, id DESC LIMIT ? OFFSET ?"
    );
    let items = sqlx::query_as::<_, DocumentArchiveSummaryDto>(&list_sql)
        .bind(&document_type)
        .bind(&document_type)
        .bind(&source_status)
        .bind(&source_status)
        .bind(&payment)
        .bind(&payment)
        .bind(customer_id)
        .bind(customer_id)
        .bind(&search)
        .bind(&pattern)
        .bind(&pattern)
        .bind(&pattern)
        .bind(&pattern)
        .bind(&pattern)
        .bind(&from)
        .bind(&from)
        .bind(&to)
        .bind(&to)
        .bind(min_total)
        .bind(min_total)
        .bind(max_total)
        .bind(max_total)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&db.pool)
        .await?;

    let summary_sql = format!(
        "SELECT COUNT(*) AS document_count,
                COALESCE(SUM(total_to_collect_xof), 0) AS total_to_collect_xof,
                COALESCE(SUM(deposit_xof), 0) AS deposit_xof,
                COALESCE(SUM(paid_xof), 0) AS paid_xof,
                COALESCE(SUM(balance_xof), 0) AS balance_xof
         FROM document_archive {where_sql}"
    );
    let summary: DocumentArchiveTotalsDto = sqlx::query_as(&summary_sql)
        .bind(&document_type)
        .bind(&document_type)
        .bind(&source_status)
        .bind(&source_status)
        .bind(&payment)
        .bind(&payment)
        .bind(customer_id)
        .bind(customer_id)
        .bind(&search)
        .bind(&pattern)
        .bind(&pattern)
        .bind(&pattern)
        .bind(&pattern)
        .bind(&pattern)
        .bind(&from)
        .bind(&from)
        .bind(&to)
        .bind(&to)
        .bind(min_total)
        .bind(min_total)
        .bind(max_total)
        .bind(max_total)
        .fetch_one(&db.pool)
        .await?;

    let total_pages = ((total + page_size - 1) / page_size).max(1);
    Ok(DocumentArchivePageDto {
        items,
        total,
        page,
        page_size,
        total_pages,
        summary,
    })
}
