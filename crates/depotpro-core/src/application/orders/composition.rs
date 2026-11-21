// ============================================================================
// Algorithme de composition mixte (casiers partagés) & calculs de commande
// ============================================================================

use std::collections::HashMap;

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::CoreResult;
use crate::infrastructure::db::DepotDb;

use super::composition_resolve::{load_assets_by_class_tx, resolve_preview_lines_tx};
use super::dtos::{
    ComposePreviewInput, ComposePreviewResult, OrderTotalsDto, PackagingAssetDto,
    PreviewAllocationDto, PreviewLineDto,
};

pub fn compute_compatibility_class(container_type: Option<&str>, volume_ml: Option<i64>) -> String {
    let ct = container_type.unwrap_or("").trim().to_lowercase();
    match (ct.as_str(), volume_ml) {
        ("glass_returnable" | "glass_bottle", Some(330)) => "bottle_33cl_glass".to_string(),
        ("glass_returnable" | "glass_bottle", Some(500)) => "bottle_50cl_glass".to_string(),
        ("glass_returnable" | "glass_bottle", Some(650)) => "bottle_65cl_glass".to_string(),
        ("glass_returnable" | "glass_bottle", Some(1000)) => "bottle_100cl_glass".to_string(),
        ("glass_returnable" | "glass_bottle", Some(v)) => format!("bottle_{v}ml_glass"),
        ("glass_disposable", Some(v)) => format!("glass_disp_{v}ml"),
        ("can", Some(330)) => "can_33cl".to_string(),
        ("can", Some(500)) => "can_50cl".to_string(),
        ("can", Some(v)) => format!("can_{v}ml"),
        ("pet" | "pet_bottle" | "plastic_bottle", Some(v)) => format!("pet_{v}ml"),
        _ => "other".to_string(),
    }
}

pub fn compute_native_crate_capacity(
    container_type: Option<&str>,
    volume_ml: Option<i64>,
) -> Option<i64> {
    let ct = container_type.unwrap_or("").trim().to_lowercase();
    match (ct.as_str(), volume_ml) {
        ("glass_returnable" | "glass_bottle", Some(330)) => Some(24),
        ("glass_returnable" | "glass_bottle", Some(500 | 650 | 1000)) => Some(12),
        ("can", Some(330 | 500)) => Some(24),
        _ => None,
    }
}

pub fn compute_order_totals(
    lines: &[PreviewLineDto],
    allocations: &[PreviewAllocationDto],
    discount_xof: i64,
    tax_xof: i64,
) -> OrderTotalsDto {
    let subtotal_xof: i64 = lines.iter().map(|l| l.line_total_xof).sum();
    let deposit_total_xof: i64 = allocations
        .iter()
        .filter(|a| a.is_consigned)
        .map(|a| a.quantity * a.deposit_amount_xof)
        .sum();
    let total_xof = (subtotal_xof + tax_xof - discount_xof).max(0);
    let deposit_due_xof = deposit_total_xof;
    let total_to_collect_xof = total_xof + deposit_due_xof;
    OrderTotalsDto {
        subtotal_xof,
        deposit_total_xof,
        discount_xof,
        tax_xof,
        total_xof,
        deposit_due_xof,
        total_to_collect_xof,
    }
}

#[derive(Debug, Clone)]
pub struct LinePackagingLinkDraft {
    pub line_index: usize,
    pub allocation_index: usize,
    pub units_in_packaging: i64,
}

