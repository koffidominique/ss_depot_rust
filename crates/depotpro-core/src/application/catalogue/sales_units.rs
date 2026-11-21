// ============================================================================
// CRUD des unités commerciales de vente (sales_units) + historique de prix
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{CreateSalesUnitInput, SalesUnitDto, UpdateSalesUnitInput};

const ALLOWED_UNIT_TYPES: &[&str] = &[
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

fn validate_opt_price(p: Option<i64>, label: &str) -> CoreResult<()> {
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
    .bind(input.code.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(label)
    .bind(&input.unit_type)
    .bind(input.conversion_factor)
    .bind(if input.is_virtual.unwrap_or(false) { 1_i64 } else { 0_i64 })
    .bind(if input.allow_fraction.unwrap_or(false) { 1_i64 } else { 0_i64 })
    .bind(input.purchase_price)
    .bind(input.wholesale_price)
    .bind(input.semi_wholesale_price)
    .bind(input.retail_price)
    .bind(input.min_selling_price)
    .bind(input.bottle_deposit_amount.unwrap_or(0))
    .bind(input.crate_deposit_amount.unwrap_or(0))
    .bind(clean_bc)
    .bind(if input.is_default_sale.unwrap_or(false) { 1_i64 } else { 0_i64 })
    .bind(if input.is_default_purchase.unwrap_or(false) { 1_i64 } else { 0_i64 })
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
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

pub async fn update_sales_unit(
    db: &DepotDb,
    id: i64,
    input: UpdateSalesUnitInput,
) -> CoreResult<SalesUnitDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let existing: Option<SalesUnitDto> = sqlx::query_as("SELECT * FROM sales_units WHERE id = ?")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?;
    let existing =
        existing.ok_or_else(|| CoreError::NotFound("Unité de vente introuvable.".into()))?;

    let label = match input.label {
        Some(l) => {
            let clean = l.trim().to_string();
            if clean.is_empty() {
                return Err(CoreError::Validation("Le libellé est obligatoire.".into()));
            }
            clean
        }
        None => existing.label,
    };
    let unit_type = input.unit_type.unwrap_or(existing.unit_type);
    if !ALLOWED_UNIT_TYPES.contains(&unit_type.as_str()) {
        return Err(CoreError::Validation("Type d'unité invalide.".into()));
    }
    let conversion_factor = input.conversion_factor.unwrap_or(existing.conversion_factor);
    if conversion_factor <= 0 {
        return Err(CoreError::Validation("Facteur de conversion invalide.".into()));
    }
    let purchase_price = input.purchase_price.unwrap_or(existing.purchase_price);
    let wholesale_price = input.wholesale_price.unwrap_or(existing.wholesale_price);
    let semi_wholesale_price = input
        .semi_wholesale_price
        .unwrap_or(existing.semi_wholesale_price);
    let retail_price = input.retail_price.unwrap_or(existing.retail_price);
    let min_selling_price = input.min_selling_price.unwrap_or(existing.min_selling_price);
    validate_opt_price(purchase_price, "Prix d'achat")?;
    validate_opt_price(wholesale_price, "Prix gros")?;
    validate_opt_price(semi_wholesale_price, "Prix demi-gros")?;
    validate_opt_price(retail_price, "Prix détail")?;
    validate_opt_price(min_selling_price, "Prix minimum")?;

    let bottle_dep = input
        .bottle_deposit_amount
        .unwrap_or(existing.bottle_deposit_amount)
        .max(0);
    let crate_dep = input
        .crate_deposit_amount
        .unwrap_or(existing.crate_deposit_amount)
        .max(0);
    let barcode = input
        .barcode
        .map(|o| o.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()))
        .unwrap_or(existing.barcode);
    let is_virtual = input
        .is_virtual
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.is_virtual);
    let allow_fraction = input
        .allow_fraction
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.allow_fraction);
    let is_default_sale = input
        .is_default_sale
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.is_default_sale);
    let is_default_purchase = input
        .is_default_purchase
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.is_default_purchase);
    let is_active = input
        .is_active
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.is_active);

    sqlx::query(
        "UPDATE sales_units
         SET label = ?, unit_type = ?, conversion_factor = ?, is_virtual = ?, allow_fraction = ?,
             purchase_price = ?, wholesale_price = ?, semi_wholesale_price = ?, retail_price = ?,
             min_selling_price = ?, bottle_deposit_amount = ?, crate_deposit_amount = ?,
             barcode = ?, is_default_sale = ?, is_default_purchase = ?, is_active = ?,
             updated_at = datetime('now')
         WHERE id = ?",
    )
    .bind(&label)
    .bind(&unit_type)
    .bind(conversion_factor)
    .bind(is_virtual)
    .bind(allow_fraction)
    .bind(purchase_price)
    .bind(wholesale_price)
    .bind(semi_wholesale_price)
    .bind(retail_price)
    .bind(min_selling_price)
    .bind(bottle_dep)
    .bind(crate_dep)
    .bind(&barcode)
    .bind(is_default_sale)
    .bind(is_default_purchase)
    .bind(is_active)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    for (ptype, old_v, new_v) in [
        ("PURCHASE", existing.purchase_price, purchase_price),
        ("WHOLESALE", existing.wholesale_price, wholesale_price),
        (
            "SEMI_WHOLESALE",
            existing.semi_wholesale_price,
            semi_wholesale_price,
        ),
        ("RETAIL", existing.retail_price, retail_price),
        (
            "MINIMUM_SELLING_PRICE",
            existing.min_selling_price,
            min_selling_price,
        ),
    ] {
        if old_v != new_v {
            if let Some(nv) = new_v {
                sqlx::query(
                    "INSERT INTO price_history (entity_type, entity_id, variant_id, sales_unit_id, price_type, old_price, new_price, currency, effective_from, reason)
                     VALUES ('product_packaging', ?, ?, ?, ?, ?, ?, 'FCFA', datetime('now'), 'Mise à jour tarif unité de vente')",
                )
                .bind(existing.packaging_id.unwrap_or(id))
                .bind(existing.variant_id)
                .bind(id)
                .bind(ptype)
                .bind(old_v)
                .bind(nv)
                .execute(&mut *tx)
                .await?;
            }
        }
    }
    tx.commit().await?;

    let updated = sqlx::query_as::<_, SalesUnitDto>("SELECT * FROM sales_units WHERE id = ?")
        .bind(id)
        .fetch_one(&db.pool)
        .await?;
    Ok(updated)
}

pub async fn delete_sales_unit(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let used: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sale_lines WHERE sales_unit_id = ?")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
    if used > 0 {
        sqlx::query("UPDATE sales_units SET is_active = 0, updated_at = datetime('now') WHERE id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        return Ok(());
    }
    let res = sqlx::query("DELETE FROM sales_units WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if res.rows_affected() == 0 {
        return Err(CoreError::NotFound("Unité de vente introuvable.".into()));
    }
    tx.commit().await?;
    Ok(())
}
