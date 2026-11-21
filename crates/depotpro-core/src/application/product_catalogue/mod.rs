// ============================================================================
// Catalogue central V3 : types, DTOs & sous-modules
// ============================================================================

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

mod overview;
mod reference_pricing;

pub use overview::{
    create_brand, create_catalogue_product, create_product_family, create_unit_of_measure,
    get_catalogue_overview, initialize_initial_catalogue,
};
pub use reference_pricing::{
    list_reference_price_history, set_catalogue_product_active, set_reference_price,
    CatalogueProductStatusDto, ReferencePriceDto, SetReferencePriceInput,
};

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
