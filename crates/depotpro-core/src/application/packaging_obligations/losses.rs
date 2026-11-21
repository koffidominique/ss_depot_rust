// ============================================================================
// Déclarations de perte et validation en créance financière
// ============================================================================

use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{insert_ledger_entry, mark_converted, DeclareLossInput};

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
