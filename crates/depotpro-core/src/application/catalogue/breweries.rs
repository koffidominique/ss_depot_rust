// ============================================================================
// CRUD des brasseries & fabricants (breweries)
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::helpers::check_duplicate;
use super::{
    BreweryDto, CreateBreweryInput, PaginatedQuery, PaginatedResponse, UpdateBreweryInput,
};

fn auto_code(prefix: &str, name: &str) -> String {
    let slug: String = name
        .trim()
        .to_uppercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let trimmed = slug.trim_matches('-');
    let short: String = trimmed.chars().take(16).collect();
    format!(
        "{prefix}-{}",
        if short.is_empty() { "ITEM" } else { &short }
    )
}

pub async fn list_breweries(
    db: &DepotDb,
    query: PaginatedQuery,
) -> CoreResult<PaginatedResponse<BreweryDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let pattern = format!("%{}%", search.trim());
    let has_search = !search.trim().is_empty();

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM breweries WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, BreweryDto>(
        "SELECT * FROM breweries WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?) ORDER BY name ASC LIMIT ? OFFSET ?",
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

pub async fn create_brewery(db: &DepotDb, input: CreateBreweryInput) -> CoreResult<BreweryDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let clean_name = input.name.trim();
    if clean_name.is_empty() {
        return Err(CoreError::Validation(
            "Le nom de la brasserie / fabricant est obligatoire.".to_string(),
        ));
    }
    let clean_code = input
        .code
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_uppercase)
        .unwrap_or_else(|| auto_code("BRW", clean_name));

    let (_guard, mut tx) = db.begin_write().await?;
    check_duplicate(&mut tx, "breweries", "code", &clean_code, None).await?;
    check_duplicate(&mut tx, "breweries", "name", clean_name, None).await?;

    let id = sqlx::query(
        "INSERT INTO breweries (code, name, short_name, country_code, address, phone, email, website, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(&clean_code)
    .bind(clean_name)
    .bind(input.short_name.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(
        input
            .country_code
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("CI"),
    )
    .bind(input.address.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.phone.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.email.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.website.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created = sqlx::query_as::<_, BreweryDto>("SELECT * FROM breweries WHERE id = ?")
        .bind(id)
        .fetch_one(&db.pool)
        .await?;
    Ok(created)
}

pub async fn update_brewery(
    db: &DepotDb,
    id: i64,
    input: UpdateBreweryInput,
) -> CoreResult<BreweryDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;

    let existing: Option<BreweryDto> = sqlx::query_as("SELECT * FROM breweries WHERE id = ?")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?;
    let existing = existing.ok_or_else(|| CoreError::NotFound("Brasserie introuvable.".into()))?;

    let code = match input.code {
        Some(c) => {
            let clean = c.trim().to_uppercase();
            if clean.is_empty() {
                return Err(CoreError::Validation("Le code est obligatoire.".into()));
            }
            check_duplicate(&mut tx, "breweries", "code", &clean, Some(id)).await?;
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
            check_duplicate(&mut tx, "breweries", "name", &clean, Some(id)).await?;
            clean
        }
        None => existing.name,
    };

    let short_name = input
        .short_name
        .map(|o| o.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()))
        .unwrap_or(existing.short_name);
    let country_code = input
        .country_code
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or(existing.country_code);
    let address = input
        .address
        .map(|o| o.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()))
        .unwrap_or(existing.address);
    let phone = input
        .phone
        .map(|o| o.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()))
        .unwrap_or(existing.phone);
    let email = input
        .email
        .map(|o| o.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()))
        .unwrap_or(existing.email);
    let website = input
        .website
        .map(|o| o.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()))
        .unwrap_or(existing.website);
    let is_active = input
        .is_active
        .map(|b| if b { 1_i64 } else { 0_i64 })
        .unwrap_or(existing.is_active);

    sqlx::query(
        "UPDATE breweries
         SET code = ?, name = ?, short_name = ?, country_code = ?, address = ?, phone = ?, email = ?, website = ?, is_active = ?, updated_at = datetime('now')
         WHERE id = ?",
    )
    .bind(&code)
    .bind(&name)
    .bind(short_name)
    .bind(&country_code)
    .bind(address)
    .bind(phone)
    .bind(email)
    .bind(website)
    .bind(is_active)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    let updated = sqlx::query_as::<_, BreweryDto>("SELECT * FROM breweries WHERE id = ?")
        .bind(id)
        .fetch_one(&db.pool)
        .await?;
    Ok(updated)
}

pub async fn delete_brewery(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let used_in_products: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM products WHERE brewery_id = ?")
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
    if used_in_products > 0 {
        sqlx::query(
            "UPDATE breweries SET is_active = 0, updated_at = datetime('now') WHERE id = ?",
        )
        .bind(id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        return Ok(());
    }
    let result = sqlx::query("DELETE FROM breweries WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound("Brasserie introuvable.".to_string()));
    }
    tx.commit().await?;
    Ok(())
}
