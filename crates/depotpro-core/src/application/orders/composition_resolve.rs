// ============================================================================
// Résolution des variantes, unités commerciales & tarifs pour commandes
// ============================================================================

use std::collections::HashMap;

use sqlx::{Sqlite, Transaction};

use crate::error::{CoreError, CoreResult};

use super::composition::{compute_compatibility_class, compute_native_crate_capacity};
use super::dtos::{OrderLineInput, PackagingAssetDto, PreviewLineDto};

#[derive(sqlx::FromRow)]
struct VariantResolveRow {
    id: i64,
    product_id: i64,
    product_name: String,
    base_unit: String,
    variant_name: String,
    volume_ml: Option<i64>,
    container_type: Option<String>,
    native_crate_capacity: Option<i64>,
    compatibility_class: Option<String>,
}

pub(crate) async fn resolve_preview_lines_tx(
    tx: &mut Transaction<'_, Sqlite>,
    inputs: &[OrderLineInput],
) -> CoreResult<(Vec<PreviewLineDto>, HashMap<String, i64>)> {
    let mut resolved = Vec::with_capacity(inputs.len());
    let mut native_caps: HashMap<String, i64> = HashMap::new();

    for item in inputs {
        if item.requested_quantity <= 0 {
            return Err(CoreError::Validation(
                "La quantité commandée doit être > 0.".to_string(),
            ));
        }
        let v: VariantResolveRow = sqlx::query_as(
            "SELECT pv.id, pv.product_id, p.name AS product_name, p.base_unit, pv.name AS variant_name,
                    pv.volume_ml, pv.container_type, pv.native_crate_capacity, pv.compatibility_class
             FROM product_variants pv
             JOIN products p ON p.id = pv.product_id
             WHERE pv.id = ? AND pv.is_active = 1",
        )
        .bind(item.variant_id)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or_else(|| {
            CoreError::NotFound(format!("Variante #{} introuvable.", item.variant_id))
        })?;

        let compat = v.compatibility_class.clone().unwrap_or_else(|| {
            compute_compatibility_class(v.container_type.as_deref(), v.volume_ml)
        });
        let native_cap = v
            .native_crate_capacity
            .or_else(|| compute_native_crate_capacity(v.container_type.as_deref(), v.volume_ml));
        if let Some(nc) = native_cap {
            native_caps.entry(compat.clone()).or_insert(nc);
        }

        let unit_norm = item.requested_unit.trim().to_lowercase();
        let factor = resolve_unit_factor_tx(tx, v.product_id, v.id, &unit_norm, native_cap).await?;
        let base_quantity = item.requested_quantity * factor;
        let unit_price_xof = match item.unit_price_xof {
            Some(p) if p >= 0 => p,
            Some(_) => {
                return Err(CoreError::Validation(
                    "Prix unitaire négatif interdit.".into(),
                ))
            }
            None => resolve_default_base_price_tx(tx, v.product_id, v.id).await?,
        };
        let discount_xof = item.discount_xof.unwrap_or(0).max(0);
        let line_total_xof = (base_quantity * unit_price_xof - discount_xof).max(0);

        resolved.push(PreviewLineDto {
            variant_id: v.id,
            product_id: v.product_id,
            product_name: v.product_name,
            variant_name: v.variant_name,
            compatibility_class: compat,
            base_unit: v.base_unit,
            requested_unit: unit_norm,
            requested_quantity: item.requested_quantity,
            units_per_requested_unit: factor,
            base_quantity,
            unit_price_xof,
            discount_xof,
            line_total_xof,
        });
    }

    Ok((resolved, native_caps))
}

async fn resolve_unit_factor_tx(
    tx: &mut Transaction<'_, Sqlite>,
    product_id: i64,
    variant_id: i64,
    unit: &str,
    native_cap: Option<i64>,
) -> CoreResult<i64> {
    if matches!(unit, "unit" | "bottle" | "can") {
        return Ok(1);
    }
    let su_factor: Option<i64> = sqlx::query_scalar(
        "SELECT conversion_factor FROM sales_units
         WHERE product_id = ? AND (variant_id = ? OR variant_id IS NULL) AND unit_type = ? AND is_active = 1
         ORDER BY variant_id DESC LIMIT 1",
    )
    .bind(product_id)
    .bind(variant_id)
    .bind(unit)
    .fetch_optional(&mut **tx)
    .await?;
    if let Some(f) = su_factor {
        return Ok(f.max(1));
    }
    let pkg_name = match unit {
        "crate" => Some("casier"),
        "carton" => Some("carton"),
        "pack" => Some("pack"),
        _ => None,
    };
    if let Some(pn) = pkg_name {
        let coeff_milli: Option<i64> = sqlx::query_scalar(
            "SELECT coefficient_milli FROM product_packagings
             WHERE product_id = ? AND name = ? AND is_active = 1 LIMIT 1",
        )
        .bind(product_id)
        .bind(pn)
        .fetch_optional(&mut **tx)
        .await?;
        if let Some(cm) = coeff_milli {
            return Ok((cm / 1000).max(1));
        }
    }
    Ok(match unit {
        "half_crate" => (native_cap.unwrap_or(24) / 2).max(1),
        "crate" | "carton" => native_cap.unwrap_or(24),
        "pack" => 6,
        "pallet" => native_cap.unwrap_or(24) * 20,
        _ => 1,
    })
}

async fn resolve_default_base_price_tx(
    tx: &mut Transaction<'_, Sqlite>,
    product_id: i64,
    variant_id: i64,
) -> CoreResult<i64> {
    let su_price: Option<i64> = sqlx::query_scalar(
        "SELECT retail_price FROM sales_units
         WHERE product_id = ? AND (variant_id = ? OR variant_id IS NULL)
           AND unit_type IN ('bottle', 'can') AND retail_price IS NOT NULL AND is_active = 1
         ORDER BY variant_id DESC LIMIT 1",
    )
    .bind(product_id)
    .bind(variant_id)
    .fetch_optional(&mut **tx)
    .await?;
    if let Some(p) = su_price {
        return Ok(p);
    }
    let pkg_row: Option<(Option<i64>, i64)> = sqlx::query_as(
        "SELECT retail_price, coefficient_milli FROM product_packagings
         WHERE product_id = ? AND is_active = 1
         ORDER BY (coefficient_milli = 1000) DESC, coefficient_milli ASC LIMIT 1",
    )
    .bind(product_id)
    .fetch_optional(&mut **tx)
    .await?;
    if let Some((Some(rp), cm)) = pkg_row {
        let units = (cm / 1000).max(1);
        return Ok(rp / units);
    }
    Ok(0)
}

pub(crate) async fn load_assets_by_class_tx(
    tx: &mut Transaction<'_, Sqlite>,
) -> CoreResult<HashMap<String, Vec<PackagingAssetDto>>> {
    let rows: Vec<PackagingAssetDto> = sqlx::query_as(
        "SELECT id, code, name, packaging_type_id, returnable_id, capacity, deposit_value,
                currency, returnable, compatibility_class, stock_empty, stock_full, is_active
         FROM packaging_assets WHERE is_active = 1",
    )
    .fetch_all(&mut **tx)
    .await?;
    let mut map: HashMap<String, Vec<PackagingAssetDto>> = HashMap::new();
    for r in rows {
        map.entry(r.compatibility_class.clone())
            .or_default()
            .push(r);
    }
    Ok(map)
}
