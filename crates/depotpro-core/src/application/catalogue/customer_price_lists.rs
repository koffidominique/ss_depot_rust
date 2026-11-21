// ============================================================================
// CRUD des grilles tarifaires clients (customer_price_lists)
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::helpers::check_duplicate;
use super::{
    CreateCustomerPriceListInput, CustomerPriceListDto, PaginatedQuery, PaginatedResponse,
    UpdateCustomerPriceListInput,
};

pub async fn list_customer_price_lists(
    db: &DepotDb,
    query: PaginatedQuery,
) -> CoreResult<PaginatedResponse<CustomerPriceListDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let pattern = format!("%{}%", search.trim());
    let has_search = !search.trim().is_empty();

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM customer_price_lists WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, CustomerPriceListDto>(
        "SELECT * FROM customer_price_lists WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?) ORDER BY is_default DESC, name ASC LIMIT ? OFFSET ?",
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

pub async fn create_customer_price_list(
    db: &DepotDb,
    input: CreateCustomerPriceListInput,
) -> CoreResult<CustomerPriceListDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let clean_code = input.code.trim().to_uppercase();
    let clean_name = input.name.trim();
    if clean_code.is_empty() || clean_name.is_empty() {
        return Err(CoreError::Validation(
            "Le code et le nom sont obligatoires.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    check_duplicate(&mut tx, "customer_price_lists", "code", &clean_code, None).await?;
    if input.is_default.unwrap_or(false) {
        sqlx::query("UPDATE customer_price_lists SET is_default = 0 WHERE is_default = 1")
            .execute(&mut *tx)
            .await?;
    }

    let id = sqlx::query(
        "INSERT INTO customer_price_lists (code, name, description, currency, is_default, valid_from, valid_to, is_active)
         VALUES (?, ?, ?, ?, ?, COALESCE(?, date('now')), ?, ?)",
    )
    .bind(&clean_code)
    .bind(clean_name)
    .bind(input.description.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.currency.as_deref().unwrap_or("FCFA"))
    .bind(if input.is_default.unwrap_or(false) { 1_i64 } else { 0_i64 })
    .bind(input.valid_from.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.valid_to.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created = sqlx::query_as::<_, CustomerPriceListDto>(
        "SELECT * FROM customer_price_lists WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(created)
}

pub async fn update_customer_price_list(
    db: &DepotDb,
    id: i64,
    input: UpdateCustomerPriceListInput,
) -> CoreResult<CustomerPriceListDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let existing: Option<CustomerPriceListDto> =
        sqlx::query_as("SELECT * FROM customer_price_lists WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let existing =
        existing.ok_or_else(|| CoreError::NotFound("Grille tarifaire introuvable.".into()))?;

    let code = match input.code {
        Some(c) => {
            let clean = c.trim().to_uppercase();
            if clean.is_empty() {
                return Err(CoreError::Validation("Le code est obligatoire.".into()));
            }
            check_duplicate(&mut tx, "customer_price_lists", "code", &clean, Some(id)).await?;
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
    let currency = input.currency.unwrap_or(existing.currency);
    let is_default = input
        .is_default
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.is_default);
    if is_default == 1 {
        sqlx::query(
            "UPDATE customer_price_lists SET is_default = 0 WHERE is_default = 1 AND id != ?",
        )
        .bind(id)
        .execute(&mut *tx)
        .await?;
    }
    let valid_from = input.valid_from.unwrap_or(existing.valid_from);
    let valid_to = input.valid_to.unwrap_or(existing.valid_to);
    let is_active = input
        .is_active
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.is_active);

    sqlx::query(
        "UPDATE customer_price_lists
         SET code = ?, name = ?, description = ?, currency = ?, is_default = ?, valid_from = ?, valid_to = ?, is_active = ?
         WHERE id = ?",
    )
    .bind(&code)
    .bind(&name)
    .bind(description)
    .bind(&currency)
    .bind(is_default)
    .bind(&valid_from)
    .bind(&valid_to)
    .bind(is_active)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    let updated = sqlx::query_as::<_, CustomerPriceListDto>(
        "SELECT * FROM customer_price_lists WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(updated)
}

pub async fn delete_customer_price_list(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let result = sqlx::query("DELETE FROM customer_price_lists WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(
            "Grille tarifaire introuvable.".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(())
}
