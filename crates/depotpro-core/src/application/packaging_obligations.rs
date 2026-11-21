//! Gestion des obligations d'emballages, échéances, conversions en créances
//! financières, déclarations de perte et retours tardifs (MAJ.md sections 5-8).
//!
//! Règles clés :
//! - Une obligation physique n'est PAS une dette financière exigible avant échéance.
//! - La valeur unitaire appliquée est celle photographiée à la vente (`unit_value`).
//! - Les conversions sont idempotentes (converted_pieces + request_key UNIQUE).
//! - Les retours tardifs régularisent la créance par une contre-écriture, sans
//!   jamais modifier ni supprimer l'historique.

use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::{DepotDb, MIN_SUPPORTED_SCHEMA_VERSION};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct PackagingObligationDto {
    pub id: i64,
    pub sale_id: i64,
    pub sale_reference: Option<String>,
    pub client_id: Option<i64>,
    pub returnable_id: i64,
    pub pieces: i64,
    pub returned_pieces: i64,
    pub lost_pieces: i64,
    pub destroyed_pieces: i64,
    pub converted_pieces: i64,
    pub pending_pieces: i64,
    pub unit_value: i64,
    pub total_reference_value: i64,
    pub due_date: Option<String>,
    pub overdue: bool,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct PackagingFinancialBalanceDto {
    pub client_id: i64,
    pub packaging_financial_balance: i64,
}

#[derive(Debug, Deserialize)]
pub struct DeclareLossInput {
    pub deposit_issue_id: i64,
    pub pieces: i64,
    pub reason: String,
    pub actor_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ConvertSummary {
    pub conversions: i64,
    pub total_amount: i64,
}

/// Liste les obligations d'un client (ou toutes) avec leur statut d'exigibilité.
pub async fn list_obligations(
    db: &DepotDb,
    client_id: Option<i64>,
) -> CoreResult<Vec<PackagingObligationDto>> {
    let rows = sqlx::query_as::<
        _,
        (
            i64,
            i64,
            Option<String>,
            Option<i64>,
            i64,
            i64,
            i64,
            i64,
            i64,
            i64,
            i64,
            Option<String>,
            String,
        ),
    >(
        "SELECT di.id, di.sale_id, s.reference, di.client_id, di.returnable_id,
                di.pieces, di.returned_pieces, di.lost_pieces, di.destroyed_pieces,
                di.converted_pieces, di.unit_value, di.due_date, di.status
         FROM deposit_issues di
         LEFT JOIN sales s ON s.id = di.sale_id
         WHERE (?1 IS NULL OR di.client_id = ?1)
           AND di.status NOT IN ('settled', 'cancelled')
         ORDER BY di.due_date ASC NULLS LAST, di.id ASC",
    )
    .bind(client_id)
    .fetch_all(&db.pool)
    .await?;

    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    Ok(rows
        .into_iter()
        .map(
            |(
                id,
                sale_id,
                sale_reference,
                cid,
                rid,
                pieces,
                returned,
                lost,
                destroyed,
                converted,
                unit_value,
                due_date,
                status,
            )| {
                let pending = pieces - returned - lost - destroyed - converted;
                PackagingObligationDto {
                    id,
                    sale_id,
                    sale_reference,
                    client_id: cid,
                    returnable_id: rid,
                    pieces,
                    returned_pieces: returned,
                    lost_pieces: lost,
                    destroyed_pieces: destroyed,
                    converted_pieces: converted,
                    pending_pieces: pending.max(0),
                    unit_value,
                    total_reference_value: pending.max(0) * unit_value,
                    overdue: matches!(status.as_str(), "pending" | "partially_returned")
                        && due_date
                            .as_deref()
                            .map(|d| d < today.as_str())
                            .unwrap_or(false),
                    due_date,
                    status,
                }
            },
        )
        .collect())
}

/// Solde financier d'emballages d'un client (créances exigibles uniquement).
pub async fn get_client_packaging_financial_balance(
    db: &DepotDb,
    client_id: i64,
) -> CoreResult<PackagingFinancialBalanceDto> {
    let balance: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount ELSE -amount END), 0)
         FROM customer_packaging_financial_ledger WHERE client_id = ?",
    )
    .bind(client_id)
    .fetch_one(&db.pool)
    .await?;
    Ok(PackagingFinancialBalanceDto {
        client_id,
        packaging_financial_balance: balance.max(0),
    })
}

