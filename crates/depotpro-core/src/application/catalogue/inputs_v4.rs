// ============================================================================
// Structures d'entrée V4 : brasseries, emballages, emplacements, unités de vente
// ============================================================================

use serde::Deserialize;

use super::helpers::deserialize_opt_bool_or_int;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBreweryInput {
    pub code: Option<String>,
    pub name: String,
    pub short_name: Option<String>,
    pub country_code: Option<String>,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub website: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBreweryInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub short_name: Option<Option<String>>,
    pub country_code: Option<String>,
    pub address: Option<Option<String>>,
    pub phone: Option<Option<String>>,
    pub email: Option<Option<String>>,
    pub website: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePackagingTypeInput {
    pub code: Option<String>,
    pub name: String,
    pub default_name: String,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_reusable: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_returnable: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStockLocationInput {
    pub code: Option<String>,
    pub name: String,
    pub location_type: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_default: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSalesUnitInput {
    pub product_id: i64,
    pub variant_id: Option<i64>,
    pub packaging_id: Option<i64>,
    pub code: Option<String>,
    pub label: String,
    pub unit_type: String,
    pub conversion_factor: i64,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_virtual: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub allow_fraction: Option<bool>,
    pub purchase_price: Option<i64>,
    pub wholesale_price: Option<i64>,
    pub semi_wholesale_price: Option<i64>,
    pub retail_price: Option<i64>,
    pub min_selling_price: Option<i64>,
    pub bottle_deposit_amount: Option<i64>,
    pub crate_deposit_amount: Option<i64>,
    pub barcode: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_default_sale: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_default_purchase: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSalesUnitInput {
    pub label: Option<String>,
    pub unit_type: Option<String>,
    pub conversion_factor: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_virtual: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub allow_fraction: Option<bool>,
    pub purchase_price: Option<Option<i64>>,
    pub wholesale_price: Option<Option<i64>>,
    pub semi_wholesale_price: Option<Option<i64>>,
    pub retail_price: Option<Option<i64>>,
    pub min_selling_price: Option<Option<i64>>,
    pub bottle_deposit_amount: Option<i64>,
    pub crate_deposit_amount: Option<i64>,
    pub barcode: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_default_sale: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_default_purchase: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertProductSupplierInput {
    pub product_id: i64,
    pub supplier_id: i64,
    pub supplier_product_code: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub preferred_supplier: Option<bool>,
    pub purchase_unit: Option<String>,
    pub units_per_purchase_package: Option<i64>,
    pub last_purchase_price: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDepositRuleInput {
    pub product_id: Option<i64>,
    pub variant_id: Option<i64>,
    pub packaging_id: Option<i64>,
    pub returnable_id: i64,
    pub deposit_kind: String,
    pub amount: i64,
    pub currency: Option<String>,
    pub effective_from: Option<String>,
    pub effective_to: Option<String>,
    pub supplier_id: Option<i64>,
}
