// ============================================================================
// Validation des références & enregistrement du stock initial à la création
// ============================================================================

use std::collections::HashSet;

use sqlx::{Sqlite, Transaction};

use crate::domain::quantity::Quantity;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::packaging::{validate_packaging_extras, validate_packaging_prices};
use super::v4_types::PackagingV4Extras;
use super::{PackagingInput, ALLOWED_PACKAGING_NAMES};

pub(crate) fn prepare_and_validate_packagings(
    raw: Option<Vec<PackagingInput>>,
    purchase_price: Option<i64>,
    wholesale_price: Option<i64>,
    semi_price: Option<i64>,
    retail_price: Option<i64>,
    pkg_extras: &[PackagingV4Extras],
) -> CoreResult<Vec<PackagingInput>> {
    let packagings = match raw {
        Some(list) if !list.is_empty() => list,
        _ => vec![PackagingInput {
            id: None,
            name: "casier".to_string(),
            coefficient: "1".to_string(),
            purchase_price,
            wholesale_price,
            semi_wholesale_price: semi_price,
            retail_price,
            barcode: None,
            allow_fraction: Some(false),
            is_active: Some(true),
            deposit_mode: Some("none".to_string()),
            components: None,
        }],
    };
    let mut seen_pkg_names = HashSet::with_capacity(packagings.len());
    for (idx, pkg) in packagings.iter().enumerate() {
        if !ALLOWED_PACKAGING_NAMES.contains(&pkg.name.as_str()) {
            return Err(CoreError::Validation(format!(
                "Conditionnement non autorisé : {} (autorisés : casier, carton, bouteille, pack, canette)",
                pkg.name
            )));
        }
        if !seen_pkg_names.insert(pkg.name.clone()) {
            return Err(CoreError::DuplicateOperation(format!(
                "Conditionnement \"{}\" dupliqué sur le même produit.",
                pkg.name
            )));
        }
        let coeff = Quantity::parse_str(&pkg.coefficient, &format!("Coefficient ({})", pkg.name))?;
        if coeff.milli_units <= 0 {
            return Err(CoreError::Validation(
                "Coefficient nul interdit.".to_string(),
            ));
        }
        validate_packaging_prices(pkg)?;
        if let Some(ex) = pkg_extras.get(idx) {
            validate_packaging_extras(ex)?;
        }
    }
    Ok(packagings)
}

pub(crate) async fn validate_create_refs_and_codes_tx(
    tx: &mut Transaction<'_, Sqlite>,
    category_id: i64,
    subcategory_id: Option<i64>,
    supplier_id: Option<i64>,
    clean_barcode: Option<&str>,
    custom_sku: Option<&str>,
) -> CoreResult<String> {
    if sqlx::query_scalar::<_, i64>("SELECT id FROM categories WHERE id = ?")
        .bind(category_id)
        .fetch_optional(&mut **tx)
        .await?
        .is_none()
    {
        return Err(CoreError::Validation("Catégorie introuvable.".to_string()));
    }
    if let Some(sub_id) = subcategory_id {
        if sqlx::query_scalar::<_, i64>("SELECT id FROM categories WHERE id = ?")
            .bind(sub_id)
            .fetch_optional(&mut **tx)
            .await?
            .is_none()
        {
            return Err(CoreError::Validation(
                "Sous-catégorie introuvable.".to_string(),
            ));
        }
    }
    if let Some(sup_id) = supplier_id {
        if sqlx::query_scalar::<_, i64>("SELECT id FROM suppliers WHERE id = ?")
            .bind(sup_id)
            .fetch_optional(&mut **tx)
            .await?
            .is_none()
        {
            return Err(CoreError::Validation(
                "Fournisseur introuvable.".to_string(),
            ));
        }
    }
    if let Some(bc) = clean_barcode {
        let dup: Option<(i64,)> = sqlx::query_as(
            "SELECT id FROM products WHERE barcode = ? UNION SELECT id FROM product_packagings WHERE barcode = ? UNION SELECT id FROM product_variants WHERE barcode = ?",
        )
        .bind(bc)
        .bind(bc)
        .bind(bc)
        .fetch_optional(&mut **tx)
        .await?;
        if dup.is_some() {
            return Err(CoreError::DuplicateOperation(
                "Ce code-barres est déjà utilisé.".to_string(),
            ));
        }
    }
    match custom_sku
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_uppercase)
    {
        Some(sku) => {
            let dup: Option<i64> =
                sqlx::query_scalar("SELECT id FROM products WHERE reference = ?")
                    .bind(&sku)
                    .fetch_optional(&mut **tx)
                    .await?;
            if dup.is_some() {
                return Err(CoreError::DuplicateOperation(format!(
                    "Ce code SKU existe déjà : {sku}"
                )));
            }
            Ok(sku)
        }
        None => DepotDb::next_sequence(tx, "PROD").await,
    }
}

pub(crate) async fn record_initial_stock_tx(
    tx: &mut Transaction<'_, Sqlite>,
    product_id: i64,
    variant_id: Option<i64>,
    default_loc_id: Option<i64>,
    initial_stock_milli: i64,
    purchase_price: Option<i64>,
    reference: &str,
) -> CoreResult<()> {
    if initial_stock_milli <= 0 {
        return Ok(());
    }
    sqlx::query(
        "INSERT INTO stock_movements (product_id, variant_id, location_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, unit_cost, reason, reference_document)
         VALUES (?, ?, ?, 'manual_adjust', ?, 0, ?, ?, 'Inventaire initial à la création', ?)",
    )
    .bind(product_id)
    .bind(variant_id)
    .bind(default_loc_id)
    .bind(initial_stock_milli)
    .bind(initial_stock_milli)
    .bind(purchase_price)
    .bind(reference)
    .execute(&mut **tx)
    .await?;
    if let Some(lid) = default_loc_id {
        sqlx::query("INSERT INTO stock_balances (product_id, variant_id, location_id, quantity_milli) VALUES (?, ?, ?, ?)")
            .bind(product_id)
            .bind(variant_id)
            .bind(lid)
            .bind(initial_stock_milli)
            .execute(&mut **tx)
            .await?;
    }
    Ok(())
}
