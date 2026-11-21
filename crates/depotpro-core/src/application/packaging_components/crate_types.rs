// ============================================================================
// CRUD des types de casiers consignés
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::CoreResult;
use crate::infrastructure::db::DepotDb;

use super::{CrateTypeDto, CreateCrateTypeInput, UpdateCrateTypeInput};

pub async fn create_crate_type(
    db: &DepotDb,
    input: CreateCrateTypeInput,
) -> CoreResult<CrateTypeDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;

    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO crate_types (code, name, producer, capacity, bottle_capacity_ml, bottle_profile_id, compatibility_group_id, dimensions, weight_g, material, deposit_value, description, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id",
    )
    .bind(input.code)
    .bind(input.name)
    .bind(input.producer)
    .bind(input.capacity)
    .bind(input.bottle_capacity_ml)
    .bind(input.bottle_profile_id)
    .bind(input.compatibility_group_id)
    .bind(input.dimensions)
    .bind(input.weight_g)
    .bind(input.material)
    .bind(input.deposit_value)
    .bind(if input.is_active { 1 } else { 0 })
    .fetch_one(&db.pool)
    .await?;

    let crate_type = sqlx::query_as::<_, CrateTypeDto>(
        "SELECT id, code, name, producer, capacity, bottle_capacity_ml, bottle_profile_id, compatibility_group_id, dimensions, weight_g, material, deposit_value, description, is_active, created_at, updated_at
         FROM crate_types WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;

    Ok(crate_type)
}

pub async fn get_crate_type(db: &DepotDb, crate_type_id: i64) -> CoreResult<CrateTypeDto> {
    require_current_actor_permission(Permission::CatalogRead)?;

    let crate_type = sqlx::query_as::<_, CrateTypeDto>(
        "SELECT id, code, name, producer, capacity, bottle_capacity_ml, bottle_profile_id, compatibility_group_id, dimensions, weight_g, material, deposit_value, description, is_active, created_at, updated_at
         FROM crate_types WHERE id = ?",
    )
    .bind(crate_type_id)
    .fetch_one(&db.pool)
    .await?;

    Ok(crate_type)
}

pub async fn get_crate_types(db: &DepotDb, active_only: bool) -> CoreResult<Vec<CrateTypeDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;

    let crate_types = if active_only {
        sqlx::query_as::<_, CrateTypeDto>(
            "SELECT id, code, name, producer, capacity, bottle_capacity_ml, bottle_profile_id, compatibility_group_id, dimensions, weight_g, material, deposit_value, description, is_active, created_at, updated_at
             FROM crate_types WHERE is_active = 1",
        )
        .fetch_all(&db.pool)
        .await?
    } else {
        sqlx::query_as::<_, CrateTypeDto>(
            "SELECT id, code, name, producer, capacity, bottle_capacity_ml, bottle_profile_id, compatibility_group_id, dimensions, weight_g, material, deposit_value, description, is_active, created_at, updated_at
             FROM crate_types",
        )
        .fetch_all(&db.pool)
        .await?
    };

    Ok(crate_types)
}

pub async fn update_crate_type(
    db: &DepotDb,
    crate_type_id: i64,
    input: UpdateCrateTypeInput,
) -> CoreResult<CrateTypeDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;

    let mut sql = "UPDATE crate_types SET updated_at = datetime('now')".to_string();
    let mut params: Vec<(&str, String)> = Vec::new();

    if let Some(name) = input.name {
        sql.push_str(", name = ?");
        params.push(("name", name));
    }
    if let Some(capacity) = input.capacity {
        sql.push_str(", capacity = ?");
        params.push(("capacity", capacity.to_string()));
    }
    if let Some(bottle_capacity_ml) = input.bottle_capacity_ml {
        sql.push_str(", bottle_capacity_ml = ?");
        params.push(("bottle_capacity_ml", bottle_capacity_ml.to_string()));
    }
    if let Some(compatibility_group_id) = input.compatibility_group_id {
        sql.push_str(", compatibility_group_id = ?");
        params.push(("compatibility_group_id", compatibility_group_id.to_string()));
    }
    if let Some(dimensions) = input.dimensions {
        sql.push_str(", dimensions = ?");
        params.push(("dimensions", dimensions));
    }
    if let Some(weight_g) = input.weight_g {
        sql.push_str(", weight_g = ?");
        params.push(("weight_g", weight_g.to_string()));
    }
    if let Some(material) = input.material {
        sql.push_str(", material = ?");
        params.push(("material", material));
    }
    if let Some(deposit_value) = input.deposit_value {
        sql.push_str(", deposit_value = ?");
        params.push(("deposit_value", deposit_value.to_string()));
    }
    if let Some(description) = input.description {
        sql.push_str(", description = ?");
        params.push(("description", description));
    }
    if let Some(is_active) = input.is_active {
        sql.push_str(", is_active = ?");
        params.push((
            "is_active",
            if is_active {
                "1".to_string()
            } else {
                "0".to_string()
            },
        ));
    }

    sql.push_str(" WHERE id = ?");
    params.push(("crate_type_id", crate_type_id.to_string()));

    let mut update = sqlx::query(&sql);
    for (_, value) in &params {
        update = update.bind(value.as_str());
    }
    update.bind(crate_type_id).execute(&db.pool).await?;

    let crate_type = sqlx::query_as::<_, CrateTypeDto>(
        "SELECT id, code, name, producer, capacity, bottle_capacity_ml, bottle_profile_id, compatibility_group_id, dimensions, weight_g, material, deposit_value, description, is_active, created_at, updated_at
         FROM crate_types WHERE id = ?",
    )
    .bind(crate_type_id)
    .fetch_one(&db.pool)
    .await?;

    Ok(crate_type)
}

pub async fn delete_crate_type(db: &DepotDb, crate_type_id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;

    sqlx::query("DELETE FROM crate_types WHERE id = ?")
        .bind(crate_type_id)
        .execute(&db.pool)
        .await?;

    Ok(())
}
