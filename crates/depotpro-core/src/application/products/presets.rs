// ============================================================================
// Liste & chargement transactionnel du catalogue prédéfini brasseries (60 réf.)
// ============================================================================

use std::collections::{HashMap, HashSet};

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::sales::audit_log_tx;
use crate::domain::money::Money;
use crate::domain::quantity::Quantity;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::duplicate::normalize_product_name;
use super::get_product_by_id;
use super::presets_helpers::{
    insert_preset_packaging_tx, resolve_preset_brewery_id_tx, resolve_preset_category_tx,
    resolve_preset_supplier_tx,
};
use super::presets_types::{
    parse_brewery_catalog, ApplyCatalogPresetsInput, ApplyCatalogPresetsResultDto,
    CatalogPresetComponentDto, CatalogPresetItemDto, CatalogPresetListDto,
    CatalogPresetPackagingDto, ExistingPresetProductRow, PresetBreweryMeta, PresetProductRaw,
    PresetReturnableMeta,
};

pub async fn list_catalog_presets(db: &DepotDb) -> CoreResult<CatalogPresetListDto> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let catalog = parse_brewery_catalog()?;
    let ret_names: HashMap<String, String> = catalog
        .returnables
        .iter()
        .map(|r| (r.code.clone(), r.name.clone()))
        .collect();

    let existing_rows = sqlx::query_as::<_, ExistingPresetProductRow>(
        "SELECT id, reference, name, barcode, is_active FROM products",
    )
    .fetch_all(&db.pool)
    .await?;
    let mut by_barcode: HashMap<String, (i64, String, i64)> = HashMap::new();
    let mut by_norm_name: HashMap<String, (i64, String, i64)> = HashMap::new();
    for r in existing_rows {
        let info = (r.id, r.reference, r.is_active);
        if let Some(bc) = r.barcode {
            by_barcode.insert(bc, info.clone());
        }
        by_norm_name.insert(normalize_product_name(&r.name), info);
    }

    let mut items = Vec::with_capacity(catalog.products.len());
    for p in catalog.products {
        let existing = by_barcode
            .get(&p.barcode)
            .or_else(|| by_norm_name.get(&normalize_product_name(&p.name)))
            .cloned();

        let packagings = p
            .packagings
            .into_iter()
            .map(|pk| CatalogPresetPackagingDto {
                name: pk.name,
                coefficient: pk.coefficient,
                purchase_price: pk.purchase_price,
                wholesale_price: pk.wholesale_price,
                semi_wholesale_price: pk.semi_wholesale_price,
                retail_price: pk.retail_price,
                barcode: pk.barcode,
                allow_fraction: pk.allow_fraction,
                deposit_mode: pk.deposit_mode,
                components: pk
                    .components
                    .into_iter()
                    .map(|c| {
                        let rname = ret_names
                            .get(&c.returnable_code)
                            .cloned()
                            .unwrap_or_else(|| c.returnable_code.clone());
                        CatalogPresetComponentDto {
                            returnable_code: c.returnable_code,
                            returnable_name: rname,
                            pieces_per_pack: c.pieces_per_pack,
                        }
                    })
                    .collect(),
            })
            .collect();

        items.push(CatalogPresetItemDto {
            key: p.key,
            brewery: p.brewery,
            name: p.name,
            brand: p.brand,
            barcode: p.barcode,
            category: p.category,
            base_unit: p.base_unit,
            initial_stock: p.initial_stock,
            min_stock: p.min_stock,
            purchase_price: p.purchase_price,
            wholesale_price: p.wholesale_price,
            semi_wholesale_price: p.semi_wholesale_price,
            retail_price: p.retail_price,
            description: p.description,
            packagings,
            existing_product_id: existing.as_ref().map(|r| r.0),
            existing_reference: existing.as_ref().map(|r| r.1.clone()),
            existing_is_active: existing.as_ref().map(|r| r.2),
        });
    }

    Ok(CatalogPresetListDto { items })
}

