// ============================================================================
// Helpers SQL pour résolution fournisseurs, catégories & emballages prédéfinis
// ============================================================================

use std::collections::HashMap;

use sqlx::{Sqlite, Transaction};

use crate::domain::quantity::Quantity;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::presets_types::{PresetBreweryMeta, PresetPackagingRaw, PresetReturnableMeta};
use super::ALLOWED_PACKAGING_NAMES;

pub(crate) async fn resolve_preset_supplier_tx(
    tx: &mut Transaction<'_, Sqlite>,
    brewery: &str,
    brewery_map: &HashMap<&str, &PresetBreweryMeta>,
) -> CoreResult<i64> {
    let sup_pattern = format!("%{}%", brewery.to_uppercase());
    let existing_sup: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM suppliers
         WHERE upper(name) LIKE ? OR upper(COALESCE(company_name, '')) LIKE ?
         ORDER BY id ASC LIMIT 1",
    )
    .bind(&sup_pattern)
    .bind(&sup_pattern)
    .fetch_optional(&mut **tx)
    .await?;

    if let Some(sid) = existing_sup {
        return Ok(sid);
    }

    let meta = brewery_map.get(brewery).ok_or_else(|| {
        CoreError::Internal(format!("Métadonnées brasserie introuvables : {brewery}"))
    })?;
    let sup_code = DepotDb::next_sequence(tx, "FRN").await?;
    let id = sqlx::query(
        "INSERT INTO suppliers (code, name, company_name, phone, address, payment_terms_days)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&sup_code)
    .bind(&meta.name)
    .bind(&meta.company_name)
    .bind(&meta.phone)
    .bind(&meta.address)
    .bind(meta.payment_terms_days)
    .execute(&mut **tx)
    .await?
    .last_insert_rowid();
    Ok(id)
}

pub(crate) async fn resolve_preset_category_tx(
    tx: &mut Transaction<'_, Sqlite>,
    category_name: &str,
) -> CoreResult<i64> {
    let existing_cat: Option<i64> =
        sqlx::query_scalar("SELECT id FROM categories WHERE lower(name) = lower(?)")
            .bind(category_name)
            .fetch_optional(&mut **tx)
            .await?;

    if let Some(cid) = existing_cat {
        return Ok(cid);
    }

    let id = sqlx::query("INSERT INTO categories (name) VALUES (?)")
        .bind(category_name)
        .execute(&mut **tx)
        .await?
        .last_insert_rowid();
    Ok(id)
}

pub(crate) async fn resolve_preset_brewery_id_tx(
    tx: &mut Transaction<'_, Sqlite>,
    brewery_name: &str,
) -> CoreResult<Option<i64>> {
    sqlx::query_scalar(
        "SELECT id FROM breweries
         WHERE upper(name) = upper(?) OR upper(COALESCE(short_name, '')) = upper(?)
         ORDER BY id ASC LIMIT 1",
    )
    .bind(brewery_name)
    .bind(brewery_name)
    .fetch_optional(&mut **tx)
    .await
    .map_err(Into::into)
}

pub(crate) async fn insert_preset_packaging_tx(
    tx: &mut Transaction<'_, Sqlite>,
    prod_id: i64,
    base_unit: &str,
    pk: &PresetPackagingRaw,
    is_default: bool,
    returnable_map: &HashMap<&str, &PresetReturnableMeta>,
) -> CoreResult<()> {
    if !ALLOWED_PACKAGING_NAMES.contains(&pk.name.as_str()) {
        return Err(CoreError::Validation(format!(
            "Conditionnement non autorisé : {}",
            pk.name
        )));
    }
    let coeff = Quantity::parse_str(&pk.coefficient, "Coefficient")?;
    let pkg_bc = pk
        .barcode
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if let Some(bc) = pkg_bc {
        let dup: Option<(i64,)> = sqlx::query_as(
            "SELECT id FROM products WHERE barcode = ?
             UNION SELECT id FROM product_packagings WHERE barcode = ?",
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

    let is_casier = pk.name == "casier";
    let mode = if pk.deposit_mode == "deposit" {
        "deposit"
    } else {
        "none"
    };
    let pkg_id = sqlx::query(
        "INSERT INTO product_packagings (
            product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price,
            semi_wholesale_price, retail_price, barcode, allow_fraction, is_reusable,
            is_returnable, is_default_sale, is_default_purchase
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(prod_id)
    .bind(&pk.name)
    .bind(base_unit)
    .bind(coeff.milli_units)
    .bind(pk.purchase_price)
    .bind(pk.wholesale_price)
    .bind(pk.semi_wholesale_price)
    .bind(pk.retail_price)
    .bind(pkg_bc)
    .bind(if pk.allow_fraction { 1_i64 } else { 0_i64 })
    .bind(if mode == "deposit" || is_casier {
        1_i64
    } else {
        0_i64
    })
    .bind(if mode == "deposit" { 1_i64 } else { 0_i64 })
    .bind(if is_default { 1_i64 } else { 0_i64 })
    .bind(if is_casier || is_default {
        1_i64
    } else {
        0_i64
    })
    .execute(&mut **tx)
    .await?
    .last_insert_rowid();

    sqlx::query("INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, ?)")
        .bind(pkg_id)
        .bind(mode)
        .execute(&mut **tx)
        .await?;

    if mode == "deposit" {
        for comp in &pk.components {
            let existing_rt: Option<i64> =
                sqlx::query_scalar("SELECT id FROM returnable_packaging_types WHERE code = ?")
                    .bind(&comp.returnable_code)
                    .fetch_optional(&mut **tx)
                    .await?;

            let rt_id = match existing_rt {
                Some(id) => id,
                None => {
                    let rmeta = returnable_map
                        .get(comp.returnable_code.as_str())
                        .ok_or_else(|| {
                            CoreError::Internal(format!(
                                "Emballage consigné prédéfini introuvable : {}",
                                comp.returnable_code
                            ))
                        })?;
                    let new_rt_id = sqlx::query(
                        "INSERT INTO returnable_packaging_types
                         (code, name, producer, kind, description, deposit_value)
                         VALUES (?, ?, ?, ?, ?, ?)",
                    )
                    .bind(&rmeta.code)
                    .bind(&rmeta.name)
                    .bind(&rmeta.producer)
                    .bind(&rmeta.kind)
                    .bind(&rmeta.description)
                    .bind(rmeta.deposit_value)
                    .execute(&mut **tx)
                    .await?
                    .last_insert_rowid();

                    sqlx::query(
                        "INSERT INTO returnable_stock_balances (packaging_id, quantity)
                         VALUES (?, 0)",
                    )
                    .bind(new_rt_id)
                    .execute(&mut **tx)
                    .await?;
                    new_rt_id
                }
            };

            sqlx::query(
                "INSERT INTO deposit_packaging_components (packaging_id, returnable_id, pieces_per_pack)
                 VALUES (?, ?, ?)",
            )
            .bind(pkg_id)
            .bind(rt_id)
            .bind(comp.pieces_per_pack)
            .execute(&mut **tx)
            .await?;
        }
    }

    Ok(())
}
