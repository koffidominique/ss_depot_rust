// ============================================================================
// Types V4 imbriqués pour fiche produit multi-niveaux (variante, unités, fournisseurs)
// ============================================================================

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use super::deserialize_opt_bool_or_int;

#[derive(Debug, Serialize, FromRow)]
pub struct ProductVariantSummaryDto {
    pub id: i64,
    pub product_id: i64,
    pub name: String,
    pub sku: Option<String>,
    pub barcode: Option<String>,
    pub volume_ml: Option<i64>,
    pub container_type: Option<String>,
    pub container_type_id: Option<i64>,
    pub container_material: Option<String>,
    pub container_returnable: i64,
    pub container_recyclable: i64,
    pub container_deposit_amount: i64,
    pub native_crate_capacity: Option<i64>,
    pub compatibility_class: Option<String>,
    pub is_active: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ProductSalesUnitDto {
    pub id: i64,
    pub product_id: i64,
    pub variant_id: Option<i64>,
    pub packaging_id: Option<i64>,
    pub label: String,
    pub unit_type: String,
    pub conversion_factor: i64,
    pub is_virtual: i64,
    pub allow_fraction: i64,
    pub purchase_price: Option<i64>,
    pub wholesale_price: Option<i64>,
    pub semi_wholesale_price: Option<i64>,
    pub retail_price: Option<i64>,
    pub min_selling_price: Option<i64>,
    pub bottle_deposit_amount: i64,
    pub crate_deposit_amount: i64,
    pub barcode: Option<String>,
    pub is_default_sale: i64,
    pub is_default_purchase: i64,
    pub is_active: i64,
}

#[derive(Debug, Deserialize)]
pub struct InitialVariantInput {
    pub name: Option<String>,
    pub sku: Option<String>,
    pub barcode: Option<String>,
    pub container_type_id: Option<i64>,
    pub container_type: Option<String>,
    pub volume_ml: i64,
    pub container_material: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub container_returnable: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub container_recyclable: Option<bool>,
    pub container_deposit_amount: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct InitialSalesUnitInput {
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
}

#[derive(Debug, Deserialize)]
pub struct InitialProductSupplierInput {
    pub supplier_id: i64,
    pub supplier_product_code: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub preferred_supplier: Option<bool>,
    pub purchase_unit: Option<String>,
    pub units_per_purchase_package: Option<i64>,
    pub last_purchase_price: Option<i64>,
}

#[derive(Debug, Default, Deserialize)]
pub struct PackagingV4Extras {
    pub variant_id: Option<i64>,
    pub packaging_type_id: Option<i64>,
    pub display_label: Option<String>,
    pub package_sku: Option<String>,
    pub min_selling_price: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_reusable: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_returnable: Option<bool>,
    pub package_deposit_amount: Option<i64>,
    pub bottle_deposit_amount: Option<i64>,
    pub package_cost: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_default_sale: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_default_purchase: Option<bool>,
}

#[derive(Debug, Default, Deserialize)]
pub struct ProductV4CreateExtras {
    pub brewery_id: Option<i64>,
    pub brand_id: Option<i64>,
    pub sku: Option<String>,
    pub subcategory_id: Option<i64>,
    pub variant_label: Option<String>,
    pub alcohol_degree_milli: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_alcoholic: Option<bool>,
    pub ingredients: Option<String>,
    pub beverage_color: Option<String>,
    pub storage_temp: Option<String>,
    pub shelf_life_days: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_perishable: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub track_batches: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub track_expiry: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub allow_credit_sale: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub allow_unit_sale: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub allow_mixed_sale: Option<bool>,
    pub default_location_id: Option<i64>,
    pub status: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
    pub variant: Option<InitialVariantInput>,
    pub packaging_extras: Option<Vec<PackagingV4Extras>>,
    pub sales_units: Option<Vec<InitialSalesUnitInput>>,
    pub product_suppliers: Option<Vec<InitialProductSupplierInput>>,
}

#[derive(Debug, Default, Deserialize)]
pub struct ProductV4UpdateExtras {
    pub brewery_id: Option<Option<i64>>,
    pub brand_id: Option<Option<i64>>,
    pub subcategory_id: Option<Option<i64>>,
    pub variant_label: Option<Option<String>>,
    pub alcohol_degree_milli: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_alcoholic: Option<bool>,
    pub ingredients: Option<Option<String>>,
    pub beverage_color: Option<Option<String>>,
    pub storage_temp: Option<Option<String>>,
    pub shelf_life_days: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_perishable: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub track_batches: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub track_expiry: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub allow_credit_sale: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub allow_unit_sale: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub allow_mixed_sale: Option<bool>,
    pub default_location_id: Option<Option<i64>>,
    pub status: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub clear_supplier_id: Option<bool>,
}
