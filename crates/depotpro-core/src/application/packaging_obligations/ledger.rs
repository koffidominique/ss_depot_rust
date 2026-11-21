// ============================================================================
// Écritures du grand livre financier d'emballages et marquage de conversion
// ============================================================================

use crate::error::CoreResult;
use crate::infrastructure::db::DepotDb;

use super::PackagingFinancialBalanceDto;

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

pub(crate) async fn mark_converted(
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
pub(crate) async fn insert_ledger_entry(
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
