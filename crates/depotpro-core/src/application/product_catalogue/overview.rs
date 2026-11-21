// ============================================================================
// Consultation, création et initialisation du catalogue central V3
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::CoreResult;
use crate::infrastructure::db::DepotDb;

use super::{
    BrandDto, CatalogueProductDto, CreateBrandInput, CreateCatalogueProductInput,
    CreateProductFamilyInput, CreateUnitOfMeasureInput, ProductCatalogueOverviewDto,
    ProductFamilyDto, UnitOfMeasureDto,
};

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