type PolicyRow = (i64, Option<i64>, Option<i64>, i64, i64, i64);

type DueRow = (i64, Option<i64>, i64, i64, i64, i64, i64);

/// Résout la politique applicable : client > emballage > défaut global.
/// Retourne (policy_id, delay_days, auto_convert, allow_late_return).
fn resolve_policy(
    policies: &[PolicyRow],
    client_id: Option<i64>,
    returnable_id: i64,
) -> (Option<i64>, i64, bool) {
    let specific_client = client_id.and_then(|cid| {
        policies
            .iter()
            .find(|&(_pid, rid, cl, _d, _a, _l)| *cl == Some(cid) && *rid == Some(returnable_id))
            .copied()
    });
    let client_any = client_id.and_then(|cid| {
        policies
            .iter()
            .find(|&(_pid, rid, cl, _d, _a, _l)| *cl == Some(cid) && rid.is_none())
            .copied()
    });
    let returnable = policies
        .iter()
        .find(|&(_pid, rid, cl, _d, _a, _l)| cl.is_none() && *rid == Some(returnable_id))
        .copied();
    let global = policies
        .iter()
        .find(|&(_pid, rid, cl, _d, _a, _l)| cl.is_none() && rid.is_none())
        .copied();
    let chosen = specific_client.or(client_any).or(returnable).or(global);
    match chosen {
        Some((id, _, _, delay, auto, _late)) => (Some(id), delay, auto != 0),
        None => (None, 30, true),
    }
}

/// Traite les échéances : convertit les obligations échues non restituées en
/// créances financières. Idempotent : rappelé deux fois, aucune double dette.
/// Retourne le nombre de conversions et le montant total créé.
pub async fn process_due_obligations(
    db: &DepotDb,
    actor: Option<&str>,
) -> CoreResult<ConvertSummary> {
    let (_guard, mut tx) = db.begin_write().await?;
    let summary = process_due_obligations_tx(&mut tx, actor).await?;
    tx.commit().await?;
    Ok(summary)
}

pub(crate) async fn process_due_obligations_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    actor: Option<&str>,
) -> CoreResult<ConvertSummary> {
    let policies: Vec<PolicyRow> = sqlx::query_as(
        "SELECT id, returnable_id, client_id, return_delay_days, auto_convert_on_due, allow_late_return
         FROM packaging_policies WHERE is_active = 1",
    )
    .fetch_all(&mut **tx)
    .await?;

    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    // Obligations échues avec une quantité non restituée et non convertie.
    let due: Vec<DueRow> = sqlx::query_as(
        "SELECT di.id, di.client_id, di.returnable_id, di.pieces, di.returned_pieces,
                di.lost_pieces + di.destroyed_pieces + di.converted_pieces, di.unit_value
         FROM deposit_issues di
         JOIN packaging_policies pp ON pp.id = di.policy_id AND pp.auto_convert_on_due = 1
         WHERE di.status IN ('pending', 'partially_returned')
           AND di.due_date IS NOT NULL AND date(di.due_date) < date('now')",
    )
    .fetch_all(&mut **tx)
    .await?;
    let _ = &policies;
    let _ = resolve_policy(&policies, None, 0);
    let _ = MIN_SUPPORTED_SCHEMA_VERSION;

    let mut conversions = 0i64;
    let mut total_amount = 0i64;
    for (issue_id, client_id, _rid, pieces, returned, already_out, unit_value) in due {
        let pending = pieces - returned - already_out;
        if pending <= 0 {
            continue;
        }
        let amount = pending.checked_mul(unit_value).ok_or_else(|| {
            CoreError::Validation("Débordement du montant de conversion.".to_string())
        })?;
        if amount <= 0 {
            // Valeur nulle : solder physiquement sans dette financière.
            mark_converted(tx, issue_id, pending).await?;
            continue;
        }
        let request_key = DepotDb::next_sequence(tx, "CNV-EMB").await?;
        sqlx::query(
            "INSERT INTO packaging_conversions
                (request_key, deposit_issue_id, client_id, reason, pieces,
                 unit_value_snapshot, amount, source_sale_id)
             SELECT ?, di.id, di.client_id, 'due_date', ?, ?, ?, di.sale_id
             FROM deposit_issues di WHERE di.id = ?",
        )
        .bind(&request_key)
        .bind(pending)
        .bind(unit_value)
        .bind(amount)
        .bind(issue_id)
        .execute(&mut **tx)
        .await?;
        let conversion_id: i64 =
            sqlx::query_scalar("SELECT id FROM packaging_conversions WHERE request_key = ?")
                .bind(&request_key)
                .fetch_one(&mut **tx)
                .await?;
        if let Some(cid) = client_id {
            insert_ledger_entry(
                tx,
                &format!("cnv:{conversion_id}"),
                cid,
                Some(conversion_id),
                "conversion_charge",
                amount,
                "debit",
                actor,
                Some(format!(
                    "Conversion échéance : {pending} pièce(s) non restituée(s)."
                )),
            )
            .await?;
        }
        mark_converted(tx, issue_id, pending).await?;
        conversions += 1;
        total_amount += amount;
    }
    let _ = &today;
    Ok(ConvertSummary {
        conversions,
        total_amount,
    })
}

