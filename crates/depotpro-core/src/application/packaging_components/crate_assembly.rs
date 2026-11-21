// ============================================================================
// Assemblage et désassemblage de casiers à partir de composants
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{
    AssembleCratesInput, CrateAssemblyRecordDto, CrateComponentDto, CrateDisassemblyRecordDto,
    DisassembleCratesInput,
};

pub async fn assemble_crates(
    db: &DepotDb,
    input: AssembleCratesInput,
) -> CoreResult<CrateAssemblyRecordDto> {
    require_current_actor_permission(Permission::ConsignmentsWrite)?;

    let mut tx = db.pool.begin().await?;

    let crate_components = sqlx::query_as::<_, CrateComponentDto>(
        "SELECT id, crate_type_id, component_type, component_profile_id,
                quantity_per_crate, deposit_value, is_required, description
         FROM crate_components WHERE crate_type_id = ?",
    )
    .bind(input.crate_type_id)
    .fetch_all(&mut *tx)
    .await?;

    if crate_components.is_empty() {
        return Err(CoreError::Validation(format!(
            "Aucun composant défini pour le type de casier ID {}",
            input.crate_type_id
        )));
    }

    let mut support_quantity_used = 0i64;
    let mut bottle_quantity_used = 0i64;

    for component in &crate_components {
        let required_quantity = component.quantity_per_crate * input.quantity;

        let current_stock = sqlx::query_scalar::<_, i64>(
            "SELECT stock_quantity FROM packaging_component_stock
             WHERE component_type = ? AND component_profile_id IS NOT DISTINCT FROM ? AND crate_type_id IS NOT DISTINCT FROM ?",
        )
        .bind(&component.component_type)
        .bind(component.component_profile_id)
        .bind(component.crate_type_id)
        .fetch_optional(&mut *tx)
        .await?
        .unwrap_or(0);

        if current_stock < required_quantity {
            return Err(CoreError::Validation(format!(
                "Stock insuffisant pour le composant {} du casier : stock actuel = {}, quantité requise = {}",
                component.component_type, current_stock, required_quantity
            )));
        }

        sqlx::query(
            "UPDATE packaging_component_stock
             SET stock_quantity = stock_quantity - ?, updated_at = datetime('now')
             WHERE component_type = ? AND component_profile_id IS NOT DISTINCT FROM ? AND crate_type_id IS NOT DISTINCT FROM ?",
        )
        .bind(required_quantity)
        .bind(&component.component_type)
        .bind(component.component_profile_id)
        .bind(component.crate_type_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "INSERT INTO packaging_component_movements (component_type, component_profile_id, crate_type_id,
                                                        movement_type, quantity, stock_before, stock_after, reason)
             VALUES (?, ?, ?, 'assembly', ?, ?, stock_quantity + ?, 'Assemblage de casiers')",
        )
        .bind(&component.component_type)
        .bind(component.component_profile_id)
        .bind(component.crate_type_id)
        .bind(-required_quantity)
        .bind(current_stock)
        .bind(-required_quantity)
        .execute(&mut *tx)
        .await?;

        if component.component_type == "crate_support" {
            support_quantity_used += required_quantity;
        } else if component.component_type == "bottle" {
            bottle_quantity_used += required_quantity;
        }
    }

    sqlx::query(
        "INSERT INTO packaging_component_stock (component_type, crate_type_id, stock_quantity, deposit_value)
         VALUES ('crate_assembled', ?, ?, 0)
         ON CONFLICT(component_type, component_profile_id, crate_type_id) DO UPDATE SET stock_quantity = stock_quantity + ?, updated_at = datetime('now')",
    )
    .bind(input.crate_type_id)
    .bind(input.quantity)
    .bind(input.quantity)
    .execute(&mut *tx)
    .await?;

    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO crate_assembly_records (crate_type_id, assembled_quantity, support_quantity_used, bottle_quantity_used, reason)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id",
    )
    .bind(input.crate_type_id)
    .bind(input.quantity)
    .bind(support_quantity_used)
    .bind(bottle_quantity_used)
    .bind(input.reason)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    let record = sqlx::query_as::<_, CrateAssemblyRecordDto>(
        "SELECT car.id, car.crate_type_id, ct.name AS crate_name, car.assembled_quantity,
                car.support_quantity_used, car.bottle_quantity_used, car.reason, car.created_at
         FROM crate_assembly_records car
         JOIN crate_types ct ON ct.id = car.crate_type_id
         WHERE car.id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;

    Ok(record)
}

