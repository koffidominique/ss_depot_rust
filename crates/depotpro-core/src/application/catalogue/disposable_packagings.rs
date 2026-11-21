// ============================================================================
// CRUD des conditionnements jetables (disposable_packaging_types)
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::helpers::check_duplicate;
use super::{
    CreateDisposablePackagingTypeInput, DisposablePackagingTypeDto, PaginatedQuery,
    PaginatedResponse, UpdateDisposablePackagingTypeInput,
};

pub async fn list_disposable_packaging_type(
    db: &DepotDb,
    query: PaginatedQuery,
) -> CoreResult<PaginatedResponse<DisposablePackagingTypeDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let pattern = format!("%{}%", search.trim());
    let has_search = !search.trim().is_empty();

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM disposable_packaging_types WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, DisposablePackagingTypeDto>(
        "SELECT * FROM disposable_packaging_types WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?) ORDER BY name ASC LIMIT ? OFFSET ?",
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

pub async fn create_disposable_packaging_type(
    db: &DepotDb,
    input: CreateDisposablePackagingTypeInput,
) -> CoreResult<DisposablePackagingTypeDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let clean_code = input.code.trim().to_uppercase();
    let clean_name = input.name.trim();
    if clean_code.is_empty() || clean_name.is_empty() {
        return Err(CoreError::Validation(
            "Le code et le nom sont obligatoires.".to_string(),
        ));
    }
    if input.units_per_pack <= 0 || input.unit_volume_ml <= 0 {
        return Err(CoreError::Validation(
            "Nombre d'unités et volume unitaire doivent être > 0.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    check_duplicate(
        &mut tx,
        "disposable_packaging_types",
        "code",
        &clean_code,
        None,
    )
    .await?;
    let id = sqlx::query(
        "INSERT INTO disposable_packaging_types (code, name, packaging_type, units_per_pack, unit_volume_ml, material, is_returnable, description, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&clean_code)
    .bind(clean_name)
    .bind(&input.packaging_type)
    .bind(input.units_per_pack)
    .bind(input.unit_volume_ml)
    .bind(&input.material)
    .bind(if input.is_returnable.unwrap_or(false) { 1_i64 } else { 0_i64 })
    .bind(input.description.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created = sqlx::query_as::<_, DisposablePackagingTypeDto>(
        "SELECT * FROM disposable_packaging_types WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(created)
}

pub async fn update_disposable_packaging_type(
    db: &DepotDb,
    id: i64,
    input: UpdateDisposablePackagingTypeInput,
) -> CoreResult<DisposablePackagingTypeDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let existing: Option<DisposablePackagingTypeDto> =
        sqlx::query_as("SELECT * FROM disposable_packaging_types WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let existing = existing
        .ok_or_else(|| CoreError::NotFound("Conditionnement jetable introuvable.".into()))?;

    let code = match input.code {
        Some(c) => {
            let clean = c.trim().to_uppercase();
            if clean.is_empty() {
                return Err(CoreError::Validation("Le code est obligatoire.".into()));
            }
            check_duplicate(
                &mut tx,
                "disposable_packaging_types",
                "code",
                &clean,
                Some(id),
            )
            .await?;
            clean
        }
        None => existing.code,
    };
    let name = input
        .name
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or(existing.name);
    let packaging_type = input.packaging_type.unwrap_or(existing.packaging_type);
    let units_per_pack = input.units_per_pack.unwrap_or(existing.units_per_pack);
    let unit_volume_ml = input.unit_volume_ml.unwrap_or(existing.unit_volume_ml);
    let material = input.material.unwrap_or(existing.material);
    let is_returnable = input
        .is_returnable
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.is_returnable);
    let description = input.description.unwrap_or(existing.description);
    let is_active = input
        .is_active
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.is_active);

    sqlx::query(
        "UPDATE disposable_packaging_types
         SET code = ?, name = ?, packaging_type = ?, units_per_pack = ?, unit_volume_ml = ?,
             material = ?, is_returnable = ?, description = ?, is_active = ?
         WHERE id = ?",
    )
    .bind(&code)
    .bind(&name)
    .bind(&packaging_type)
    .bind(units_per_pack)
    .bind(unit_volume_ml)
    .bind(&material)
    .bind(is_returnable)
    .bind(description)
    .bind(is_active)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    let updated = sqlx::query_as::<_, DisposablePackagingTypeDto>(
        "SELECT * FROM disposable_packaging_types WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(updated)
}

pub async fn delete_disposable_packaging_type(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let result = sqlx::query("DELETE FROM disposable_packaging_types WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(
            "Type de conditionnement jetable introuvable.".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(())
}
