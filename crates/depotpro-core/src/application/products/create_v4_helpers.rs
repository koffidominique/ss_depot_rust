// ============================================================================
// Helpers V4 atomiques pour création produit (variante, unités, fournisseurs, stock)
// ============================================================================

use sqlx::{Sqlite, Transaction};

use crate::application::orders::{compute_compatibility_class, compute_native_crate_capacity};
use crate::error::{CoreError, CoreResult};

use super::v4_types::InitialVariantInput;

pub(crate) async fn validate_brewery_and_brand_tx(
    tx: &mut Transaction<'_, Sqlite>,
    brewery_id: Option<i64>,
    brand_id: Option<i64>,
) -> CoreResult<Option<String>> {
    if let Some(bid) = brewery_id {
        let ok: Option<i64> = sqlx::query_scalar("SELECT id FROM breweries WHERE id = ?")
            .bind(bid)
            .fetch_optional(&mut **tx)
            .await?;
        if ok.is_none() {
            return Err(CoreError::Validation(
                "Brasserie / fabricant introuvable.".to_string(),
            ));
        }
    }
    if let Some(br_id) = brand_id {
        let row: Option<(String, Option<i64>)> =
            sqlx::query_as("SELECT name, brewery_id FROM brands WHERE id = ?")
                .bind(br_id)
                .fetch_optional(&mut **tx)
                .await?;
        let (brand_name, brand_brewery_id) =
            row.ok_or_else(|| CoreError::Validation("Marque introuvable.".to_string()))?;
        if let (Some(sel_brewery), Some(owner_brewery)) = (brewery_id, brand_brewery_id) {
            if sel_brewery != owner_brewery {
                return Err(CoreError::Validation(
                    "La marque sélectionnée n'appartient pas au fabricant choisi.".to_string(),
                ));
            }
        }
        return Ok(Some(brand_name));
    }
    Ok(None)
}

pub(crate) fn normalize_container_type(raw: Option<&str>) -> Option<&'static str> {
    let trimmed = raw?.trim().to_lowercase();
    if trimmed.is_empty() {
        return None;
    }
    match trimmed.as_str() {
        "glass_returnable" | "ct-glass-ret" => Some("glass_returnable"),
        "glass_disposable" | "ct-glass-disp" => Some("glass_disposable"),
        "pet" | "ct-pet" => Some("pet"),
        "can" | "ct-can" | "canette" => Some("can"),
        "plastic_bottle" | "plastique" => Some("plastic_bottle"),
        "other" | "ct-other" | "ct-keg" | "ct-tetra" | "ct-pouch" => Some("other"),
        s if s.contains("verre") && s.contains("consign") => Some("glass_returnable"),
        s if s.contains("verre") => Some("glass_disposable"),
        s if s.contains("pet") => Some("pet"),
        s if s.contains("can") || s.contains("alu") => Some("can"),
        s if s.contains("plast") => Some("plastic_bottle"),
        _ => Some("other"),
    }
}

pub(crate) fn normalize_container_material(raw: Option<&str>) -> Option<&'static str> {
    let trimmed = raw?.trim().to_lowercase();
    if trimmed.is_empty() {
        return None;
    }
    match trimmed.as_str() {
        "glass" | "verre" => Some("glass"),
        "pet" => Some("pet"),
        "aluminium" | "aluminum" | "alu" => Some("aluminium"),
        "carton" | "brique" | "tetra" | "tetrapak" => Some("carton"),
        "plastic" | "plastique" => Some("plastic"),
        _ => Some("other"),
    }
}

pub(crate) async fn create_initial_variant_tx(
    tx: &mut Transaction<'_, Sqlite>,
    product_id: i64,
    product_name: &str,
    variant: &InitialVariantInput,
) -> CoreResult<i64> {
    if variant.volume_ml <= 0 {
        return Err(CoreError::Validation(
            "Le volume du contenant en ml doit être strictement positif.".to_string(),
        ));
    }
    if variant.container_deposit_amount.unwrap_or(0) < 0 {
        return Err(CoreError::Validation(
            "La consigne contenant ne peut pas être négative.".to_string(),
        ));
    }
    let clean_sku = variant
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
        .fetch_optional(&mut **tx)
        .await?;
        if dup.is_some() {
            return Err(CoreError::DuplicateOperation(format!(
                "Code SKU variante déjà utilisé : {sku}"
            )));
        }
    }
    let clean_bc = variant
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
        .fetch_optional(&mut **tx)
        .await?;
        if dup.is_some() {
            return Err(CoreError::DuplicateOperation(format!(
                "Code-barres variante déjà utilisé : {bc}"
            )));
        }
    }

    let vname = variant
        .name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("{product_name} — {} ml", variant.volume_ml));

    let norm_type = normalize_container_type(variant.container_type.as_deref());
    let norm_mat = normalize_container_material(variant.container_material.as_deref());
    let compat_class = compute_compatibility_class(norm_type, Some(variant.volume_ml));
    let native_cap = compute_native_crate_capacity(norm_type, Some(variant.volume_ml));

    if let Some(ct_id) = variant.container_type_id {
        let brand_id: Option<i64> =
            sqlx::query_scalar("SELECT brand_id FROM products WHERE id = ?")
                .bind(product_id)
                .fetch_optional(&mut **tx)
                .await?
                .flatten();
        if let Some(bid) = brand_id {
            let dup: Option<i64> = sqlx::query_scalar(
                "SELECT pv.id FROM product_variants pv
                 JOIN products p ON p.id = pv.product_id
                 WHERE p.brand_id = ? AND pv.volume_ml = ? AND pv.container_type_id = ?
                   AND p.is_active = 1 AND pv.is_active = 1 AND pv.product_id != ?",
            )
            .bind(bid)
            .bind(variant.volume_ml)
            .bind(ct_id)
            .bind(product_id)
            .fetch_optional(&mut **tx)
            .await?;
            if dup.is_some() {
                return Err(CoreError::DuplicateOperation(
                    "Une variante active identique (marque, volume, contenant) existe déjà."
                        .to_string(),
                ));
            }
        }
    }

    let variant_id = sqlx::query(
        "INSERT INTO product_variants (
            product_id, name, sku, barcode, volume_ml, container_type, container_type_id,
            container_material, container_returnable, container_recyclable, container_deposit_amount,
            native_crate_capacity, compatibility_class
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(product_id)
    .bind(&vname)
    .bind(clean_sku)
    .bind(clean_bc)
    .bind(variant.volume_ml)
    .bind(norm_type)
    .bind(variant.container_type_id)
    .bind(norm_mat)
    .bind(if variant.container_returnable.unwrap_or(false) {
        1_i64
    } else {
        0_i64
    })
    .bind(if variant.container_recyclable.unwrap_or(false) {
        1_i64
    } else {
        0_i64
    })
    .bind(variant.container_deposit_amount.unwrap_or(0))
    .bind(native_cap)
    .bind(&compat_class)
    .execute(&mut **tx)
    .await?
    .last_insert_rowid();

    sqlx::query("UPDATE products SET variant_id = ? WHERE id = ?")
        .bind(variant_id)
        .bind(product_id)
        .execute(&mut **tx)
        .await?;

    Ok(variant_id)
}