pub fn compose_order_allocations(
    lines: &[PreviewLineDto],
    assets_by_class: &HashMap<String, Vec<PackagingAssetDto>>,
    native_caps: &HashMap<String, i64>,
) -> (Vec<PreviewAllocationDto>, Vec<String>) {
    let mut grouped_totals: HashMap<String, i64> = HashMap::new();
    let mut class_order: Vec<String> = Vec::new();
    for line in lines {
        if !grouped_totals.contains_key(&line.compatibility_class) {
            class_order.push(line.compatibility_class.clone());
        }
        *grouped_totals
            .entry(line.compatibility_class.clone())
            .or_insert(0) += line.base_quantity;
    }

    let mut allocations: Vec<PreviewAllocationDto> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();

    for class in class_order {
        let total_bottles = grouped_totals[&class];
        let Some(assets) = assets_by_class.get(&class) else {
            if class != "other" && !class.starts_with("pet_") && !class.starts_with("glass_disp_") {
                warnings.push(format!("Aucun casier physique disponible pour {class}"));
            }
            continue;
        };
        let mut active: Vec<&PackagingAssetDto> = assets
            .iter()
            .filter(|a| a.capacity > 0 && a.is_active == 1)
            .collect();
        if active.is_empty() {
            warnings.push(format!("Aucun casier physique actif pour {class}"));
            continue;
        }
        active.sort_by(|a, b| b.capacity.cmp(&a.capacity));

        let preferred = native_caps
            .get(&class)
            .and_then(|nc| active.iter().copied().find(|a| a.capacity == *nc));
        let chosen = if let Some(pref) = preferred {
            if total_bottles <= pref.capacity || total_bottles % pref.capacity == 0 {
                pref
            } else {
                active[0]
            }
        } else {
            active[0]
        };

        let cap = chosen.capacity;
        let full_crates = total_bottles / cap;
        let remaining = total_bottles % cap;
        let mut total_qty = full_crates;

        if remaining > 0 {
            if remaining >= 6 {
                total_qty += 1;
                warnings.push(format!(
                    "Casier partiel : {remaining} bouteilles sur {cap} dans la classe {class}"
                ));
            } else {
                warnings.push(format!(
                    "{remaining} bouteilles vendues à l'unité (pas de casier dédié)"
                ));
            }
        }

        if total_qty > 0 {
            let is_consigned = chosen.returnable == 1;
            let unit_dep = if is_consigned { chosen.deposit_value } else { 0 };
            allocations.push(PreviewAllocationDto {
                packaging_asset_id: chosen.id,
                packaging_name: chosen.name.clone(),
                compatibility_class: class,
                capacity: chosen.capacity,
                quantity: total_qty,
                is_consigned,
                deposit_amount_xof: unit_dep,
                total_deposit_xof: unit_dep * total_qty,
            });
        }
    }

    (allocations, warnings)
}

pub fn link_lines_to_allocations(
    lines: &[PreviewLineDto],
    allocations: &[PreviewAllocationDto],
) -> Vec<LinePackagingLinkDraft> {
    let mut links = Vec::new();
    let mut line_remaining: Vec<i64> = lines.iter().map(|l| l.base_quantity).collect();

    for (alloc_idx, alloc) in allocations.iter().enumerate() {
        let mut slots = alloc.capacity * alloc.quantity;
        for (line_idx, line) in lines.iter().enumerate() {
            if slots <= 0 {
                break;
            }
            if line.compatibility_class != alloc.compatibility_class {
                continue;
            }
            if line_remaining[line_idx] <= 0 {
                continue;
            }
            let put = line_remaining[line_idx].min(slots);
            if put > 0 {
                links.push(LinePackagingLinkDraft {
                    line_index: line_idx,
                    allocation_index: alloc_idx,
                    units_in_packaging: put,
                });
                line_remaining[line_idx] -= put;
                slots -= put;
            }
        }
    }
    links
}

pub async fn compose_preview(
    db: &DepotDb,
    input: ComposePreviewInput,
) -> CoreResult<ComposePreviewResult> {
    require_current_actor_permission(Permission::SalesRead)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let (lines, native_caps) = resolve_preview_lines_tx(&mut tx, &input.lines).await?;
    let assets_map = load_assets_by_class_tx(&mut tx).await?;
    let (allocations, warnings) = compose_order_allocations(&lines, &assets_map, &native_caps);
    let totals = compute_order_totals(
        &lines,
        &allocations,
        input.discount_xof.unwrap_or(0).max(0),
        input.tax_xof.unwrap_or(0).max(0),
    );
    Ok(ComposePreviewResult {
        lines,
        allocations,
        warnings,
        totals,
    })
}
