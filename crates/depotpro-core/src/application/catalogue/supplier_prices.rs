// ============================================================================
// CRUD des tarifs fournisseurs (supplier_product_prices)
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{
    CreateSupplierProductPriceInput, PaginatedQuery, PaginatedResponse, SupplierProductPriceDto,
    UpdateSupplierProductPriceInput,
};

pub async fn list_supplier_prices(
    db: &DepotDb,
    query: PaginatedQuery,
    supplier_id: Option<i64>,
    product_id: Option<i64>,
) -> CoreResult<PaginatedResponse<SupplierProductPriceDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let _search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let sup_filter = supplier_id.unwrap_or(0);
    let prod_filter = product_id.unwrap_or(0);

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM supplier_product_prices 
         WHERE (? = 1 OR is_active = 1)
           AND (? = 0 OR supplier_id = ?)
           AND (? = 0 OR product_id = ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(sup_filter)
    .bind(sup_filter)
    .bind(prod_filter)
    .bind(prod_filter)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, SupplierProductPriceDto>(
        "SELECT * FROM supplier_product_prices 
         WHERE (? = 1 OR is_active = 1)
           AND (? = 0 OR supplier_id = ?)
           AND (? = 0 OR product_id = ?)
         ORDER BY valid_from DESC
         LIMIT ? OFFSET ?",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(sup_filter)
    .bind(sup_filter)
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

pub async fn create_supplier_price(
    db: &DepotDb,
    input: CreateSupplierProductPriceInput,
) -> CoreResult<SupplierProductPriceDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    if input.supplier_id <= 0 {
        return Err(CoreError::Validation(
            "L'ID du fournisseur est obligatoire.".to_string(),
        ));
    }
    if input.price_fcfa < 0 {
        return Err(CoreError::Validation(
            "Le prix ne peut pas être négatif.".to_string(),
        ));
    }
    let currency = input.currency.unwrap_or_else(|| "XOF".to_string());
    let (_guard, mut tx) = db.begin_write().await?;
    let id = sqlx::query(
        "INSERT INTO supplier_product_prices (supplier_id, product_id, variant_id, price_fcfa, currency, valid_from, valid_to, min_order_qty, lead_time_days, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(input.supplier_id)
    .bind(input.product_id)
    .bind(input.variant_id)
    .bind(input.price_fcfa)
    .bind(&currency)
    .bind(&input.valid_from)
    .bind(input.valid_to.as_deref())
    .bind(input.min_order_qty)
    .bind(input.lead_time_days)
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created = sqlx::query_as::<_, SupplierProductPriceDto>(
        "SELECT * FROM supplier_product_prices WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(created)
}

pub async fn update_supplier_price(
    db: &DepotDb,
    id: i64,
    input: UpdateSupplierProductPriceInput,
) -> CoreResult<SupplierProductPriceDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;

    let mut updates = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(sid) = input.supplier_id {
        updates.push("supplier_id = ?".to_string());
        binds.push(sid.to_string());
    }
    if let Some(ref p) = input.product_id {
        updates.push("product_id = ?".to_string());
        binds.push(p.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(ref v) = input.variant_id {
        updates.push("variant_id = ?".to_string());
        binds.push(v.map(|v| v.to_string()).unwrap_or_default());
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
    if let Some(c) = &input.currency {
        updates.push("currency = ?".to_string());
        binds.push(c.clone());
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
    if let Some(ref q) = input.min_order_qty {
        updates.push("min_order_qty = ?".to_string());
        binds.push(q.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(ref l) = input.lead_time_days {
        updates.push("lead_time_days = ?".to_string());
        binds.push(l.map(|v| v.to_string()).unwrap_or_default());
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
        "UPDATE supplier_product_prices SET {} WHERE id = ?",
        updates.join(", ")
    );
    let mut q = sqlx::query(&sql);
    for b in binds {
        q = q.bind(b);
    }
    q = q.bind(id);
    q.execute(&mut *tx).await?;
    tx.commit().await?;

    let updated = sqlx::query_as::<_, SupplierProductPriceDto>(
        "SELECT * FROM supplier_product_prices WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(updated)
}

pub async fn delete_supplier_price(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let result = sqlx::query("DELETE FROM supplier_product_prices WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(
            "Prix fournisseur introuvable.".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(())
}
