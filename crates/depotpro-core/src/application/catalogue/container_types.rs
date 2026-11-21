// ============================================================================
// CRUD des types de contenants (container_types)
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::helpers::check_duplicate;
use super::{
    ContainerTypeDto, CreateContainerTypeInput, PaginatedQuery, PaginatedResponse,
    UpdateContainerTypeInput,
};

const ALLOWED_MATERIALS: &[&str] = &[
    "glass",
    "pet",
    "aluminium",
    "carton",
    "plastic",
    "wood",
    "other",
];

pub async fn list_container_type(
    db: &DepotDb,
    query: PaginatedQuery,
) -> CoreResult<PaginatedResponse<ContainerTypeDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let pattern = format!("%{}%", search.trim());
    let has_search = !search.trim().is_empty();

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM container_types WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, ContainerTypeDto>(
        "SELECT id, code, name, material, is_returnable, is_recyclable, default_volume_ml, default_deposit_value, description, is_active, created_at, updated_at
         FROM container_types
         WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?)
         ORDER BY id ASC LIMIT ? OFFSET ?",
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

pub async fn create_container_type(
    db: &DepotDb,
    input: CreateContainerTypeInput,
) -> CoreResult<ContainerTypeDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let clean_code = input.code.trim().to_uppercase();
    let clean_name = input.name.trim();
    if clean_code.is_empty() || clean_name.is_empty() {
        return Err(CoreError::Validation(
            "Le code et le nom sont obligatoires.".to_string(),
        ));
    }
    let material = input.material.as_deref().unwrap_or("other");
    if !ALLOWED_MATERIALS.contains(&material) {
        return Err(CoreError::Validation("Matériau invalide.".to_string()));
    }
    if let Some(v) = input.default_volume_ml {
        if v <= 0 {
            return Err(CoreError::Validation(
                "Le volume par défaut doit être > 0 ml.".to_string(),
            ));
        }
    }
    if input.default_deposit_value.unwrap_or(0) < 0 {
        return Err(CoreError::Validation(
            "La consigne par défaut ne peut pas être négative.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    check_duplicate(&mut tx, "container_types", "code", &clean_code, None).await?;
    let id = sqlx::query(
        "INSERT INTO container_types (code, name, material, is_returnable, is_recyclable, default_volume_ml, default_deposit_value, description, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(&clean_code)
    .bind(clean_name)
    .bind(material)
    .bind(if input.is_returnable.unwrap_or(false) { 1_i64 } else { 0_i64 })
    .bind(if input.is_recyclable.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .bind(input.default_volume_ml)
    .bind(input.default_deposit_value.unwrap_or(0))
    .bind(input.description.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created = sqlx::query_as::<_, ContainerTypeDto>(
        "SELECT id, code, name, material, is_returnable, is_recyclable, default_volume_ml, default_deposit_value, description, is_active, created_at, updated_at
         FROM container_types WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(created)
}

pub async fn update_container_type(
    db: &DepotDb,
    id: i64,
    input: UpdateContainerTypeInput,
) -> CoreResult<ContainerTypeDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let existing: Option<ContainerTypeDto> = sqlx::query_as(
        "SELECT id, code, name, material, is_returnable, is_recyclable, default_volume_ml, default_deposit_value, description, is_active, created_at, updated_at
         FROM container_types WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;
    let existing =
        existing.ok_or_else(|| CoreError::NotFound("Type de contenant introuvable.".into()))?;

    let code = match input.code {
        Some(c) => {
            let clean = c.trim().to_uppercase();
            if clean.is_empty() {
                return Err(CoreError::Validation("Le code est obligatoire.".into()));
            }
            check_duplicate(&mut tx, "container_types", "code", &clean, Some(id)).await?;
            clean
        }
        None => existing.code,
    };
    let name = match input.name {
        Some(n) => {
            let clean = n.trim().to_string();
            if clean.is_empty() {
                return Err(CoreError::Validation("Le nom est obligatoire.".into()));
            }
            clean
        }
        None => existing.name,
    };
    let material = input.material.unwrap_or(existing.material);
    if !ALLOWED_MATERIALS.contains(&material.as_str()) {
        return Err(CoreError::Validation("Matériau invalide.".to_string()));
    }
    let default_volume_ml = input
        .default_volume_ml
        .unwrap_or(existing.default_volume_ml);
    if let Some(v) = default_volume_ml {
        if v <= 0 {
            return Err(CoreError::Validation("Le volume doit être > 0 ml.".into()));
        }
    }
    let default_deposit_value = input
        .default_deposit_value
        .unwrap_or(existing.default_deposit_value)
        .max(0);
    let description = input
        .description
        .map(|o| o.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()))
        .unwrap_or(existing.description);
    let is_returnable = input
        .is_returnable
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.is_returnable);
    let is_recyclable = input
        .is_recyclable
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.is_recyclable);
    let is_active = input
        .is_active
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.is_active);

    sqlx::query(
        "UPDATE container_types
         SET code = ?, name = ?, material = ?, is_returnable = ?, is_recyclable = ?,
             default_volume_ml = ?, default_deposit_value = ?, description = ?, is_active = ?, updated_at = datetime('now')
         WHERE id = ?",
    )
    .bind(&code)
    .bind(&name)
    .bind(&material)
    .bind(is_returnable)
    .bind(is_recyclable)
    .bind(default_volume_ml)
    .bind(default_deposit_value)
    .bind(description)
    .bind(is_active)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    let updated = sqlx::query_as::<_, ContainerTypeDto>(
        "SELECT id, code, name, material, is_returnable, is_recyclable, default_volume_ml, default_deposit_value, description, is_active, created_at, updated_at
         FROM container_types WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(updated)
}

pub async fn delete_container_type(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let result = sqlx::query("DELETE FROM container_types WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(
            "Type de contenant introuvable.".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(())
}
