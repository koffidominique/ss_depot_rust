// ============================================================================
// Insertion atomique des conditionnements initiaux lors de la création produit
// ============================================================================

use sqlx::{Sqlite, Transaction};

use crate::domain::quantity::Quantity;
use crate::error::{CoreError, CoreResult};

use super::v4_types::PackagingV4Extras;
use super::PackagingInput;

pub(crate) async fn insert_initial_packagings_tx(
    tx: &mut Transaction<'_, Sqlite>,
    product_id: i64,
    variant_id: Option<i64>,
    base_unit: &str,
    packagings: Vec<PackagingInput>,
    pkg_extras: &[PackagingV4Extras],
) -> CoreResult<Option<i64>> {
    let default_extra = PackagingV4Extras::default();
    let mut first_pkg_id: Option<i64> = None;

    for (idx, pkg) in packagings.into_iter().enumerate() {
        let ex = pkg_extras.get(idx).unwrap_or(&default_extra);
        let coeff = Quantity::parse_str(&pkg.coefficient, &format!("Coefficient ({})", pkg.name))?;
        let pkg_bc = pkg
            .barcode
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty());
        if let Some(bc) = pkg_bc {
            let dup: Option<(i64,)> = sqlx::query_as(
                "SELECT id FROM products WHERE barcode = ? UNION SELECT id FROM product_packagings WHERE barcode = ?",
            )
            .bind(bc)
            .bind(bc)
            .fetch_optional(&mut **tx)
            .await?;
            if dup.is_some() {
                return Err(CoreError::DuplicateOperation(format!(
                    "Code-barres déjà utilisé : {bc}"
                )));
            }
        }
        let pkg_id = sqlx::query(
            "INSERT INTO product_packagings (
                product_id, variant_id, packaging_type_id, name, display_label, package_sku,
                base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price,
                retail_price, min_selling_price, barcode, allow_fraction, is_reusable, is_returnable,
                package_deposit_amount, bottle_deposit_amount, package_cost, is_default_sale, is_default_purchase
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(product_id)
        .bind(ex.variant_id.or(variant_id))
        .bind(ex.packaging_type_id)
        .bind(&pkg.name)
        .bind(ex.display_label.as_deref().map(str::trim).filter(|s| !s.is_empty()))
        .bind(ex.package_sku.as_deref().map(str::trim).filter(|s| !s.is_empty()))
        .bind(base_unit)
        .bind(coeff.milli_units)
        .bind(pkg.purchase_price)
        .bind(pkg.wholesale_price)
        .bind(pkg.semi_wholesale_price)
        .bind(pkg.retail_price)
        .bind(ex.min_selling_price)
        .bind(pkg_bc)
        .bind(if pkg.allow_fraction.unwrap_or(false) { 1_i64 } else { 0_i64 })
        .bind(if ex.is_reusable.unwrap_or(false) { 1_i64 } else { 0_i64 })
        .bind(if ex.is_returnable.unwrap_or(false) { 1_i64 } else { 0_i64 })
        .bind(ex.package_deposit_amount.unwrap_or(0))
        .bind(ex.bottle_deposit_amount.unwrap_or(0))
        .bind(ex.package_cost.unwrap_or(0))
        .bind(if ex.is_default_sale.unwrap_or(false) { 1_i64 } else { 0_i64 })
        .bind(if ex.is_default_purchase.unwrap_or(false) { 1_i64 } else { 0_i64 })
        .execute(&mut **tx)
        .await?
        .last_insert_rowid();

        if first_pkg_id.is_none() {
            first_pkg_id = Some(pkg_id);
        }

        let mode = if pkg.deposit_mode.as_deref() == Some("deposit") {
            "deposit"
        } else {
            "none"
        };
        sqlx::query("INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, ?)")
            .bind(pkg_id)
            .bind(mode)
            .execute(&mut **tx)
            .await?;

        if mode == "deposit" {
            if let Some(comps) = pkg.components {
                for comp in comps {
                    if comp.pieces_per_pack <= 0 {
                        return Err(CoreError::Validation(
                            "Nombre de pièces par conditionnement invalide.".to_string(),
                        ));
                    }
                    let rt_exists: Option<i64> = sqlx::query_scalar(
                        "SELECT id FROM returnable_packaging_types WHERE id = ?",
                    )
                    .bind(comp.returnable_id)
                    .fetch_optional(&mut **tx)
                    .await?;
                    if rt_exists.is_none() {
                        return Err(CoreError::Validation(
                            "Type d'emballage consigné introuvable.".to_string(),
                        ));
                    }
                    sqlx::query(
                        "INSERT INTO deposit_packaging_components (packaging_id, returnable_id, pieces_per_pack) VALUES (?, ?, ?)",
                    )
                    .bind(pkg_id)
                    .bind(comp.returnable_id)
                    .bind(comp.pieces_per_pack)
                    .execute(&mut **tx)
                    .await?;
                }
            }
        }
    }

    Ok(first_pkg_id)
}
