// ============================================================================
// CRUD des variantes physiques de produits (product_variants)
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::orders::{compute_compatibility_class, compute_native_crate_capacity};
use crate::application::products::create_v4_helpers::{
    normalize_container_material, normalize_container_type,
};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{CreateProductVariantInput, PaginatedQuery, PaginatedResponse, ProductVariantDto};

pub(super) const VARIANT_SELECT: &str =
    "SELECT id, product_id, name, sku, barcode, volume_ml, container_type,
    container_type_id, container_material, container_returnable, container_recyclable,
    container_deposit_amount, native_crate_capacity, compatibility_class,
    net_weight_g, bottle_profile_id, crate_type_id,
    compatibility_group_id, disposable_packaging_id, is_active, created_at, updated_at
    FROM product_variants";

pub async fn list_product_variants(
    db: &DepotDb,
    query: PaginatedQuery,
    product_id: Option<i64>,
) -> CoreResult<PaginatedResponse<ProductVariantDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let pattern = format!("%{}%", search.trim());
    let has_search = !search.trim().is_empty();
    let prod_filter = product_id.unwrap_or(0);

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM product_variants
         WHERE (? = 1 OR is_active = 1)
           AND (? = 0 OR product_id = ?)
           AND (? = 0 OR name LIKE ? OR COALESCE(sku, '') LIKE ? OR COALESCE(barcode, '') LIKE ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(prod_filter)
    .bind(prod_filter)
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let sql = format!(
        "{VARIANT_SELECT}
         WHERE (? = 1 OR is_active = 1)
           AND (? = 0 OR product_id = ?)
           AND (? = 0 OR name LIKE ? OR COALESCE(sku, '') LIKE ? OR COALESCE(barcode, '') LIKE ?)
         ORDER BY name ASC LIMIT ? OFFSET ?"
    );
    let rows = sqlx::query_as::<_, ProductVariantDto>(&sql)
        .bind(if include_archived { 1_i64 } else { 0_i64 })
        .bind(prod_filter)
        .bind(prod_filter)
        .bind(if has_search { 1_i64 } else { 0_i64 })
        .bind(&pattern)
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

pub async fn create_product_variant(
    db: &DepotDb,
    input: CreateProductVariantInput,
) -> CoreResult<ProductVariantDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let clean_name = input.name.trim();
    if clean_name.is_empty() {
        return Err(CoreError::Validation("Le nom est obligatoire.".to_string()));
    }
    if input.product_id <= 0 {
        return Err(CoreError::Validation(
            "L'ID du produit est obligatoire.".to_string(),
        ));
    }
    if let Some(v) = input.volume_ml {
        if v <= 0 {
            return Err(CoreError::Validation(
                "Le volume en ml doit être strictement positif.".to_string(),
            ));
        }
    }
    if input.container_deposit_amount.unwrap_or(0) < 0 {
        return Err(CoreError::Validation(
            "La consigne contenant ne peut pas être négative.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    let prod_exists: Option<i64> = sqlx::query_scalar("SELECT id FROM products WHERE id = ?")
        .bind(input.product_id)
        .fetch_optional(&mut *tx)
        .await?;
    if prod_exists.is_none() {
        return Err(CoreError::Validation(
            "Produit parent introuvable.".to_string(),
        ));
    }

    let clean_sku = input
        .sku
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_uppercase);
    if let Some(ref sku) = clean_sku {
        let dup: Option<i64> = sqlx::query_scalar(
            "SELECT id FROM product_variants WHERE sku = ? UNION SELECT id FROM products WHERE reference = ?",
        )
        .bind(sku)
        .bind(sku)
        .fetch_optional(&mut *tx)
        .await?;
        if dup.is_some() {
            return Err(CoreError::DuplicateOperation(format!(
                "Ce code SKU existe déjà : {sku}"
            )));
        }
    }

    let clean_bc = input
        .barcode
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if let Some(bc) = clean_bc {
        let dup: Option<i64> = sqlx::query_scalar(
            "SELECT id FROM product_variants WHERE barcode = ? UNION SELECT id FROM products WHERE barcode = ?",
        )
        .bind(bc)
        .bind(bc)
        .fetch_optional(&mut *tx)
        .await?;
        if dup.is_some() {
            return Err(CoreError::DuplicateOperation(format!(
                "Code-barres déjà utilisé : {bc}"
            )));
        }
    }

    let norm_type = normalize_container_type(input.container_type.as_deref());
    let norm_mat = normalize_container_material(input.container_material.as_deref());
    let compat_class = compute_compatibility_class(norm_type, input.volume_ml);
    let native_cap = compute_native_crate_capacity(norm_type, input.volume_ml);

    let id = sqlx::query(
        "INSERT INTO product_variants (
            product_id, name, sku, barcode, volume_ml, container_type, container_type_id,
            container_material, container_returnable, container_recyclable, container_deposit_amount,
            native_crate_capacity, compatibility_class,
            net_weight_g, bottle_profile_id, crate_type_id, compatibility_group_id,
            disposable_packaging_id, is_active, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(input.product_id)
    .bind(clean_name)
    .bind(clean_sku)
    .bind(clean_bc)
    .bind(input.volume_ml)
    .bind(norm_type)
    .bind(input.container_type_id)
    .bind(norm_mat)
    .bind(if input.container_returnable.unwrap_or(false) {
        1_i64
    } else {
        0_i64
    })
    .bind(if input.container_recyclable.unwrap_or(false) {
        1_i64
    } else {
        0_i64
    })
    .bind(input.container_deposit_amount.unwrap_or(0))
    .bind(native_cap)
    .bind(&compat_class)
    .bind(input.net_weight_g)
    .bind(input.bottle_profile_id)
    .bind(input.crate_type_id)
    .bind(input.compatibility_group_id)
    .bind(input.disposable_packaging_id)
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created = sqlx::query_as::<_, ProductVariantDto>(&format!("{VARIANT_SELECT} WHERE id = ?"))
        .bind(id)
        .fetch_one(&db.pool)
        .await?;
    Ok(created)
}
