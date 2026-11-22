// ============================================================================
// Dettes fournisseurs : suivi et règlement avec contrôle caisse
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::sales::{audit_log_tx, get_theoretical_cash_tx, require_open_session_tx};
use crate::domain::money::Money;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{PaySupplierDebtInput, SupplierDebtDto};

pub async fn list_supplier_debts(db: &DepotDb) -> CoreResult<Vec<SupplierDebtDto>> {
    require_current_actor_permission(Permission::PurchasesRead)?;
    let rows = sqlx::query_as::<_, SupplierDebtDto>(
        "SELECT sd.id, sd.receipt_id, sd.supplier_id, s.name AS supplier_name, s.code AS supplier_code,
                pr.reference AS receipt_reference, po.reference AS order_reference,
                sd.initial_amount, sd.remaining_amount, sd.due_date, sd.status, sd.created_at
         FROM supplier_debts sd
         JOIN suppliers s ON s.id = sd.supplier_id
         JOIN purchase_receipts pr ON pr.id = sd.receipt_id
         JOIN purchase_orders po ON po.id = pr.purchase_order_id
         ORDER BY sd.status ASC, sd.id DESC",
    )
    .fetch_all(&db.pool)
    .await?;
    Ok(rows)
}

pub async fn pay_supplier_debt(
    db: &DepotDb,
    debt_id: i64,
    input: PaySupplierDebtInput,
) -> CoreResult<SupplierDebtDto> {
    require_current_actor_permission(Permission::SupplierDebtsPay)?;
    let request_key = input.request_key.trim().to_string();
    if request_key.is_empty() {
        return Err(CoreError::Validation(
            "Clé d'idempotence requise.".to_string(),
        ));
    }
    let amount = Money::from_positive(input.amount, "Montant règlement fournisseur")?;
    let (_guard, mut tx) = db.begin_write().await?;

    let existing_pay: Option<(i64, String)> =
        sqlx::query_as("SELECT id, payment_kind FROM payments WHERE request_key = ?")
            .bind(&request_key)
            .fetch_optional(&mut *tx)
            .await?;
    if let Some((_pay_id, kind)) = existing_pay {
        let expected_desc = format!("Règlement fournisseur dette #{debt_id}");
        let cm_desc: Option<String> =
            sqlx::query_scalar("SELECT description FROM cash_movements WHERE request_key = ?")
                .bind(format!("cm-sup:{request_key}"))
                .fetch_optional(&mut *tx)
                .await?;
        tx.rollback().await?;
        if kind != "supplier_debt" || cm_desc.as_deref() != Some(expected_desc.as_str()) {
            return Err(CoreError::DuplicateOperation(
                "Cette clé d'idempotence a déjà été utilisée pour une autre opération.".to_string(),
            ));
        }
        return list_supplier_debts(db)
            .await?
            .into_iter()
            .find(|d| d.id == debt_id)
            .ok_or_else(|| CoreError::Validation("Dette fournisseur introuvable.".to_string()));
    }

    let (session_id, _sref, opening_cash) = require_open_session_tx(&mut tx).await?;
    let debt: Option<(i64, i64)> =
        sqlx::query_as("SELECT id, remaining_amount FROM supplier_debts WHERE id = ?")
            .bind(debt_id)
            .fetch_optional(&mut *tx)
            .await?;
    let (_id, rem) =
        debt.ok_or_else(|| CoreError::Validation("Dette fournisseur introuvable.".to_string()))?;
    if amount.value() > rem {
        return Err(CoreError::InvalidPayment(
            "Le règlement dépasse le solde fournisseur restant.".to_string(),
        ));
    }

    let pm: Option<(String, i64, i64)> =
        sqlx::query_as("SELECT code, is_cash, active FROM payment_methods WHERE code = ?")
            .bind(&input.method_code)
            .fetch_optional(&mut *tx)
            .await?;
    let (pm_code, is_cash, active) =
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
                "Espèces insuffisantes en caisse pour ce règlement fournisseur.".to_string(),
            ));
        }
    }

    let pay_ref = DepotDb::next_sequence(&mut tx, "PAY").await?;
    let payment_id = sqlx::query(
        "INSERT INTO payments (reference, request_key, payment_kind, total_amount, note)
         VALUES (?, ?, 'supplier_debt', ?, ?)",
    )
    .bind(&pay_ref)
    .bind(&request_key)
    .bind(amount.value())
    .bind(
        input
            .note
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty()),
    )
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    let part_id =
        sqlx::query("INSERT INTO payment_parts (payment_id, method_code, amount) VALUES (?, ?, ?)")
            .bind(payment_id)
            .bind(&pm_code)
            .bind(amount.value())
            .execute(&mut *tx)
            .await?
            .last_insert_rowid();

    sqlx::query(
        "INSERT INTO cash_movements (session_id, request_key, payment_part_id, kind, method_code, direction, amount, description, reference_document)
         VALUES (?, ?, ?, 'supplier_payment', ?, 'out', ?, ?, ?)",
    )
    .bind(session_id)
    .bind(format!("cm-sup:{request_key}"))
    .bind(part_id)
    .bind(&pm_code)
    .bind(amount.value())
    .bind(format!("Règlement fournisseur dette #{debt_id}"))
    .bind(&pay_ref)
    .execute(&mut *tx)
    .await?;

    let next_rem = rem - amount.value();
    sqlx::query("UPDATE supplier_debts SET remaining_amount = ?, status = ? WHERE id = ?")
        .bind(next_rem)
        .bind(if next_rem == 0 { "paid" } else { "partial" })
        .bind(debt_id)
        .execute(&mut *tx)
        .await?;

    audit_log_tx(
        &mut tx,
        "PAY_SUPPLIER_DEBT",
        "supplier_debts",
        Some(debt_id.to_string()),
        &format!("{pay_ref} — {} FCFA", amount.value()),
    )
    .await?;
    tx.commit().await?;

    list_supplier_debts(db)
        .await?
        .into_iter()
        .find(|d| d.id == debt_id)
        .ok_or_else(|| CoreError::Internal("Dette fournisseur introuvable.".to_string()))
}
