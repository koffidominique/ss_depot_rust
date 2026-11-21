use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT")]
pub enum UnitType {
    #[serde(rename = "piece")]
    Piece,
    #[serde(rename = "liter")]
    Liter,
    #[serde(rename = "kilogram")]
    Kilogram,
    #[serde(rename = "pack")]
    Pack,
    #[serde(rename = "case")]
    Case,
}

impl std::fmt::Display for UnitType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UnitType::Piece => f.write_str("piece"),
            UnitType::Liter => f.write_str("liter"),
            UnitType::Kilogram => f.write_str("kilogram"),
            UnitType::Pack => f.write_str("pack"),
            UnitType::Case => f.write_str("case"),
        }
    }
}

#[derive(Debug, Serialize, FromRow)]
pub struct BrandDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub country_of_origin: Option<String>,
    pub is_active: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ProductFamilyDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub category: String,
    pub is_active: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct UnitOfMeasureDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub symbol: String,
    pub unit_type: String,
    pub conversion_factor: f64,
    pub is_active: bool,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CatalogueProductDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub barcode: Option<String>,
    pub brand_id: Option<i64>,
    pub brand_name: Option<String>,
    pub family_id: Option<i64>,
    pub family_name: Option<String>,
    pub bottle_profile_id: Option<i64>,
    pub bottle_profile_name: Option<String>,
    pub crate_type_id: Option<i64>,
    pub crate_type_name: Option<String>,
    pub unit_id: i64,
    pub unit_name: String,
    pub unit_price: i64,
    pub deposit_per_unit: i64,
    pub is_active: bool,
    pub is_sellable: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductCatalogueOverviewDto {
    pub brands: Vec<BrandDto>,
    pub families: Vec<ProductFamilyDto>,
    pub units: Vec<UnitOfMeasureDto>,
    pub products: Vec<CatalogueProductDto>,
}

#[derive(Debug, Deserialize)]
pub struct CreateBrandInput {
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub country_of_origin: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateProductFamilyInput {
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub category: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateUnitOfMeasureInput {
    pub code: String,
    pub name: String,
    pub symbol: String,
    pub unit_type: String,
    pub conversion_factor: f64,
}

#[derive(Debug, Deserialize)]
pub struct CreateCatalogueProductInput {
    pub code: String,
    pub name: String,
    pub barcode: Option<String>,
    pub brand_id: Option<i64>,
    pub family_id: Option<i64>,
    pub bottle_profile_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub unit_id: i64,
    pub unit_price: i64,
    pub deposit_per_unit: i64,
    pub is_sellable: bool,
}

pub async fn get_catalogue_overview(db: &DepotDb) -> CoreResult<ProductCatalogueOverviewDto> {
    require_current_actor_permission(Permission::CatalogRead)?;

    let brands = sqlx::query_as::<_, BrandDto>(
        "SELECT id, code, name, description, country_of_origin, is_active, created_at
         FROM brands ORDER BY name",
    )
    .fetch_all(&db.pool)
    .await?;

    let families = sqlx::query_as::<_, ProductFamilyDto>(
        "SELECT id, code, name, description, category, is_active, created_at
         FROM product_families ORDER BY name",
    )
    .fetch_all(&db.pool)
    .await?;

    let units = sqlx::query_as::<_, UnitOfMeasureDto>(
        "SELECT id, code, name, symbol, unit_type, conversion_factor, is_active
         FROM units_of_measure ORDER BY name",
    )
    .fetch_all(&db.pool)
    .await?;

    let products = sqlx::query_as::<_, CatalogueProductDto>(
        "SELECT p.id, p.code, p.name, p.barcode, p.brand_id, b.name AS brand_name,
                p.family_id, f.name AS family_name, p.bottle_profile_id, bp.name AS bottle_profile_name,
                p.crate_type_id, ct.name AS crate_type_name, p.unit_id, u.name AS unit_name,
                p.unit_price, p.deposit_per_unit, p.is_active, p.is_sellable, p.created_at
         FROM catalogue_products p
         LEFT JOIN brands b ON b.id = p.brand_id
         LEFT JOIN product_families f ON f.id = p.family_id
         LEFT JOIN bottle_profiles bp ON bp.id = p.bottle_profile_id
         LEFT JOIN crate_types ct ON ct.id = p.crate_type_id
         JOIN units_of_measure u ON u.id = p.unit_id
         ORDER BY p.name",
    )
    .fetch_all(&db.pool)
    .await?;

    Ok(ProductCatalogueOverviewDto {
        brands,
        families,
        units,
        products,
    })
}

pub async fn create_brand(db: &DepotDb, input: CreateBrandInput) -> CoreResult<BrandDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;

    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO brands (code, name, description, country_of_origin, is_active)
         VALUES (?, ?, ?, ?, 1)
         RETURNING id",
    )
    .bind(input.code)
    .bind(input.name)
    .bind(input.description)
    .bind(input.country_of_origin)
    .fetch_one(&db.pool)
    .await?;

