// ============================================================================
// Création de produit et de ses conditionnements initiaux
// ============================================================================

use std::collections::HashSet;

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::sales::audit_log_tx;
use crate::domain::money::Money;
use crate::domain::quantity::Quantity;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::packaging::validate_packaging_prices;
use super::{
    get_product_by_id, sanitize_image_path, CreateProductInput, PackagingInput, ProductSummaryDto,
    ALLOWED_PACKAGING_NAMES,
};

pub async fn create_product(
    db: &DepotDb,
    input: CreateProductInput,
) -> CoreResult<ProductSummaryDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let name = input.name.trim().to_string();
    let base_unit = input.base_unit.trim().to_string();
    if name.is_empty() {
        return Err(CoreError::Validation(
            "Le nom du produit est obligatoire.".to_string(),
        ));
    }
    if base_unit.is_empty() {
        return Err(CoreError::Validation(
            "L'unité de base est obligatoire.".to_string(),
        ));
    }

    let initial_stock = Quantity::parse_str(
        input.initial_stock.as_deref().unwrap_or("0"),
        "Stock initial",
    )?;
    let min_stock =
        Quantity::parse_str(input.min_stock.as_deref().unwrap_or("0"), "Stock minimum")?;
    let max_stock =
        Quantity::parse_str(input.max_stock.as_deref().unwrap_or("0"), "Stock maximum")?;

    let purchase_price = input
        .purchase_price
        .map(|v| Money::from_non_negative(v, "Prix d'achat").map(|m| m.value()))
        .transpose()?;
    let wholesale_price = input
        .wholesale_price
        .map(|v| Money::from_non_negative(v, "Prix gros").map(|m| m.value()))
        .transpose()?;
    let semi_price = input
        .semi_wholesale_price
        .map(|v| Money::from_non_negative(v, "Prix demi-gros").map(|m| m.value()))
        .transpose()?;
    let retail_price = input
        .retail_price
        .map(|v| Money::from_non_negative(v, "Prix détail").map(|m| m.value()))
        .transpose()?;
    let image_path = sanitize_image_path(input.image_path.as_deref())?;

    let default_pkg_name = "casier".to_string();
    let packagings = match input.packagings {
        Some(list) if !list.is_empty() => list,
        _ => vec![PackagingInput {
            id: None,
            name: default_pkg_name,
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
    for pkg in &packagings {
        if !ALLOWED_PACKAGING_NAMES.contains(&pkg.name.as_str()) {
            return Err(CoreError::Validation(format!(
                "Conditionnement non autorisé : {} (seul \"casier\" est autorisé)",
                pkg.name
            )));
        }
        if pkg.deposit_mode.as_deref() == Some("deposit") && pkg.name != "casier" {
            return Err(CoreError::Validation(
                "Seul le conditionnement \"casier\" est soumis au système de retour d'emballage."
                    .to_string(),
            ));
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
    }

    let (_guard, mut tx) = db.begin_write().await?;

    if sqlx::query_scalar::<_, i64>("SELECT id FROM categories WHERE id = ?")
        .bind(input.category_id)
        .fetch_optional(&mut *tx)
        .await?
        .is_none()
    {
        return Err(CoreError::Validation("Catégorie introuvable.".to_string()));
    }
    if let Some(sup_id) = input.supplier_id {
        if sqlx::query_scalar::<_, i64>("SELECT id FROM suppliers WHERE id = ?")
            .bind(sup_id)
            .fetch_optional(&mut *tx)
            .await?
            .is_none()
        {
            return Err(CoreError::Validation(
                "Fournisseur introuvable.".to_string(),
            ));
        }
    }

    let clean_barcode = input
        .barcode
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if let Some(bc) = clean_barcode {
        let dup: Option<(i64,)> = sqlx::query_as(
            "SELECT id FROM products WHERE barcode = ? UNION SELECT id FROM product_packagings WHERE barcode = ?",
        )
        .bind(bc)
        .bind(bc)
        .fetch_optional(&mut *tx)
        .await?;
        if dup.is_some() {
            return Err(CoreError::DuplicateOperation(
                "Ce code-barres est déjà utilisé.".to_string(),
            ));
        }
    }

    let reference = DepotDb::next_sequence(&mut tx, "PROD").await?;
    let avg_num = purchase_price.map(|v| v.to_string());
    let avg_den = purchase_price.map(|_| "1".to_string());

    let product_id = sqlx::query(
        "INSERT INTO products (reference, barcode, name, brand, category_id, supplier_id, description, base_unit,
                               stock_milli, min_stock_milli, max_stock_milli, average_cost_num, average_cost_den,
                               purchase_price, wholesale_price, semi_wholesale_price, retail_price, image_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&reference)
    .bind(clean_barcode)
    .bind(&name)
    .bind(input.brand.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.category_id)
    .bind(input.supplier_id)
    .bind(input.description.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(&base_unit)
    .bind(initial_stock.milli_units)
    .bind(min_stock.milli_units)
    .bind(max_stock.milli_units)
    .bind(avg_num)
    .bind(avg_den)
    .bind(purchase_price)
    .bind(wholesale_price)
    .bind(semi_price)
    .bind(retail_price)
    .bind(image_path)
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    if initial_stock.milli_units > 0 {
        sqlx::query(
            "INSERT INTO stock_movements (product_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, unit_cost, reason, reference_document)
             VALUES (?, 'manual_adjust', ?, 0, ?, ?, 'Stock initial à la création', ?)",
        )
        .bind(product_id)
        .bind(initial_stock.milli_units)
        .bind(initial_stock.milli_units)
        .bind(purchase_price)
        .bind(&reference)
        .execute(&mut *tx)
        .await?;
    }

    for pkg in packagings {
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
            .fetch_optional(&mut *tx)
            .await?;
            if dup.is_some() {
                return Err(CoreError::DuplicateOperation(format!(
                    "Code-barres déjà utilisé : {bc}"
                )));
            }
        }

        let pkg_id = sqlx::query(
            "INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, barcode, allow_fraction)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(product_id)
        .bind(&pkg.name)
        .bind(&base_unit)
        .bind(coeff.milli_units)
        .bind(pkg.purchase_price)
        .bind(pkg.wholesale_price)
        .bind(pkg.semi_wholesale_price)
        .bind(pkg.retail_price)
        .bind(pkg_bc)
        .bind(if pkg.allow_fraction.unwrap_or(false) { 1_i64 } else { 0_i64 })
        .execute(&mut *tx)
        .await?
        .last_insert_rowid();

        let mode = if pkg.deposit_mode.as_deref() == Some("deposit") {
            "deposit"
        } else {
            "none"
        };
        sqlx::query("INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, ?)")
            .bind(pkg_id)
            .bind(mode)
            .execute(&mut *tx)
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
                    .fetch_optional(&mut *tx)
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
                    .execute(&mut *tx)
                    .await?;
                }
            }
        }
    }

    audit_log_tx(
        &mut tx,
        "CREATE_PRODUCT",
        "products",
        Some(product_id.to_string()),
        &format!("Création produit {reference} — {name}"),
    )
    .await?;
    tx.commit().await?;
    get_product_by_id(db, product_id).await
}
