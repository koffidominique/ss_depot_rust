// ============================================================================
// Vue d'ensemble des consignes, soldes clients, mouvements et retours
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::CoreResult;
use crate::infrastructure::db::DepotDb;

use super::{
    ClientPackagingBalanceDto, ConsignmentsOverviewDto, DepositReturnDto, OpenDepositIssueDto,
    ReturnableMovementDto, ReturnableTypeDto,
};

pub async fn get_overview(db: &DepotDb) -> CoreResult<ConsignmentsOverviewDto> {
    require_current_actor_permission(Permission::ConsignmentsRead)?;
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
                di.pieces, di.returned_pieces, di.unit_value, di.amount,
                CASE
                    WHEN rpt.kind = 'bottle' THEN (
                        SELECT sl.product_name || ' (' ||
                            CASE WHEN sl.base_quantity_milli % 1000 = 0
                                 THEN CAST(sl.base_quantity_milli / 1000 AS TEXT)
                                 ELSE rtrim(rtrim(printf('%.3f', sl.base_quantity_milli / 1000.0), '0'), '.')
                            END || ' ' || sl.base_unit || ')'
                        FROM sale_lines sl
                        WHERE sl.id = di.sale_line_id
                    )
                    ELSE (
                        SELECT GROUP_CONCAT(
                            sl.product_name || ' (' ||
                            CASE WHEN sl.base_quantity_milli % 1000 = 0
                                 THEN CAST(sl.base_quantity_milli / 1000 AS TEXT)
                                 ELSE rtrim(rtrim(printf('%.3f', sl.base_quantity_milli / 1000.0), '0'), '.')
                            END || ' ' || sl.base_unit || ')',
                            ' + '
                        )
                        FROM sale_lines sl
                        JOIN deposit_packaging_components dpc ON dpc.packaging_id = sl.packaging_id
                        WHERE sl.sale_id = di.sale_id AND dpc.returnable_id = di.returnable_id
                    )
                END AS expected_products
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
