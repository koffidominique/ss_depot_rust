// ============================================================================
// CRUD des profils de bouteilles consignées
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::CoreResult;
use crate::infrastructure::db::DepotDb;

use super::{BottleProfileDto, CreateBottleProfileInput, UpdateBottleProfileInput};

pub async fn create_bottle_profile(
    db: &DepotDb,
    input: CreateBottleProfileInput,
) -> CoreResult<BottleProfileDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;

    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO bottle_profiles (code, name, producer, material, capacity_ml, diameter_mm, height_mm, weight_g, base_type, neck_type, compatibility_group_id, deposit_value, description, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id",
    )
    .bind(input.code)
    .bind(input.name)
    .bind(input.producer)
    .bind(input.material)
    .bind(input.capacity_ml)
    .bind(input.diameter_mm)
    .bind(input.height_mm)
    .bind(input.weight_g)
    .bind(input.base_type)
    .bind(input.neck_type)
    .bind(input.compatibility_group_id)
    .bind(input.deposit_value)
    .bind(input.description)
    .bind(if input.is_active { 1 } else { 0 })
    .fetch_one(&db.pool)
    .await?;

    let profile = sqlx::query_as::<_, BottleProfileDto>(
        "SELECT id, code, name, producer, material, capacity_ml, diameter_mm, height_mm, weight_g, base_type, neck_type, compatibility_group_id, deposit_value, description, is_active, created_at, updated_at
         FROM bottle_profiles WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;

    Ok(profile)
}

pub async fn get_bottle_profile(db: &DepotDb, profile_id: i64) -> CoreResult<BottleProfileDto> {
    require_current_actor_permission(Permission::CatalogRead)?;

    let profile = sqlx::query_as::<_, BottleProfileDto>(
        "SELECT id, code, name, producer, material, capacity_ml, diameter_mm, height_mm, weight_g, base_type, neck_type, compatibility_group_id, deposit_value, description, is_active, created_at, updated_at
         FROM bottle_profiles WHERE id = ?",
    )
    .bind(profile_id)
    .fetch_one(&db.pool)
    .await?;

    Ok(profile)
}

pub async fn get_bottle_profiles_by_material(
    db: &DepotDb,
    material: String,
) -> CoreResult<Vec<BottleProfileDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;

    let profiles = sqlx::query_as::<_, BottleProfileDto>(
        "SELECT id, code, name, producer, material, capacity_ml, diameter_mm, height_mm, weight_g, base_type, neck_type, compatibility_group_id, deposit_value, description, is_active, created_at, updated_at
         FROM bottle_profiles WHERE material = ?",
    )
    .bind(material)
    .fetch_all(&db.pool)
    .await?;

    Ok(profiles)
}

pub async fn update_bottle_profile(
    db: &DepotDb,
    profile_id: i64,
    input: UpdateBottleProfileInput,
) -> CoreResult<BottleProfileDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;

    let mut sql = "UPDATE bottle_profiles SET updated_at = datetime('now')".to_string();
    let mut params: Vec<(&str, String)> = Vec::new();

    if let Some(name) = input.name {
        sql.push_str(", name = ?");
        params.push(("name", name));
    }
    if let Some(material) = input.material {
        sql.push_str(", material = ?");
        params.push(("material", material));
    }
    if let Some(capacity_ml) = input.capacity_ml {
        sql.push_str(", capacity_ml = ?");
        params.push(("capacity_ml", capacity_ml.to_string()));
    }
    if let Some(diameter_mm) = input.diameter_mm {
        sql.push_str(", diameter_mm = ?");
        params.push(("diameter_mm", diameter_mm.to_string()));
    }
    if let Some(height_mm) = input.height_mm {
        sql.push_str(", height_mm = ?");
        params.push(("height_mm", height_mm.to_string()));
    }
    if let Some(weight_g) = input.weight_g {
        sql.push_str(", weight_g = ?");
        params.push(("weight_g", weight_g.to_string()));
    }
    if let Some(base_type) = input.base_type {
        sql.push_str(", base_type = ?");
        params.push(("base_type", base_type));
    }
    if let Some(neck_type) = input.neck_type {
        sql.push_str(", neck_type = ?");
        params.push(("neck_type", neck_type));
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
    params.push(("profile_id", profile_id.to_string()));

    let mut update = sqlx::query(&sql);
    for (_, value) in &params {
        update = update.bind(value.as_str());
    }
    update.bind(profile_id).execute(&db.pool).await?;

    let profile = sqlx::query_as::<_, BottleProfileDto>(
        "SELECT id, code, name, producer, material, capacity_ml, diameter_mm, height_mm, weight_g, base_type, neck_type, compatibility_group_id, deposit_value, description, is_active, created_at, updated_at
         FROM bottle_profiles WHERE id = ?",
    )
    .bind(profile_id)
    .fetch_one(&db.pool)
    .await?;

    Ok(profile)
}

pub async fn delete_bottle_profile(db: &DepotDb, profile_id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;

    sqlx::query("DELETE FROM bottle_profiles WHERE id = ?")
        .bind(profile_id)
        .execute(&db.pool)
        .await?;

    Ok(())
}
