// ============================================================================
// CRUD des groupes de compatibilité (crate_compatibility_groups)
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::helpers::check_duplicate;
use super::{
    CompatibilityGroupDto, CreateCompatibilityGroupInput, PaginatedQuery, PaginatedResponse,
    UpdateCompatibilityGroupInput,
};

pub async fn list_compatibility_group(
    db: &DepotDb,
    query: PaginatedQuery,
) -> CoreResult<PaginatedResponse<CompatibilityGroupDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let pattern = format!("%{}%", search.trim());
    let has_search = !search.trim().is_empty();

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM crate_compatibility_groups WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, CompatibilityGroupDto>(
        "SELECT * FROM crate_compatibility_groups WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?) ORDER BY name ASC LIMIT ? OFFSET ?",
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

pub async fn create_compatibility_group(
    db: &DepotDb,
    input: CreateCompatibilityGroupInput,
) -> CoreResult<CompatibilityGroupDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let clean_code = input.code.trim().to_uppercase();
    let clean_name = input.name.trim();
    if clean_code.is_empty() || clean_name.is_empty() {
        return Err(CoreError::Validation(
            "Le code et le nom sont obligatoires.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    check_duplicate(
        &mut tx,
        "crate_compatibility_groups",
        "code",
        &clean_code,
        None,
    )
    .await?;
    let id = sqlx::query(
        "INSERT INTO crate_compatibility_groups (code, name, description, allows_mixed_brands, allows_mixed_volumes, is_active)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&clean_code)
    .bind(clean_name)
    .bind(input.description.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(if input.allows_mixed_brands.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .bind(if input.allows_mixed_volumes.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created = sqlx::query_as::<_, CompatibilityGroupDto>(
        "SELECT * FROM crate_compatibility_groups WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(created)
}

pub async fn update_compatibility_group(
    db: &DepotDb,
    id: i64,
    input: UpdateCompatibilityGroupInput,
) -> CoreResult<CompatibilityGroupDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let existing: Option<CompatibilityGroupDto> =
        sqlx::query_as("SELECT * FROM crate_compatibility_groups WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let existing = existing
        .ok_or_else(|| CoreError::NotFound("Groupe de compatibilité introuvable.".into()))?;

    let code = match input.code {
        Some(c) => {
            let clean = c.trim().to_uppercase();
            if clean.is_empty() {
                return Err(CoreError::Validation("Le code est obligatoire.".into()));
            }
            check_duplicate(
                &mut tx,
                "crate_compatibility_groups",
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
    let description = input.description.unwrap_or(existing.description);
    let allows_mixed_brands = input
        .allows_mixed_brands
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.allows_mixed_brands);
    let allows_mixed_volumes = input
        .allows_mixed_volumes
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.allows_mixed_volumes);
    let is_active = input
        .is_active
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.is_active);

    sqlx::query(
        "UPDATE crate_compatibility_groups
         SET code = ?, name = ?, description = ?, allows_mixed_brands = ?, allows_mixed_volumes = ?, is_active = ?
         WHERE id = ?",
    )
    .bind(&code)
    .bind(&name)
    .bind(description)
    .bind(allows_mixed_brands)
    .bind(allows_mixed_volumes)
    .bind(is_active)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    let updated = sqlx::query_as::<_, CompatibilityGroupDto>(
        "SELECT * FROM crate_compatibility_groups WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(updated)
}

pub async fn delete_compatibility_group(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let result = sqlx::query("DELETE FROM crate_compatibility_groups WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(
            "Groupe de compatibilité introuvable.".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(())
}
