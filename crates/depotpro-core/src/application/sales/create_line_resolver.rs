// ============================================================================
// Résolution conditionnement / unité commerciale de vente & tarifs POS
// ============================================================================

use sqlx::{Sqlite, Transaction};

use crate::error::{CoreError, CoreResult};

pub(crate) struct ResolvedLineUnit {
    pub pkg_id: i64,
    pub pkg_name: String,
    pub variant_id: Option<i64>,
    pub sales_unit_id: Option<i64>,
    pub sales_unit_label: Option<String>,
    pub coeff_milli: i64,
    pub allow_fraction: i64,
    pub p_wholesale: Option<i64>,
    pub p_semi: Option<i64>,
    pub p_retail: Option<i64>,
    pub min_price: Option<i64>,
    pub unit_b_dep: i64,
    pub unit_c_dep: i64,
    pub is_unit_sale: bool,
}

type SalePackagingRow = (
    i64,
    Option<i64>,
    String,
    i64,
    Option<i64>,
    Option<i64>,
    Option<i64>,
    Option<i64>,
    i64,
    i64,
    i64,
);

type SalesUnitRow = (
    i64,
    Option<i64>,
    String,
    String,
    i64,
    i64,
    Option<i64>,
    Option<i64>,
    Option<i64>,
    Option<i64>,
    i64,
    i64,
);

pub(crate) async fn resolve_line_unit_tx(
    tx: &mut Transaction<'_, Sqlite>,
    product_id: i64,
    product_name: &str,
    packaging_id: i64,
    sales_unit_id: Option<i64>,
) -> CoreResult<ResolvedLineUnit> {
    let pkg: Option<SalePackagingRow> = sqlx::query_as(
        "SELECT id, variant_id, name, coefficient_milli, wholesale_price, semi_wholesale_price,
                retail_price, min_selling_price, allow_fraction, package_deposit_amount, bottle_deposit_amount
         FROM product_packagings WHERE id = ? AND product_id = ? AND is_active = 1",
    )
    .bind(packaging_id)
    .bind(product_id)
    .fetch_optional(&mut **tx)
    .await?;

    let (
        pkg_id,
        pkg_variant_id,
        pkg_name,
        pkg_coeff_milli,
        pkg_wholesale,
        pkg_semi,
        pkg_retail,
        pkg_min_price,
        pkg_allow_fraction,
        pkg_crate_dep,
        pkg_bottle_dep,
    ) = pkg.ok_or_else(|| {
        CoreError::Validation(format!("Conditionnement invalide pour \"{product_name}\"."))
    })?;

    if let Some(su_id) = sales_unit_id {
        let su: Option<SalesUnitRow> = sqlx::query_as(
            "SELECT id, variant_id, label, unit_type, conversion_factor, allow_fraction,
                    wholesale_price, semi_wholesale_price, retail_price, min_selling_price,
                    bottle_deposit_amount, crate_deposit_amount
             FROM sales_units WHERE id = ? AND product_id = ? AND is_active = 1",
        )
        .bind(su_id)
        .bind(product_id)
        .fetch_optional(&mut **tx)
        .await?;
        let (
            id,
            su_var_id,
            su_label,
            su_type,
            su_factor,
            su_frac,
            su_whole,
            su_semi,
            su_ret,
            su_min,
            su_b_dep,
            su_c_dep,
        ) = su.ok_or_else(|| {
            CoreError::Validation(format!(
                "Unité de vente introuvable ou inactive pour \"{product_name}\"."
            ))
        })?;
        let coeff_milli = su_factor.checked_mul(1000).ok_or_else(|| {
            CoreError::Validation("Facteur de conversion unité invalide.".to_string())
        })?;
        return Ok(ResolvedLineUnit {
            pkg_id,
            pkg_name,
            variant_id: su_var_id.or(pkg_variant_id),
            sales_unit_id: Some(id),
            sales_unit_label: Some(su_label),
            coeff_milli,
            allow_fraction: su_frac,
            p_wholesale: su_whole.or(pkg_wholesale),
            p_semi: su_semi.or(pkg_semi),
            p_retail: su_ret.or(pkg_retail),
            min_price: su_min.or(pkg_min_price),
            unit_b_dep: su_b_dep,
            unit_c_dep: su_c_dep,
            is_unit_sale: matches!(su_type.as_str(), "bottle" | "can"),
        });
    }

    Ok(ResolvedLineUnit {
        pkg_id,
        pkg_name: pkg_name.clone(),
        variant_id: pkg_variant_id,
        sales_unit_id: None,
        sales_unit_label: None,
        coeff_milli: pkg_coeff_milli,
        allow_fraction: pkg_allow_fraction,
        p_wholesale: pkg_wholesale,
        p_semi: pkg_semi,
        p_retail: pkg_retail,
        min_price: pkg_min_price,
        unit_b_dep: pkg_bottle_dep,
        unit_c_dep: pkg_crate_dep,
        is_unit_sale: matches!(pkg_name.as_str(), "bouteille" | "canette"),
    })
}
