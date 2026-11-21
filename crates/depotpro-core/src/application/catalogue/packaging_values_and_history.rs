// ============================================================================
// Valeurs d'emballages (packaging_values) & historique des prix (price_history)
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{
    CreatePackagingValueInput, PackagingValueDto, PaginatedQuery, PaginatedResponse,
    PriceHistoryDto, UpdatePackagingValueInput,
};

pub async fn list_packaging_values(
    db: &DepotDb,
    query: PaginatedQuery,
    returnable_id: Option<i64>,
) -> CoreResult<PaginatedResponse<PackagingValueDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let include_archived = query.include_archived.unwrap_or(false);
    let ret_filter = returnable_id.unwrap_or(0);

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM packaging_values
         WHERE (? = 1 OR is_active = 1)
           AND (? = 0 OR returnable_id = ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(ret_filter)
    .bind(ret_filter)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, PackagingValueDto>(
        "SELECT * FROM packaging_values
         WHERE (? = 1 OR is_active = 1)
           AND (? = 0 OR returnable_id = ?)
         ORDER BY valid_from DESC LIMIT ? OFFSET ?",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(ret_filter)
    .bind(ret_filter)
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

pub async fn create_packaging_value(
    db: &DepotDb,
    input: CreatePackagingValueInput,
) -> CoreResult<PackagingValueDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    if input.amount < 0 {
        return Err(CoreError::Validation(
            "La valeur ne peut pas être négative.".to_string(),
        ));
    }
    let (_guard, mut tx) = db.begin_write().await?;
    let id = sqlx::query(
        "INSERT INTO packaging_values (returnable_id, value_type, amount, currency, valid_from, valid_to, description, is_active)
         VALUES (?, ?, ?, ?, COALESCE(?, date('now')), ?, ?, ?)",
    )
    .bind(input.returnable_id)
    .bind(&input.value_type)
    .bind(input.amount)
    .bind(input.currency.as_deref().unwrap_or("FCFA"))
    .bind(input.valid_from.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.valid_to.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.description.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created =
        sqlx::query_as::<_, PackagingValueDto>("SELECT * FROM packaging_values WHERE id = ?")
            .bind(id)
            .fetch_one(&db.pool)
            .await?;
    Ok(created)
}

pub async fn update_packaging_value(
    db: &DepotDb,
    id: i64,
    input: UpdatePackagingValueInput,
) -> CoreResult<PackagingValueDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let existing: Option<PackagingValueDto> =
        sqlx::query_as("SELECT * FROM packaging_values WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let existing =
        existing.ok_or_else(|| CoreError::NotFound("Valeur d'emballage introuvable.".into()))?;

    let value_type = input.value_type.unwrap_or(existing.value_type);
    let amount = input.amount.unwrap_or(existing.amount);
    if amount < 0 {
        return Err(CoreError::Validation(
            "La valeur ne peut pas être négative.".to_string(),
        ));
    }
    let valid_from = input.valid_from.unwrap_or(existing.valid_from);
    let valid_to = input.valid_to.unwrap_or(existing.valid_to);
    let description = input.description.unwrap_or(existing.description);
    let is_active = input
        .is_active
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.is_active);

    sqlx::query(
        "UPDATE packaging_values
         SET value_type = ?, amount = ?, valid_from = ?, valid_to = ?, description = ?, is_active = ?
         WHERE id = ?",
    )
    .bind(&value_type)
    .bind(amount)
    .bind(&valid_from)
    .bind(&valid_to)
    .bind(description)
    .bind(is_active)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    let updated =
        sqlx::query_as::<_, PackagingValueDto>("SELECT * FROM packaging_values WHERE id = ?")
            .bind(id)
            .fetch_one(&db.pool)
            .await?;
    Ok(updated)
}

pub async fn delete_packaging_value(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let result = sqlx::query("DELETE FROM packaging_values WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(
            "Valeur d'emballage introuvable.".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(())
}

pub async fn list_price_history(
    db: &DepotDb,
    query: PaginatedQuery,
    entity_type: Option<String>,
    entity_id: Option<i64>,
) -> CoreResult<PaginatedResponse<PriceHistoryDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let et = entity_type.unwrap_or_default();
    let has_et = !et.trim().is_empty();
    let eid = entity_id.unwrap_or(0);

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM price_history
         WHERE (? = 0 OR entity_type = ?)
           AND (? = 0 OR entity_id = ?)",
    )
    .bind(if has_et { 1_i64 } else { 0_i64 })
    .bind(&et)
    .bind(eid)
    .bind(eid)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, PriceHistoryDto>(
        "SELECT id, entity_type, entity_id, variant_id, sales_unit_id, supplier_id, price_type,
                old_price, new_price, old_packaging_value, new_packaging_value, currency,
                effective_from, effective_to, changed_by, reason, created_at
         FROM price_history
         WHERE (? = 0 OR entity_type = ?)
           AND (? = 0 OR entity_id = ?)
         ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
    )
    .bind(if has_et { 1_i64 } else { 0_i64 })
    .bind(&et)
    .bind(eid)
    .bind(eid)
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
