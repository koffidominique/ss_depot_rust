// ============================================================================
// Structures d'entrée pour tarification fournisseurs, clients et consignes
// ============================================================================

use serde::Deserialize;

use super::helpers::deserialize_opt_bool_or_int;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSupplierProductPriceInput {
    pub supplier_id: i64,
    pub product_id: i64,
    pub packaging_id: Option<i64>,
    pub purchase_price: i64,
    pub packaging_value: Option<i64>,
    pub fees: Option<i64>,
    pub valid_from: Option<String>,
    pub valid_to: Option<String>,
    pub source: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSupplierProductPriceInput {
    pub purchase_price: Option<i64>,
    pub packaging_value: Option<i64>,
    pub fees: Option<i64>,
    pub valid_from: Option<String>,
    pub valid_to: Option<Option<String>>,
    pub source: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCustomerPriceListInput {
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub currency: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_default: Option<bool>,
    pub valid_from: Option<String>,
    pub valid_to: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCustomerPriceListInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub description: Option<Option<String>>,
    pub currency: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_default: Option<bool>,
    pub valid_from: Option<String>,
    pub valid_to: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCustomerPriceListItemInput {
    pub price_list_id: i64,
    pub product_id: i64,
    pub packaging_id: Option<i64>,
    pub price_tier: String,
    pub price: i64,
    pub packaging_value: Option<i64>,
    pub valid_from: Option<String>,
    pub valid_to: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCustomerPriceListItemInput {
    pub price: Option<i64>,
    pub packaging_value: Option<i64>,
    pub valid_from: Option<String>,
    pub valid_to: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePackagingValueInput {
    pub returnable_id: i64,
    pub value_type: String,
    pub amount: i64,
    pub currency: Option<String>,
    pub valid_from: Option<String>,
    pub valid_to: Option<String>,
    pub description: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePackagingValueInput {
    pub value_type: Option<String>,
    pub amount: Option<i64>,
    pub valid_from: Option<String>,
    pub valid_to: Option<Option<String>>,
    pub description: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}
