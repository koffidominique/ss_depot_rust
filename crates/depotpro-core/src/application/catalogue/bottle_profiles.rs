// ============================================================================
// CRUD des profils de bouteilles (bottle_profiles)
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::helpers::check_duplicate;
use super::{
    BottleProfileDto, CreateBottleProfileInput, PaginatedQuery, PaginatedResponse,
    UpdateBottleProfileInput,
};

pub async fn list_bottle_profile(
    db: &DepotDb,
    query: PaginatedQuery,
) -> CoreResult<PaginatedResponse<BottleProfileDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let pattern = format!("%{}%", search.trim());
    let has_search = !search.trim().is_empty();

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM bottle_profiles WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, BottleProfileDto>(
        "SELECT * FROM bottle_profiles WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?) ORDER BY name ASC LIMIT ? OFFSET ?",
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

pub async fn create_bottle_profile(
    db: &DepotDb,
    input: CreateBottleProfileInput,
) -> CoreResult<BottleProfileDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let clean_code = input.code.trim().to_uppercase();
    let clean_name = input.name.trim();
    let clean_producer = input.producer.trim();
    if clean_code.is_empty() || clean_name.is_empty() || clean_producer.is_empty() {
        return Err(CoreError::Validation(
            "Le code, le nom et le producteur sont obligatoires.".to_string(),
        ));
    }
    if input.capacity_ml <= 0 {
        return Err(CoreError::Validation(
            "La capacité doit être positive.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    check_duplicate(&mut tx, "bottle_profiles", "code", &clean_code, None).await?;
    let id = sqlx::query(
        "INSERT INTO bottle_profiles (code, name, producer, material, capacity_ml, diameter_mm, height_mm, weight_g, base_type, neck_type, compatibility_group_id, deposit_value, description, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&clean_code)
    .bind(clean_name)
    .bind(clean_producer)
    .bind(&input.material)
    .bind(input.capacity_ml)
    .bind(input.diameter_mm)
    .bind(input.height_mm)
    .bind(input.weight_g)
    .bind(input.base_type.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.neck_type.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.compatibility_group_id)
    .bind(input.deposit_value.unwrap_or(0))
    .bind(input.description.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created =
        sqlx::query_as::<_, BottleProfileDto>("SELECT * FROM bottle_profiles WHERE id = ?")
            .bind(id)
            .fetch_one(&db.pool)
            .await?;
    Ok(created)
}

pub async fn update_bottle_profile(
    db: &DepotDb,
    id: i64,
    input: UpdateBottleProfileInput,
) -> CoreResult<BottleProfileDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let existing: Option<BottleProfileDto> =
        sqlx::query_as("SELECT * FROM bottle_profiles WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let existing =
        existing.ok_or_else(|| CoreError::NotFound("Profil bouteille introuvable.".into()))?;

    let code = match input.code {
        Some(c) => {
            let clean = c.trim().to_uppercase();
            if clean.is_empty() {
                return Err(CoreError::Validation("Le code est obligatoire.".into()));
            }
            check_duplicate(&mut tx, "bottle_profiles", "code", &clean, Some(id)).await?;
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
    let material = input.material.unwrap_or(existing.material);
    let capacity_ml = input.capacity_ml.unwrap_or(existing.capacity_ml);
    let diameter_mm = input.diameter_mm.unwrap_or(existing.diameter_mm);
    let height_mm = input.height_mm.unwrap_or(existing.height_mm);
    let weight_g = input.weight_g.unwrap_or(existing.weight_g);
    let base_type = input.base_type.unwrap_or(existing.base_type);
    let neck_type = input.neck_type.unwrap_or(existing.neck_type);
    let compatibility_group_id = input
        .compatibility_group_id
        .unwrap_or(existing.compatibility_group_id);
    let deposit_value = input.deposit_value.unwrap_or(existing.deposit_value);
    let description = input.description.unwrap_or(existing.description);
    let is_active = input
        .is_active
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.is_active);

    sqlx::query(
        "UPDATE bottle_profiles
         SET code = ?, name = ?, producer = ?, material = ?, capacity_ml = ?, diameter_mm = ?,
             height_mm = ?, weight_g = ?, base_type = ?, neck_type = ?, compatibility_group_id = ?,
             deposit_value = ?, description = ?, is_active = ?
         WHERE id = ?",
    )
    .bind(&code)
    .bind(&name)
    .bind(&producer)
    .bind(&material)
    .bind(capacity_ml)
    .bind(diameter_mm)
    .bind(height_mm)
    .bind(weight_g)
    .bind(base_type)
    .bind(neck_type)
    .bind(compatibility_group_id)
    .bind(deposit_value)
    .bind(description)
    .bind(is_active)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    let updated =
        sqlx::query_as::<_, BottleProfileDto>("SELECT * FROM bottle_profiles WHERE id = ?")
            .bind(id)
            .fetch_one(&db.pool)
            .await?;
    Ok(updated)
}

pub async fn delete_bottle_profile(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let result = sqlx::query("DELETE FROM bottle_profiles WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(
            "Profil de bouteille introuvable.".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(())
}