pub async fn disassemble_crates(
    db: &DepotDb,
    input: DisassembleCratesInput,
) -> CoreResult<CrateDisassemblyRecordDto> {
    require_current_actor_permission(Permission::ConsignmentsWrite)?;

    let mut tx = db.pool.begin().await?;

    let crate_components = sqlx::query_as::<_, CrateComponentDto>(
        "SELECT id, crate_type_id, component_type, component_profile_id,
                quantity_per_crate, deposit_value, is_required, description
         FROM crate_components WHERE crate_type_id = ?",
    )
    .bind(input.crate_type_id)
    .fetch_all(&mut *tx)
    .await?;

    if crate_components.is_empty() {
        return Err(CoreError::Validation(format!(
            "Aucun composant défini pour le type de casier ID {}",
            input.crate_type_id
        )));
    }

    let current_crate_stock = sqlx::query_scalar::<_, i64>(
        "SELECT stock_quantity FROM packaging_component_stock
         WHERE component_type = 'crate_assembled' AND crate_type_id = ?",
    )
    .bind(input.crate_type_id)
    .fetch_optional(&mut *tx)
    .await?
    .unwrap_or(0);

    if current_crate_stock < input.quantity {
        return Err(CoreError::Validation(format!(
            "Stock insuffisant pour les casiers assemblés : stock actuel = {}, quantité demandée = {}",
            current_crate_stock, input.quantity
        )));
    }

    let mut support_quantity_recovered = 0i64;
    let mut bottle_quantity_recovered = 0i64;

    sqlx::query(
        "UPDATE packaging_component_stock
         SET stock_quantity = stock_quantity - ?, updated_at = datetime('now')
         WHERE component_type = 'crate_assembled' AND crate_type_id = ?",
    )
    .bind(input.quantity)
    .bind(input.crate_type_id)
    .execute(&mut *tx)
    .await?;

    for component in &crate_components {
        let recovered_quantity = component.quantity_per_crate * input.quantity;

        sqlx::query(
            "INSERT INTO packaging_component_stock (component_type, component_profile_id, crate_type_id, stock_quantity, deposit_value)
             VALUES (?, ?, ?, ?, 0)
             ON CONFLICT(component_type, component_profile_id, crate_type_id) DO UPDATE SET stock_quantity = stock_quantity + ?, updated_at = datetime('now')",
        )
        .bind(&component.component_type)
        .bind(component.component_profile_id)
        .bind(component.crate_type_id)
        .bind(recovered_quantity)
        .bind(recovered_quantity)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "INSERT INTO packaging_component_movements (component_type, component_profile_id, crate_type_id,
                                                        movement_type, quantity, stock_before, stock_after, reason)
             VALUES (?, ?, ?, 'disassembly', ?, ?, stock_quantity - ?, 'Désassemblage de casiers')",
        )
        .bind(&component.component_type)
        .bind(component.component_profile_id)
        .bind(component.crate_type_id)
        .bind(recovered_quantity)
        .bind(sqlx::query_scalar::<_, i64>(
            "SELECT stock_quantity FROM packaging_component_stock
             WHERE component_type = ? AND component_profile_id IS NOT DISTINCT FROM ? AND crate_type_id IS NOT DISTINCT FROM ?",
        )
        .bind(&component.component_type)
        .bind(component.component_profile_id)
        .bind(component.crate_type_id)
        .fetch_one(&mut *tx)
        .await?)
        .bind(recovered_quantity)
        .execute(&mut *tx)
        .await?;

        if component.component_type == "crate_support" {
            support_quantity_recovered += recovered_quantity;
        } else if component.component_type == "bottle" {
            bottle_quantity_recovered += recovered_quantity;
        }
    }

    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO crate_disassembly_records (crate_type_id, disassembled_quantity, support_quantity_recovered, bottle_quantity_recovered, reason)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id",
    )
    .bind(input.crate_type_id)
    .bind(input.quantity)
    .bind(support_quantity_recovered)
    .bind(bottle_quantity_recovered)
    .bind(input.reason)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    let record = sqlx::query_as::<_, CrateDisassemblyRecordDto>(
        "SELECT cdr.id, cdr.crate_type_id, ct.name AS crate_name, cdr.disassembled_quantity,
                cdr.support_quantity_recovered, cdr.bottle_quantity_recovered, cdr.reason, cdr.created_at
         FROM crate_disassembly_records cdr
         JOIN crate_types ct ON ct.id = cdr.crate_type_id
         WHERE cdr.id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;

    Ok(record)
}
