// ============================================================================
// Dépenses de fonctionnement et catégories de dépenses
// ============================================================================

use serde::Serialize;
use sqlx::FromRow;

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::sales::{audit_log_tx, get_theoretical_cash_tx, require_open_session_tx};
use crate::domain::money::Money;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::CreateExpenseInput;

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
