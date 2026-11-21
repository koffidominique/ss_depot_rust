// ============================================================================
// Créances clients : consultation et encaissement multi-moyens
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::sales::{audit_log_tx, require_open_session_tx};
use crate::domain::money::Money;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{PayReceivableInput, ReceivableDto};

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
        let (code, active) = pm
            .ok_or_else(|| CoreError::InvalidPayment("Moyen de paiement invalide.".to_string()))?;
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
