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
         ORDER BY valid_from DESC LIMIT ? OFFSET ?",
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
    if input.purchase_price < 0 {
        return Err(CoreError::Validation(
            "Le prix ne peut pas être négatif.".to_string(),
        ));
    }
    let (_guard, mut tx) = db.begin_write().await?;
    let id = sqlx::query(
        "INSERT INTO supplier_product_prices (supplier_id, product_id, packaging_id, purchase_price, packaging_value, fees, valid_from, valid_to, source, is_active)
         VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, date('now')), ?, ?, ?)",
    )
    .bind(input.supplier_id)
    .bind(input.product_id)
    .bind(input.packaging_id)
    .bind(input.purchase_price)
    .bind(input.packaging_value.unwrap_or(0))
    .bind(input.fees.unwrap_or(0))
    .bind(input.valid_from.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.valid_to.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.source.as_deref().unwrap_or("manual"))
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    sqlx::query(
        "INSERT INTO price_history (entity_type, entity_id, supplier_id, price_type, new_price, new_packaging_value, currency, effective_from, reason)
         VALUES ('supplier_price', ?, ?, 'PURCHASE', ?, ?, 'FCFA', datetime('now'), 'Nouveau tarif fournisseur')",
    )
    .bind(id)
    .bind(input.supplier_id)
    .bind(input.purchase_price)
    .bind(input.packaging_value.unwrap_or(0))
    .execute(&mut *tx)
    .await?;
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
    let existing: Option<SupplierProductPriceDto> =
        sqlx::query_as("SELECT * FROM supplier_product_prices WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let existing =
        existing.ok_or_else(|| CoreError::NotFound("Tarif fournisseur introuvable.".into()))?;

    let purchase_price = input.purchase_price.unwrap_or(existing.purchase_price);
    if purchase_price < 0 {
        return Err(CoreError::Validation(
            "Le prix ne peut pas être négatif.".to_string(),
        ));
    }
    let packaging_value = input.packaging_value.unwrap_or(existing.packaging_value);
    let fees = input.fees.unwrap_or(existing.fees);
    let valid_from = input.valid_from.unwrap_or(existing.valid_from);
    let valid_to = input.valid_to.unwrap_or(existing.valid_to);
    let source = input.source.unwrap_or(existing.source);
    let is_active = input
        .is_active
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.is_active);

    sqlx::query(
        "UPDATE supplier_product_prices
         SET purchase_price = ?, packaging_value = ?, fees = ?, valid_from = ?, valid_to = ?, source = ?, is_active = ?
         WHERE id = ?",
    )
    .bind(purchase_price)
    .bind(packaging_value)
    .bind(fees)
    .bind(&valid_from)
    .bind(&valid_to)
    .bind(&source)
    .bind(is_active)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    if purchase_price != existing.purchase_price || packaging_value != existing.packaging_value {
        sqlx::query(
            "INSERT INTO price_history (entity_type, entity_id, supplier_id, price_type, old_price, new_price, old_packaging_value, new_packaging_value, currency, effective_from, reason)
             VALUES ('supplier_price', ?, ?, 'PURCHASE', ?, ?, ?, ?, 'FCFA', datetime('now'), 'Mise à jour tarif fournisseur')",
        )
        .bind(id)
        .bind(existing.supplier_id)
        .bind(existing.purchase_price)
        .bind(purchase_price)
        .bind(existing.packaging_value)
        .bind(packaging_value)
        .execute(&mut *tx)
        .await?;
    }
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
            "Tarif fournisseur introuvable.".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(())
}
