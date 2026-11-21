// ============================================================================
// Synchronisation transactionnelle de stock_balances avec products.stock_milli
// ============================================================================

use sqlx::{Sqlite, Transaction};

use crate::error::CoreResult;

pub(crate) async fn sync_stock_balance_tx(
    tx: &mut Transaction<'_, Sqlite>,
    product_id: i64,
    next_stock_milli: i64,
) -> CoreResult<()> {
    let prod_loc: Option<(Option<i64>, Option<i64>)> =
        sqlx::query_as("SELECT default_location_id, variant_id FROM products WHERE id = ?")
            .bind(product_id)
            .fetch_optional(&mut **tx)
            .await?;
    let (default_loc_id, variant_id) = match prod_loc {
        Some(pair) => pair,
        None => return Ok(()),
    };
    let loc_id = match default_loc_id {
        Some(lid) => Some(lid),
        None => {
            sqlx::query_scalar::<_, i64>(
                "SELECT id FROM stock_locations WHERE is_default = 1 LIMIT 1",
            )
            .fetch_optional(&mut **tx)
            .await?
        }
    };
    let Some(lid) = loc_id else {
        return Ok(());
    };
    let clamped = next_stock_milli.max(0);
    let existing: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM stock_balances
         WHERE product_id = ? AND location_id = ? AND (variant_id = ? OR (variant_id IS NULL AND ? IS NULL))",
    )
    .bind(product_id)
    .bind(lid)
    .bind(variant_id)
    .bind(variant_id)
    .fetch_optional(&mut **tx)
    .await?;
    if let Some(bid) = existing {
        sqlx::query(
            "UPDATE stock_balances SET quantity_milli = ?, updated_at = datetime('now') WHERE id = ?",
        )
        .bind(clamped)
        .bind(bid)
        .execute(&mut **tx)
        .await?;
    } else {
        sqlx::query(
            "INSERT INTO stock_balances (product_id, variant_id, location_id, quantity_milli) VALUES (?, ?, ?, ?)",
        )
        .bind(product_id)
        .bind(variant_id)
        .bind(lid)
        .bind(clamped)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}
