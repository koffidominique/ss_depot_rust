// ============================================================================
// Requêtes de lecture produits, catégories et hydratation conditionnements
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{
    CategoryDto, DepositComponentDto, PackagingRow, PaginatedProductsDto, ProductPackagingDto,
    ProductRow, ProductSummaryDto,
};

pub async fn list_categories(db: &DepotDb) -> CoreResult<Vec<CategoryDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let rows = sqlx::query_as::<_, CategoryDto>(
        "SELECT id, name, description, is_active FROM categories ORDER BY name ASC",
    )
    .fetch_all(&db.pool)
    .await?;
    Ok(rows)
}

pub async fn create_category(
    db: &DepotDb,
    name: &str,
    description: Option<&str>,
) -> CoreResult<CategoryDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let clean = name.trim();
    if clean.is_empty() {
        return Err(CoreError::Validation(
            "Le nom de la catégorie est obligatoire.".to_string(),
        ));
    }
    let (_guard, mut tx) = db.begin_write().await?;
    let dup: Option<(i64,)> =
        sqlx::query_as("SELECT id FROM categories WHERE lower(name) = lower(?)")
            .bind(clean)
            .fetch_optional(&mut *tx)
            .await?;
    if dup.is_some() {
        return Err(CoreError::DuplicateOperation(
            "Cette catégorie existe déjà.".to_string(),
        ));
    }
    let id = sqlx::query("INSERT INTO categories (name, description) VALUES (?, ?)")
        .bind(clean)
        .bind(description.map(str::trim).filter(|s| !s.is_empty()))
        .execute(&mut *tx)
        .await?
        .last_insert_rowid();
    tx.commit().await?;

    let created = sqlx::query_as::<_, CategoryDto>(
        "SELECT id, name, description, is_active FROM categories WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(created)
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
           AND (? = 0 OR p.category_id = ?)
           AND (? = 0 OR p.stock_milli <= p.min_stock_milli)
           AND (? = 0 OR (
             p.name LIKE ? OR p.reference LIKE ? OR COALESCE(p.barcode, '') LIKE ?
             OR COALESCE(p.brand, '') LIKE ?
             OR EXISTS (SELECT 1 FROM product_packagings pk WHERE pk.product_id = p.id AND pk.barcode LIKE ?)
           ))",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(cat_filter)
    .bind(cat_filter)
    .bind(if low_stock_only { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .bind(&pattern)
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, ProductRow>(
        "SELECT p.id, p.reference, p.barcode, p.name, p.brand, p.brand_id,
                b.brewery_id, br.name AS brewery_name, p.variant_id,
                pv.name AS variant_name, pv.volume_ml, pv.container_type, pv.alcohol_degree,
                pv.bottle_profile_id, pv.crate_type_id, pv.compatibility_group_id,
                p.category_id, c.name AS category_name,
                p.supplier_id, s.name AS supplier_name, p.description, p.base_unit,
                p.stock_milli, p.min_stock_milli, p.max_stock_milli, p.average_cost_num, p.average_cost_den,
                p.purchase_price, p.wholesale_price, p.semi_wholesale_price, p.retail_price, p.image_path, p.is_active
         FROM products p
         JOIN categories c ON c.id = p.category_id
         LEFT JOIN suppliers s ON s.id = p.supplier_id
         LEFT JOIN brands b ON b.id = p.brand_id
         LEFT JOIN breweries br ON br.id = b.brewery_id
         LEFT JOIN product_variants pv ON pv.id = p.variant_id
         WHERE (? = 1 OR p.is_active = 1)
           AND (? = 0 OR p.category_id = ?)
           AND (? = 0 OR p.stock_milli <= p.min_stock_milli)
           AND (? = 0 OR (
             p.name LIKE ? OR p.reference LIKE ? OR COALESCE(p.barcode, '') LIKE ?
             OR COALESCE(p.brand, '') LIKE ?
             OR EXISTS (SELECT 1 FROM product_packagings pk WHERE pk.product_id = p.id AND pk.barcode LIKE ?)
           ))
         ORDER BY p.is_active DESC, p.name ASC
         LIMIT ? OFFSET ?",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(cat_filter)
    .bind(cat_filter)
    .bind(if low_stock_only { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
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

async fn hydrate_products(
    db: &DepotDb,
    rows: Vec<ProductRow>,
) -> CoreResult<Vec<ProductSummaryDto>> {
    let mut items = Vec::with_capacity(rows.len());
    for prod in rows {
        let pkg_rows = sqlx::query_as::<_, PackagingRow>(
            "SELECT pk.id, pk.product_id, pk.name, pk.base_unit, pk.coefficient_milli,
                    pk.purchase_price, pk.wholesale_price, pk.semi_wholesale_price, pk.retail_price,
                    pk.barcode, pk.allow_fraction, pk.is_active, dp.mode AS deposit_mode
             FROM product_packagings pk
             LEFT JOIN deposit_packaging_profiles dp ON dp.packaging_id = pk.id
             WHERE pk.product_id = ?
             ORDER BY pk.coefficient_milli ASC",
        )
        .bind(prod.id)
        .fetch_all(&db.pool)
        .await?;

        let mut packagings = Vec::with_capacity(pkg_rows.len());
        for pk in pkg_rows {
            let comps = sqlx::query_as::<_, DepositComponentDto>(
                "SELECT dpc.returnable_id, dpc.pieces_per_pack, rpt.code, rpt.name, rpt.deposit_value, rpt.kind
                 FROM deposit_packaging_components dpc
                 JOIN returnable_packaging_types rpt ON rpt.id = dpc.returnable_id
                 WHERE dpc.packaging_id = ?",
            )
            .bind(pk.id)
            .fetch_all(&db.pool)
            .await?;

            packagings.push(ProductPackagingDto {
                id: pk.id,
                product_id: pk.product_id,
                name: pk.name,
                base_unit: pk.base_unit,
                coefficient_milli: pk.coefficient_milli,
                purchase_price: pk.purchase_price,
                wholesale_price: pk.wholesale_price,
                semi_wholesale_price: pk.semi_wholesale_price,
                retail_price: pk.retail_price,
                barcode: pk.barcode,
                allow_fraction: pk.allow_fraction,
                is_active: pk.is_active,
                deposit_mode: pk.deposit_mode,
                components: comps,
            });
        }

        let avg_cost = prod
            .average_cost_num
            .as_deref()
            .and_then(|n| n.parse::<i128>().ok())
            .zip(
                prod.average_cost_den
                    .as_deref()
                    .and_then(|d| d.parse::<i128>().ok()),
            )
            .and_then(|(num, den)| {
                if den > 0 {
                    Some(((num + den / 2) / den) as i64)
                } else {
                    None
                }
            });

        items.push(ProductSummaryDto {
            id: prod.id,
            reference: prod.reference,
            barcode: prod.barcode,
            name: prod.name,
            brand: prod.brand,
            brand_id: prod.brand_id,
            brewery_id: prod.brewery_id,
            brewery_name: prod.brewery_name,
            variant_id: prod.variant_id,
            variant_name: prod.variant_name,
            volume_ml: prod.volume_ml,
            container_type: prod.container_type,
            alcohol_degree: prod.alcohol_degree,
            bottle_profile_id: prod.bottle_profile_id,
            crate_type_id: prod.crate_type_id,
            compatibility_group_id: prod.compatibility_group_id,
            category_id: prod.category_id,
            category_name: prod.category_name,
            supplier_id: prod.supplier_id,
            supplier_name: prod.supplier_name,
            description: prod.description,
            base_unit: prod.base_unit,
            stock_milli: prod.stock_milli,
            min_stock_milli: prod.min_stock_milli,
            max_stock_milli: prod.max_stock_milli,
            average_cost_fcfa: avg_cost,
            purchase_price: prod.purchase_price,
            wholesale_price: prod.wholesale_price,
            semi_wholesale_price: prod.semi_wholesale_price,
            retail_price: prod.retail_price,
            image_path: prod.image_path,
            is_active: prod.is_active,
            packagings,
        });
    }
    Ok(items)
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

pub(crate) async fn get_product_by_id(db: &DepotDb, id: i64) -> CoreResult<ProductSummaryDto> {
    let row = sqlx::query_as::<_, ProductRow>(
        "SELECT p.id, p.reference, p.barcode, p.name, p.brand, p.brand_id,
                b.brewery_id, br.name AS brewery_name, p.variant_id,
                pv.name AS variant_name, pv.volume_ml, pv.container_type, pv.alcohol_degree,
                pv.bottle_profile_id, pv.crate_type_id, pv.compatibility_group_id,
                p.category_id, c.name AS category_name,
                p.supplier_id, s.name AS supplier_name, p.description, p.base_unit,
                p.stock_milli, p.min_stock_milli, p.max_stock_milli, p.average_cost_num, p.average_cost_den,
                p.purchase_price, p.wholesale_price, p.semi_wholesale_price, p.retail_price, p.image_path, p.is_active
         FROM products p
         JOIN categories c ON c.id = p.category_id
         LEFT JOIN suppliers s ON s.id = p.supplier_id
         LEFT JOIN brands b ON b.id = p.brand_id
         LEFT JOIN breweries br ON br.id = b.brewery_id
         LEFT JOIN product_variants pv ON pv.id = p.variant_id
         WHERE p.id = ?",
    )
    .bind(id)
    .fetch_optional(&db.pool)
    .await?
    .ok_or_else(|| CoreError::Validation("Produit introuvable.".to_string()))?;

    let mut items = hydrate_products(db, vec![row]).await?;
    items
        .pop()
        .ok_or_else(|| CoreError::Validation("Produit introuvable.".to_string()))
}
