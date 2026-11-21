// ============================================================================
// CRUD des listes de prix clients (customer_price_lists)
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

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
        "SELECT COUNT(*) FROM customer_price_lists 
         WHERE (? = 1 OR is_active = 1)
           AND (? = 0 OR name LIKE ? OR COALESCE(description, '') LIKE ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, CustomerPriceListDto>(
        "SELECT * FROM customer_price_lists 
         WHERE (? = 1 OR is_active = 1)
           AND (? = 0 OR name LIKE ? OR COALESCE(description, '') LIKE ?)
         ORDER BY is_default DESC, name ASC
         LIMIT ? OFFSET ?",
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
    let clean_name = input.name.trim();
    if clean_name.is_empty() {
        return Err(CoreError::Validation("Le nom est obligatoire.".to_string()));
    }
    let currency = input.currency.unwrap_or_else(|| "XOF".to_string());
    let (_guard, mut tx) = db.begin_write().await?;
    if input.is_default.unwrap_or(false) {
        sqlx::query("UPDATE customer_price_lists SET is_default = 0 WHERE is_default = 1")
            .execute(&mut *tx)
            .await?;
    }
    let id = sqlx::query(
        "INSERT INTO customer_price_lists (name, description, currency, is_default, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(&clean_name)
    .bind(input.description.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(&currency)
    .bind(if input.is_default.unwrap_or(false) { 1_i64 } else { 0_i64 })
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

    let mut updates = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(name) = &input.name {
        let clean = name.trim();
        if clean.is_empty() {
            return Err(CoreError::Validation(
                "Le nom ne peut pas être vide.".to_string(),
            ));
        }
        updates.push("name = ?".to_string());
        binds.push(clean.to_string());
    }
    if let Some(ref d) = input.description {
        if let Some(dd) = d {
            updates.push("description = ?".to_string());
            binds.push(dd.trim().to_string());
        }
    }
    if let Some(c) = &input.currency {
        updates.push("currency = ?".to_string());
        binds.push(c.clone());
    }
    if let Some(def) = input.is_default {
        if def {
            sqlx::query(
                "UPDATE customer_price_lists SET is_default = 0 WHERE is_default = 1 AND id != ?",
            )
            .bind(id)
            .execute(&mut *tx)
            .await?;
        }
        updates.push("is_default = ?".to_string());
        binds.push(if def { "1" } else { "0" }.to_string());
    }
    if let Some(active) = input.is_active {
        updates.push("is_active = ?".to_string());
        binds.push(if active { "1" } else { "0" }.to_string());
    }

    updates.push("updated_at = datetime('now')".to_string());

    if updates.is_empty() {
        return Err(CoreError::Validation(
            "Aucun champ à mettre à jour.".to_string(),
        ));
    }

    let sql = format!(
        "UPDATE customer_price_lists SET {} WHERE id = ?",
        updates.join(", ")
    );
    let mut q = sqlx::query(&sql);
    for b in binds {
        q = q.bind(b);
    }
    q = q.bind(id);
    q.execute(&mut *tx).await?;
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
            "Liste de prix introuvable.".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(())
}
