// ============================================================================
// CRUD des unités commerciales de vente (sales_units) + historique de prix
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{CreateSalesUnitInput, SalesUnitDto};

pub(super) const ALLOWED_UNIT_TYPES: &[&str] = &[
    "bottle",
    "can",
    "pack",
    "carton",
    "half_crate",
    "crate",
    "film",
    "pallet",
    "custom",
];

pub(super) fn validate_opt_price(p: Option<i64>, label: &str) -> CoreResult<()> {
    if let Some(v) = p {
        if v < 0 {
            return Err(CoreError::Validation(format!(
                "{label} ne peut pas être négatif."
            )));
        }
    }
    Ok(())
}

pub async fn list_sales_units(db: &DepotDb, product_id: i64) -> CoreResult<Vec<SalesUnitDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let rows = sqlx::query_as::<_, SalesUnitDto>(
        "SELECT * FROM sales_units WHERE product_id = ? AND is_active = 1 ORDER BY conversion_factor ASC, id ASC",
    )
    .bind(product_id)
    .fetch_all(&db.pool)
    .await?;
    Ok(rows)
}

pub async fn create_sales_unit(
    db: &DepotDb,
    input: CreateSalesUnitInput,
) -> CoreResult<SalesUnitDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let label = input.label.trim();
    if label.is_empty() {
        return Err(CoreError::Validation(
            "Le libellé de l'unité de vente est obligatoire.".to_string(),
        ));
    }
    if !ALLOWED_UNIT_TYPES.contains(&input.unit_type.as_str()) {
        return Err(CoreError::Validation(format!(
            "Type d'unité invalide : {}",
            input.unit_type
        )));
    }
    if input.conversion_factor <= 0 {
        return Err(CoreError::Validation(
            "Le facteur de conversion doit être > 0.".to_string(),
        ));
    }
    validate_opt_price(input.purchase_price, "Prix d'achat")?;
    validate_opt_price(input.wholesale_price, "Prix gros")?;
    validate_opt_price(input.semi_wholesale_price, "Prix demi-gros")?;
    validate_opt_price(input.retail_price, "Prix détail")?;
    validate_opt_price(input.min_selling_price, "Prix minimum")?;
    validate_opt_price(input.bottle_deposit_amount, "Consigne bouteille")?;
    validate_opt_price(input.crate_deposit_amount, "Consigne casier")?;

    let (_guard, mut tx) = db.begin_write().await?;
    let prod_exists: Option<i64> = sqlx::query_scalar("SELECT id FROM products WHERE id = ?")
        .bind(input.product_id)
        .fetch_optional(&mut *tx)
        .await?;
    if prod_exists.is_none() {
        return Err(CoreError::Validation("Produit introuvable.".to_string()));
    }

    let clean_bc = input
        .barcode
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if let Some(bc) = clean_bc {
        let dup: Option<i64> = sqlx::query_scalar(
            "SELECT id FROM sales_units WHERE barcode = ?
             UNION SELECT id FROM products WHERE barcode = ?
             UNION SELECT id FROM product_packagings WHERE barcode = ?",
        )
        .bind(bc)
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

    if input.is_default_sale.unwrap_or(false) {
        sqlx::query("UPDATE sales_units SET is_default_sale = 0 WHERE product_id = ?")
            .bind(input.product_id)
            .execute(&mut *tx)
            .await?;
    }

    let id = sqlx::query(
        "INSERT INTO sales_units (
            product_id, variant_id, packaging_id, code, label, unit_type, conversion_factor,
            is_virtual, allow_fraction, purchase_price, wholesale_price, semi_wholesale_price,
            retail_price, min_selling_price, bottle_deposit_amount, crate_deposit_amount,
            barcode, is_default_sale, is_default_purchase, is_active
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(input.product_id)
    .bind(input.variant_id)
    .bind(input.packaging_id)
    .bind(
        input
            .code
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty()),
    )
    .bind(label)
    .bind(&input.unit_type)
    .bind(input.conversion_factor)
    .bind(if input.is_virtual.unwrap_or(false) {
        1_i64
    } else {
        0_i64
    })
    .bind(if input.allow_fraction.unwrap_or(false) {
        1_i64
    } else {
        0_i64
    })
    .bind(input.purchase_price)
    .bind(input.wholesale_price)
    .bind(input.semi_wholesale_price)
    .bind(input.retail_price)
    .bind(input.min_selling_price)
    .bind(input.bottle_deposit_amount.unwrap_or(0))
    .bind(input.crate_deposit_amount.unwrap_or(0))
    .bind(clean_bc)
    .bind(if input.is_default_sale.unwrap_or(false) {
        1_i64
    } else {
        0_i64
    })
    .bind(if input.is_default_purchase.unwrap_or(false) {
        1_i64
    } else {
        0_i64
    })
    .bind(if input.is_active.unwrap_or(true) {
        1_i64
    } else {
        0_i64
    })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    for (ptype, amt) in [
        ("PURCHASE", input.purchase_price),
        ("WHOLESALE", input.wholesale_price),
        ("SEMI_WHOLESALE", input.semi_wholesale_price),
        ("RETAIL", input.retail_price),
        ("MINIMUM_SELLING_PRICE", input.min_selling_price),
    ] {
        if let Some(val) = amt {
            sqlx::query(
                "INSERT INTO price_history (entity_type, entity_id, variant_id, sales_unit_id, price_type, new_price, currency, effective_from, reason)
                 VALUES ('product_packaging', ?, ?, ?, ?, ?, 'FCFA', datetime('now'), 'Configuration unité de vente')",
            )
            .bind(input.packaging_id.unwrap_or(id))
            .bind(input.variant_id)
            .bind(id)
            .bind(ptype)
            .bind(val)
            .execute(&mut *tx)
            .await?;
        }
    }
    tx.commit().await?;

    let created = sqlx::query_as::<_, SalesUnitDto>("SELECT * FROM sales_units WHERE id = ?")
        .bind(id)
        .fetch_one(&db.pool)
        .await?;
    Ok(created)
}
