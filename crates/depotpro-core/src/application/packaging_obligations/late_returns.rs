// ============================================================================
// Retours tardifs sur obligations converties et régularisation comptable
// ============================================================================

use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::insert_ledger_entry;

/// Enregistre un retour tardif sur une obligation déjà convertie (ou non) :
/// incrémente `returned_pieces`, incrémente le stock d'emballages vides, et
/// régularise la créance par une écriture de crédit (`late_return_credit`),
/// sans jamais modifier les écritures historiques.
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
    let late_regulated = (capped - pending_physical.max(0)).max(0).min(converted);
    let _physical_back = capped - late_regulated;

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
