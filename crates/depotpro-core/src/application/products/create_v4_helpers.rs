// ============================================================================
// Helpers V4 atomiques pour création produit (variante, unités, fournisseurs, stock)
// ============================================================================

use sqlx::{Sqlite, Transaction};

use crate::error::{CoreError, CoreResult};

use super::v4_types::{InitialProductSupplierInput, InitialSalesUnitInput, InitialVariantInput};

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

    let variant_id = sqlx::query(
        "INSERT INTO product_variants (
            product_id, name, sku, barcode, volume_ml, container_type, container_type_id,
            container_material, container_returnable, container_recyclable, container_deposit_amount
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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

pub(crate) async fn create_initial_sales_units_tx(
    tx: &mut Transaction<'_, Sqlite>,
    product_id: i64,
    variant_id: Option<i64>,
    default_pkg_id: Option<i64>,
    units: &[InitialSalesUnitInput],
) -> CoreResult<()> {
    for u in units {
        let label = u.label.trim();
        if label.is_empty() {
            return Err(CoreError::Validation(
                "Le libellé d'une unité de vente est obligatoire.".to_string(),
            ));
        }
        if u.conversion_factor <= 0 {
            return Err(CoreError::Validation(format!(
                "Conversion invalide pour l'unité \"{label}\"."
            )));
        }
        for p in [
            u.purchase_price,
            u.wholesale_price,
            u.semi_wholesale_price,
            u.retail_price,
            u.min_selling_price,
            u.bottle_deposit_amount,
            u.crate_deposit_amount,
        ]
        .into_iter()
        .flatten()
        {
            if p < 0 {
                return Err(CoreError::Validation(format!(
                    "Montant négatif interdit sur l'unité \"{label}\"."
                )));
            }
        }
        let clean_bc = u.barcode.as_deref().map(str::trim).filter(|s| !s.is_empty());
        let su_id = sqlx::query(
            "INSERT INTO sales_units (
                product_id, variant_id, packaging_id, label, unit_type, conversion_factor,
                is_virtual, allow_fraction, purchase_price, wholesale_price, semi_wholesale_price,
                retail_price, min_selling_price, bottle_deposit_amount, crate_deposit_amount,
                barcode, is_default_sale, is_default_purchase
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(product_id)
        .bind(variant_id)
        .bind(default_pkg_id)
        .bind(label)
        .bind(&u.unit_type)
        .bind(u.conversion_factor)
        .bind(if u.is_virtual.unwrap_or(false) { 1_i64 } else { 0_i64 })
        .bind(if u.allow_fraction.unwrap_or(false) { 1_i64 } else { 0_i64 })
        .bind(u.purchase_price)
        .bind(u.wholesale_price)
        .bind(u.semi_wholesale_price)
        .bind(u.retail_price)
        .bind(u.min_selling_price)
        .bind(u.bottle_deposit_amount.unwrap_or(0))
        .bind(u.crate_deposit_amount.unwrap_or(0))
        .bind(clean_bc)
        .bind(if u.is_default_sale.unwrap_or(false) { 1_i64 } else { 0_i64 })
        .bind(if u.is_default_purchase.unwrap_or(false) { 1_i64 } else { 0_i64 })
        .execute(&mut **tx)
        .await?
        .last_insert_rowid();

        for (ptype, amt) in [
            ("PURCHASE", u.purchase_price),
            ("WHOLESALE", u.wholesale_price),
            ("RETAIL", u.retail_price),
            ("MINIMUM_SELLING_PRICE", u.min_selling_price),
        ] {
            if let Some(val) = amt {
                sqlx::query(
                    "INSERT INTO price_history (entity_type, entity_id, variant_id, sales_unit_id, price_type, new_price, currency, effective_from, reason)
                     VALUES ('product_packaging', ?, ?, ?, ?, ?, 'FCFA', datetime('now'), 'Création produit')",
                )
                .bind(default_pkg_id.unwrap_or(su_id))
                .bind(variant_id)
                .bind(su_id)
                .bind(ptype)
                .bind(val)
                .execute(&mut **tx)
                .await?;
            }
        }
    }
    Ok(())
}

pub(crate) async fn create_initial_product_suppliers_tx(
    tx: &mut Transaction<'_, Sqlite>,
    product_id: i64,
    suppliers: &[InitialProductSupplierInput],
) -> CoreResult<()> {
    for ps in suppliers {
        let sup_ok: Option<i64> = sqlx::query_scalar("SELECT id FROM suppliers WHERE id = ?")
            .bind(ps.supplier_id)
            .fetch_optional(&mut **tx)
            .await?;
        if sup_ok.is_none() {
            return Err(CoreError::Validation(
                "Fournisseur associé introuvable.".to_string(),
            ));
        }
        sqlx::query(
            "INSERT OR REPLACE INTO product_suppliers (
                product_id, supplier_id, supplier_product_code, preferred_supplier,
                purchase_unit, units_per_purchase_package, last_purchase_price, is_active
             ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
        )
        .bind(product_id)
        .bind(ps.supplier_id)
        .bind(ps.supplier_product_code.as_deref().map(str::trim).filter(|s| !s.is_empty()))
        .bind(if ps.preferred_supplier.unwrap_or(false) { 1_i64 } else { 0_i64 })
        .bind(ps.purchase_unit.as_deref().unwrap_or("casier"))
        .bind(ps.units_per_purchase_package.unwrap_or(1).max(1))
        .bind(ps.last_purchase_price)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}
