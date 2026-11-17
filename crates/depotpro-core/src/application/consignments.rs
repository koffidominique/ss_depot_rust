use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::application::sales::{audit_log_tx, get_theoretical_cash_tx, require_open_session_tx};
use crate::domain::money::Money;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

#[derive(Debug, Serialize, FromRow)]
pub struct ReturnableTypeDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub producer: String,
    pub kind: String,
    pub description: Option<String>,
    pub deposit_value: i64,
    pub stock_quantity: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ClientPackagingBalanceDto {
    pub id: i64,
    pub client_id: i64,
    pub client_name: String,
    pub client_code: String,
    pub returnable_id: i64,
    pub packaging_name: String,
    pub packaging_code: String,
    pub deposit_value: i64,
    pub balance_pieces: i64,
    pub deposit_held_amount: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ReturnableMovementDto {
    pub id: i64,
    pub packaging_id: i64,
    pub packaging_name: String,
    pub packaging_code: String,
    pub movement_type: String,
    pub quantity: i64,
    pub stock_before: Option<i64>,
    pub stock_after: i64,
    pub reason: String,
    pub reference_document: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct OpenDepositIssueDto {
    pub id: i64,
    pub sale_id: i64,
    pub sale_reference: String,
    pub client_id: Option<i64>,
    pub client_name: Option<String>,
    pub returnable_id: i64,
    pub packaging_name: String,
    pub packaging_code: String,
    pub pieces: i64,
    pub returned_pieces: i64,
    pub unit_value: i64,
    pub amount: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct DepositReturnDto {
    pub id: i64,
    pub reference: String,
    pub packaging_name: String,
    pub client_name: Option<String>,
    pub pieces: i64,
    pub condition_state: String,
    pub refund_amount: i64,
    pub credit_reduction: i64,
    pub method_label: String,
    pub reason: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsignmentsOverviewDto {
    pub types: Vec<ReturnableTypeDto>,
    pub client_balances: Vec<ClientPackagingBalanceDto>,
    pub recent_movements: Vec<ReturnableMovementDto>,
    pub open_issues: Vec<OpenDepositIssueDto>,
    pub returns: Vec<DepositReturnDto>,
}

#[derive(Debug, Deserialize)]
pub struct CreateReturnableTypeInput {
    pub code: String,
    pub name: String,
    pub producer: String,
    pub kind: String,
    pub deposit_value: i64,
    pub initial_stock: Option<i64>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AdjustReturnableStockInput {
    pub packaging_id: i64,
    pub movement_type: String,
    pub quantity: i64,
    pub reason: String,
    pub request_key: String,
}

#[derive(Debug, Deserialize)]
pub struct ReturnClientEmptiesInput {
    pub issue_id: i64,
    pub pieces: i64,
    pub condition_state: String,
    pub refund_amount: i64,
    pub credit_reduction: i64,
    pub method_code: String,
    pub reason: String,
    pub request_key: String,
}

pub async fn get_overview(db: &DepotDb) -> CoreResult<ConsignmentsOverviewDto> {
    let types = sqlx::query_as::<_, ReturnableTypeDto>(
        "SELECT rpt.id, rpt.code, rpt.name, rpt.producer, rpt.kind, rpt.description, rpt.deposit_value,
                COALESCE(rsb.quantity, 0) AS stock_quantity
         FROM returnable_packaging_types rpt
         LEFT JOIN returnable_stock_balances rsb ON rsb.packaging_id = rpt.id
         ORDER BY rpt.name",
    )
    .fetch_all(&db.pool)
    .await?;

    let client_balances = sqlx::query_as::<_, ClientPackagingBalanceDto>(
        "SELECT cpa.rowid AS id, cpa.client_id, c.name AS client_name, c.code AS client_code,
                cpa.returnable_id, rpt.name AS packaging_name, rpt.code AS packaging_code, rpt.deposit_value,
                cpa.balance_pieces, cpa.deposit_held_amount
         FROM customer_packaging_accounts cpa
         JOIN clients c ON c.id = cpa.client_id
         JOIN returnable_packaging_types rpt ON rpt.id = cpa.returnable_id
         WHERE cpa.balance_pieces > 0 OR cpa.deposit_held_amount > 0
         ORDER BY c.name, rpt.name",
    )
    .fetch_all(&db.pool)
    .await?;

    let recent_movements = sqlx::query_as::<_, ReturnableMovementDto>(
        "SELECT rsm.id, rsm.packaging_id, rpt.name AS packaging_name, rpt.code AS packaging_code,
                rsm.movement_type, rsm.quantity, rsm.stock_before, rsm.stock_after,
                rsm.reason, rsm.reference_document, rsm.date AS created_at
         FROM returnable_stock_movements rsm
         JOIN returnable_packaging_types rpt ON rpt.id = rsm.packaging_id
         ORDER BY rsm.id DESC LIMIT 50",
    )
    .fetch_all(&db.pool)
    .await?;

    let open_issues = sqlx::query_as::<_, OpenDepositIssueDto>(
        "SELECT di.id, di.sale_id, s.reference AS sale_reference, di.client_id, c.name AS client_name,
                di.returnable_id, rpt.name AS packaging_name, rpt.code AS packaging_code,
                di.pieces, di.returned_pieces, di.unit_value, di.amount
         FROM deposit_issues di
         JOIN sales s ON s.id = di.sale_id
         LEFT JOIN clients c ON c.id = di.client_id
         JOIN returnable_packaging_types rpt ON rpt.id = di.returnable_id
         WHERE s.status != 'cancelled' AND di.returned_pieces < di.pieces
         ORDER BY di.id DESC",
    )
    .fetch_all(&db.pool)
    .await?;

    let returns = sqlx::query_as::<_, DepositReturnDto>(
        "SELECT dr.id, dr.reference, rpt.name AS packaging_name, c.name AS client_name,
                dr.pieces, dr.condition_state, dr.refund_amount, dr.credit_reduction,
                pm.label AS method_label, dr.reason, dr.created_at
         FROM deposit_returns dr
         JOIN returnable_packaging_types rpt ON rpt.id = dr.returnable_id
         LEFT JOIN clients c ON c.id = dr.client_id
         JOIN payment_methods pm ON pm.code = dr.method_code
         ORDER BY dr.id DESC LIMIT 50",
    )
    .fetch_all(&db.pool)
    .await?;

    Ok(ConsignmentsOverviewDto {
        types,
        client_balances,
        recent_movements,
        open_issues,
        returns,
    })
}

pub async fn create_returnable_type(
    db: &DepotDb,
    input: CreateReturnableTypeInput,
) -> CoreResult<ReturnableTypeDto> {
    let code = input.code.trim().to_uppercase();
    let name = input.name.trim().to_string();
    let producer = input.producer.trim().to_string();
    if code.is_empty() || name.is_empty() || producer.is_empty() {
        return Err(CoreError::Validation(
            "Code, nom et producteur sont obligatoires.".to_string(),
        ));
    }
    if !matches!(input.kind.as_str(), "bottle" | "crate") {
        return Err(CoreError::Validation("Type emballage invalide.".to_string()));
    }
    let deposit_value = Money::from_non_negative(input.deposit_value, "Valeur de consigne")?;
    let initial_stock = input.initial_stock.unwrap_or(0);
    if initial_stock < 0 {
        return Err(CoreError::Validation(
            "Le stock initial doit être positif ou nul.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    if sqlx::query_scalar::<_, i64>("SELECT id FROM returnable_packaging_types WHERE code = ?")
        .bind(&code)
        .fetch_optional(&mut *tx)
        .await?
        .is_some()
    {
        return Err(CoreError::DuplicateOperation("Code emballage déjà utilisé.".to_string()));
    }

    let clean_desc = input
        .description
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string);
    let id = sqlx::query(
        "INSERT INTO returnable_packaging_types (code, name, producer, kind, description, deposit_value)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&code)
    .bind(&name)
    .bind(&producer)
    .bind(&input.kind)
    .bind(clean_desc.as_deref())
    .bind(deposit_value.value())
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    sqlx::query("INSERT INTO returnable_stock_balances (packaging_id, quantity) VALUES (?, ?)")
        .bind(id)
        .bind(initial_stock)
        .execute(&mut *tx)
        .await?;

    if initial_stock > 0 {
        sqlx::query(
            "INSERT INTO returnable_stock_movements (request_key, packaging_id, movement_type, quantity, stock_before, stock_after, reason, reference_document)
             VALUES (?, ?, 'initial', ?, 0, ?, 'Stock initial emballage', ?)",
        )
        .bind(format!("init-ret-{id}"))
        .bind(id)
        .bind(initial_stock)
        .bind(initial_stock)
        .bind(&code)
        .execute(&mut *tx)
        .await?;
    }

    audit_log_tx(
        &mut tx,
        "CREATE_RETURNABLE_TYPE",
        "returnable_packaging_types",
        Some(id.to_string()),
        &format!("{code} — {name}"),
    )
    .await?;
    tx.commit().await?;

    Ok(ReturnableTypeDto {
        id,
        code,
        name,
        producer,
        kind: input.kind,
        description: clean_desc,
        deposit_value: deposit_value.value(),
        stock_quantity: initial_stock,
    })
}

pub async fn adjust_returnable_stock(
    db: &DepotDb,
    input: AdjustReturnableStockInput,
) -> CoreResult<()> {
    if input.quantity <= 0 {
        return Err(CoreError::Validation(
            "La quantité doit être un entier strictement positif.".to_string(),
        ));
    }
    let reason = input.reason.trim().to_string();
    if reason.is_empty() {
        return Err(CoreError::Validation("Le motif est obligatoire.".to_string()));
    }
    if !matches!(
        input.movement_type.as_str(),
        "entry" | "exit" | "breakage" | "loss" | "correction_in" | "correction_out"
    ) {
        return Err(CoreError::Validation("Type de mouvement invalide.".to_string()));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    if sqlx::query_scalar::<_, i64>("SELECT id FROM returnable_stock_movements WHERE request_key = ?")
        .bind(&input.request_key)
        .fetch_optional(&mut *tx)
        .await?
        .is_some()
    {
        tx.rollback().await?;
        return Ok(());
    }

    let bal: Option<(i64,)> =
        sqlx::query_as("SELECT quantity FROM returnable_stock_balances WHERE packaging_id = ?")
            .bind(input.packaging_id)
            .fetch_optional(&mut *tx)
            .await?;
    let before = bal.map(|b| b.0).unwrap_or(0);
    let is_out = matches!(
        input.movement_type.as_str(),
        "exit" | "breakage" | "loss" | "correction_out"
    );
    let after = if is_out {
        before.checked_sub(input.quantity)
    } else {
        before.checked_add(input.quantity)
    }
    .ok_or_else(|| CoreError::Validation("Débordement sur le stock de vides.".to_string()))?;
    if after < 0 {
        return Err(CoreError::InsufficientStock(
            "Stock de vides insuffisant pour ce mouvement.".to_string(),
        ));
    }

    if bal.is_some() {
        sqlx::query("UPDATE returnable_stock_balances SET quantity = ? WHERE packaging_id = ?")
            .bind(after)
            .bind(input.packaging_id)
            .execute(&mut *tx)
            .await?;
    } else {
        sqlx::query("INSERT INTO returnable_stock_balances (packaging_id, quantity) VALUES (?, ?)")
            .bind(input.packaging_id)
            .bind(after)
            .execute(&mut *tx)
            .await?;
    }

    sqlx::query(
        "INSERT INTO returnable_stock_movements (request_key, packaging_id, movement_type, quantity, stock_before, stock_after, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&input.request_key)
    .bind(input.packaging_id)
    .bind(&input.movement_type)
    .bind(input.quantity)
    .bind(before)
    .bind(after)
    .bind(&reason)
    .execute(&mut *tx)
    .await?;

    audit_log_tx(
        &mut tx,
        "RETURNABLE_STOCK_MOVEMENT",
        "returnable_packaging_types",
        Some(input.packaging_id.to_string()),
        &format!("{} {} ({reason})", input.movement_type, input.quantity),
    )
    .await?;
    tx.commit().await?;
    Ok(())
}

pub async fn return_client_empties(
    db: &DepotDb,
    input: ReturnClientEmptiesInput,
) -> CoreResult<String> {
    if input.pieces <= 0 {
        return Err(CoreError::Validation("Nombre de pièces retournées invalide.".to_string()));
    }
    if !matches!(input.condition_state.as_str(), "good" | "damaged") {
        return Err(CoreError::Validation("État d'emballage invalide.".to_string()));
    }
    let refund_amount = Money::from_non_negative(input.refund_amount, "Montant remboursé")?;
    let credit_reduction = Money::from_non_negative(input.credit_reduction, "Réduction créance")?;
    let reason = input.reason.trim().to_string();
    if reason.is_empty() {
        return Err(CoreError::Validation("Le motif du retour est obligatoire.".to_string()));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    if let Some((existing_ref,)) =
        sqlx::query_as::<_, (String,)>("SELECT reference FROM deposit_returns WHERE request_key = ?")
            .bind(&input.request_key)
            .fetch_optional(&mut *tx)
            .await?
    {
        tx.rollback().await?;
        return Ok(existing_ref);
    }

    let (session_id, _sref, opening_cash) = require_open_session_tx(&mut tx).await?;
    type DepositIssueRow = (i64, i64, Option<i64>, i64, i64, i64, i64);
    let issue: Option<DepositIssueRow> = sqlx::query_as(
        "SELECT id, sale_id, client_id, returnable_id, pieces, returned_pieces, unit_value
         FROM deposit_issues WHERE id = ?",
    )
    .bind(input.issue_id)
    .fetch_optional(&mut *tx)
    .await?;
    let (issue_id, sale_id, client_id, returnable_id, pieces, returned_pieces, unit_value) =
        issue.ok_or_else(|| CoreError::Validation("Consigne client introuvable.".to_string()))?;

    let total_returned_pieces = returned_pieces
        .checked_add(input.pieces)
        .ok_or_else(|| CoreError::Validation("Débordement du nombre de pièces.".to_string()))?;
    if total_returned_pieces > pieces {
        return Err(CoreError::Validation(
            "Nombre de vides retournés supérieur au solde sorti sur cette vente.".to_string(),
        ));
    }
    let max_val = Money::from_non_negative(unit_value, "Tarif consigne")?
        .checked_mul(input.pieces, "Valeur consignée retournée")?;
    let total_counterpart = refund_amount.checked_add(credit_reduction, "Contrepartie retour vides")?;
    if total_counterpart > max_val {
        return Err(CoreError::InvalidPayment(format!(
            "La contrepartie ({}) dépasse la valeur consignée ({}).",
            total_counterpart.value(),
            max_val.value()
        )));
    }

    if credit_reduction.value() > 0 {
        let rec: Option<(i64, i64)> =
            sqlx::query_as("SELECT id, remaining_amount FROM customer_receivables WHERE sale_id = ?")
                .bind(sale_id)
                .fetch_optional(&mut *tx)
                .await?;
        let (rec_id, rem) = rec.ok_or_else(|| {
            CoreError::InvalidPayment("Aucune créance associée à cette vente.".to_string())
        })?;
        if credit_reduction.value() > rem {
            return Err(CoreError::InvalidPayment(
                "Réduction de créance supérieure au solde restant.".to_string(),
            ));
        }
        let next_rem = Money(rem)
            .checked_sub_non_negative(credit_reduction, "Solde créance")?
            .value();
        sqlx::query("UPDATE customer_receivables SET remaining_amount = ?, status = ? WHERE id = ?")
            .bind(next_rem)
            .bind(if next_rem == 0 { "paid" } else { "partial" })
            .bind(rec_id)
            .execute(&mut *tx)
            .await?;
    }

    if refund_amount.value() > 0 && input.method_code == "cash" {
        let avail = get_theoretical_cash_tx(&mut tx, session_id, opening_cash).await?;
        if refund_amount.value() > avail {
            return Err(CoreError::InvalidPayment(
                "Espèces en caisse insuffisantes pour rembourser la consigne.".to_string(),
            ));
        }
    }

    let bal: Option<(i64,)> =
        sqlx::query_as("SELECT quantity FROM returnable_stock_balances WHERE packaging_id = ?")
            .bind(returnable_id)
            .fetch_optional(&mut *tx)
            .await?;
    let before = bal.map(|b| b.0).unwrap_or(0);
    let after = if input.condition_state == "good" {
        before
            .checked_add(input.pieces)
            .ok_or_else(|| CoreError::Validation("Débordement du stock de vides.".to_string()))?
    } else {
        before
    };

    if input.condition_state == "good" {
        if bal.is_some() {
            sqlx::query("UPDATE returnable_stock_balances SET quantity = ? WHERE packaging_id = ?")
                .bind(after)
                .bind(returnable_id)
                .execute(&mut *tx)
                .await?;
        } else {
            sqlx::query("INSERT INTO returnable_stock_balances (packaging_id, quantity) VALUES (?, ?)")
                .bind(returnable_id)
                .bind(after)
                .execute(&mut *tx)
                .await?;
        }
    }

    let mov_type = if input.condition_state == "good" {
        "entry"
    } else {
        "breakage"
    };
    let mov_id = sqlx::query(
        "INSERT INTO returnable_stock_movements (request_key, packaging_id, movement_type, quantity, stock_before, stock_after, reason, reference_document)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(format!("ret-vides:{}", input.request_key))
    .bind(returnable_id)
    .bind(mov_type)
    .bind(input.pieces)
    .bind(before)
    .bind(after)
    .bind(format!("Retour client ({}) : {reason}", input.condition_state))
    .bind(format!("VENTE-{sale_id}"))
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    sqlx::query("UPDATE deposit_issues SET returned_pieces = returned_pieces + ? WHERE id = ?")
        .bind(input.pieces)
        .bind(issue_id)
        .execute(&mut *tx)
        .await?;

    if let Some(cid) = client_id {
        let released_deposit = Money::from_non_negative(unit_value, "Tarif consigne")?
            .checked_mul(input.pieces, "Libération consigne client")?
            .value();
        sqlx::query(
            "UPDATE customer_packaging_accounts
             SET balance_pieces = MAX(0, balance_pieces - ?),
                 deposit_held_amount = MAX(0, deposit_held_amount - ?)
             WHERE client_id = ? AND returnable_id = ?",
        )
        .bind(input.pieces)
        .bind(released_deposit)
        .bind(cid)
        .bind(returnable_id)
        .execute(&mut *tx)
        .await?;
    }

    let reference = DepotDb::next_sequence(&mut tx, "REC").await?;
    if refund_amount.value() > 0 {
        sqlx::query(
            "INSERT INTO cash_movements (session_id, request_key, kind, method_code, direction, amount, description, reference_document)
             VALUES (?, ?, 'deposit_refund', ?, 'out', ?, ?, ?)",
        )
        .bind(session_id)
        .bind(format!("dep-ref:{}", input.request_key))
        .bind(&input.method_code)
        .bind(refund_amount.value())
        .bind(format!("Remboursement consigne {reference} ({reason})"))
        .bind(&reference)
        .execute(&mut *tx)
        .await?;
    }

    let ret_id = sqlx::query(
        "INSERT INTO deposit_returns (reference, request_key, issue_id, client_id, returnable_id, session_id, stock_movement_id, pieces, condition_state, refund_amount, credit_reduction, method_code, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&reference)
    .bind(&input.request_key)
    .bind(issue_id)
    .bind(client_id)
    .bind(returnable_id)
    .bind(session_id)
    .bind(mov_id)
    .bind(input.pieces)
    .bind(&input.condition_state)
    .bind(refund_amount.value())
    .bind(credit_reduction.value())
    .bind(&input.method_code)
    .bind(&reason)
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    audit_log_tx(
        &mut tx,
        "DEPOSIT_RETURN",
        "deposit_returns",
        Some(ret_id.to_string()),
        &format!("{reference} — {} pièces ({})", input.pieces, input.condition_state),
    )
    .await?;
    tx.commit().await?;
    Ok(reference)
}
