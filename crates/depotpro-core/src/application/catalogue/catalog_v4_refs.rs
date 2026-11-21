// ============================================================================
// Référentiels V4 : packaging_types, stock_locations, product_suppliers, deposit_rules
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{
    CreateDepositRuleInput, CreatePackagingTypeInput, CreateStockLocationInput, DepositRuleDto,
    PackagingTypeDto, ProductSupplierDto, StockLocationDto, UpsertProductSupplierInput,
};

fn slug_code(prefix: &str, name: &str) -> String {
    let s: String = name
        .trim()
        .to_uppercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let trimmed = s.trim_matches('-').chars().take(18).collect::<String>();
    format!(
        "{prefix}-{}",
        if trimmed.is_empty() { "REF" } else { &trimmed }
    )
}

pub async fn list_packaging_types(db: &DepotDb) -> CoreResult<Vec<PackagingTypeDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let rows = sqlx::query_as::<_, PackagingTypeDto>(
        "SELECT * FROM packaging_types WHERE is_active = 1 ORDER BY id ASC",
    )
    .fetch_all(&db.pool)
    .await?;
    Ok(rows)
}

pub async fn create_packaging_type(
    db: &DepotDb,
    input: CreatePackagingTypeInput,
) -> CoreResult<PackagingTypeDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let name = input.name.trim();
    if name.is_empty() {
        return Err(CoreError::Validation(
            "Le nom du type d'emballage est obligatoire.".to_string(),
        ));
    }
    if !matches!(
        input.default_name.as_str(),
        "casier" | "carton" | "bouteille" | "pack" | "canette"
    ) {
        return Err(CoreError::Validation(
            "Nom normalisé d'emballage invalide.".to_string(),
        ));
    }
    let code = input
        .code
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_uppercase)
        .unwrap_or_else(|| slug_code("PT", name));

    let (_guard, mut tx) = db.begin_write().await?;
    let id = sqlx::query(
        "INSERT INTO packaging_types (code, name, default_name, is_reusable, is_returnable) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&code)
    .bind(name)
    .bind(&input.default_name)
    .bind(if input.is_reusable.unwrap_or(false) { 1_i64 } else { 0_i64 })
    .bind(if input.is_returnable.unwrap_or(false) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created =
        sqlx::query_as::<_, PackagingTypeDto>("SELECT * FROM packaging_types WHERE id = ?")
            .bind(id)
            .fetch_one(&db.pool)
            .await?;
    Ok(created)
}

pub async fn list_stock_locations(db: &DepotDb) -> CoreResult<Vec<StockLocationDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let rows = sqlx::query_as::<_, StockLocationDto>(
        "SELECT * FROM stock_locations WHERE is_active = 1 ORDER BY is_default DESC, name ASC",
    )
    .fetch_all(&db.pool)
    .await?;
    Ok(rows)
}

pub async fn create_stock_location(
    db: &DepotDb,
    input: CreateStockLocationInput,
) -> CoreResult<StockLocationDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let name = input.name.trim();
    if name.is_empty() {
        return Err(CoreError::Validation(
            "Le nom de l'emplacement est obligatoire.".to_string(),
        ));
    }
    let ltype = input.location_type.as_deref().unwrap_or("depot");
    if !matches!(ltype, "depot" | "shop" | "zone" | "cold_room" | "other") {
        return Err(CoreError::Validation(
            "Type d'emplacement invalide.".to_string(),
        ));
    }
    let code = input
        .code
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_uppercase)
        .unwrap_or_else(|| slug_code("LOC", name));

    let (_guard, mut tx) = db.begin_write().await?;
    if input.is_default.unwrap_or(false) {
        sqlx::query("UPDATE stock_locations SET is_default = 0")
            .execute(&mut *tx)
            .await?;
    }
    let id = sqlx::query(
        "INSERT INTO stock_locations (code, name, location_type, is_default) VALUES (?, ?, ?, ?)",
    )
    .bind(&code)
    .bind(name)
    .bind(ltype)
    .bind(if input.is_default.unwrap_or(false) {
        1_i64
    } else {
        0_i64
    })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created =
        sqlx::query_as::<_, StockLocationDto>("SELECT * FROM stock_locations WHERE id = ?")
            .bind(id)
            .fetch_one(&db.pool)
            .await?;
    Ok(created)
}

pub async fn list_product_suppliers(
    db: &DepotDb,
    product_id: i64,
) -> CoreResult<Vec<ProductSupplierDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let rows = sqlx::query_as::<_, ProductSupplierDto>(
        "SELECT ps.*, s.name AS supplier_name
         FROM product_suppliers ps
         JOIN suppliers s ON s.id = ps.supplier_id
         WHERE ps.product_id = ? AND ps.is_active = 1
         ORDER BY ps.preferred_supplier DESC, s.name ASC",
    )
    .bind(product_id)
    .fetch_all(&db.pool)
    .await?;
    Ok(rows)
}

