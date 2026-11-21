// ============================================================================
// Helpers transactionnels création/mise à jour de commandes mixtes
// ============================================================================

use sqlx::{Sqlite, Transaction};

use crate::application::auth::{current_actor, Role};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::composition::{compose_order_allocations, link_lines_to_allocations};
use super::composition_resolve::load_assets_by_class_tx;
use super::dtos::{
    OrderAllocationOverrideInput, OrderLineInput, PreviewAllocationDto, PreviewLineDto,
};

pub(crate) async fn generate_order_number_tx(
    tx: &mut Transaction<'_, Sqlite>,
) -> CoreResult<String> {
    let today = chrono::Utc::now().format("%Y%m%d").to_string();
    let seq = DepotDb::next_sequence(tx, "ORD").await?;
    let tail = seq.rsplit('-').next().unwrap_or("0001");
    Ok(format!("ORD-{today}-{tail}"))
}

pub(crate) async fn check_min_selling_prices_tx(
    tx: &mut Transaction<'_, Sqlite>,
    lines: &[PreviewLineDto],
    allow_override: bool,
) -> CoreResult<()> {
    let is_owner = current_actor().is_some_and(|a| a.role == Role::Owner);
    if allow_override && is_owner {
        return Ok(());
    }
    for line in lines {
        let min_unit: Option<i64> = sqlx::query_scalar(
            "SELECT MIN(val) FROM (
                SELECT min_selling_price AS val FROM sales_units
                WHERE product_id = ? AND (variant_id = ? OR variant_id IS NULL)
                  AND unit_type IN ('bottle', 'can') AND min_selling_price IS NOT NULL AND is_active = 1
                UNION ALL
                SELECT CAST(min_selling_price / MAX(1, coefficient_milli / 1000) AS INTEGER) AS val
                FROM product_packagings
                WHERE product_id = ? AND min_selling_price IS NOT NULL AND is_active = 1
            )",
        )
        .bind(line.product_id)
        .bind(line.variant_id)
        .bind(line.product_id)
        .fetch_optional(&mut **tx)
        .await?
        .flatten();
        if let Some(min_p) = min_unit {
            if line.unit_price_xof < min_p {
                return Err(CoreError::Validation(format!(
                    "Prix unitaire ({} FCFA) inférieur au prix minimum autorisé ({} FCFA) pour {}.",
                    line.unit_price_xof, min_p, line.product_name
                )));
            }
        }
    }
    Ok(())
}

pub(crate) async fn resolve_allocations_tx(
    tx: &mut Transaction<'_, Sqlite>,
    lines: &[PreviewLineDto],
    native_caps: &std::collections::HashMap<String, i64>,
    override_allocs: Option<&[OrderAllocationOverrideInput]>,
) -> CoreResult<Vec<PreviewAllocationDto>> {
    let Some(overrides) = override_allocs else {
        let assets_map = load_assets_by_class_tx(tx).await?;
        let (allocs, _) = compose_order_allocations(lines, &assets_map, native_caps);
        return Ok(allocs);
    };
    let mut result = Vec::with_capacity(overrides.len());
    for ov in overrides {
        if ov.quantity <= 0 {
            return Err(CoreError::Validation(
                "Quantité d'emballage doit être > 0.".to_string(),
            ));
        }
        let row: Option<(String, String, i64, i64, i64)> = sqlx::query_as(
            "SELECT name, compatibility_class, capacity, deposit_value, returnable
             FROM packaging_assets WHERE id = ? AND is_active = 1",
        )
        .bind(ov.packaging_asset_id)
        .fetch_optional(&mut **tx)
        .await?;
        let (name, compat, capacity, def_dep, returnable) = row.ok_or_else(|| {
            CoreError::NotFound(format!(
                "Emballage physique #{} introuvable.",
                ov.packaging_asset_id
            ))
        })?;
        let dep_xof = if ov.is_consigned {
            let d = ov.deposit_amount_xof.unwrap_or(def_dep);
            if d <= 0 && returnable == 1 {
                return Err(CoreError::Validation(
                    "Un emballage consigné doit avoir une valeur de consigne > 0.".to_string(),
                ));
            }
            d
        } else {
            0
        };
        result.push(PreviewAllocationDto {
            packaging_asset_id: ov.packaging_asset_id,
            packaging_name: name,
            compatibility_class: compat,
            capacity,
            quantity: ov.quantity,
            is_consigned: ov.is_consigned,
            deposit_amount_xof: dep_xof,
            total_deposit_xof: dep_xof * ov.quantity,
        });
    }
    Ok(result)
}

pub(crate) async fn write_lines_and_allocations_tx(
    tx: &mut Transaction<'_, Sqlite>,
    order_id: i64,
    lines: &[PreviewLineDto],
    raw_lines: &[OrderLineInput],
    allocations: &[PreviewAllocationDto],
    override_allocs: Option<&[OrderAllocationOverrideInput]>,
) -> CoreResult<()> {
    let mut line_ids = Vec::with_capacity(lines.len());
    for (idx, l) in lines.iter().enumerate() {
        let notes = raw_lines.get(idx).and_then(|r| r.notes.as_deref());
        let lid = sqlx::query(
            "INSERT INTO order_lines (
                order_id, product_id, variant_id, requested_unit, requested_quantity,
                base_quantity, unit_price_xof, line_total_xof, discount_xof, notes
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(order_id)
        .bind(l.product_id)
        .bind(l.variant_id)
        .bind(&l.requested_unit)
        .bind(l.requested_quantity)
        .bind(l.base_quantity)
        .bind(l.unit_price_xof)
        .bind(l.line_total_xof)
        .bind(l.discount_xof)
        .bind(notes)
        .execute(&mut **tx)
        .await?
        .last_insert_rowid();
        line_ids.push(lid);
    }

    let mut alloc_ids = Vec::with_capacity(allocations.len());
    for (idx, a) in allocations.iter().enumerate() {
        let provided_by = override_allocs
            .and_then(|o| o.get(idx))
            .and_then(|x| x.provided_by.as_deref())
            .unwrap_or("depot");
        let notes = override_allocs
            .and_then(|o| o.get(idx))
            .and_then(|x| x.notes.as_deref());
        let aid = sqlx::query(
            "INSERT INTO order_packaging_allocations (
                order_id, packaging_asset_id, quantity, is_consigned, deposit_amount_xof, provided_by, notes
             ) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(order_id)
        .bind(a.packaging_asset_id)
        .bind(a.quantity)
        .bind(if a.is_consigned { 1_i64 } else { 0_i64 })
        .bind(a.deposit_amount_xof)
        .bind(provided_by)
        .bind(notes)
        .execute(&mut **tx)
        .await?
        .last_insert_rowid();
        alloc_ids.push(aid);
    }

    let links = link_lines_to_allocations(lines, allocations);
    for lk in links {
        sqlx::query(
            "INSERT INTO order_line_packaging_links (order_line_id, order_packaging_allocation_id, units_in_packaging)
             VALUES (?, ?, ?)",
        )
        .bind(line_ids[lk.line_index])
        .bind(alloc_ids[lk.allocation_index])
        .bind(lk.units_in_packaging)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}
