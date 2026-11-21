// ============================================================================
// Types & chargement du catalogue prédéfini brasseries SOLIBRA / BRASSIVOIRE
// ============================================================================

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::error::{CoreError, CoreResult};

use super::{deserialize_opt_bool_or_int, ProductSummaryDto};

const BREWERY_CATALOG_JSON: &str = include_str!("../../../../../catalog/brewery_catalog.json");

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct PresetBreweryMeta {
    pub brewery: String,
    pub name: String,
    pub company_name: String,
    pub phone: String,
    pub address: String,
    pub payment_terms_days: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct PresetReturnableMeta {
    pub code: String,
    pub name: String,
    pub producer: String,
    pub kind: String,
    pub description: Option<String>,
    pub deposit_value: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct PresetComponentRaw {
    pub returnable_code: String,
    pub pieces_per_pack: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct PresetPackagingRaw {
    pub name: String,
    pub coefficient: String,
    pub purchase_price: i64,
    pub wholesale_price: i64,
    pub semi_wholesale_price: i64,
    pub retail_price: i64,
    pub barcode: Option<String>,
    pub allow_fraction: bool,
    pub deposit_mode: String,
    #[serde(default)]
    pub components: Vec<PresetComponentRaw>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct PresetProductRaw {
    pub key: String,
    pub brewery: String,
    pub name: String,
    pub brand: String,
    pub barcode: String,
    pub category: String,
    pub base_unit: String,
    pub initial_stock: String,
    pub min_stock: String,
    pub purchase_price: i64,
    pub wholesale_price: i64,
    pub semi_wholesale_price: i64,
    pub retail_price: i64,
    pub description: String,
    pub packagings: Vec<PresetPackagingRaw>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct BreweryCatalogFile {
    pub breweries: Vec<PresetBreweryMeta>,
    pub returnables: Vec<PresetReturnableMeta>,
    pub products: Vec<PresetProductRaw>,
}

#[derive(Debug, Serialize)]
pub struct CatalogPresetComponentDto {
    pub returnable_code: String,
    pub returnable_name: String,
    pub pieces_per_pack: i64,
}

#[derive(Debug, Serialize)]
pub struct CatalogPresetPackagingDto {
    pub name: String,
    pub coefficient: String,
    pub purchase_price: i64,
    pub wholesale_price: i64,
    pub semi_wholesale_price: i64,
    pub retail_price: i64,
    pub barcode: Option<String>,
    pub allow_fraction: bool,
    pub deposit_mode: String,
    pub components: Vec<CatalogPresetComponentDto>,
}

#[derive(Debug, Serialize)]
pub struct CatalogPresetItemDto {
    pub key: String,
    pub brewery: String,
    pub name: String,
    pub brand: String,
    pub barcode: String,
    pub category: String,
    pub base_unit: String,
    pub initial_stock: String,
    pub min_stock: String,
    pub purchase_price: i64,
    pub wholesale_price: i64,
    pub semi_wholesale_price: i64,
    pub retail_price: i64,
    pub description: String,
    pub packagings: Vec<CatalogPresetPackagingDto>,
    pub existing_product_id: Option<i64>,
    pub existing_reference: Option<String>,
    pub existing_is_active: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct CatalogPresetListDto {
    pub items: Vec<CatalogPresetItemDto>,
}

#[derive(Debug, Deserialize)]
pub struct ApplyCatalogPresetsInput {
    pub keys: Vec<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub activate: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct ApplyCatalogPresetsResultDto {
    pub created: i64,
    pub reactivated: i64,
    pub skipped: i64,
    pub activate: bool,
    pub products: Vec<ProductSummaryDto>,
}

#[derive(Debug, FromRow)]
pub(crate) struct ExistingPresetProductRow {
    pub id: i64,
    pub reference: String,
    pub name: String,
    pub barcode: Option<String>,
    pub is_active: i64,
}

pub(crate) fn parse_brewery_catalog() -> CoreResult<BreweryCatalogFile> {
    serde_json::from_str(BREWERY_CATALOG_JSON)
        .map_err(|e| CoreError::Internal(format!("Catalogue prédéfini invalide : {e}")))
}
