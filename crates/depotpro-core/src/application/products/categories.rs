// ============================================================================
// CRUD des catégories hiérarchiques produits
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::CategoryDto;

pub async fn list_categories(db: &DepotDb) -> CoreResult<Vec<CategoryDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let rows = sqlx::query_as::<_, CategoryDto>(
        "SELECT id, parent_id, name, slug, description, is_active FROM categories ORDER BY COALESCE(parent_id, id), name ASC",
    )
    .fetch_all(&db.pool)
    .await?;
    Ok(rows)
}

pub async fn create_category(
    db: &DepotDb,
    name: &str,
    description: Option<&str>,
) -> CoreResult<CategoryDto> {
    create_category_with_parent(db, name, description, None).await
}

pub async fn create_category_with_parent(
    db: &DepotDb,
    name: &str,
    description: Option<&str>,
    parent_id: Option<i64>,
) -> CoreResult<CategoryDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let clean = name.trim();
    if clean.is_empty() {
        return Err(CoreError::Validation(
            "Le nom de la catégorie est obligatoire.".to_string(),
        ));
    }
    let (_guard, mut tx) = db.begin_write().await?;
    if let Some(pid) = parent_id {
        let parent_ok: Option<i64> = sqlx::query_scalar("SELECT id FROM categories WHERE id = ?")
            .bind(pid)
            .fetch_optional(&mut *tx)
            .await?;
        if parent_ok.is_none() {
            return Err(CoreError::Validation(
                "Catégorie parente introuvable.".to_string(),
            ));
        }
    }
    let dup: Option<(i64,)> =
        sqlx::query_as("SELECT id FROM categories WHERE lower(name) = lower(?)")
            .bind(clean)
            .fetch_optional(&mut *tx)
            .await?;
    if dup.is_some() {
        return Err(CoreError::DuplicateOperation(
            "Cette catégorie existe déjà.".to_string(),
        ));
    }
    let slug: String = clean
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    let id = sqlx::query(
        "INSERT INTO categories (parent_id, name, slug, description) VALUES (?, ?, ?, ?)",
    )
    .bind(parent_id)
    .bind(clean)
    .bind(if slug.is_empty() { None } else { Some(slug) })
    .bind(description.map(str::trim).filter(|s| !s.is_empty()))
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created = sqlx::query_as::<_, CategoryDto>(
        "SELECT id, parent_id, name, slug, description, is_active FROM categories WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(created)
}

pub async fn update_category(
    db: &DepotDb,
    id: i64,
    name: Option<&str>,
    description: Option<&str>,
    parent_id: Option<Option<i64>>,
    is_active: Option<bool>,
) -> CoreResult<CategoryDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let cur = sqlx::query_as::<_, CategoryDto>(
        "SELECT id, parent_id, name, slug, description, is_active FROM categories WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| CoreError::NotFound("Catégorie introuvable.".to_string()))?;

    let new_name = match name {
        Some(n) => {
            let trimmed = n.trim().to_string();
            if trimmed.is_empty() {
                return Err(CoreError::Validation("Le nom est obligatoire.".to_string()));
            }
            trimmed
        }
        None => cur.name,
    };
    let new_parent = parent_id.unwrap_or(cur.parent_id);
    if new_parent == Some(id) {
        return Err(CoreError::Validation(
            "Une catégorie ne peut pas être son propre parent.".to_string(),
        ));
    }
    let new_desc = description
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or(cur.description);
    let new_active = is_active
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(cur.is_active);

    sqlx::query(
        "UPDATE categories SET parent_id = ?, name = ?, description = ?, is_active = ? WHERE id = ?",
    )
    .bind(new_parent)
    .bind(&new_name)
    .bind(new_desc)
    .bind(new_active)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    let updated = sqlx::query_as::<_, CategoryDto>(
        "SELECT id, parent_id, name, slug, description, is_active FROM categories WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(updated)
}
