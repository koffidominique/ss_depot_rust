// ============================================================================
// CRUD des variantes physiques de produits (product_variants)
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::products::create_v4_helpers::{
    normalize_container_material, normalize_container_type,
};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{
    CreateProductVariantInput, PaginatedQuery, PaginatedResponse, ProductVariantDto,
    UpdateProductVariantInput,
};

const VARIANT_SELECT: &str = "SELECT id, product_id, name, sku, barcode, volume_ml, container_type,
    container_type_id, container_material, container_returnable, container_recyclable,
    container_deposit_amount, net_weight_g, bottle_profile_id, crate_type_id,
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

    let id = sqlx::query(
        "INSERT INTO product_variants (
            product_id, name, sku, barcode, volume_ml, container_type, container_type_id,
            container_material, container_returnable, container_recyclable, container_deposit_amount,
            net_weight_g, bottle_profile_id, crate_type_id, compatibility_group_id,
            disposable_packaging_id, is_active, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(input.product_id)
    .bind(clean_name)
    .bind(clean_sku)
    .bind(clean_bc)
    .bind(input.volume_ml)
    .bind(norm_type)
    .bind(input.container_type_id)
    .bind(norm_mat)
    .bind(if input.container_returnable.unwrap_or(false) { 1_i64 } else { 0_i64 })
    .bind(if input.container_recyclable.unwrap_or(false) { 1_i64 } else { 0_i64 })
    .bind(input.container_deposit_amount.unwrap_or(0))
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

pub async fn update_product_variant(
    db: &DepotDb,
    id: i64,
    input: UpdateProductVariantInput,
) -> CoreResult<ProductVariantDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let existing: Option<ProductVariantDto> =
        sqlx::query_as(&format!("{VARIANT_SELECT} WHERE id = ?"))
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let existing =
        existing.ok_or_else(|| CoreError::NotFound("Variante introuvable.".to_string()))?;

    let name = match input.name {
        Some(n) => {
            let clean = n.trim().to_string();
            if clean.is_empty() {
                return Err(CoreError::Validation("Le nom est obligatoire.".into()));
            }
            clean
        }
        None => existing.name,
    };
    let sku = match input.sku {
        Some(o) => {
            let clean = o.map(|s| s.trim().to_uppercase()).filter(|s| !s.is_empty());
            if let Some(ref s) = clean {
                let dup: Option<i64> =
                    sqlx::query_scalar("SELECT id FROM product_variants WHERE sku = ? AND id != ?")
                        .bind(s)
                        .bind(id)
                        .fetch_optional(&mut *tx)
                        .await?;
                if dup.is_some() {
                    return Err(CoreError::DuplicateOperation(format!(
                        "Ce code SKU existe déjà : {s}"
                    )));
                }
            }
            clean
        }
        None => existing.sku,
    };
    let volume_ml = input.volume_ml.unwrap_or(existing.volume_ml);
    if volume_ml.is_some_and(|v| v <= 0) {
        return Err(CoreError::Validation(
            "Le volume en ml doit être > 0.".into(),
        ));
    }
    let barcode = input
        .barcode
        .map(|o| o.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()))
        .unwrap_or(existing.barcode);
    let container_type = match input.container_type {
        Some(o) => normalize_container_type(o.as_deref()).map(str::to_string),
        None => existing.container_type,
    };
    let container_type_id = input
        .container_type_id
        .unwrap_or(existing.container_type_id);
    let container_material = match input.container_material {
        Some(o) => normalize_container_material(o.as_deref()).map(str::to_string),
        None => existing.container_material,
    };
    let container_returnable = input
        .container_returnable
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.container_returnable);
    let container_recyclable = input
        .container_recyclable
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.container_recyclable);
    let container_deposit_amount = input
        .container_deposit_amount
        .unwrap_or(existing.container_deposit_amount)
        .max(0);
    let net_weight_g = input.net_weight_g.unwrap_or(existing.net_weight_g);
    let bottle_profile_id = input
        .bottle_profile_id
        .unwrap_or(existing.bottle_profile_id);
    let crate_type_id = input.crate_type_id.unwrap_or(existing.crate_type_id);
    let compatibility_group_id = input
        .compatibility_group_id
        .unwrap_or(existing.compatibility_group_id);
    let disposable_packaging_id = input
        .disposable_packaging_id
        .unwrap_or(existing.disposable_packaging_id);
    let is_active = input
        .is_active
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.is_active);

    sqlx::query(
        "UPDATE product_variants
         SET name = ?, sku = ?, barcode = ?, volume_ml = ?, container_type = ?, container_type_id = ?,
             container_material = ?, container_returnable = ?, container_recyclable = ?, container_deposit_amount = ?,
             net_weight_g = ?, bottle_profile_id = ?, crate_type_id = ?, compatibility_group_id = ?,
             disposable_packaging_id = ?, is_active = ?, updated_at = datetime('now')
         WHERE id = ?",
    )
    .bind(&name)
    .bind(&sku)
    .bind(&barcode)
    .bind(volume_ml)
    .bind(&container_type)
    .bind(container_type_id)
    .bind(&container_material)
    .bind(container_returnable)
    .bind(container_recyclable)
    .bind(container_deposit_amount)
    .bind(net_weight_g)
    .bind(bottle_profile_id)
    .bind(crate_type_id)
    .bind(compatibility_group_id)
    .bind(disposable_packaging_id)
    .bind(is_active)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    let updated = sqlx::query_as::<_, ProductVariantDto>(&format!("{VARIANT_SELECT} WHERE id = ?"))
        .bind(id)
        .fetch_one(&db.pool)
        .await?;
    Ok(updated)
}

pub async fn delete_product_variant(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let used: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sale_lines WHERE variant_id = ?")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
    if used > 0 {
        sqlx::query(
            "UPDATE product_variants SET is_active = 0, updated_at = datetime('now') WHERE id = ?",
        )
        .bind(id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        return Ok(());
    }
    let result = sqlx::query("DELETE FROM product_variants WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound("Variante introuvable.".to_string()));
    }
    tx.commit().await?;
    Ok(())
}