pub async fn upsert_product_supplier(
    db: &DepotDb,
    input: UpsertProductSupplierInput,
) -> CoreResult<ProductSupplierDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let units = input.units_per_purchase_package.unwrap_or(1);
    if units <= 0 {
        return Err(CoreError::Validation(
            "Le nombre d'unités par colis d'achat doit être > 0.".to_string(),
        ));
    }
    if let Some(p) = input.last_purchase_price {
        if p < 0 {
            return Err(CoreError::Validation(
                "Le prix d'achat ne peut pas être négatif.".to_string(),
            ));
        }
    }
    let (_guard, mut tx) = db.begin_write().await?;
    if input.preferred_supplier.unwrap_or(false) {
        sqlx::query("UPDATE product_suppliers SET preferred_supplier = 0 WHERE product_id = ?")
            .bind(input.product_id)
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query(
        "INSERT INTO product_suppliers (product_id, supplier_id, supplier_product_code, preferred_supplier, purchase_unit, units_per_purchase_package, last_purchase_price, is_active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
         ON CONFLICT(product_id, supplier_id) DO UPDATE SET
            supplier_product_code = excluded.supplier_product_code,
            preferred_supplier = excluded.preferred_supplier,
            purchase_unit = excluded.purchase_unit,
            units_per_purchase_package = excluded.units_per_purchase_package,
            last_purchase_price = COALESCE(excluded.last_purchase_price, product_suppliers.last_purchase_price),
            is_active = 1,
            updated_at = datetime('now')",
    )
    .bind(input.product_id)
    .bind(input.supplier_id)
    .bind(input.supplier_product_code.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(if input.preferred_supplier.unwrap_or(false) { 1_i64 } else { 0_i64 })
    .bind(input.purchase_unit.as_deref().unwrap_or("casier"))
    .bind(units)
    .bind(input.last_purchase_price)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    let row = sqlx::query_as::<_, ProductSupplierDto>(
        "SELECT ps.*, s.name AS supplier_name
         FROM product_suppliers ps
         JOIN suppliers s ON s.id = ps.supplier_id
         WHERE ps.product_id = ? AND ps.supplier_id = ?",
    )
    .bind(input.product_id)
    .bind(input.supplier_id)
    .fetch_one(&db.pool)
    .await?;
    Ok(row)
}

pub async fn list_deposit_rules(
    db: &DepotDb,
    product_id: Option<i64>,
) -> CoreResult<Vec<DepositRuleDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let pf = product_id.unwrap_or(0);
    let rows = sqlx::query_as::<_, DepositRuleDto>(
        "SELECT dr.*, rpt.name AS returnable_name
         FROM deposit_rules dr
         JOIN returnable_packaging_types rpt ON rpt.id = dr.returnable_id
         WHERE dr.is_active = 1 AND (? = 0 OR dr.product_id = ?)
         ORDER BY dr.id DESC",
    )
    .bind(pf)
    .bind(pf)
    .fetch_all(&db.pool)
    .await?;
    Ok(rows)
}

pub async fn create_deposit_rule(
    db: &DepotDb,
    input: CreateDepositRuleInput,
) -> CoreResult<DepositRuleDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    if input.amount < 0 {
        return Err(CoreError::Validation(
            "Le montant de consigne doit être >= 0.".to_string(),
        ));
    }
    if !matches!(
        input.deposit_kind.as_str(),
        "bottle" | "crate" | "pallet" | "other"
    ) {
        return Err(CoreError::Validation(
            "Type de consigne invalide (bottle, crate, pallet, other).".to_string(),
        ));
    }
    let (_guard, mut tx) = db.begin_write().await?;
    let id = sqlx::query(
        "INSERT INTO deposit_rules (product_id, variant_id, packaging_id, returnable_id, deposit_kind, amount, currency, effective_from, effective_to, supplier_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, date('now')), ?, ?)",
    )
    .bind(input.product_id)
    .bind(input.variant_id)
    .bind(input.packaging_id)
    .bind(input.returnable_id)
    .bind(&input.deposit_kind)
    .bind(input.amount)
    .bind(input.currency.as_deref().unwrap_or("FCFA"))
    .bind(input.effective_from.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.effective_to.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.supplier_id)
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created = sqlx::query_as::<_, DepositRuleDto>(
        "SELECT dr.*, rpt.name AS returnable_name
         FROM deposit_rules dr
         JOIN returnable_packaging_types rpt ON rpt.id = dr.returnable_id
         WHERE dr.id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(created)
}
