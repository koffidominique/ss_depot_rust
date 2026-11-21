// ============================================================================
// Création atomique d'un produit, variante physique, conditionnements & stock
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::sales::audit_log_tx;
use crate::domain::money::Money;
use crate::domain::quantity::Quantity;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::create_packagings::insert_initial_packagings_tx;
use super::create_prep_helpers::{
    prepare_and_validate_packagings, record_initial_stock_tx, validate_create_refs_and_codes_tx,
};
use super::create_units_helpers::{
    create_initial_product_suppliers_tx, create_initial_sales_units_tx,
};
use super::create_v4_helpers::{create_initial_variant_tx, validate_brewery_and_brand_tx};
use super::duplicate::ensure_unique_product_name;
use super::v4_types::ProductV4CreateExtras;
use super::{get_product_by_id, sanitize_image_path, CreateProductInput, ProductSummaryDto};

pub async fn create_product(
    db: &DepotDb,
    input: CreateProductInput,
) -> CoreResult<ProductSummaryDto> {
    create_product_v4(db, input, ProductV4CreateExtras::default()).await
}

pub async fn create_product_v4(
    db: &DepotDb,
    input: CreateProductInput,
    extras: ProductV4CreateExtras,
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

    let pkg_extras = extras.packaging_extras.unwrap_or_default();
    let packagings = prepare_and_validate_packagings(
        input.packagings,
        purchase_price,
        wholesale_price,
        semi_price,
        retail_price,
        &pkg_extras,
    )?;

    let (_guard, mut tx) = db.begin_write().await?;
    ensure_unique_product_name(&mut tx, &name, None).await?;

    let clean_barcode = input
        .barcode
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let reference = validate_create_refs_and_codes_tx(
        &mut tx,
        input.category_id,
        extras.subcategory_id,
        input.supplier_id,
        clean_barcode,
        extras.sku.as_deref(),
    )
    .await?;

    let resolved_brand =
        validate_brewery_and_brand_tx(&mut tx, extras.brewery_id, extras.brand_id).await?;
    let brand_text = input
        .brand
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or(resolved_brand);

    let is_active_val: i64 = match extras.is_active {
        Some(false) => 0,
        _ if extras.status.as_deref() == Some("inactive") => 0,
        _ => 1,
    };
    let status = extras
        .status
        .as_deref()
        .filter(|s| matches!(*s, "draft" | "active" | "inactive"))
        .unwrap_or(if is_active_val == 0 {
            "inactive"
        } else {
            "active"
        });
    let default_loc_id = match extras.default_location_id {
        Some(lid) => Some(lid),
        None => {
            sqlx::query_scalar::<_, i64>(
                "SELECT id FROM stock_locations WHERE is_default = 1 LIMIT 1",
            )
            .fetch_optional(&mut *tx)
            .await?
        }
    };

    let avg_num = purchase_price.map(|v| v.to_string());
    let avg_den = purchase_price.map(|_| "1".to_string());

    let product_id = sqlx::query(
        "INSERT INTO products (
            reference, barcode, name, brand, brewery_id, brand_id, category_id, subcategory_id,
            variant_label, supplier_id, description, alcohol_degree_milli, is_alcoholic,
            ingredients, beverage_color, storage_temp, shelf_life_days, is_perishable,
            track_batches, track_expiry, allow_credit_sale, allow_unit_sale, allow_mixed_sale,
            default_location_id, status, base_unit, stock_milli, min_stock_milli, max_stock_milli,
            average_cost_num, average_cost_den, purchase_price, wholesale_price,
            semi_wholesale_price, retail_price, image_path, is_active, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
    )
    .bind(&reference)
    .bind(clean_barcode)
    .bind(&name)
    .bind(brand_text.as_deref())
    .bind(extras.brewery_id)
    .bind(extras.brand_id)
    .bind(input.category_id)
    .bind(extras.subcategory_id)
    .bind(
        extras
            .variant_label
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty()),
    )
    .bind(input.supplier_id)
    .bind(
        input
            .description
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty()),
    )
    .bind(extras.alcohol_degree_milli)
    .bind(if extras.is_alcoholic.unwrap_or(false) {
        1_i64
    } else {
        0_i64
    })
    .bind(
        extras
            .ingredients
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty()),
    )
    .bind(
        extras
            .beverage_color
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty()),
    )
    .bind(
        extras
            .storage_temp
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty()),
    )
    .bind(extras.shelf_life_days)
    .bind(if extras.is_perishable.unwrap_or(false) {
        1_i64
    } else {
        0_i64
    })
    .bind(if extras.track_batches.unwrap_or(false) {
        1_i64
    } else {
        0_i64
    })
    .bind(if extras.track_expiry.unwrap_or(false) {
        1_i64
    } else {
        0_i64
    })
    .bind(if extras.allow_credit_sale.unwrap_or(true) {
        1_i64
    } else {
        0_i64
    })
    .bind(if extras.allow_unit_sale.unwrap_or(true) {
        1_i64
    } else {
        0_i64
    })
    .bind(if extras.allow_mixed_sale.unwrap_or(true) {
        1_i64
    } else {
        0_i64
    })
    .bind(default_loc_id)
    .bind(status)
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
    .bind(is_active_val)
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    let variant_id = if let Some(ref v) = extras.variant {
        Some(create_initial_variant_tx(&mut tx, product_id, &name, v).await?)
    } else {
        None
    };

    record_initial_stock_tx(
        &mut tx,
        product_id,
        variant_id,
        default_loc_id,
        initial_stock.milli_units,
        purchase_price,
        &reference,
    )
    .await?;

    let first_pkg_id = insert_initial_packagings_tx(
        &mut tx,
        product_id,
        variant_id,
        &base_unit,
        packagings,
        &pkg_extras,
    )
    .await?;

    if let Some(ref units) = extras.sales_units {
        create_initial_sales_units_tx(&mut tx, product_id, variant_id, first_pkg_id, units).await?;
    }
    if let Some(ref sups) = extras.product_suppliers {
        create_initial_product_suppliers_tx(&mut tx, product_id, sups).await?;
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
