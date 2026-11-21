// ============================================================================
// Mise à jour d'une fiche produit existante + historisation des prix
// ============================================================================

use sqlx::FromRow;

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::sales::audit_log_tx;
use crate::domain::money::Money;
use crate::domain::quantity::Quantity;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::create_v4_helpers::validate_brewery_and_brand_tx;
use super::duplicate::ensure_unique_product_name;
use super::v4_types::ProductV4UpdateExtras;
use super::{get_product_by_id, sanitize_image_path, ProductSummaryDto, UpdateProductInput};

#[derive(FromRow)]
struct ExistingProductRow {
    reference: String,
    name: String,
    brand: Option<String>,
    brewery_id: Option<i64>,
    brand_id: Option<i64>,
    barcode: Option<String>,
    category_id: i64,
    subcategory_id: Option<i64>,
    variant_label: Option<String>,
    supplier_id: Option<i64>,
    description: Option<String>,
    alcohol_degree_milli: Option<i64>,
    is_alcoholic: i64,
    ingredients: Option<String>,
    beverage_color: Option<String>,
    storage_temp: Option<String>,
    shelf_life_days: Option<i64>,
    is_perishable: i64,
    track_batches: i64,
    track_expiry: i64,
    allow_credit_sale: i64,
    allow_unit_sale: i64,
    allow_mixed_sale: i64,
    default_location_id: Option<i64>,
    status: String,
    min_stock_milli: i64,
    max_stock_milli: i64,
    purchase_price: Option<i64>,
    wholesale_price: Option<i64>,
    semi_wholesale_price: Option<i64>,
    retail_price: Option<i64>,
    image_path: Option<String>,
    is_active: i64,
}

pub async fn update_product(
    db: &DepotDb,
    id: i64,
    input: UpdateProductInput,
) -> CoreResult<ProductSummaryDto> {
    update_product_v4(db, id, input, ProductV4UpdateExtras::default()).await
}

