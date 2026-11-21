// ============================================================================
// Requêtes de lecture produits, catégories hiérarchiques & archivage sécurisé
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::hydrate::hydrate_products;
use super::{PaginatedProductsDto, ProductRow, ProductSummaryDto};

const PRODUCT_SELECT: &str = "SELECT p.id, p.reference, p.barcode, p.name, p.brand,
    p.brewery_id, brw.name AS brewery_name, p.brand_id, p.variant_id, p.variant_label,
    p.category_id, c.name AS category_name, p.subcategory_id, sc.name AS subcategory_name,
    p.supplier_id, s.name AS supplier_name, p.description,
    p.alcohol_degree_milli, p.is_alcoholic, p.ingredients, p.beverage_color,
    p.storage_temp, p.shelf_life_days, p.is_perishable, p.track_batches, p.track_expiry,
    p.allow_credit_sale, p.allow_unit_sale, p.allow_mixed_sale, p.default_location_id,
    p.status, p.base_unit, p.stock_milli, p.min_stock_milli, p.max_stock_milli,
    p.average_cost_num, p.average_cost_den, p.purchase_price, p.wholesale_price,
    p.semi_wholesale_price, p.retail_price, p.image_path, p.is_active
 FROM products p
 JOIN categories c ON c.id = p.category_id
 LEFT JOIN categories sc ON sc.id = p.subcategory_id
 LEFT JOIN breweries brw ON brw.id = p.brewery_id
 LEFT JOIN suppliers s ON s.id = p.supplier_id";

pub async fn delete_or_archive_product(db: &DepotDb, id: i64) -> CoreResult<bool> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let has_tx: i64 = sqlx::query_scalar(
        "SELECT (SELECT COUNT(*) FROM sale_lines WHERE product_id = ?)
              + (SELECT COUNT(*) FROM purchase_order_lines WHERE product_id = ?)
              + (SELECT COUNT(*) FROM stock_movements WHERE product_id = ?)",
    )
    .bind(id)
    .bind(id)
    .bind(id)
    .fetch_one(&mut *tx)
    .await?;
    if has_tx > 0 {
        sqlx::query(
            "UPDATE products SET is_active = 0, status = 'inactive', updated_at = datetime('now') WHERE id = ?",
        )
        .bind(id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        return Ok(false);
    }
    sqlx::query("DELETE FROM deposit_packaging_components WHERE packaging_id IN (SELECT id FROM product_packagings WHERE product_id = ?)")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM deposit_packaging_profiles WHERE packaging_id IN (SELECT id FROM product_packagings WHERE product_id = ?)")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM product_packagings WHERE product_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM product_variants WHERE product_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    let res = sqlx::query("DELETE FROM products WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if res.rows_affected() == 0 {
        return Err(CoreError::NotFound("Produit introuvable.".to_string()));
    }
    tx.commit().await?;
    Ok(true)
}

pub async fn list_products(
    db: &DepotDb,
    search: Option<&str>,
    category_id: Option<i64>,
    include_archived: bool,
    low_stock_only: bool,
    page: i64,
    page_size: i64,
) -> CoreResult<PaginatedProductsDto> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = page.max(1);
    let ps = page_size.clamp(1, 100);
    let offset = (p - 1) * ps;
    let pattern = format!("%{}%", search.unwrap_or("").trim());
    let has_search = !search.unwrap_or("").trim().is_empty();
    let cat_filter = category_id.unwrap_or(0);

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM products p
         WHERE (? = 1 OR p.is_active = 1)
           AND (? = 0 OR p.category_id = ? OR p.subcategory_id = ?)
           AND (? = 0 OR p.stock_milli <= p.min_stock_milli)
           AND (? = 0 OR (
             p.name LIKE ? OR p.reference LIKE ? OR COALESCE(p.barcode, '') LIKE ?
             OR COALESCE(p.brand, '') LIKE ?
             OR EXISTS (SELECT 1 FROM product_packagings pk WHERE pk.product_id = p.id AND pk.barcode LIKE ?)
             OR EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND (pv.sku LIKE ? OR COALESCE(pv.barcode, '') LIKE ?))
           ))",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(cat_filter)
    .bind(cat_filter)
    .bind(cat_filter)
    .bind(if low_stock_only { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .bind(&pattern)
    .bind(&pattern)
    .bind(&pattern)
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let sql = format!(
        "{PRODUCT_SELECT}
         WHERE (? = 1 OR p.is_active = 1)
           AND (? = 0 OR p.category_id = ? OR p.subcategory_id = ?)
           AND (? = 0 OR p.stock_milli <= p.min_stock_milli)
           AND (? = 0 OR (
             p.name LIKE ? OR p.reference LIKE ? OR COALESCE(p.barcode, '') LIKE ?
             OR COALESCE(p.brand, '') LIKE ?
             OR EXISTS (SELECT 1 FROM product_packagings pk WHERE pk.product_id = p.id AND pk.barcode LIKE ?)
             OR EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND (pv.sku LIKE ? OR COALESCE(pv.barcode, '') LIKE ?))
           ))
         ORDER BY p.is_active DESC, p.name ASC
         LIMIT ? OFFSET ?"
    );
    let rows = sqlx::query_as::<_, ProductRow>(&sql)
        .bind(if include_archived { 1_i64 } else { 0_i64 })
        .bind(cat_filter)
        .bind(cat_filter)
        .bind(cat_filter)
        .bind(if low_stock_only { 1_i64 } else { 0_i64 })
        .bind(if has_search { 1_i64 } else { 0_i64 })
        .bind(&pattern)
        .bind(&pattern)
        .bind(&pattern)
        .bind(&pattern)
        .bind(&pattern)
        .bind(&pattern)
        .bind(&pattern)
        .bind(ps)
        .bind(offset)
        .fetch_all(&db.pool)
        .await?;

    let items = hydrate_products(db, rows).await?;
    let total_pages = ((total + ps - 1) / ps).max(1);
    Ok(PaginatedProductsDto {
        items,
        total,
        page: p,
        page_size: ps,
        total_pages,
    })
}

pub async fn list_active_products(
    db: &DepotDb,
    search: Option<&str>,
    limit: i64,
    offset: i64,
) -> CoreResult<Vec<ProductSummaryDto>> {
    let page = (offset / limit.max(1)) + 1;
    let res = list_products(db, search, None, false, false, page, limit).await?;
    Ok(res.items)
}

pub async fn get_product_by_id(db: &DepotDb, id: i64) -> CoreResult<ProductSummaryDto> {
    let row = sqlx::query_as::<_, ProductRow>(&format!("{PRODUCT_SELECT} WHERE p.id = ?"))
        .bind(id)
        .fetch_optional(&db.pool)
        .await?
        .ok_or_else(|| CoreError::Validation("Produit introuvable.".to_string()))?;
    hydrate_products(db, vec![row])
        .await?
        .pop()
        .ok_or_else(|| CoreError::Validation("Produit introuvable.".to_string()))
}
