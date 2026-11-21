// ============================================================================
// CRUD des types de casiers (crate_types)
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::helpers::check_duplicate;
use super::{
    CrateTypeDto, CreateCrateTypeInput, PaginatedQuery, PaginatedResponse, UpdateCrateTypeInput,
};

pub async fn list_crate_type(
    db: &DepotDb,
    query: PaginatedQuery,
) -> CoreResult<PaginatedResponse<CrateTypeDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let pattern = format!("%{}%", search.trim());
    let has_search = !search.trim().is_empty();

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM crate_types WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, CrateTypeDto>(
        "SELECT * FROM crate_types WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?) ORDER BY name ASC LIMIT ? OFFSET ?",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .bind(ps)
    .bind(offset)
    .fetch_all(&db.pool)
    .await?;

    let total_pages = ((total + ps - 1) / ps).max(1);
    Ok(PaginatedResponse {
        items: rows,
        total,
        page: p,
        page_size: ps,
        total_pages,
    })
}

pub async fn create_crate_type(
    db: &DepotDb,
    input: CreateCrateTypeInput,
) -> CoreResult<CrateTypeDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let clean_code = input.code.trim().to_uppercase();
    let clean_name = input.name.trim();
    let clean_producer = input.producer.trim();
    if clean_code.is_empty() || clean_name.is_empty() || clean_producer.is_empty() {
        return Err(CoreError::Validation(
            "Le code, le nom et le producteur sont obligatoires.".to_string(),
        ));
    }
    if input.capacity <= 0 || input.bottle_capacity_ml <= 0 {
        return Err(CoreError::Validation(
            "La capacité et le volume bouteille doivent être positifs.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    check_duplicate(&mut tx, "crate_types", "code", &clean_code, None).await?;
    let id = sqlx::query(
        "INSERT INTO crate_types (code, name, producer, capacity, bottle_capacity_ml, bottle_profile_id, compatibility_group_id, dimensions, weight_g, material, deposit_value, description, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&clean_code)
    .bind(clean_name)
    .bind(clean_producer)
    .bind(input.capacity)
    .bind(input.bottle_capacity_ml)
    .bind(input.bottle_profile_id)
    .bind(input.compatibility_group_id)
    .bind(input.dimensions.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.weight_g)
    .bind(input.material.as_deref().unwrap_or("plastic"))
    .bind(input.deposit_value.unwrap_or(0))
    .bind(input.description.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created = sqlx::query_as::<_, CrateTypeDto>("SELECT * FROM crate_types WHERE id = ?")
        .bind(id)
        .fetch_one(&db.pool)
        .await?;
    Ok(created)
}

pub async fn update_crate_type(
    db: &DepotDb,
    id: i64,
    input: UpdateCrateTypeInput,
) -> CoreResult<CrateTypeDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let existing: Option<CrateTypeDto> = sqlx::query_as("SELECT * FROM crate_types WHERE id = ?")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?;
    let existing = existing.ok_or_else(|| CoreError::NotFound("Casier introuvable.".into()))?;

    let code = match input.code {
        Some(c) => {
            let clean = c.trim().to_uppercase();
            if clean.is_empty() {
                return Err(CoreError::Validation("Le code est obligatoire.".into()));
            }
            check_duplicate(&mut tx, "crate_types", "code", &clean, Some(id)).await?;
            clean
        }
        None => existing.code,
    };
    let name = input
        .name
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or(existing.name);
    let producer = input
        .producer
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or(existing.producer);
    let capacity = input.capacity.unwrap_or(existing.capacity);
    let bottle_capacity_ml = input
        .bottle_capacity_ml
        .unwrap_or(existing.bottle_capacity_ml);
    let bottle_profile_id = input
        .bottle_profile_id
        .unwrap_or(existing.bottle_profile_id);
    let compatibility_group_id = input
        .compatibility_group_id
        .unwrap_or(existing.compatibility_group_id);
    let dimensions = input.dimensions.unwrap_or(existing.dimensions);
    let weight_g = input.weight_g.unwrap_or(existing.weight_g);
    let material = input.material.unwrap_or(existing.material);
    let deposit_value = input.deposit_value.unwrap_or(existing.deposit_value);
    let description = input.description.unwrap_or(existing.description);
    let is_active = input
        .is_active
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.is_active);

    sqlx::query(
        "UPDATE crate_types
         SET code = ?, name = ?, producer = ?, capacity = ?, bottle_capacity_ml = ?,
             bottle_profile_id = ?, compatibility_group_id = ?, dimensions = ?, weight_g = ?,
             material = ?, deposit_value = ?, description = ?, is_active = ?
         WHERE id = ?",
    )
    .bind(&code)
    .bind(&name)
    .bind(&producer)
    .bind(capacity)
    .bind(bottle_capacity_ml)
    .bind(bottle_profile_id)
    .bind(compatibility_group_id)
    .bind(dimensions)
    .bind(weight_g)
    .bind(&material)
    .bind(deposit_value)
    .bind(description)
    .bind(is_active)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    let updated = sqlx::query_as::<_, CrateTypeDto>("SELECT * FROM crate_types WHERE id = ?")
        .bind(id)
        .fetch_one(&db.pool)
        .await?;
    Ok(updated)
}

pub async fn delete_crate_type(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let result = sqlx::query("DELETE FROM crate_types WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(
            "Type de casier introuvable.".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(())
}
