// ============================================================================
// CRUD des lignes de listes de prix clients (customer_price_list_items)
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
) -> CoreResult<PaginatedResponse<CustomerPriceListItemDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let _search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let list_filter = price_list_id.unwrap_or(0);

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM customer_price_list_items 
         WHERE (? = 1 OR is_active = 1)
           AND (? = 0 OR price_list_id = ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(list_filter)
    .bind(list_filter)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, CustomerPriceListItemDto>(
        "SELECT * FROM customer_price_list_items 
         WHERE (? = 1 OR is_active = 1)
           AND (? = 0 OR price_list_id = ?)
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(list_filter)
    .bind(list_filter)
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
    if input.price_list_id <= 0 {
        return Err(CoreError::Validation(
            "L'ID de la liste de prix est obligatoire.".to_string(),
        ));
    }
    if input.price_fcfa < 0 {
        return Err(CoreError::Validation(
            "Le prix ne peut pas être négatif.".to_string(),
        ));
    }
    let (_guard, mut tx) = db.begin_write().await?;
    let list_exists: Option<i64> =
        sqlx::query_scalar("SELECT id FROM customer_price_lists WHERE id = ?")
            .bind(input.price_list_id)
            .fetch_optional(&mut *tx)
            .await?;
    if list_exists.is_none() {
        return Err(CoreError::Validation(
            "Liste de prix parent introuvable.".to_string(),
        ));
    }
    let id = sqlx::query(
        "INSERT INTO customer_price_list_items (price_list_id, product_id, variant_id, packaging_id, price_fcfa, valid_from, valid_to, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(input.price_list_id)
    .bind(input.product_id)
    .bind(input.variant_id)
    .bind(input.packaging_id)
    .bind(input.price_fcfa)
    .bind(&input.valid_from)
    .bind(input.valid_to.as_deref())
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

    let mut updates = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(p) = input.price_list_id {
        updates.push("price_list_id = ?".to_string());
        binds.push(p.to_string());
    }
    if let Some(ref p) = input.product_id {
        updates.push("product_id = ?".to_string());
        binds.push(p.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(ref v) = input.variant_id {
        updates.push("variant_id = ?".to_string());
        binds.push(v.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(ref p) = input.packaging_id {
        updates.push("packaging_id = ?".to_string());
        binds.push(p.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(price) = input.price_fcfa {
        if price < 0 {
            return Err(CoreError::Validation(
                "Le prix ne peut pas être négatif.".to_string(),
            ));
        }
        updates.push("price_fcfa = ?".to_string());
        binds.push(price.to_string());
    }
    if let Some(v) = &input.valid_from {
        updates.push("valid_from = ?".to_string());
        binds.push(v.clone());
    }
    if let Some(v) = &input.valid_to {
        if let Some(vv) = v {
            updates.push("valid_to = ?".to_string());
            binds.push(vv.clone());
        }
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
        "UPDATE customer_price_list_items SET {} WHERE id = ?",
        updates.join(", ")
    );
    let mut q = sqlx::query(&sql);
    for b in binds {
        q = q.bind(b);
    }
    q = q.bind(id);
    q.execute(&mut *tx).await?;
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
            "Élément de liste de prix introuvable.".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(())
}
