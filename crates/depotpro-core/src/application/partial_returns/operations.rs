// ============================================================================
// Opérations SQLite : retours partiels d'emballages & suivi des reliquats
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{
    CreatePartialReturnInput, PartialReturnItemDto, PartialReturnOverviewDto,
    PendingPartialReturnDto, UpdatePendingReturnInput,
};

pub async fn get_partial_returns_overview(db: &DepotDb) -> CoreResult<PartialReturnOverviewDto> {
    require_current_actor_permission(Permission::ConsignmentsRead)?;

    let pending_returns = sqlx::query_as::<_, PendingPartialReturnDto>(
        "SELECT ppr.id, ppr.client_id, c.name AS client_name, ppr.sale_id, s.reference AS sale_reference,
                ppr.total_expected_pieces, ppr.total_returned_pieces, ppr.remaining_pieces, ppr.status,
                ppr.created_at, ppr.last_updated_at
         FROM pending_partial_returns ppr
         JOIN clients c ON c.id = ppr.client_id
         JOIN sales s ON s.id = ppr.sale_id
         WHERE ppr.status IN ('pending', 'in_progress')
         ORDER BY ppr.created_at DESC",
    )
    .fetch_all(&db.pool)
    .await?;

    let recent_partial_returns = sqlx::query_as::<_, PartialReturnItemDto>(
        "SELECT pri.id, pri.return_id, pri.component_type, pri.component_profile_id, pri.crate_type_id,
                pri.quantity, pri.condition_state, pri.unit_refund_value, pri.total_refund_amount, pri.is_accepted
         FROM partial_return_items pri
         ORDER BY pri.id DESC LIMIT 50",
    )
    .fetch_all(&db.pool)
    .await?;

    Ok(PartialReturnOverviewDto {
        pending_returns,
        recent_partial_returns,
    })
}

pub async fn create_partial_return(
    db: &DepotDb,
    input: CreatePartialReturnInput,
) -> CoreResult<Vec<PartialReturnItemDto>> {
    require_current_actor_permission(Permission::ConsignmentsWrite)?;

    let mut tx = db.pool.begin().await?;

    let sale: Option<(i64, String)> =
        sqlx::query_as("SELECT s.id, s.status FROM sales s WHERE s.id = ?")
            .bind(input.sale_id)
            .fetch_optional(&mut *tx)
            .await?;

    let (_sale_id, sale_status) = sale
        .ok_or_else(|| CoreError::Validation(format!("Vente ID {} introuvable", input.sale_id)))?;
    if sale_status == "cancelled" {
        return Err(CoreError::Validation(format!(
            "Vente ID {} annulée : retour partiel impossible",
            input.sale_id
        )));
    }

    let mut total_refund_amount = 0i64;
    let mut return_items = Vec::new();

    for item in &input.items {
        let deposit_value = sqlx::query_scalar::<_, i64>(
            "SELECT deposit_value FROM packaging_component_stock
             WHERE component_type = ? AND component_profile_id IS NOT DISTINCT FROM ? AND crate_type_id IS NOT DISTINCT FROM ?",
        )
        .bind(&item.component_type)
        .bind(item.component_profile_id)
        .bind(item.crate_type_id)
        .fetch_optional(&mut *tx)
        .await?
        .unwrap_or(0);

        let refund_multiplier = match item.condition_state.as_str() {
            "good" => 100,
            "damaged" => 50,
            "lost" => 0,
            _ => 100,
        };

        let unit_refund_value = (deposit_value * refund_multiplier) / 100;
        let total_item_refund = unit_refund_value * item.quantity;
        total_refund_amount += total_item_refund;

        sqlx::query(
            "UPDATE packaging_component_stock
             SET stock_quantity = stock_quantity + ?, updated_at = datetime('now')
             WHERE component_type = ? AND component_profile_id IS NOT DISTINCT FROM ? AND crate_type_id IS NOT DISTINCT FROM ?",
        )
        .bind(item.quantity)
        .bind(&item.component_type)
        .bind(item.component_profile_id)
        .bind(item.crate_type_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "INSERT INTO packaging_component_movements (component_type, component_profile_id, crate_type_id,
                                                        movement_type, quantity, stock_before, stock_after, reason)
             VALUES (?, ?, ?, 'return', ?, stock_quantity - ?, stock_quantity, ?)",
        )
        .bind(&item.component_type)
        .bind(item.component_profile_id)
        .bind(item.crate_type_id)
        .bind(item.quantity)
        .bind(item.quantity)
        .bind(&input.reason)
        .execute(&mut *tx)
        .await?;

        let return_id = sqlx::query_scalar::<_, i64>(
            "INSERT INTO deposit_returns (client_id, returnable_id, pieces, condition_state, refund_amount, credit_reduction, method_code, reason)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?)
             RETURNING id",
        )
        .bind(input.client_id)
        .bind(0i64)
        .bind(item.quantity)
        .bind(&item.condition_state)
        .bind(total_item_refund)
        .bind(&input.payment_method_code)
        .bind(&input.reason)
        .fetch_one(&mut *tx)
        .await?;

        let item_id = sqlx::query_scalar::<_, i64>(
            "INSERT INTO partial_return_items (return_id, component_type, component_profile_id, crate_type_id,
                                                quantity, condition_state, unit_refund_value, total_refund_amount, is_accepted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
             RETURNING id",
        )
        .bind(return_id)
        .bind(&item.component_type)
        .bind(item.component_profile_id)
        .bind(item.crate_type_id)
        .bind(item.quantity)
        .bind(&item.condition_state)
        .bind(unit_refund_value)
        .bind(total_item_refund)
        .fetch_one(&mut *tx)
        .await?;

        return_items.push(PartialReturnItemDto {
            id: item_id,
            return_id,
            component_type: item.component_type.clone(),
            component_profile_id: item.component_profile_id,
            crate_type_id: item.crate_type_id,
            quantity: item.quantity,
            condition_state: item.condition_state.clone(),
            unit_refund_value,
            total_refund_amount: total_item_refund,
            is_accepted: true,
        });
    }

    sqlx::query(
        "UPDATE customer_packaging_component_balances
         SET balance_pieces = balance_pieces - ?, deposit_held_amount = deposit_held_amount - ?, last_transaction_at = datetime('now')
         WHERE client_id = ? AND component_type = ? AND component_profile_id IS NOT DISTINCT FROM ? AND crate_type_id IS NOT DISTINCT FROM ?",
    )
    .bind(input.items.iter().map(|i| i.quantity).sum::<i64>())
    .bind(total_refund_amount)
    .bind(input.client_id)
    .bind("")
    .bind(None::<i64>)
    .bind(None::<i64>)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(return_items)
}

