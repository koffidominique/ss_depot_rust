// ============================================================================
// Vue d'ensemble et mouvements de stock des composants d'emballage
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{
    CrateAssemblyRecordDto, CrateComponentDto, CrateDisassemblyRecordDto,
    CreateCrateComponentInput, CustomerPackagingComponentBalanceDto, PackagingComponentMovementDto,
    PackagingComponentStockDto, PackagingComponentsOverviewDto, UpdateComponentStockInput,
};

pub async fn get_components_overview(db: &DepotDb) -> CoreResult<PackagingComponentsOverviewDto> {
    require_current_actor_permission(Permission::ConsignmentsRead)?;

    let component_stock = sqlx::query_as::<_, PackagingComponentStockDto>(
        "SELECT pcs.id, pcs.component_type, pcs.component_profile_id, pcs.crate_type_id,
                pcs.stock_quantity, pcs.reserved_quantity, pcs.deposit_value, pcs.last_counted_at
         FROM packaging_component_stock pcs
         ORDER BY pcs.component_type, pcs.crate_type_id, pcs.component_profile_id",
    )
    .fetch_all(&db.pool)
    .await?;

    let customer_balances = sqlx::query_as::<_, CustomerPackagingComponentBalanceDto>(
        "SELECT cpcb.rowid AS id, cpcb.client_id, c.name AS client_name,
                cpcb.component_type, cpcb.component_profile_id, cpcb.crate_type_id,
                cpcb.balance_pieces, cpcb.deposit_held_amount, cpcb.last_transaction_at
         FROM customer_packaging_component_balances cpcb
         JOIN clients c ON c.id = cpcb.client_id
         WHERE cpcb.balance_pieces != 0 OR cpcb.deposit_held_amount != 0
         ORDER BY c.name, cpcb.component_type",
    )
    .fetch_all(&db.pool)
    .await?;

    let recent_movements = sqlx::query_as::<_, PackagingComponentMovementDto>(
        "SELECT pcm.id, pcm.component_type, pcm.component_profile_id, pcm.crate_type_id,
                pcm.movement_type, pcm.quantity, pcm.stock_before, pcm.stock_after,
                pcm.reason, pcm.reference_document, pcm.created_at
         FROM packaging_component_movements pcm
         ORDER BY pcm.id DESC LIMIT 50",
    )
    .fetch_all(&db.pool)
    .await?;

    let crate_components = sqlx::query_as::<_, CrateComponentDto>(
        "SELECT cc.id, cc.crate_type_id, cc.component_type, cc.component_profile_id,
                cc.quantity_per_crate, cc.deposit_value, cc.is_required, cc.description
         FROM crate_components cc
         ORDER BY cc.crate_type_id, cc.component_type",
    )
    .fetch_all(&db.pool)
    .await?;

    let assembly_records = sqlx::query_as::<_, CrateAssemblyRecordDto>(
        "SELECT car.id, car.crate_type_id, ct.name AS crate_name, car.assembled_quantity,
                car.support_quantity_used, car.bottle_quantity_used, car.reason, car.created_at
         FROM crate_assembly_records car
         JOIN crate_types ct ON ct.id = car.crate_type_id
         ORDER BY car.id DESC LIMIT 50",
    )
    .fetch_all(&db.pool)
    .await?;

    let disassembly_records = sqlx::query_as::<_, CrateDisassemblyRecordDto>(
        "SELECT cdr.id, cdr.crate_type_id, ct.name AS crate_name, cdr.disassembled_quantity,
                cdr.support_quantity_recovered, cdr.bottle_quantity_recovered, cdr.reason, cdr.created_at
         FROM crate_disassembly_records cdr
         JOIN crate_types ct ON ct.id = cdr.crate_type_id
         ORDER BY cdr.id DESC LIMIT 50",
    )
    .fetch_all(&db.pool)
    .await?;

    Ok(PackagingComponentsOverviewDto {
        component_stock,
        customer_balances,
        recent_movements,
        crate_components,
        assembly_records,
        disassembly_records,
    })
}

pub async fn create_crate_component(
    db: &DepotDb,
    input: CreateCrateComponentInput,
) -> CoreResult<CrateComponentDto> {
    require_current_actor_permission(Permission::ConsignmentsWrite)?;

    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO crate_components (crate_type_id, component_type, component_profile_id,
                                        quantity_per_crate, deposit_value, is_required, description)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING id",
    )
    .bind(input.crate_type_id)
    .bind(input.component_type)
    .bind(input.component_profile_id)
    .bind(input.quantity_per_crate)
    .bind(input.deposit_value)
    .bind(input.is_required)
    .bind(input.description)
    .fetch_one(&db.pool)
    .await?;

    let component = sqlx::query_as::<_, CrateComponentDto>(
        "SELECT id, crate_type_id, component_type, component_profile_id, quantity_per_crate,
                deposit_value, is_required, description
         FROM crate_components WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;

    Ok(component)
}

pub async fn update_component_stock(
    db: &DepotDb,
    input: UpdateComponentStockInput,
) -> CoreResult<PackagingComponentStockDto> {
    require_current_actor_permission(Permission::ConsignmentsWrite)?;

    let mut tx = db.pool.begin().await?;

    let current_stock = sqlx::query_scalar::<_, i64>(
        "SELECT stock_quantity FROM packaging_component_stock
         WHERE component_type = ? AND component_profile_id IS NOT DISTINCT FROM ? AND crate_type_id IS NOT DISTINCT FROM ?",
    )
    .bind(&input.component_type)
    .bind(input.component_profile_id)
    .bind(input.crate_type_id)
    .fetch_optional(&mut *tx)
    .await?
    .unwrap_or(0);

    let new_stock = current_stock + input.quantity;

    if new_stock < 0 {
        return Err(CoreError::Validation(format!(
            "Stock insuffisant pour le composant {} : stock actuel = {}, quantité demandée = {}",
            input.component_type, current_stock, input.quantity
        )));
    }

    let stock_before = current_stock;
    let stock_after = new_stock;

    sqlx::query(
        "INSERT INTO packaging_component_stock (component_type, component_profile_id, crate_type_id, stock_quantity, deposit_value)
         VALUES (?, ?, ?, ?, 0)
         ON CONFLICT(component_type, component_profile_id, crate_type_id) DO UPDATE SET stock_quantity = excluded.stock_quantity, updated_at = datetime('now')",
    )
    .bind(&input.component_type)
    .bind(input.component_profile_id)
    .bind(input.crate_type_id)
    .bind(new_stock)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO packaging_component_movements (component_type, component_profile_id, crate_type_id,
                                                    movement_type, quantity, stock_before, stock_after, reason, reference_document)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&input.component_type)
    .bind(input.component_profile_id)
    .bind(input.crate_type_id)
    .bind(&input.movement_type)
    .bind(input.quantity)
    .bind(stock_before)
    .bind(stock_after)
    .bind(&input.reason)
    .bind(input.reference_document)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let stock = sqlx::query_as::<_, PackagingComponentStockDto>(
        "SELECT id, component_type, component_profile_id, crate_type_id, stock_quantity, reserved_quantity, deposit_value, last_counted_at
         FROM packaging_component_stock
         WHERE component_type = ? AND component_profile_id IS NOT DISTINCT FROM ? AND crate_type_id IS NOT DISTINCT FROM ?",
    )
    .bind(&input.component_type)
    .bind(input.component_profile_id)
    .bind(input.crate_type_id)
    .fetch_one(&db.pool)
    .await?;

    Ok(stock)
}
