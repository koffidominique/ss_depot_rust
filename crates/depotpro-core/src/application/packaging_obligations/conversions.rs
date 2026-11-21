// ============================================================================
// Consultation des obligations d'emballages & conversion sur échéance
// ============================================================================

use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::{DepotDb, MIN_SUPPORTED_SCHEMA_VERSION};

use super::{insert_ledger_entry, mark_converted, ConvertSummary, PackagingObligationDto};

type PolicyRow = (i64, Option<i64>, Option<i64>, i64, i64, i64);
type DueRow = (i64, Option<i64>, i64, i64, i64, i64, i64);

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

/// Résout la politique applicable : client > emballage > défaut global.
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