pub async fn update_product_v4(
    db: &DepotDb,
    id: i64,
    input: UpdateProductInput,
    extras: ProductV4UpdateExtras,
) -> CoreResult<ProductSummaryDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let cur = sqlx::query_as::<_, ExistingProductRow>(
        "SELECT reference, name, brand, brewery_id, brand_id, barcode, category_id, subcategory_id,
                variant_label, supplier_id, description, alcohol_degree_milli, is_alcoholic,
                ingredients, beverage_color, storage_temp, shelf_life_days, is_perishable,
                track_batches, track_expiry, allow_credit_sale, allow_unit_sale, allow_mixed_sale,
                default_location_id, status, min_stock_milli, max_stock_milli, purchase_price,
                wholesale_price, semi_wholesale_price, retail_price, image_path, is_active
         FROM products WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| CoreError::Validation("Produit introuvable.".to_string()))?;

    let name = match input.name {
        Some(n) => {
            let trimmed = n.trim().to_string();
            if trimmed.is_empty() {
                return Err(CoreError::Validation("Nom produit invalide.".to_string()));
            }
            trimmed
        }
        None => cur.name,
    };
    ensure_unique_product_name(&mut tx, &name, Some(id)).await?;

    if let Some(cid) = input.category_id {
        if sqlx::query_scalar::<_, i64>("SELECT id FROM categories WHERE id = ?")
            .bind(cid)
            .fetch_optional(&mut *tx)
            .await?
            .is_none()
        {
            return Err(CoreError::Validation("Catégorie introuvable.".to_string()));
        }
    }
    if let Some(sid) = input.supplier_id {
        if sqlx::query_scalar::<_, i64>("SELECT id FROM suppliers WHERE id = ?")
            .bind(sid)
            .fetch_optional(&mut *tx)
            .await?
            .is_none()
        {
            return Err(CoreError::Validation(
                "Fournisseur introuvable.".to_string(),
            ));
        }
    }

    let brewery_id = extras.brewery_id.unwrap_or(cur.brewery_id);
    let brand_id = extras.brand_id.unwrap_or(cur.brand_id);
    let resolved_brand = validate_brewery_and_brand_tx(&mut tx, brewery_id, brand_id).await?;
    let brand = input.brand.or(resolved_brand).or(cur.brand);

    let barcode = match input.barcode {
        Some(b) => {
            let trimmed = b.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }
        None => cur.barcode,
    };
    if let Some(ref bc) = barcode {
        let dup: Option<(i64,)> = sqlx::query_as(
            "SELECT id FROM products WHERE barcode = ? AND id != ? UNION SELECT id FROM product_packagings WHERE barcode = ?",
        )
        .bind(bc).bind(id).bind(bc)
        .fetch_optional(&mut *tx).await?;
        if dup.is_some() {
            return Err(CoreError::DuplicateOperation(
                "Code-barres déjà utilisé.".to_string(),
            ));
        }
    }

    let min_stock = match input.min_stock {
        Some(s) => Quantity::parse_str(&s, "Stock minimum")?.milli_units,
        None => cur.min_stock_milli,
    };
    let max_stock = match input.max_stock {
        Some(s) => Quantity::parse_str(&s, "Stock maximum")?.milli_units,
        None => cur.max_stock_milli,
    };

    let purchase_price = match input.purchase_price {
        Some(v) => Some(Money::from_non_negative(v, "Prix d'achat")?.value()),
        None => cur.purchase_price,
    };
    let wholesale_price = match input.wholesale_price {
        Some(v) => Some(Money::from_non_negative(v, "Prix gros")?.value()),
        None => cur.wholesale_price,
    };
    let semi_price = match input.semi_wholesale_price {
        Some(v) => Some(Money::from_non_negative(v, "Prix demi-gros")?.value()),
        None => cur.semi_wholesale_price,
    };
    let retail_price = match input.retail_price {
        Some(v) => Some(Money::from_non_negative(v, "Prix détail")?.value()),
        None => cur.retail_price,
    };
    let image_path = match input.image_path {
        Some(opt) => sanitize_image_path(opt.as_deref())?,
        None => cur.image_path,
    };
    let supplier_id = if extras.clear_supplier_id == Some(true) {
        None
    } else {
        input.supplier_id.or(cur.supplier_id)
    };
    let (is_active, status) = match (input.is_active, extras.status.as_deref()) {
        (Some(false), _) => (0_i64, "inactive".to_string()),
        (Some(true), Some("draft")) => (1_i64, "draft".to_string()),
        (Some(true), _) => (1_i64, "active".to_string()),
        (None, Some("inactive")) => (0_i64, "inactive".to_string()),
        (None, Some("active")) => (1_i64, "active".to_string()),
        (None, Some("draft")) => (1_i64, "draft".to_string()),
        _ => (cur.is_active, cur.status),
    };

    sqlx::query(
        "UPDATE products
         SET name = ?, brand = ?, brewery_id = ?, brand_id = ?, barcode = ?,
             category_id = ?, subcategory_id = ?, variant_label = ?, supplier_id = ?, description = ?,
             alcohol_degree_milli = ?, is_alcoholic = ?, ingredients = ?, beverage_color = ?,
             storage_temp = ?, shelf_life_days = ?, is_perishable = ?, track_batches = ?,
             track_expiry = ?, allow_credit_sale = ?, allow_unit_sale = ?, allow_mixed_sale = ?,
             default_location_id = ?, status = ?, min_stock_milli = ?, max_stock_milli = ?,
             purchase_price = ?, wholesale_price = ?, semi_wholesale_price = ?, retail_price = ?,
             image_path = ?, is_active = ?, updated_at = datetime('now')
         WHERE id = ?",
    )
    .bind(&name)
    .bind(brand)
    .bind(brewery_id)
    .bind(brand_id)
    .bind(&barcode)
    .bind(input.category_id.unwrap_or(cur.category_id))
    .bind(extras.subcategory_id.unwrap_or(cur.subcategory_id))
    .bind(extras.variant_label.unwrap_or(cur.variant_label))
    .bind(supplier_id)
    .bind(input.description.or(cur.description))
    .bind(extras.alcohol_degree_milli.unwrap_or(cur.alcohol_degree_milli))
    .bind(extras.is_alcoholic.map(|b| if b { 1 } else { 0 }).unwrap_or(cur.is_alcoholic))
    .bind(extras.ingredients.unwrap_or(cur.ingredients))
    .bind(extras.beverage_color.unwrap_or(cur.beverage_color))
    .bind(extras.storage_temp.unwrap_or(cur.storage_temp))
    .bind(extras.shelf_life_days.unwrap_or(cur.shelf_life_days))
    .bind(extras.is_perishable.map(|b| if b { 1 } else { 0 }).unwrap_or(cur.is_perishable))
    .bind(extras.track_batches.map(|b| if b { 1 } else { 0 }).unwrap_or(cur.track_batches))
    .bind(extras.track_expiry.map(|b| if b { 1 } else { 0 }).unwrap_or(cur.track_expiry))
    .bind(extras.allow_credit_sale.map(|b| if b { 1 } else { 0 }).unwrap_or(cur.allow_credit_sale))
    .bind(extras.allow_unit_sale.map(|b| if b { 1 } else { 0 }).unwrap_or(cur.allow_unit_sale))
    .bind(extras.allow_mixed_sale.map(|b| if b { 1 } else { 0 }).unwrap_or(cur.allow_mixed_sale))
    .bind(extras.default_location_id.unwrap_or(cur.default_location_id))
    .bind(&status)
    .bind(min_stock)
    .bind(max_stock)
    .bind(purchase_price)
    .bind(wholesale_price)
    .bind(semi_price)
    .bind(retail_price)
    .bind(image_path)
    .bind(is_active)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    for (ptype, old_v, new_v) in [
        ("PURCHASE", cur.purchase_price, purchase_price),
        ("WHOLESALE", cur.wholesale_price, wholesale_price),
        ("SEMI_WHOLESALE", cur.semi_wholesale_price, semi_price),
        ("RETAIL", cur.retail_price, retail_price),
    ] {
        if old_v != new_v {
            if let Some(nv) = new_v {
                sqlx::query(
                    "INSERT INTO price_history (entity_type, entity_id, price_type, old_price, new_price, currency, effective_from, reason)
                     VALUES ('product', ?, ?, ?, ?, 'FCFA', datetime('now'), 'Mise à jour fiche produit')",
                )
                .bind(id)
                .bind(ptype)
                .bind(old_v)
                .bind(nv)
                .execute(&mut *tx)
                .await?;
            }
        }
    }

    audit_log_tx(
        &mut tx,
        "UPDATE_PRODUCT",
        "products",
        Some(id.to_string()),
        &format!("Mise à jour produit {}", cur.reference),
    )
    .await?;
    tx.commit().await?;
    get_product_by_id(db, id).await
}