    let brand = sqlx::query_as::<_, BrandDto>(
        "SELECT id, code, name, description, country_of_origin, is_active, created_at
         FROM brands WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;

    Ok(brand)
}

pub async fn create_product_family(
    db: &DepotDb,
    input: CreateProductFamilyInput,
) -> CoreResult<ProductFamilyDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;

    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO product_families (code, name, description, category, is_active)
         VALUES (?, ?, ?, ?, 1)
         RETURNING id",
    )
    .bind(input.code)
    .bind(input.name)
    .bind(input.description)
    .bind(input.category)
    .fetch_one(&db.pool)
    .await?;

    let family = sqlx::query_as::<_, ProductFamilyDto>(
        "SELECT id, code, name, description, category, is_active, created_at
         FROM product_families WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;

    Ok(family)
}

pub async fn create_unit_of_measure(
    db: &DepotDb,
    input: CreateUnitOfMeasureInput,
) -> CoreResult<UnitOfMeasureDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;

    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO units_of_measure (code, name, symbol, unit_type, conversion_factor, is_active)
         VALUES (?, ?, ?, ?, ?, 1)
         RETURNING id",
    )
    .bind(input.code)
    .bind(input.name)
    .bind(input.symbol)
    .bind(input.unit_type)
    .bind(input.conversion_factor)
    .fetch_one(&db.pool)
    .await?;

    let unit = sqlx::query_as::<_, UnitOfMeasureDto>(
        "SELECT id, code, name, symbol, unit_type, conversion_factor, is_active
         FROM units_of_measure WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;

    Ok(unit)
}

pub async fn create_catalogue_product(
    db: &DepotDb,
    input: CreateCatalogueProductInput,
) -> CoreResult<CatalogueProductDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;

    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO catalogue_products (code, name, barcode, brand_id, family_id, bottle_profile_id,
                                        crate_type_id, unit_id, unit_price, deposit_per_unit, is_active, is_sellable)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
         RETURNING id",
    )
    .bind(input.code)
    .bind(input.name)
    .bind(input.barcode)
    .bind(input.brand_id)
    .bind(input.family_id)
    .bind(input.bottle_profile_id)
    .bind(input.crate_type_id)
    .bind(input.unit_id)
    .bind(input.unit_price)
    .bind(input.deposit_per_unit)
    .bind(input.is_sellable)
    .fetch_one(&db.pool)
    .await?;

    let product = sqlx::query_as::<_, CatalogueProductDto>(
        "SELECT p.id, p.code, p.name, p.barcode, p.brand_id, b.name AS brand_name,
                p.family_id, f.name AS family_name, p.bottle_profile_id, bp.name AS bottle_profile_name,
                p.crate_type_id, ct.name AS crate_type_name, p.unit_id, u.name AS unit_name,
                p.unit_price, p.deposit_per_unit, p.is_active, p.is_sellable, p.created_at
         FROM catalogue_products p
         LEFT JOIN brands b ON b.id = p.brand_id
         LEFT JOIN product_families f ON f.id = p.family_id
         LEFT JOIN bottle_profiles bp ON bp.id = p.bottle_profile_id
         LEFT JOIN crate_types ct ON ct.id = p.crate_type_id
         JOIN units_of_measure u ON u.id = p.unit_id
         WHERE p.id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;

    Ok(product)
}