pub async fn create_pending_partial_return(
    db: &DepotDb,
    client_id: i64,
    sale_id: i64,
    total_expected_pieces: i64,
) -> CoreResult<PendingPartialReturnDto> {
    require_current_actor_permission(Permission::ConsignmentsWrite)?;

    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO pending_partial_returns (client_id, sale_id, total_expected_pieces, remaining_pieces, status)
         VALUES (?, ?, ?, ?, 'pending')
         RETURNING id",
    )
    .bind(client_id)
    .bind(sale_id)
    .bind(total_expected_pieces)
    .bind(total_expected_pieces)
    .fetch_one(&db.pool)
    .await?;

    let pending_return = sqlx::query_as::<_, PendingPartialReturnDto>(
        "SELECT ppr.id, ppr.client_id, c.name AS client_name, ppr.sale_id, s.reference AS sale_reference,
                ppr.total_expected_pieces, ppr.total_returned_pieces, ppr.remaining_pieces, ppr.status,
                ppr.created_at, ppr.last_updated_at
         FROM pending_partial_returns ppr
         JOIN clients c ON c.id = ppr.client_id
         JOIN sales s ON s.id = ppr.sale_id
         WHERE ppr.id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;

    Ok(pending_return)
}

pub async fn update_pending_return(
    db: &DepotDb,
    input: UpdatePendingReturnInput,
) -> CoreResult<PendingPartialReturnDto> {
    require_current_actor_permission(Permission::ConsignmentsWrite)?;

    let mut tx = db.pool.begin().await?;

    let pending_return = sqlx::query_as::<_, PendingPartialReturnDto>(
        "SELECT ppr.id, ppr.client_id, ppr.sale_id, ppr.total_expected_pieces, ppr.total_returned_pieces, ppr.remaining_pieces
         FROM pending_partial_returns ppr
         WHERE ppr.id = ?",
    )
    .bind(input.pending_return_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| {
        CoreError::Validation(format!(
            "Retour en attente ID {} introuvable",
            input.pending_return_id
        ))
    })?;

    let new_returned_pieces =
        pending_return.total_returned_pieces + input.items.iter().map(|i| i.quantity).sum::<i64>();
    let new_remaining =
        pending_return.remaining_pieces - input.items.iter().map(|i| i.quantity).sum::<i64>();

    if new_remaining < 0 {
        return Err(CoreError::Validation(format!(
            "Trop de pièces retournées : restant = {}, retour = {}",
            pending_return.remaining_pieces,
            input.items.iter().map(|i| i.quantity).sum::<i64>()
        )));
    }

    sqlx::query(
        "UPDATE pending_partial_returns
         SET total_returned_pieces = ?, remaining_pieces = ?, status = ?, last_updated_at = datetime('now')
         WHERE id = ?",
    )
    .bind(new_returned_pieces)
    .bind(new_remaining)
    .bind(&input.status)
    .bind(input.pending_return_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let updated_return = sqlx::query_as::<_, PendingPartialReturnDto>(
        "SELECT ppr.id, ppr.client_id, c.name AS client_name, ppr.sale_id, s.reference AS sale_reference,
                ppr.total_expected_pieces, ppr.total_returned_pieces, ppr.remaining_pieces, ppr.status,
                ppr.created_at, ppr.last_updated_at
         FROM pending_partial_returns ppr
         JOIN clients c ON c.id = ppr.client_id
         JOIN sales s ON s.id = ppr.sale_id
         WHERE ppr.id = ?",
    )
    .bind(input.pending_return_id)
    .fetch_one(&db.pool)
    .await?;

    Ok(updated_return)
}