pub async fn apply_catalog_presets(
    db: &DepotDb,
    input: ApplyCatalogPresetsInput,
) -> CoreResult<ApplyCatalogPresetsResultDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let catalog = parse_brewery_catalog()?;
    let preset_map: HashMap<&str, &PresetProductRaw> = catalog
        .products
        .iter()
        .map(|p| (p.key.as_str(), p))
        .collect();
    let brewery_map: HashMap<&str, &PresetBreweryMeta> = catalog
        .breweries
        .iter()
        .map(|b| (b.brewery.as_str(), b))
        .collect();
    let returnable_map: HashMap<&str, &PresetReturnableMeta> = catalog
        .returnables
        .iter()
        .map(|r| (r.code.as_str(), r))
        .collect();

    let mut dedup_keys = Vec::new();
    let mut seen_keys = HashSet::new();
    for raw_key in &input.keys {
        let trimmed = raw_key.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !preset_map.contains_key(trimmed) {
            return Err(CoreError::Validation(format!(
                "Produit prédéfini introuvable : {trimmed}"
            )));
        }
        if seen_keys.insert(trimmed.to_string()) {
            dedup_keys.push(trimmed.to_string());
        }
    }
    if dedup_keys.is_empty() {
        return Err(CoreError::Validation(
            "Sélectionnez au moins un produit du catalogue prédéfini.".to_string(),
        ));
    }

    let activate = input.activate.unwrap_or(true);
    let (_guard, mut tx) = db.begin_write().await?;

    let default_loc_id: Option<i64> =
        sqlx::query_scalar("SELECT id FROM stock_locations WHERE is_default = 1 LIMIT 1")
            .fetch_optional(&mut *tx)
            .await?;

    let existing_rows = sqlx::query_as::<_, ExistingPresetProductRow>(
        "SELECT id, reference, name, barcode, is_active FROM products",
    )
    .fetch_all(&mut *tx)
    .await?;
    let mut by_barcode: HashMap<String, (i64, String, i64)> = HashMap::new();
    let mut by_norm_name: HashMap<String, (i64, String, i64)> = HashMap::new();
    for r in existing_rows {
        let info = (r.id, r.reference, r.is_active);
        if let Some(bc) = r.barcode {
            by_barcode.insert(bc, info.clone());
        }
        by_norm_name.insert(normalize_product_name(&r.name), info);
    }

    let mut created = 0_i64;
    let mut reactivated = 0_i64;
    let mut skipped = 0_i64;
    let mut affected_ids: Vec<i64> = Vec::new();

    for key in &dedup_keys {
        let preset = preset_map[key.as_str()];
        let norm_preset_name = normalize_product_name(&preset.name);
        let existing = by_barcode
            .get(&preset.barcode)
            .or_else(|| by_norm_name.get(&norm_preset_name))
            .cloned();

        if let Some((cur_id, cur_ref, cur_active)) = existing {
            if activate && cur_active == 0 {
                sqlx::query(
                    "UPDATE products
                     SET is_active = 1, status = 'active', updated_at = datetime('now')
                     WHERE id = ?",
                )
                .bind(cur_id)
                .execute(&mut *tx)
                .await?;
                let updated_info = (cur_id, cur_ref, 1_i64);
                by_barcode.insert(preset.barcode.clone(), updated_info.clone());
                by_norm_name.insert(norm_preset_name, updated_info);
                reactivated += 1;
                affected_ids.push(cur_id);
            } else {
                skipped += 1;
            }
            continue;
        }

        let dup_pkg_bc: Option<i64> =
            sqlx::query_scalar("SELECT id FROM product_packagings WHERE barcode = ? LIMIT 1")
                .bind(&preset.barcode)
                .fetch_optional(&mut *tx)
                .await?;
        if dup_pkg_bc.is_some() {
            return Err(CoreError::DuplicateOperation(format!(
                "Code-barres déjà utilisé sur un conditionnement : {}",
                preset.barcode
            )));
        }

        let supplier_id =
            resolve_preset_supplier_tx(&mut tx, &preset.brewery, &brewery_map).await?;
        let category_id = resolve_preset_category_tx(&mut tx, &preset.category).await?;
        let brewery_id = resolve_preset_brewery_id_tx(&mut tx, &preset.brewery).await?;

        let initial_stock = Quantity::parse_str(&preset.initial_stock, "Stock initial")?;
        let min_stock = Quantity::parse_str(&preset.min_stock, "Stock minimum")?;
        let purchase_price = Money::from_non_negative(preset.purchase_price, "Prix d'achat")?;
        let wholesale_price = Money::from_non_negative(preset.wholesale_price, "Prix gros")?;
        let semi_price = Money::from_non_negative(preset.semi_wholesale_price, "Prix demi-gros")?;
        let retail_price = Money::from_non_negative(preset.retail_price, "Prix détail")?;
        let is_active = if activate { 1_i64 } else { 0_i64 };
        let status = if activate { "active" } else { "inactive" };

        let reference = DepotDb::next_sequence(&mut tx, "PROD").await?;
        let prod_id = sqlx::query(
            "INSERT INTO products (
                reference, barcode, name, brand, brewery_id, category_id, supplier_id,
                description, default_location_id, status, base_unit, stock_milli,
                min_stock_milli, max_stock_milli, average_cost_num, average_cost_den,
                purchase_price, wholesale_price, semi_wholesale_price, retail_price,
                image_path, is_active, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, '1', ?, ?, ?, ?, NULL, ?, datetime('now'))",
        )
        .bind(&reference)
        .bind(&preset.barcode)
        .bind(&preset.name)
        .bind(&preset.brand)
        .bind(brewery_id)
        .bind(category_id)
        .bind(supplier_id)
        .bind(&preset.description)
        .bind(default_loc_id)
        .bind(status)
        .bind(&preset.base_unit)
        .bind(initial_stock.milli_units)
        .bind(min_stock.milli_units)
        .bind(purchase_price.value().to_string())
        .bind(purchase_price.value())
        .bind(wholesale_price.value())
        .bind(semi_price.value())
        .bind(retail_price.value())
        .bind(is_active)
        .execute(&mut *tx)
        .await?
        .last_insert_rowid();

        for (idx, pk) in preset.packagings.iter().enumerate() {
            insert_preset_packaging_tx(
                &mut tx,
                prod_id,
                &preset.base_unit,
                pk,
                idx == 0,
                &returnable_map,
            )
            .await?;
        }

        let info = (prod_id, reference, is_active);
        by_barcode.insert(preset.barcode.clone(), info.clone());
        by_norm_name.insert(norm_preset_name, info);
        created += 1;
        affected_ids.push(prod_id);
    }

    if created > 0 || reactivated > 0 {
        audit_log_tx(
            &mut tx,
            "APPLY_CATALOG_PRESETS",
            "products",
            None,
            &format!(
                "Catalogue brasseries : {created} créé(s), {reactivated} réactivé(s), {skipped} ignoré(s) (actif={activate})"
            ),
        )
        .await?;
    }
    tx.commit().await?;

    let mut products = Vec::with_capacity(affected_ids.len());
    for pid in affected_ids {
        products.push(get_product_by_id(db, pid).await?);
    }

    Ok(ApplyCatalogPresetsResultDto {
        created,
        reactivated,
        skipped,
        activate,
        products,
    })
}
