use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::sales::{
    audit_log_tx, get_theoretical_cash_tx, require_open_session_tx, PaymentPartInput,
};
use crate::domain::money::Money;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

#[derive(Debug, Serialize, FromRow)]
pub struct CashSessionDto {
    pub id: i64,
    pub reference: String,
    pub opened_at: String,
    pub closed_at: Option<String>,
    pub status: String,
    pub opening_cash: i64,
    pub theoretical_cash: Option<i64>,
    pub physical_cash: Option<i64>,
    pub difference: Option<i64>,
    pub closing_notes: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct MethodSummaryDto {
    pub method_code: String,
    pub label: String,
    pub is_cash: i64,
    pub total_in: i64,
    pub total_out: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CashMovementDto {
    pub id: i64,
    pub kind: String,
    pub method_code: String,
    pub method_label: String,
    pub is_cash: i64,
    pub direction: String,
    pub amount: i64,
    pub description: String,
    pub reference_document: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CashSummaryDto {
    pub theoretical_cash: i64,
    pub by_method: Vec<MethodSummaryDto>,
    pub movements: Vec<CashMovementDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CashStatusDto {
    pub active_session: Option<CashSessionDto>,
    pub summary: Option<CashSummaryDto>,
    pub history: Vec<CashSessionDto>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ReceivableDto {
    pub id: i64,
    pub sale_id: i64,
    pub sale_reference: String,
    pub sale_date: String,
    pub sale_total: i64,
    pub client_id: i64,
    pub client_name: String,
    pub client_code: String,
    pub client_phone: Option<String>,
    pub initial_amount: i64,
    pub remaining_amount: i64,
    pub due_date: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct OpenCashInput {
    pub opening_cash: i64,
    pub request_key: String,
}

#[derive(Debug, Deserialize)]
pub struct CloseCashInput {
    pub session_id: i64,
    pub physical_cash: i64,
    pub closing_notes: Option<String>,
    pub request_key: String,
}

#[derive(Debug, Deserialize)]
pub struct PayReceivableInput {
    pub request_key: String,
    pub note: Option<String>,
    pub parts: Vec<PaymentPartInput>,
}

#[derive(Debug, Deserialize)]
pub struct CreateExpenseInput {
    pub request_key: String,
    pub category: String,
    pub amount: i64,
    pub method_code: String,
    pub beneficiary: Option<String>,
    pub notes: Option<String>,
    pub receipt_path: Option<String>,
    pub expense_date: Option<String>,
}

pub async fn get_cash_status(db: &DepotDb) -> CoreResult<CashStatusDto> {
    require_current_actor_permission(Permission::CashRead)?;
    let active_session = sqlx::query_as::<_, CashSessionDto>(
        "SELECT id, reference, opened_at, closed_at, status, opening_cash, theoretical_cash, physical_cash, difference, closing_notes
         FROM cash_sessions WHERE status = 'open' LIMIT 1",
    )
    .fetch_optional(&db.pool)
    .await?;

    let mut summary = None;

    if let Some(ref s) = active_session {
        let net_cash: i64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)
             FROM cash_movements WHERE session_id = ? AND method_code = 'cash'",
        )
        .bind(s.id)
        .fetch_one(&db.pool)
        .await?;
        let theoretical_cash = Money(s.opening_cash)
            .checked_add(Money(net_cash), "Solde théorique caisse")?
            .value();

        let by_method = sqlx::query_as::<_, MethodSummaryDto>(
            "SELECT cm.method_code, pm.label, pm.is_cash,
                    COALESCE(SUM(CASE WHEN cm.direction = 'in' THEN cm.amount ELSE 0 END), 0) AS total_in,
                    COALESCE(SUM(CASE WHEN cm.direction = 'out' THEN cm.amount ELSE 0 END), 0) AS total_out
             FROM cash_movements cm
             JOIN payment_methods pm ON pm.code = cm.method_code
             WHERE cm.session_id = ?
             GROUP BY cm.method_code, pm.label, pm.is_cash",
        )
        .bind(s.id)
        .fetch_all(&db.pool)
        .await?;

        let movements = sqlx::query_as::<_, CashMovementDto>(
            "SELECT cm.id, cm.kind, cm.method_code, pm.label AS method_label, pm.is_cash,
                    cm.direction, cm.amount, cm.description, cm.reference_document, cm.created_at
             FROM cash_movements cm
             JOIN payment_methods pm ON pm.code = cm.method_code
             WHERE cm.session_id = ?
             ORDER BY cm.id DESC LIMIT 100",
        )
        .bind(s.id)
        .fetch_all(&db.pool)
        .await?;

        summary = Some(CashSummaryDto {
            theoretical_cash,
            by_method,
            movements,
        });
    }

    let history = sqlx::query_as::<_, CashSessionDto>(
        "SELECT id, reference, opened_at, closed_at, status, opening_cash, theoretical_cash, physical_cash, difference, closing_notes
         FROM cash_sessions WHERE status = 'closed' ORDER BY id DESC LIMIT 30",
    )
    .fetch_all(&db.pool)
    .await?;

    Ok(CashStatusDto {
        active_session,
        summary,
        history,
    })
}

pub async fn open_cash_session(db: &DepotDb, input: OpenCashInput) -> CoreResult<CashSessionDto> {
    require_current_actor_permission(Permission::CashOperate)?;
    let request_key = input.request_key.trim().to_string();
    if request_key.is_empty() {
        return Err(CoreError::Validation(
            "Clé d'idempotence requise.".to_string(),
        ));
    }
    let opening_cash = Money::from_non_negative(input.opening_cash, "Fond de caisse initial")?;
    let (_guard, mut tx) = db.begin_write().await?;

    if let Some(dup) = sqlx::query_as::<_, CashSessionDto>(
        "SELECT id, reference, opened_at, closed_at, status, opening_cash, theoretical_cash, physical_cash, difference, closing_notes
         FROM cash_sessions WHERE opening_key = ?",
    )
    .bind(&request_key)
    .fetch_optional(&mut *tx)
    .await?
    {
        tx.rollback().await?;
        return Ok(dup);
    }

    if sqlx::query_scalar::<_, i64>("SELECT id FROM cash_sessions WHERE status = 'open' LIMIT 1")
        .fetch_optional(&mut *tx)
        .await?
        .is_some()
    {
        return Err(CoreError::SessionAlreadyOpen(
            "Une session de caisse est déjà ouverte.".to_string(),
        ));
    }

    let reference = DepotDb::next_sequence(&mut tx, "CAI").await?;
    let id = sqlx::query(
        "INSERT INTO cash_sessions (reference, opening_key, status, opening_cash) VALUES (?, ?, 'open', ?)",
    )
    .bind(&reference)
    .bind(&request_key)
    .bind(opening_cash.value())
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    audit_log_tx(
        &mut tx,
        "OPEN_CASH",
        "cash_sessions",
        Some(id.to_string()),
        &format!("Ouverture {reference} — Fond {} FCFA", opening_cash.value()),
    )
    .await?;
    tx.commit().await?;

    let created = sqlx::query_as::<_, CashSessionDto>(
        "SELECT id, reference, opened_at, closed_at, status, opening_cash, theoretical_cash, physical_cash, difference, closing_notes
         FROM cash_sessions WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(created)
}

pub async fn close_cash_session(db: &DepotDb, input: CloseCashInput) -> CoreResult<CashSessionDto> {
    require_current_actor_permission(Permission::CashOperate)?;
    let request_key = input.request_key.trim().to_string();
    if request_key.is_empty() {
        return Err(CoreError::Validation(
            "Clé d'idempotence requise.".to_string(),
        ));
    }
    let physical_cash = Money::from_non_negative(input.physical_cash, "Montant physique compté")?;
    let notes = input.closing_notes.as_deref().map(str::trim).unwrap_or("");

    let (_guard, mut tx) = db.begin_write().await?;
    if let Some(dup) = sqlx::query_as::<_, CashSessionDto>(
        "SELECT id, reference, opened_at, closed_at, status, opening_cash, theoretical_cash, physical_cash, difference, closing_notes
         FROM cash_sessions WHERE closing_key = ?",
    )
    .bind(&request_key)
    .fetch_optional(&mut *tx)
    .await?
    {
        tx.rollback().await?;
        if dup.id != input.session_id {
            return Err(CoreError::DuplicateOperation(
                "Cette clé d'idempotence a déjà été utilisée pour une autre session.".to_string(),
            ));
        }
        return Ok(dup);
    }

    let s: Option<(i64, String, i64)> = sqlx::query_as(
        "SELECT id, reference, opening_cash FROM cash_sessions WHERE id = ? AND status = 'open'",
    )
    .bind(input.session_id)
    .fetch_optional(&mut *tx)
    .await?;
    let (sid, sref, opening_cash) =
        s.ok_or_else(|| CoreError::SessionNotOpen("Session ouverte introuvable.".to_string()))?;

    let theoretical = get_theoretical_cash_tx(&mut tx, sid, opening_cash).await?;
    let difference = physical_cash
        .checked_sub(Money(theoretical), "Écart de clôture")?
        .value();
    if difference != 0 && notes.is_empty() {
        return Err(CoreError::Validation(format!(
            "Un écart de caisse ({difference} FCFA) nécessite obligatoirement un commentaire justificatif."
        )));
    }

    sqlx::query(
        "UPDATE cash_sessions
         SET status = 'closed', closing_key = ?, closed_at = datetime('now'),
             theoretical_cash = ?, physical_cash = ?, difference = ?, closing_notes = ?
         WHERE id = ?",
    )
    .bind(&request_key)
    .bind(theoretical)
    .bind(physical_cash.value())
    .bind(difference)
    .bind(if notes.is_empty() { None } else { Some(notes) })
    .bind(sid)
    .execute(&mut *tx)
    .await?;

    audit_log_tx(
        &mut tx,
        "CLOSE_CASH",
        "cash_sessions",
        Some(sid.to_string()),
        &format!(
            "Clôture {sref} — Théorique {theoretical} / Physique {} / Écart {difference}",
            physical_cash.value()
        ),
    )
    .await?;
    tx.commit().await?;

    let closed = sqlx::query_as::<_, CashSessionDto>(
        "SELECT id, reference, opened_at, closed_at, status, opening_cash, theoretical_cash, physical_cash, difference, closing_notes
         FROM cash_sessions WHERE id = ?",
    )
    .bind(sid)
    .fetch_one(&db.pool)
    .await?;
    Ok(closed)
}

pub async fn list_receivables(db: &DepotDb) -> CoreResult<Vec<ReceivableDto>> {
    require_current_actor_permission(Permission::ReceivablesRead)?;
    let rows = sqlx::query_as::<_, ReceivableDto>(
        "SELECT cr.id, cr.sale_id, s.reference AS sale_reference, s.created_at AS sale_date, s.total_amount AS sale_total,
                cr.client_id, c.name AS client_name, c.code AS client_code, c.phone AS client_phone,
                cr.initial_amount, cr.remaining_amount, cr.due_date, cr.status, cr.created_at
         FROM customer_receivables cr
         JOIN sales s ON s.id = cr.sale_id
         JOIN clients c ON c.id = cr.client_id
         ORDER BY CASE WHEN cr.status IN ('open', 'partial') THEN 0 ELSE 1 END, cr.due_date ASC, cr.id DESC",
    )
    .fetch_all(&db.pool)
    .await?;
    Ok(rows)
}

pub async fn pay_receivable(
    db: &DepotDb,
    receivable_id: i64,
    input: PayReceivableInput,
) -> CoreResult<ReceivableDto> {
    require_current_actor_permission(Permission::ReceivablesPay)?;
    let request_key = input.request_key.trim().to_string();
    if request_key.is_empty() {
        return Err(CoreError::Validation(
            "Clé d'idempotence requise.".to_string(),
        ));
    }
    if input.parts.is_empty() {
        return Err(CoreError::InvalidPayment(
            "Indiquez au moins un moyen de paiement.".to_string(),
        ));
    }
    let (_guard, mut tx) = db.begin_write().await?;

    let existing_pay: Option<(i64, String)> =
        sqlx::query_as("SELECT id, payment_kind FROM payments WHERE request_key = ?")
            .bind(&request_key)
            .fetch_optional(&mut *tx)
            .await?;
    if let Some((pay_id, kind)) = existing_pay {
        let alloc_rec: Option<i64> = sqlx::query_scalar(
            "SELECT receivable_id FROM payment_allocations WHERE payment_id = ?",
        )
        .bind(pay_id)
        .fetch_optional(&mut *tx)
        .await?;
        tx.rollback().await?;
        if kind != "receivable" || alloc_rec != Some(receivable_id) {
            return Err(CoreError::DuplicateOperation(
                "Cette clé d'idempotence a déjà été utilisée pour une autre opération.".to_string(),
            ));
        }
        return list_receivables(db)
            .await?
            .into_iter()
            .find(|r| r.id == receivable_id)
            .ok_or_else(|| CoreError::Validation("Créance introuvable.".to_string()));
    }

    let (session_id, _sref, _opening) = require_open_session_tx(&mut tx).await?;
    let rec: Option<(i64, i64, i64, i64, String)> = sqlx::query_as(
        "SELECT id, sale_id, client_id, remaining_amount, status FROM customer_receivables WHERE id = ?",
    )
    .bind(receivable_id)
    .fetch_optional(&mut *tx)
    .await?;
    let (rec_id, sale_id, client_id, remaining, status) =
        rec.ok_or_else(|| CoreError::Validation("Créance introuvable.".to_string()))?;
    if status == "cancelled" || remaining <= 0 {
        return Err(CoreError::HistoricalImmutable(
            "Cette créance est déjà soldée ou annulée.".to_string(),
        ));
    }

    let mut total_paid = Money::ZERO;
    let mut valid_parts: Vec<(String, i64)> = Vec::new();
    for p in &input.parts {
        let amt = Money::from_positive(p.amount, &format!("Montant ({})", p.method_code))?;
        let pm: Option<(String, i64)> =
            sqlx::query_as("SELECT code, active FROM payment_methods WHERE code = ?")
                .bind(&p.method_code)
                .fetch_optional(&mut *tx)
                .await?;
        let (code, active) =
            pm.ok_or_else(|| CoreError::InvalidPayment("Moyen de paiement invalide.".to_string()))?;
        if active == 0 {
            return Err(CoreError::InvalidPayment(
                "Moyen de paiement inactif.".to_string(),
            ));
        }
        total_paid = total_paid.checked_add(amt, "Total règlement")?;
        valid_parts.push((code, amt.value()));
    }

    if total_paid.value() > remaining {
        return Err(CoreError::InvalidPayment(format!(
            "Le paiement ({}) dépasse le solde restant ({remaining}).",
            total_paid.value()
        )));
    }

    let pay_ref = DepotDb::next_sequence(&mut tx, "REC").await?;
    let payment_id = sqlx::query(
        "INSERT INTO payments (reference, request_key, sale_id, client_id, payment_kind, total_amount, note)
         VALUES (?, ?, ?, ?, 'receivable', ?, ?)",
    )
    .bind(&pay_ref)
    .bind(&request_key)
    .bind(sale_id)
    .bind(client_id)
    .bind(total_paid.value())
    .bind(input.note.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    sqlx::query(
        "INSERT INTO payment_allocations (payment_id, receivable_id, amount) VALUES (?, ?, ?)",
    )
    .bind(payment_id)
    .bind(rec_id)
    .bind(total_paid.value())
    .execute(&mut *tx)
    .await?;

    for (idx, (code, amt)) in valid_parts.iter().enumerate() {
        let part_id = sqlx::query(
            "INSERT INTO payment_parts (payment_id, method_code, amount) VALUES (?, ?, ?)",
        )
        .bind(payment_id)
        .bind(code)
        .bind(amt)
        .execute(&mut *tx)
        .await?
        .last_insert_rowid();

        sqlx::query(
            "INSERT INTO cash_movements (session_id, request_key, payment_part_id, kind, method_code, direction, amount, description, reference_document)
             VALUES (?, ?, ?, 'receivable', ?, 'in', ?, ?, ?)",
        )
        .bind(session_id)
        .bind(format!("cm-rec:{request_key}:{idx}"))
        .bind(part_id)
        .bind(code)
        .bind(amt)
        .bind(format!("Encaissement créance #{rec_id}"))
        .bind(&pay_ref)
        .execute(&mut *tx)
        .await?;
    }

    let next_rem = Money(remaining)
        .checked_sub_non_negative(total_paid, "Solde restant créance")?
        .value();
    sqlx::query("UPDATE customer_receivables SET remaining_amount = ?, status = ? WHERE id = ?")
        .bind(next_rem)
        .bind(if next_rem == 0 { "paid" } else { "partial" })
        .bind(rec_id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("UPDATE sales SET paid_amount = paid_amount + ? WHERE id = ?")
        .bind(total_paid.value())
        .bind(sale_id)
        .execute(&mut *tx)
        .await?;

    audit_log_tx(
        &mut tx,
        "PAY_RECEIVABLE",
        "customer_receivables",
        Some(rec_id.to_string()),
        &format!("{pay_ref} — {} FCFA", total_paid.value()),
    )
    .await?;
    tx.commit().await?;

    list_receivables(db)
        .await?
        .into_iter()
        .find(|r| r.id == rec_id)
        .ok_or_else(|| CoreError::Internal("Créance introuvable.".to_string()))
}

pub async fn create_expense(db: &DepotDb, input: CreateExpenseInput) -> CoreResult<ExpenseItemDto> {
    require_current_actor_permission(Permission::ExpensesWrite)?;
    let request_key = input.request_key.trim().to_string();
    if request_key.is_empty() {
        return Err(CoreError::Validation(
            "Clé d'idempotence requise.".to_string(),
        ));
    }
    let category = input.category.trim().to_string();
    if category.is_empty() {
        return Err(CoreError::Validation(
            "La catégorie est obligatoire.".to_string(),
        ));
    }
    let amount = Money::from_positive(input.amount, "Montant dépense")?;
    let receipt_path =
        crate::application::products::sanitize_image_path(input.receipt_path.as_deref())?;
    let (_guard, mut tx) = db.begin_write().await?;

    if let Some(existing_id) =
        sqlx::query_scalar::<_, i64>("SELECT id FROM expenses WHERE request_key = ?")
            .bind(&request_key)
            .fetch_optional(&mut *tx)
            .await?
    {
        tx.rollback().await?;
        let item = sqlx::query_as::<_, ExpenseItemDto>(
            "SELECT e.id, e.reference, e.category, e.amount, e.method_code, pm.label AS method_label,
                    e.session_id, e.beneficiary, e.notes, e.receipt_path, e.expense_date, e.created_at
             FROM expenses e
             JOIN payment_methods pm ON pm.code = e.method_code
             WHERE e.id = ?",
        )
        .bind(existing_id)
        .fetch_one(&db.pool)
        .await?;
        return Ok(item);
    }

    let (session_id, _sref, opening_cash) = require_open_session_tx(&mut tx).await?;
    let pm: Option<(String, i64, i64)> =
        sqlx::query_as("SELECT code, is_cash, active FROM payment_methods WHERE code = ?")
            .bind(&input.method_code)
            .fetch_optional(&mut *tx)
            .await?;
    let (code, is_cash, active) =
        pm.ok_or_else(|| CoreError::InvalidPayment("Moyen de paiement invalide.".to_string()))?;
    if active == 0 {
        return Err(CoreError::InvalidPayment(
            "Moyen de paiement inactif.".to_string(),
        ));
    }
    if is_cash == 1 {
        let avail = get_theoretical_cash_tx(&mut tx, session_id, opening_cash).await?;
        if amount.value() > avail {
            return Err(CoreError::InvalidPayment(
                "Espèces insuffisantes en caisse pour cette dépense.".to_string(),
            ));
        }
    }

    let reference = DepotDb::next_sequence(&mut tx, "DEP").await?;
    let exp_date = input
        .expense_date
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
    let exp_id = sqlx::query(
        "INSERT INTO expenses (reference, request_key, category, amount, method_code, session_id, beneficiary, notes, receipt_path, expense_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&reference)
    .bind(&request_key)
    .bind(&category)
    .bind(amount.value())
    .bind(&code)
    .bind(session_id)
    .bind(input.beneficiary.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.notes.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(&receipt_path)
    .bind(&exp_date)
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    sqlx::query(
        "INSERT INTO cash_movements (session_id, request_key, kind, method_code, direction, amount, description, reference_document)
         VALUES (?, ?, 'expense', ?, 'out', ?, ?, ?)",
    )
    .bind(session_id)
    .bind(format!("cm-exp:{request_key}"))
    .bind(&code)
    .bind(amount.value())
    .bind(format!("Dépense {category} ({reference})"))
    .bind(&reference)
    .execute(&mut *tx)
    .await?;

    audit_log_tx(
        &mut tx,
        "CREATE_EXPENSE",
        "expenses",
        Some(exp_id.to_string()),
        &format!("{reference} — {category} : {} FCFA", amount.value()),
    )
    .await?;
    tx.commit().await?;

    let item = sqlx::query_as::<_, ExpenseItemDto>(
        "SELECT e.id, e.reference, e.category, e.amount, e.method_code, pm.label AS method_label,
                e.session_id, e.beneficiary, e.notes, e.receipt_path, e.expense_date, e.created_at
         FROM expenses e
         JOIN payment_methods pm ON pm.code = e.method_code
         WHERE e.id = ?",
    )
    .bind(exp_id)
    .fetch_one(&db.pool)
    .await?;
    Ok(item)
}

#[derive(Debug, Serialize, FromRow)]
pub struct ExpenseCategoryDto {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ExpenseItemDto {
    pub id: i64,
    pub reference: String,
    pub category: String,
    pub amount: i64,
    pub method_code: String,
    pub method_label: String,
    pub session_id: i64,
    pub beneficiary: Option<String>,
    pub notes: Option<String>,
    pub receipt_path: Option<String>,
    pub expense_date: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct ExpensesOverviewDto {
    pub categories: Vec<ExpenseCategoryDto>,
    pub items: Vec<ExpenseItemDto>,
}

pub async fn list_expenses(db: &DepotDb) -> CoreResult<ExpensesOverviewDto> {
    require_current_actor_permission(Permission::CashRead)?;
    let categories = sqlx::query_as::<_, ExpenseCategoryDto>(
        "SELECT id, name FROM expense_categories ORDER BY name",
    )
    .fetch_all(&db.pool)
    .await?;
    let items = sqlx::query_as::<_, ExpenseItemDto>(
        "SELECT e.id, e.reference, e.category, e.amount, e.method_code, pm.label AS method_label,
                e.session_id, e.beneficiary, e.notes, e.receipt_path, e.expense_date, e.created_at
         FROM expenses e
         JOIN payment_methods pm ON pm.code = e.method_code
         ORDER BY e.id DESC LIMIT 500",
    )
    .fetch_all(&db.pool)
    .await?;
    Ok(ExpensesOverviewDto { categories, items })
}