async fn mark_converted(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    issue_id: i64,
    pending: i64,
) -> CoreResult<()> {
    sqlx::query(
        "UPDATE deposit_issues
         SET converted_pieces = converted_pieces + ?,
             status = CASE WHEN returned_pieces + lost_pieces + destroyed_pieces
                                + converted_pieces >= pieces
                           THEN 'converted' ELSE status END,
             converted_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ?",
    )
    .bind(pending)
    .bind(issue_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn insert_ledger_entry(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    request_key: &str,
    client_id: i64,
    conversion_id: Option<i64>,
    entry_type: &str,
    amount: i64,
    direction: &str,
    actor: Option<&str>,
    note: Option<String>,
) -> CoreResult<()> {
    let user_id: Option<i64> = match actor {
        Some(name) => {
            sqlx::query_scalar("SELECT id FROM users WHERE username = ?")
                .bind(name)
                .fetch_optional(&mut **tx)
                .await?
        }
        None => None,
    };
    let prev: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount ELSE -amount END), 0)
         FROM customer_packaging_financial_ledger WHERE client_id = ?",
    )
    .bind(client_id)
    .fetch_one(&mut **tx)
    .await?;
    let delta = if direction == "debit" {
        amount
    } else {
        -amount
    };
    let balance_after = (prev + delta).max(0);
    sqlx::query(
        "INSERT INTO customer_packaging_financial_ledger
            (request_key, client_id, conversion_id, entry_type, amount, direction,
             balance_after, note, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(request_key)
    .bind(client_id)
    .bind(conversion_id)
    .bind(entry_type)
    .bind(amount)
    .bind(direction)
    .bind(balance_after)
    .bind(note)
    .bind(user_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// Déclare une perte ou destruction avant échéance. La conversion financière
/// n'est créée qu'après validation (`validate_loss_declaration`).
pub async fn declare_loss(
    db: &DepotDb,
    input: DeclareLossInput,
    actor: Option<&str>,
) -> CoreResult<i64> {
    if input.pieces <= 0 {
        return Err(CoreError::Validation(
            "La quantité déclarée doit être strictement positive.".to_string(),
        ));
    }
    if input.reason.trim().is_empty() {
        return Err(CoreError::Validation(
            "Le motif est obligatoire.".to_string(),
        ));
    }
    let mut g = db.begin_write().await?;
    let tx = &mut g.1;
    let (pieces_due, client_id): (i64, Option<i64>) =
        sqlx::query_as("SELECT pieces, client_id FROM deposit_issues WHERE id = ?")
            .bind(input.deposit_issue_id)
            .fetch_optional(&mut **tx)
            .await?
            .ok_or_else(|| {
                CoreError::Validation("Obligation d'emballage introuvable.".to_string())
            })?;
    let already: i64 = sqlx::query_scalar(
        "SELECT returned_pieces + lost_pieces + destroyed_pieces + converted_pieces
         FROM deposit_issues WHERE id = ?",
    )
    .bind(input.deposit_issue_id)
    .fetch_one(&mut **tx)
    .await?;
    if input.pieces > pieces_due - already {
        return Err(CoreError::Validation(format!(
            "Quantité déclarée supérieure au reste à restituer (max {}).",
            pieces_due - already
        )));
    }
    let request_key = DepotDb::next_sequence(tx, "DEC-PERTE").await?;
    let user_id: Option<i64> = match actor {
        Some(name) => {
            sqlx::query_scalar("SELECT id FROM users WHERE username = ?")
                .bind(name)
                .fetch_optional(&mut **tx)
                .await?
        }
        None => None,
    };
    sqlx::query(
        "INSERT INTO packaging_loss_declarations
            (request_key, deposit_issue_id, client_id, pieces, status, reason, declared_by_user_id)
         VALUES (?, ?, ?, ?, 'declared', ?, ?)",
    )
    .bind(&request_key)
    .bind(input.deposit_issue_id)
    .bind(client_id)
    .bind(input.pieces)
    .bind(input.reason.trim())
    .bind(user_id)
    .execute(&mut **tx)
    .await?;
    let decl_id: i64 =
        sqlx::query_scalar("SELECT id FROM packaging_loss_declarations WHERE request_key = ?")
            .bind(&request_key)
            .fetch_one(&mut **tx)
            .await?;
    sqlx::query(
        "INSERT INTO audit_logs (entity_type, entity_id, action, details, actor_name)
         VALUES ('packaging_loss_declarations', ?, 'DECLARE_LOSS', ?, ?)",
    )
    .bind(decl_id.to_string())
    .bind(format!(
        "Perte déclarée : {} pièce(s) — motif : {}",
        input.pieces,
        input.reason.trim()
    ))
    .bind(actor)
    .execute(&mut **tx)
    .await?;
    g.1.commit().await?;
    Ok(decl_id)
}

/// Valide une déclaration de perte : convertit immédiatement la quantité
/// concernée en créance financière (une seule fois).
pub async fn validate_loss_declaration(
    db: &DepotDb,
    declaration_id: i64,
    actor: Option<&str>,
) -> CoreResult<i64> {
    let mut g = db.begin_write().await?;
    let tx = &mut g.1;
    let (issue_id, pieces, client_id, status): (i64, i64, Option<i64>, String) = sqlx::query_as(
        "SELECT deposit_issue_id, pieces, client_id, status
         FROM packaging_loss_declarations WHERE id = ?",
    )
    .bind(declaration_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| CoreError::Validation("Déclaration introuvable.".to_string()))?;
    if status != "declared" {
        return Err(CoreError::Validation(
            "Cette déclaration a déjà été traitée.".to_string(),
        ));
    }
    let unit_value: i64 = sqlx::query_scalar("SELECT unit_value FROM deposit_issues WHERE id = ?")
        .bind(issue_id)
        .fetch_one(&mut **tx)
        .await?;
    let amount = pieces
        .checked_mul(unit_value)
        .ok_or_else(|| CoreError::Validation("Débordement du montant.".to_string()))?;
    let request_key = DepotDb::next_sequence(tx, "CNV-EMB").await?;
    sqlx::query(
        "INSERT INTO packaging_conversions
            (request_key, deposit_issue_id, client_id, reason, pieces,
             unit_value_snapshot, amount)
         VALUES (?, ?, ?, 'loss', ?, ?, ?)",
    )
    .bind(&request_key)
    .bind(issue_id)
    .bind(client_id)
    .bind(pieces)
    .bind(unit_value)
    .bind(amount)
    .execute(&mut **tx)
    .await?;
    let conversion_id: i64 =
        sqlx::query_scalar("SELECT id FROM packaging_conversions WHERE request_key = ?")
            .bind(&request_key)
            .fetch_one(&mut **tx)
            .await?;
    if let Some(cid) = client_id {
        insert_ledger_entry(
            tx,
            &format!("cnv:{conversion_id}"),
            cid,
            Some(conversion_id),
            "conversion_charge",
            amount,
            "debit",
            actor,
            Some(format!("Perte validée : {pieces} pièce(s).")),
        )
        .await?;
    }
    mark_converted(tx, issue_id, pieces).await?;
    sqlx::query(
        "UPDATE packaging_loss_declarations
         SET status = 'validated', validated_by_user_id = (SELECT id FROM users WHERE username = ?),
             conversion_id = ?, updated_at = datetime('now')
         WHERE id = ?",
    )
    .bind(actor)
    .bind(conversion_id)
    .bind(declaration_id)
    .execute(&mut **tx)
    .await?;
    sqlx::query(
        "INSERT INTO audit_logs (entity_type, entity_id, action, details, actor_name)
         VALUES ('packaging_loss_declarations', ?, 'VALIDATE_LOSS', ?, ?)",
    )
    .bind(declaration_id.to_string())
    .bind(format!("Perte validée — créance créée : {amount} FCFA"))
    .bind(actor)
    .execute(&mut **tx)
    .await?;
    g.1.commit().await?;
    Ok(amount)
}

/// Enregistre un retour tardif sur une obligation déjà convertie (ou non) :
/// incrémente `returned_pieces`, incrémente le stock d'emballages vides, et
/// régularise la créance par une écriture de crédit (`late_return_credit`),
/// sans jamais modifier les écritures historiques.
///
/// `pieces` ne doit pas dépasser le reste dû + la quantité déjà convertie
/// (le retour tardif régularise au-delà du reste physique).
pub async fn register_late_return(
    db: &DepotDb,
    deposit_issue_id: i64,
    pieces: i64,
    actor: Option<&str>,
) -> CoreResult<i64> {
    if pieces <= 0 {
        return Err(CoreError::Validation(
            "La quantité retournée doit être strictement positive.".to_string(),
        ));
    }
    let mut g = db.begin_write().await?;
    let tx = &mut g.1;
    let (client_id, rid, status, pieces_due, returned, converted): (
        Option<i64>,
        i64,
        String,
        i64,
        i64,
        i64,
    ) = sqlx::query_as(
        "SELECT client_id, returnable_id, status, pieces, returned_pieces, converted_pieces
         FROM deposit_issues WHERE id = ?",
    )
    .bind(deposit_issue_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or_else(|| CoreError::Validation("Obligation introuvable.".to_string()))?;
    if status == "settled" || status == "cancelled" {
        return Err(CoreError::Validation(
            "Cette obligation est déjà soldée.".to_string(),
        ));
    }
    let pending_physical = pieces_due - returned - converted;
    if pieces > pending_physical && converted == 0 {
        return Err(CoreError::Validation(format!(
            "Retour supérieur au reste à restituer (max {pending_physical})."
        )));
    }
    let capped = pieces.min(pending_physical.max(0) + converted);
    // 1. Mise à jour de l'obligation : les retours tardifs réduisent d'abord la
    //    quantité convertie (régularisation), puis les pièces restantes.
    let late_regulated = (capped - pending_physical.max(0)).max(0).min(converted);
    let _physical_back = capped - late_regulated;
    // 1. Mise à jour de l'obligation.
    sqlx::query(
        "UPDATE deposit_issues
         SET returned_pieces = returned_pieces + ?,
             converted_pieces = converted_pieces - ?,
             updated_at = datetime('now')
         WHERE id = ?",
    )
    .bind(capped)
    .bind(late_regulated)
    .bind(deposit_issue_id)
    .execute(&mut **tx)
    .await?;
    sqlx::query(
        "UPDATE deposit_issues
         SET status = CASE WHEN returned_pieces >= pieces THEN 'settled' ELSE status END
         WHERE id = ?",
    )
    .bind(deposit_issue_id)
    .execute(&mut **tx)
    .await?;
    // 2. Stock d'emballages vides récupérés.
    sqlx::query(
        "INSERT INTO returnable_stock_movements
            (request_key, packaging_id, movement_type, quantity, stock_before, stock_after, reason)
         SELECT ?, ?, 'entry', COALESCE(rsb.quantity, 0) + ?, COALESCE(rsb.quantity, 0),
                COALESCE(rsb.quantity, 0) + ?, 'Retour tardif client'
         FROM returnable_packaging_types rpt
         LEFT JOIN returnable_stock_balances rsb ON rsb.packaging_id = rpt.id
         WHERE rpt.id = ?",
    )
    .bind(format!("late-ret:{deposit_issue_id}:{capped}"))
    .bind(rid)
    .bind(capped)
    .bind(capped)
    .bind(rid)
    .execute(&mut **tx)
    .await?;
    sqlx::query(
        "INSERT INTO returnable_stock_balances (packaging_id, quantity)
         VALUES (?, ?)
         ON CONFLICT(packaging_id) DO UPDATE SET quantity = quantity + excluded.quantity",
    )
    .bind(rid)
    .bind(0)
    .execute(&mut **tx)
    .await?;
    sqlx::query(
        "UPDATE returnable_stock_balances SET quantity = quantity + ? WHERE packaging_id = ?",
    )
    .bind(capped)
    .bind(rid)
    .execute(&mut **tx)
    .await?;
    // 3. Régularisation financière : crédit à hauteur de la partie convertie restituée.
    let mut credited = 0i64;
    if let Some(cid) = client_id {
        if late_regulated > 0 {
            let unit_value: i64 =
                sqlx::query_scalar("SELECT unit_value FROM deposit_issues WHERE id = ?")
                    .bind(deposit_issue_id)
                    .fetch_one(&mut **tx)
                    .await?;
            credited = late_regulated * unit_value;
            if credited > 0 {
                insert_ledger_entry(
                    tx,
                    &format!("late-ret:{deposit_issue_id}:{credited}"),
                    cid,
                    None,
                    "late_return_credit",
                    credited,
                    "credit",
                    actor,
                    Some(format!(
                        "Retour tardif : {late_regulated} pièce(s) récupérée(s) après conversion."
                    )),
                )
                .await?;
            }
        }
    }
    sqlx::query(
        "INSERT INTO audit_logs (entity_type, entity_id, action, details, actor_name)
         VALUES ('deposit_issues', ?, 'LATE_RETURN', ?, ?)",
    )
    .bind(deposit_issue_id.to_string())
    .bind(format!(
        "Retour tardif : {capped} pièce(s), régularisation : {credited} FCFA"
    ))
    .bind(actor)
    .execute(&mut **tx)
    .await?;
    g.1.commit().await?;
    Ok(credited)
}

#[derive(Debug, Deserialize)]
pub struct PayPackagingDebtInput {
    pub client_id: i64,
    pub parts: Vec<PayPackagingPart>,
    pub request_key: String,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PayPackagingPart {
    pub method_code: String,
    pub amount: i64,
}

#[derive(Debug, Serialize)]
pub struct PayPackagingDebtDto {
    pub client_id: i64,
    pub packaging_financial_balance: i64,
}

/// Règlement d'une créance financière d'emballages (registre distinct du compte
/// commercial). Idempotent via request_key. Le paiement est enregistré dans le
/// ledger 'payment' sans jamais toucher aux créances commerciales.
pub async fn pay_packaging_financial_debt(
    db: &DepotDb,
    input: PayPackagingDebtInput,
    actor: Option<&str>,
) -> CoreResult<PayPackagingDebtDto> {
    if input.request_key.trim().is_empty() {
        return Err(CoreError::Validation(
            "Clé d'idempotence requise.".to_string(),
        ));
    }
    if input.parts.is_empty() {
        return Err(CoreError::Validation(
            "Indiquez au moins un moyen de paiement.".to_string(),
        ));
    }
    let mut g = db.begin_write().await?;
    let tx0 = &mut g.1;

    // Idempotence : une écriture 'payment' avec la même request_key rejoue le solde.
    let existing: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM customer_packaging_financial_ledger
         WHERE request_key = ? AND entry_type = 'payment'",
    )
    .bind(input.request_key.trim())
    .fetch_optional(&mut **tx0)
    .await?;
    if existing.is_some() {
        let bal = get_client_packaging_financial_balance(db, input.client_id).await?;
        return Ok(PayPackagingDebtDto {
            client_id: input.client_id,
            packaging_financial_balance: bal.packaging_financial_balance,
        });
    }

    let tx = &mut g.1;
    let mut total = 0i64;
    let mut parts: Vec<(String, i64)> = Vec::new();
    for p in &input.parts {
        if p.amount <= 0 {
            return Err(CoreError::Validation(
                "Le montant payé doit être strictement positif.".to_string(),
            ));
        }
        let pm: Option<(String, i64)> =
            sqlx::query_as("SELECT code, active FROM payment_methods WHERE code = ?")
                .bind(&p.method_code)
                .fetch_optional(&mut **tx)
                .await?;
        let (code, active) =
            pm.ok_or_else(|| CoreError::Validation("Moyen de paiement invalide.".to_string()))?;
        if active == 0 {
            return Err(CoreError::Validation(
                "Moyen de paiement inactif.".to_string(),
            ));
        }
        total = total.checked_add(p.amount).ok_or_else(|| {
            CoreError::Validation("Débordement du montant du règlement.".to_string())
        })?;
        parts.push((code, p.amount));
    }
    if total <= 0 {
        return Err(CoreError::Validation(
            "Le règlement doit être positif.".to_string(),
        ));
    }
    let balance = get_client_packaging_financial_balance(db, input.client_id)
        .await?
        .packaging_financial_balance;
    if total > balance {
        return Err(CoreError::Validation(format!(
            "Le règlement ({total}) dépasse la créance d'emballages restante ({balance})."
        )));
    }

    insert_ledger_entry(
        tx,
        input.request_key.trim(),
        input.client_id,
        None,
        "payment",
        total,
        "credit",
        actor,
        input.note.clone(),
    )
    .await?;
    sqlx::query(
        "INSERT INTO audit_logs (entity_type, entity_id, action, details, actor_name)
         VALUES ('customer_packaging_financial_ledger', ?, 'PAY_PACKAGING_DEBT', ?, ?)",
    )
    .bind(input.client_id.to_string())
    .bind(format!("Règlement créance d'emballages : {total} FCFA"))
    .bind(actor)
    .execute(&mut **tx)
    .await?;
    g.1.commit().await?;
    let bal = get_client_packaging_financial_balance(db, input.client_id).await?;
    Ok(PayPackagingDebtDto {
        client_id: input.client_id,
        packaging_financial_balance: bal.packaging_financial_balance,
    })
}

#[derive(Debug, Serialize)]
pub struct ClientPackagingDashboardDto {
    pub client_id: i64,
    /// Dette commerciale (créance de marchandises) — registre customer_receivables.
    pub commercial_debt: i64,
    /// Créance financière d'emballages exigible (après conversion uniquement).
    pub packaging_financial_debt: i64,
    /// Obligations physiques en attente : quantité de pièces à restituer.
    pub pending_pieces: i64,
    /// Valeur indicative des emballages en attente — JAMAIS exigible avant conversion.
    pub pending_reference_value: i64,
    /// Total financier réellement dû (commercial + créances d'emballages converties).
    pub total_financial_due: i64,
}

/// Tableau de bord emballages d'un client : soldes strictement séparés
/// (MAJ.md §6.2 et §11.2 — la valeur indicative n'est jamais une dette exigible).
pub async fn get_client_packaging_dashboard(
    db: &DepotDb,
    client_id: i64,
) -> CoreResult<ClientPackagingDashboardDto> {
    let commercial_debt: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(remaining_amount), 0) FROM customer_receivables
         WHERE client_id = ? AND status IN ('open', 'partial')",
    )
    .bind(client_id)
    .fetch_one(&db.pool)
    .await?;
    let packaging_financial_debt = get_client_packaging_financial_balance(db, client_id)
        .await?
        .packaging_financial_balance;
    let obligations = list_obligations(db, Some(client_id)).await?;
    let pending_pieces: i64 = obligations.iter().map(|o| o.pending_pieces).sum();
    let pending_reference_value: i64 = obligations.iter().map(|o| o.total_reference_value).sum();
    Ok(ClientPackagingDashboardDto {
        client_id,
        commercial_debt,
        packaging_financial_debt,
        pending_pieces,
        pending_reference_value,
        total_financial_due: commercial_debt + packaging_financial_debt,
    })
}
