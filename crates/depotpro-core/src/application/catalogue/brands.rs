// ============================================================================
// CRUD des marques (brands)
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::helpers::check_duplicate;
use super::{BrandDto, CreateBrandInput, PaginatedQuery, PaginatedResponse, UpdateBrandInput};

pub async fn list_brand(
    db: &DepotDb,
    query: PaginatedQuery,
) -> CoreResult<PaginatedResponse<BrandDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let pattern = format!("%{}%", search.trim());
    let has_search = !search.trim().is_empty();

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM brands WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, BrandDto>(
        "SELECT id, code, name, brewery_id, country_of_origin, description, is_active, created_at, updated_at
         FROM brands
         WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?)
         ORDER BY name ASC LIMIT ? OFFSET ?",
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

pub async fn create_brand(db: &DepotDb, input: CreateBrandInput) -> CoreResult<BrandDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let clean_code = input.code.trim().to_uppercase();
    let clean_name = input.name.trim();
    if clean_code.is_empty() || clean_name.is_empty() {
        return Err(CoreError::Validation(
            "Le code et le nom sont obligatoires.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    check_duplicate(&mut tx, "brands", "code", &clean_code, None).await?;
    check_duplicate(&mut tx, "brands", "name", clean_name, None).await?;
    if let Some(bid) = input.brewery_id {
        let exists: Option<i64> = sqlx::query_scalar("SELECT id FROM breweries WHERE id = ?")
            .bind(bid)
            .fetch_optional(&mut *tx)
            .await?;
        if exists.is_none() {
            return Err(CoreError::Validation(
                "Brasserie / fabricant introuvable.".to_string(),
            ));
        }
    }

    let id = sqlx::query(
        "INSERT INTO brands (code, name, brewery_id, country_of_origin, description, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(&clean_code)
    .bind(clean_name)
    .bind(input.brewery_id)
    .bind(input.country_of_origin.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.description.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created = sqlx::query_as::<_, BrandDto>(
        "SELECT id, code, name, brewery_id, country_of_origin, description, is_active, created_at, updated_at FROM brands WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(created)
}

pub async fn update_brand(db: &DepotDb, id: i64, input: UpdateBrandInput) -> CoreResult<BrandDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let existing: Option<BrandDto> = sqlx::query_as(
        "SELECT id, code, name, brewery_id, country_of_origin, description, is_active, created_at, updated_at FROM brands WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;
    let existing = existing.ok_or_else(|| CoreError::NotFound("Marque introuvable.".into()))?;

    let code = match input.code {
        Some(c) => {
            let clean = c.trim().to_uppercase();
            if clean.is_empty() {
                return Err(CoreError::Validation(
                    "Le code ne peut pas être vide.".into(),
                ));
            }
            check_duplicate(&mut tx, "brands", "code", &clean, Some(id)).await?;
            clean
        }
        None => existing.code,
    };
    let name = match input.name {
        Some(n) => {
            let clean = n.trim().to_string();
            if clean.is_empty() {
                return Err(CoreError::Validation(
                    "Le nom ne peut pas être vide.".into(),
                ));
            }
            check_duplicate(&mut tx, "brands", "name", &clean, Some(id)).await?;
            clean
        }
        None => existing.name,
    };
    let brewery_id = input.brewery_id.unwrap_or(existing.brewery_id);
    if let Some(bid) = brewery_id {
        let exists: Option<i64> = sqlx::query_scalar("SELECT id FROM breweries WHERE id = ?")
            .bind(bid)
            .fetch_optional(&mut *tx)
            .await?;
        if exists.is_none() {
            return Err(CoreError::Validation(
                "Brasserie / fabricant introuvable.".to_string(),
            ));
        }
    }
    let country_of_origin = input
        .country_of_origin
        .map(|o| o.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()))
        .unwrap_or(existing.country_of_origin);
    let description = input
        .description
        .map(|o| o.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()))
        .unwrap_or(existing.description);
    let is_active = input
        .is_active
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.is_active);

    sqlx::query(
        "UPDATE brands
         SET code = ?, name = ?, brewery_id = ?, country_of_origin = ?, description = ?, is_active = ?, updated_at = datetime('now')
         WHERE id = ?",
    )
    .bind(&code)
    .bind(&name)
    .bind(brewery_id)
    .bind(country_of_origin)
    .bind(description)
    .bind(is_active)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    let updated = sqlx::query_as::<_, BrandDto>(
        "SELECT id, code, name, brewery_id, country_of_origin, description, is_active, created_at, updated_at FROM brands WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(updated)
}

pub async fn delete_brand(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let used: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM products WHERE brand_id = ?")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
    if used > 0 {
        sqlx::query("UPDATE brands SET is_active = 0, updated_at = datetime('now') WHERE id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        return Ok(());
    }
    let result = sqlx::query("DELETE FROM brands WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound("Marque introuvable.".to_string()));
    }
    tx.commit().await?;
    Ok(())
}
