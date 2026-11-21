// ============================================================================
// Structures d'entrée pour tarification fournisseurs, clients et consignes
// ============================================================================

use serde::Deserialize;

use super::helpers::deserialize_opt_bool_or_int;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSupplierProductPriceInput {
    pub supplier_id: i64,
    pub product_id: Option<i64>,
    pub variant_id: Option<i64>,
    pub price_fcfa: i64,
    pub currency: Option<String>,
    pub valid_from: String,
    pub valid_to: Option<String>,
    pub min_order_qty: Option<i64>,
    pub lead_time_days: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSupplierProductPriceInput {
    pub supplier_id: Option<i64>,
    pub product_id: Option<Option<i64>>,
    pub variant_id: Option<Option<i64>>,
    pub price_fcfa: Option<i64>,
    pub currency: Option<String>,
    pub valid_from: Option<String>,
    pub valid_to: Option<Option<String>>,
    pub min_order_qty: Option<Option<i64>>,
    pub lead_time_days: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCustomerPriceListInput {
    pub name: String,
    pub description: Option<String>,
    pub currency: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_default: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCustomerPriceListInput {
    pub name: Option<String>,
    pub description: Option<Option<String>>,
    pub currency: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_default: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCustomerPriceListItemInput {
    pub price_list_id: i64,
    pub product_id: Option<i64>,
    pub variant_id: Option<i64>,
    pub packaging_id: Option<i64>,
    pub price_fcfa: i64,
    pub valid_from: String,
    pub valid_to: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCustomerPriceListItemInput {
    pub price_list_id: Option<i64>,
    pub product_id: Option<Option<i64>>,
    pub variant_id: Option<Option<i64>>,
    pub packaging_id: Option<Option<i64>>,
    pub price_fcfa: Option<i64>,
    pub valid_from: Option<String>,
    pub valid_to: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePackagingValueInput {
    pub returnable_id: i64,
    pub packaging_type: String,
    pub value_fcfa: i64,
    pub effective_from: String,
    pub effective_to: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePackagingValueInput {
    pub returnable_id: Option<i64>,
    pub packaging_type: Option<String>,
    pub value_fcfa: Option<i64>,
    pub effective_from: Option<String>,
    pub effective_to: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}
