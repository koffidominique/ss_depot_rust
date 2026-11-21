// ============================================================================
// Validation et mise à jour des conditionnements & profils consignés
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::sales::audit_log_tx;
use crate::domain::money::Money;
use crate::domain::quantity::Quantity;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::packaging_deposit::{
    record_packaging_price_changes_tx, upsert_packaging_deposit_profile_tx,
};
use super::v4_types::PackagingV4Extras;
use super::{get_product_by_id, PackagingInput, ProductPackagingDto, ALLOWED_PACKAGING_NAMES};

pub(crate) fn validate_packaging_prices(pkg: &PackagingInput) -> CoreResult<()> {
    if let Some(v) = pkg.purchase_price {
        Money::from_non_negative(v, "Prix d'achat (conditionnement)")?;
    }
    if let Some(v) = pkg.wholesale_price {
        Money::from_non_negative(v, "Prix gros (conditionnement)")?;
    }
    if let Some(v) = pkg.semi_wholesale_price {
        Money::from_non_negative(v, "Prix demi-gros (conditionnement)")?;
    }
    if let Some(v) = pkg.retail_price {
        Money::from_non_negative(v, "Prix détail (conditionnement)")?;
    }
    Ok(())
}

pub(crate) fn validate_packaging_extras(ex: &PackagingV4Extras) -> CoreResult<()> {
    if let Some(v) = ex.min_selling_price {
        Money::from_non_negative(v, "Prix minimum (conditionnement)")?;
    }
    if let Some(v) = ex.package_deposit_amount {
        Money::from_non_negative(v, "Consigne emballage")?;
    }
    if let Some(v) = ex.bottle_deposit_amount {
        Money::from_non_negative(v, "Consigne bouteille")?;
    }
    if let Some(v) = ex.package_cost {
        Money::from_non_negative(v, "Coût emballage")?;
    }
    Ok(())
}

pub async fn upsert_packaging(
    db: &DepotDb,
    product_id: i64,
    pkg: PackagingInput,
) -> CoreResult<ProductPackagingDto> {
    upsert_packaging_v4(db, product_id, pkg, PackagingV4Extras::default()).await
}