pub async fn initialize_initial_catalogue(db: &DepotDb) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;

    let mut tx = db.pool.begin().await?;

    let brand_count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM brands")
        .fetch_one(&mut *tx)
        .await?;

    if brand_count == 0 {
        let brands = vec![
            ("HEINEKEN", "Heineken", "Pays-Bas"),
            ("CORONA", "Corona", "Mexique"),
            ("BUDWEISER", "Budweiser", "États-Unis"),
            ("COCA", "Coca-Cola", "États-Unis"),
            ("PEPSI", "Pepsi", "États-Unis"),
            ("ORANGINA", "Orangina", "France"),
            ("PERRIER", "Perrier", "France"),
            ("EVIAN", "Évian", "France"),
        ];

        for (code, name, country) in brands {
            sqlx::query(
                "INSERT INTO brands (code, name, country_of_origin, is_active) VALUES (?, ?, ?, 1)",
            )
            .bind(code)
            .bind(name)
            .bind(country)
            .execute(&mut *tx)
            .await?;
        }
    }

    let family_count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM product_families")
        .fetch_one(&mut *tx)
        .await?;

    if family_count == 0 {
        let families = vec![
            ("BIERE", "Bière", "Boissons alcoolisées"),
            ("SODA", "Soda", "Boissons non alcoolisées"),
            ("EAU", "Eau", "Boissons non alcoolisées"),
            ("JUS", "Jus de fruits", "Boissons non alcoolisées"),
            ("SIROP", "Sirop", "Boissons non alcoolisées"),
        ];

        for (code, name, category) in families {
            sqlx::query(
                "INSERT INTO product_families (code, name, category, is_active) VALUES (?, ?, ?, 1)",
            )
            .bind(code)
            .bind(name)
            .bind(category)
            .execute(&mut *tx)
            .await?;
        }
    }

    let unit_count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM units_of_measure")
        .fetch_one(&mut *tx)
        .await?;

    if unit_count == 0 {
        let units = vec![
            ("PIECE", "Pièce", "pcs", "piece", 1.0),
            ("LITER", "Litre", "L", "liter", 1.0),
            ("CENTILITER", "Centilitre", "cL", "liter", 0.01),
            ("CASE", "Casier", "casier", "case", 1.0),
            ("PACK", "Pack", "pack", "pack", 1.0),
        ];

        for (code, name, symbol, unit_type, factor) in units {
            sqlx::query(
                "INSERT INTO units_of_measure (code, name, symbol, unit_type, conversion_factor, is_active)
                 VALUES (?, ?, ?, ?, ?, 1)",
            )
            .bind(code)
            .bind(name)
            .bind(symbol)
            .bind(unit_type)
            .bind(factor)
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    Ok(())
}

// ---------------------------------------------------------------------------
// PHASE 4 catalogue_seed.md : archivage/réactivation et prix de référence
// historisé (critères 9, 11, 14, 15).
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct CatalogueProductStatusDto {
    pub id: i64,
    pub code: String,
    pub is_active: bool,
    pub is_sellable: bool,
}

/// Archive (is_active = 0) ou réactive une référence du catalogue standard.
/// Une référence utilisée dans des opérations n'est jamais supprimée
/// physiquement (catalogue_seed.md §14) : l'historique des ventes conserve
/// ses propres désignations.
pub async fn set_catalogue_product_active(
    db: &DepotDb,
    product_id: i64,
    is_active: bool,
) -> CoreResult<CatalogueProductStatusDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;

    let (_guard, mut tx) = db.begin_write().await?;
    let row: Option<(String, String)> =
        sqlx::query_as("SELECT code, name FROM catalogue_products WHERE id = ?")
            .bind(product_id)
            .fetch_optional(&mut *tx)
            .await?;
    let (code, name) =
        row.ok_or_else(|| CoreError::Validation("Référence catalogue introuvable.".to_string()))?;

    sqlx::query(
        "UPDATE catalogue_products SET is_active = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(if is_active { 1 } else { 0 })
    .bind(product_id)
    .execute(&mut *tx)
    .await?;

    crate::application::sales::audit_log_tx(
        &mut tx,
        if is_active {
            "CATALOG_REACTIVATE"
        } else {
            "CATALOG_ARCHIVE"
        },
        "catalogue_products",
        Some(product_id.to_string()),
        &format!(
            "{} de la référence {code} ({name})",
            if is_active {
                "Réactivation"
            } else {
                "Archivage"
            }
        ),
    )
    .await?;
    tx.commit().await?;

    let (is_active_db, is_sellable): (i64, i64) =
        sqlx::query_as("SELECT is_active, is_sellable FROM catalogue_products WHERE id = ?")
            .bind(product_id)
            .fetch_one(&db.pool)
            .await?;
    Ok(CatalogueProductStatusDto {
        id: product_id,
        code,
        is_active: is_active_db == 1,
        is_sellable: is_sellable == 1,
    })
}

#[derive(Debug, Deserialize)]
pub struct SetReferencePriceInput {
    pub reference_price: i64,
    pub reason: Option<String>,
    pub request_key: String,
}

#[derive(Debug, Serialize)]
pub struct ReferencePriceDto {
    pub id: i64,
    pub product_id: i64,
    pub reference_price: i64,
    pub previous_price: i64,
    pub reason: Option<String>,
    pub changed_by: Option<String>,
    pub created_at: String,
}

/// Définit le prix de référence d'une référence catalogue avec historique
/// complet (ancien prix, nouveau prix, auteur, motif). Les ventes
/// historiques ne sont jamais recalculées : elles portent leur propre
/// photographie de prix (catalogue_seed.md §8.1, critère 15).
pub async fn set_reference_price(
    db: &DepotDb,
    product_id: i64,
    input: SetReferencePriceInput,
    actor_name: Option<&str>,
) -> CoreResult<ReferencePriceDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    if input.reference_price < 0 {
        return Err(CoreError::Validation(
            "Le prix de référence ne peut pas être négatif.".to_string(),
        ));
    }
    if input.request_key.trim().is_empty() {
        return Err(CoreError::Validation(
            "Clé d'idempotence requise.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;

    // Idempotence.
    let replay: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM catalogue_reference_price_history WHERE request_key = ?",
    )
    .bind(input.request_key.trim())
    .fetch_optional(&mut *tx)
    .await?;
    if let Some(hist_id) = replay {
        let (price, prev): (i64, i64) = sqlx::query_as(
            "SELECT reference_price, previous_price FROM catalogue_reference_price_history
             WHERE request_key = ?",
        )
        .bind(input.request_key.trim())
        .fetch_one(&mut *tx)
        .await?;
        return Ok(ReferencePriceDto {
            id: hist_id,
            product_id,
            reference_price: price,
            previous_price: prev,
            reason: None,
            changed_by: actor_name.map(str::to_string),
            created_at: String::new(),
        });
    }

    let existing: Option<(String, i64)> =
        sqlx::query_as("SELECT code, unit_price FROM catalogue_products WHERE id = ?")
            .bind(product_id)
            .fetch_optional(&mut *tx)
            .await?;
    let (code, old_price) = existing
        .ok_or_else(|| CoreError::Validation("Référence catalogue introuvable.".to_string()))?;
    if old_price == input.reference_price {
        return Err(CoreError::Validation(
            "Le prix de référence est déjà à cette valeur.".to_string(),
        ));
    }

    sqlx::query(
        "UPDATE catalogue_products SET unit_price = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(input.reference_price)
    .bind(product_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO catalogue_reference_price_history
            (request_key, catalogue_product_id, previous_price, reference_price, reason, changed_by_name)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(input.request_key.trim())
    .bind(product_id)
    .bind(old_price)
    .bind(input.reference_price)
    .bind(input.reason.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(actor_name)
    .execute(&mut *tx)
    .await?;
    let hist_id = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM catalogue_reference_price_history WHERE request_key = ?",
    )
    .bind(input.request_key.trim())
    .fetch_one(&mut *tx)
    .await?;

    crate::application::sales::audit_log_tx(
        &mut tx,
        "CATALOG_PRICE_CHANGE",
        "catalogue_products",
        Some(product_id.to_string()),
        &format!(
            "Prix de référence {code} : {old_price} → {} FCFA",
            input.reference_price
        ),
    )
    .await?;
    tx.commit().await?;

    Ok(ReferencePriceDto {
        id: hist_id,
        product_id,
        reference_price: input.reference_price,
        previous_price: old_price,
        reason: input.reason,
        changed_by: actor_name.map(str::to_string),
        created_at: String::new(),
    })
}

/// Historique des prix de référence d'une référence (du plus récent au plus ancien).
pub async fn list_reference_price_history(
    db: &DepotDb,
    product_id: i64,
) -> CoreResult<Vec<ReferencePriceDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let rows = sqlx::query_as::<_, (i64, i64, i64, Option<String>, Option<String>, String)>(
        "SELECT id, catalogue_product_id, reference_price, reason, changed_by_name, created_at
         FROM catalogue_reference_price_history
         WHERE catalogue_product_id = ?
         ORDER BY id DESC",
    )
    .bind(product_id)
    .fetch_all(&db.pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(
            |(id, pid, price, reason, changed_by, created_at)| ReferencePriceDto {
                id,
                product_id: pid,
                reference_price: price,
                previous_price: 0,
                reason,
                changed_by,
                created_at,
            },
        )
        .collect())
}
