// ============================================================================
// Mise à jour d'une fiche produit existante
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::sales::audit_log_tx;
use crate::domain::money::Money;
use crate::domain::quantity::Quantity;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{get_product_by_id, sanitize_image_path, ProductSummaryDto, UpdateProductInput};

pub async fn update_product(
    db: &DepotDb,
    id: i64,
    input: UpdateProductInput,
) -> CoreResult<ProductSummaryDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    type ExistingProductRow = (
        String,
        String,
        Option<String>,
        Option<String>,
        i64,
        Option<i64>,
        Option<String>,
        i64,
        i64,
        Option<i64>,
        Option<i64>,
        Option<i64>,
        Option<i64>,
        Option<String>,
        i64,
    );
    let (_guard, mut tx) = db.begin_write().await?;
    let existing: Option<ExistingProductRow> = sqlx::query_as(
        "SELECT reference, name, brand, barcode, category_id, supplier_id, description,
                min_stock_milli, max_stock_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, image_path, is_active
         FROM products WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;

    let cur = existing.ok_or_else(|| CoreError::Validation("Produit introuvable.".to_string()))?;

    let name = match input.name {
        Some(n) => {
            let trimmed = n.trim().to_string();
            if trimmed.is_empty() {
                return Err(CoreError::Validation("Nom produit invalide.".to_string()));
            }
            trimmed
        }
        None => cur.1.clone(),
    };

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

    let barcode = match input.barcode {
        Some(b) => {
            let trimmed = b.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }
        None => cur.3.clone(),
    };
    if let Some(ref bc) = barcode {
        let dup: Option<(i64,)> = sqlx::query_as(
            "SELECT id FROM products WHERE barcode = ? AND id != ? UNION SELECT id FROM product_packagings WHERE barcode = ?",
        )
        .bind(bc)
        .bind(id)
        .bind(bc)
        .fetch_optional(&mut *tx)
        .await?;
        if dup.is_some() {
            return Err(CoreError::DuplicateOperation(
                "Code-barres déjà utilisé.".to_string(),
            ));
        }
    }

    let min_stock = match input.min_stock {
        Some(s) => Quantity::parse_str(&s, "Stock minimum")?.milli_units,
        None => cur.7,
    };
    let max_stock = match input.max_stock {
        Some(s) => Quantity::parse_str(&s, "Stock maximum")?.milli_units,
        None => cur.8,
    };

    let purchase_price = match input.purchase_price {
        Some(v) => Some(Money::from_non_negative(v, "Prix d'achat")?.value()),
        None => cur.9,
    };
    let wholesale_price = match input.wholesale_price {
        Some(v) => Some(Money::from_non_negative(v, "Prix gros")?.value()),
        None => cur.10,
    };
    let semi_price = match input.semi_wholesale_price {
        Some(v) => Some(Money::from_non_negative(v, "Prix demi-gros")?.value()),
        None => cur.11,
    };
    let retail_price = match input.retail_price {
        Some(v) => Some(Money::from_non_negative(v, "Prix détail")?.value()),
        None => cur.12,
    };
    let image_path = match input.image_path {
        Some(opt) => sanitize_image_path(opt.as_deref())?,
        None => cur.13.clone(),
    };
    let is_active = input
        .is_active
        .map(|b| if b { 1_i64 } else { 0_i64 })
        .unwrap_or(cur.14);

    sqlx::query(
        "UPDATE products
         SET name = ?, brand = ?, barcode = ?, category_id = ?, supplier_id = ?, description = ?,
             min_stock_milli = ?, max_stock_milli = ?, purchase_price = ?, wholesale_price = ?,
             semi_wholesale_price = ?, retail_price = ?, image_path = ?, is_active = ?
         WHERE id = ?",
    )
    .bind(&name)
    .bind(input.brand.or(cur.2))
    .bind(&barcode)
    .bind(input.category_id.unwrap_or(cur.4))
    .bind(input.supplier_id.or(cur.5))
    .bind(input.description.or(cur.6))
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

    audit_log_tx(
        &mut tx,
        "UPDATE_PRODUCT",
        "products",
        Some(id.to_string()),
        &format!("Mise à jour produit {}", cur.0),
    )
    .await?;
    tx.commit().await?;
    get_product_by_id(db, id).await
}