pub async fn upsert_packaging_v4(
    db: &DepotDb,
    product_id: i64,
    pkg: PackagingInput,
    ex: PackagingV4Extras,
) -> CoreResult<ProductPackagingDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    if !ALLOWED_PACKAGING_NAMES.contains(&pkg.name.as_str()) {
        return Err(CoreError::Validation(format!(
            "Type de conditionnement invalide : {} (autorisés : casier, carton, bouteille, pack, canette).",
            pkg.name
        )));
    }
    let coeff = Quantity::parse_str(&pkg.coefficient, "Coefficient")?;
    if coeff.milli_units <= 0 {
        return Err(CoreError::Validation(
            "Coefficient nul interdit.".to_string(),
        ));
    }
    validate_packaging_prices(&pkg)?;
    validate_packaging_extras(&ex)?;

    let (_guard, mut tx) = db.begin_write().await?;
    let base_unit: Option<(String,)> =
        sqlx::query_as("SELECT base_unit FROM products WHERE id = ?")
            .bind(product_id)
            .fetch_optional(&mut *tx)
            .await?;
    let (base_unit,) =
        base_unit.ok_or_else(|| CoreError::Validation("Produit introuvable.".to_string()))?;

    let pkg_bc = pkg
        .barcode
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if let Some(bc) = pkg_bc {
        let dup: Option<(i64,)> = sqlx::query_as(
            "SELECT id FROM products WHERE barcode = ? UNION SELECT id FROM product_packagings WHERE barcode = ? AND id != ?",
        )
        .bind(bc).bind(bc).bind(pkg.id.unwrap_or(-1))
        .fetch_optional(&mut *tx).await?;
        if dup.is_some() {
            return Err(CoreError::DuplicateOperation(
                "Code-barres déjà utilisé.".to_string(),
            ));
        }
    }

    let dup_name: Option<(i64,)> = sqlx::query_as(
        "SELECT id FROM product_packagings WHERE product_id = ? AND name = ? AND id != ?",
    )
    .bind(product_id)
    .bind(&pkg.name)
    .bind(pkg.id.unwrap_or(-1))
    .fetch_optional(&mut *tx)
    .await?;
    if dup_name.is_some() {
        return Err(CoreError::DuplicateOperation(format!(
            "Un conditionnement \"{}\" existe déjà pour ce produit. Sélectionnez-le pour le modifier.",
            pkg.name
        )));
    }

    let clean_label = ex
        .display_label
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let clean_sku = ex
        .package_sku
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    let pkg_id = if let Some(id) = pkg.id {
        type PrevPkgPrices = (Option<i64>, Option<i64>, Option<i64>, Option<i64>);
        let prev_prices: Option<PrevPkgPrices> = sqlx::query_as(
            "SELECT purchase_price, wholesale_price, semi_wholesale_price, retail_price
                 FROM product_packagings WHERE id = ? AND product_id = ?",
        )
        .bind(id)
        .bind(product_id)
        .fetch_optional(&mut *tx)
        .await?;
        let prev = prev_prices.ok_or_else(|| {
            CoreError::Validation("Conditionnement introuvable pour ce produit.".to_string())
        })?;

        sqlx::query(
            "UPDATE product_packagings
             SET name = ?, variant_id = COALESCE(?, variant_id), packaging_type_id = COALESCE(?, packaging_type_id),
                 display_label = COALESCE(?, display_label), package_sku = COALESCE(?, package_sku),
                 coefficient_milli = ?, purchase_price = ?, wholesale_price = ?, semi_wholesale_price = ?,
                 retail_price = ?, min_selling_price = ?, barcode = ?, allow_fraction = ?,
                 is_reusable = ?, is_returnable = ?, package_deposit_amount = ?,
                 bottle_deposit_amount = ?, package_cost = ?, is_default_sale = ?,
                 is_default_purchase = ?, is_active = ?
             WHERE id = ? AND product_id = ?",
        )
        .bind(&pkg.name)
        .bind(ex.variant_id)
        .bind(ex.packaging_type_id)
        .bind(clean_label)
        .bind(clean_sku)
        .bind(coeff.milli_units)
        .bind(pkg.purchase_price)
        .bind(pkg.wholesale_price)
        .bind(pkg.semi_wholesale_price)
        .bind(pkg.retail_price)
        .bind(ex.min_selling_price)
        .bind(pkg_bc)
        .bind(if pkg.allow_fraction.unwrap_or(false) {
            1_i64
        } else {
            0_i64
        })
        .bind(if ex.is_reusable.unwrap_or(false) {
            1_i64
        } else {
            0_i64
        })
        .bind(if ex.is_returnable.unwrap_or(false) {
            1_i64
        } else {
            0_i64
        })
        .bind(ex.package_deposit_amount.unwrap_or(0))
        .bind(ex.bottle_deposit_amount.unwrap_or(0))
        .bind(ex.package_cost.unwrap_or(0))
        .bind(if ex.is_default_sale.unwrap_or(false) {
            1_i64
        } else {
            0_i64
        })
        .bind(if ex.is_default_purchase.unwrap_or(false) {
            1_i64
        } else {
            0_i64
        })
        .bind(if pkg.is_active.unwrap_or(true) {
            1_i64
        } else {
            0_i64
        })
        .bind(id)
        .bind(product_id)
        .execute(&mut *tx)
        .await?;

        record_packaging_price_changes_tx(&mut tx, id, ex.variant_id, prev, &pkg).await?;
        id
    } else {
        sqlx::query(
            "INSERT INTO product_packagings (
                product_id, variant_id, packaging_type_id, name, display_label, package_sku,
                base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price,
                retail_price, min_selling_price, barcode, allow_fraction, is_reusable, is_returnable,
                package_deposit_amount, bottle_deposit_amount, package_cost, is_default_sale, is_default_purchase
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(product_id)
        .bind(ex.variant_id)
        .bind(ex.packaging_type_id)
        .bind(&pkg.name)
        .bind(clean_label)
        .bind(clean_sku)
        .bind(&base_unit)
        .bind(coeff.milli_units)
        .bind(pkg.purchase_price)
        .bind(pkg.wholesale_price)
        .bind(pkg.semi_wholesale_price)
        .bind(pkg.retail_price)
        .bind(ex.min_selling_price)
        .bind(pkg_bc)
        .bind(if pkg.allow_fraction.unwrap_or(false) {
            1_i64
        } else {
            0_i64
        })
        .bind(if ex.is_reusable.unwrap_or(false) {
            1_i64
        } else {
            0_i64
        })
        .bind(if ex.is_returnable.unwrap_or(false) {
            1_i64
        } else {
            0_i64
        })
        .bind(ex.package_deposit_amount.unwrap_or(0))
        .bind(ex.bottle_deposit_amount.unwrap_or(0))
        .bind(ex.package_cost.unwrap_or(0))
        .bind(if ex.is_default_sale.unwrap_or(false) {
            1_i64
        } else {
            0_i64
        })
        .bind(if ex.is_default_purchase.unwrap_or(false) {
            1_i64
        } else {
            0_i64
        })
        .execute(&mut *tx)
        .await?
        .last_insert_rowid()
    };

    upsert_packaging_deposit_profile_tx(
        &mut tx,
        pkg_id,
        pkg.deposit_mode.as_deref(),
        pkg.components,
    )
    .await?;

    audit_log_tx(
        &mut tx,
        "UPSERT_PACKAGING",
        "product_packagings",
        Some(pkg_id.to_string()),
        &format!("Conditionnement {}", pkg.name),
    )
    .await?;
    tx.commit().await?;

    let prod = get_product_by_id(db, product_id).await?;
    prod.packagings
        .into_iter()
        .find(|p| p.id == pkg_id)
        .ok_or_else(|| CoreError::Internal("Conditionnement introuvable.".to_string()))
}
