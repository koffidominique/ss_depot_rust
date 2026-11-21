// ============================================================================
// Mise à jour et suppression/archivage des variantes (product_variants)
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::orders::{compute_compatibility_class, compute_native_crate_capacity};
use crate::application::products::create_v4_helpers::{
    normalize_container_material, normalize_container_type,
};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::product_variants::VARIANT_SELECT;
use super::{ProductVariantDto, UpdateProductVariantInput};

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
    let compat_class = compute_compatibility_class(container_type.as_deref(), volume_ml);
    let native_cap = compute_native_crate_capacity(container_type.as_deref(), volume_ml);

    sqlx::query(
        "UPDATE product_variants
         SET name = ?, sku = ?, barcode = ?, volume_ml = ?, container_type = ?, container_type_id = ?,
             container_material = ?, container_returnable = ?, container_recyclable = ?, container_deposit_amount = ?,
             native_crate_capacity = ?, compatibility_class = ?,
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
    .bind(native_cap)
    .bind(&compat_class)
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
