// ============================================================================
// CRUD des lignes de grilles tarifaires (customer_price_list_items)
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{
    CreateCustomerPriceListItemInput, CustomerPriceListItemDto, PaginatedQuery, PaginatedResponse,
    UpdateCustomerPriceListItemInput,
};

pub async fn list_customer_price_list_items(
    db: &DepotDb,
    query: PaginatedQuery,
    price_list_id: Option<i64>,
    product_id: Option<i64>,
) -> CoreResult<PaginatedResponse<CustomerPriceListItemDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let include_archived = query.include_archived.unwrap_or(false);
    let pl_filter = price_list_id.unwrap_or(0);
    let prod_filter = product_id.unwrap_or(0);

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM customer_price_list_items
         WHERE (? = 1 OR is_active = 1)
           AND (? = 0 OR price_list_id = ?)
           AND (? = 0 OR product_id = ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(pl_filter)
    .bind(pl_filter)
    .bind(prod_filter)
    .bind(prod_filter)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, CustomerPriceListItemDto>(
        "SELECT * FROM customer_price_list_items
         WHERE (? = 1 OR is_active = 1)
           AND (? = 0 OR price_list_id = ?)
           AND (? = 0 OR product_id = ?)
         ORDER BY valid_from DESC LIMIT ? OFFSET ?",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(pl_filter)
    .bind(pl_filter)
    .bind(prod_filter)
    .bind(prod_filter)
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

pub async fn create_customer_price_list_item(
    db: &DepotDb,
    input: CreateCustomerPriceListItemInput,
) -> CoreResult<CustomerPriceListItemDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    if input.price < 0 {
        return Err(CoreError::Validation(
            "Le prix ne peut pas être négatif.".to_string(),
        ));
    }
    let (_guard, mut tx) = db.begin_write().await?;
    let id = sqlx::query(
        "INSERT INTO customer_price_list_items (price_list_id, product_id, packaging_id, price_tier, price, packaging_value, valid_from, valid_to, is_active)
         VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, date('now')), ?, ?)",
    )
    .bind(input.price_list_id)
    .bind(input.product_id)
    .bind(input.packaging_id)
    .bind(&input.price_tier)
    .bind(input.price)
    .bind(input.packaging_value.unwrap_or(0))
    .bind(input.valid_from.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.valid_to.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created = sqlx::query_as::<_, CustomerPriceListItemDto>(
        "SELECT * FROM customer_price_list_items WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(created)
}

pub async fn update_customer_price_list_item(
    db: &DepotDb,
    id: i64,
    input: UpdateCustomerPriceListItemInput,
) -> CoreResult<CustomerPriceListItemDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let existing: Option<CustomerPriceListItemDto> =
        sqlx::query_as("SELECT * FROM customer_price_list_items WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let existing =
        existing.ok_or_else(|| CoreError::NotFound("Ligne tarifaire introuvable.".into()))?;

    let price = input.price.unwrap_or(existing.price);
    if price < 0 {
        return Err(CoreError::Validation(
            "Le prix ne peut pas être négatif.".to_string(),
        ));
    }
    let packaging_value = input.packaging_value.unwrap_or(existing.packaging_value);
    let valid_from = input.valid_from.unwrap_or(existing.valid_from);
    let valid_to = input.valid_to.unwrap_or(existing.valid_to);
    let is_active = input
        .is_active
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.is_active);

    sqlx::query(
        "UPDATE customer_price_list_items
         SET price = ?, packaging_value = ?, valid_from = ?, valid_to = ?, is_active = ?
         WHERE id = ?",
    )
    .bind(price)
    .bind(packaging_value)
    .bind(&valid_from)
    .bind(&valid_to)
    .bind(is_active)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    if price != existing.price {
        let ptype = match existing.price_tier.as_str() {
            "wholesale" => "WHOLESALE",
            "semi_wholesale" => "SEMI_WHOLESALE",
            _ => "RETAIL",
        };
        sqlx::query(
            "INSERT INTO price_history (entity_type, entity_id, price_type, old_price, new_price, old_packaging_value, new_packaging_value, currency, effective_from, reason)
             VALUES ('customer_price_list_item', ?, ?, ?, ?, ?, ?, 'FCFA', datetime('now'), 'Mise à jour grille client')",
        )
        .bind(id)
        .bind(ptype)
        .bind(existing.price)
        .bind(price)
        .bind(existing.packaging_value)
        .bind(packaging_value)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    let updated = sqlx::query_as::<_, CustomerPriceListItemDto>(
        "SELECT * FROM customer_price_list_items WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(updated)
}

pub async fn delete_customer_price_list_item(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let result = sqlx::query("DELETE FROM customer_price_list_items WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(
            "Ligne de grille tarifaire introuvable.".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(())
}
