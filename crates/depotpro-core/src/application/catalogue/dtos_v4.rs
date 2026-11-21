// ============================================================================
// DTOs V4 : brasseries, emballages, emplacements, unités de vente & consignes
// ============================================================================

use serde::Serialize;
use sqlx::FromRow;

#[derive(Debug, Serialize, FromRow)]
pub struct BreweryDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub short_name: Option<String>,
    pub country_code: String,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub website: Option<String>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PackagingTypeDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub default_name: String,
    pub is_reusable: i64,
    pub is_returnable: i64,
    pub is_active: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct StockLocationDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub location_type: String,
    pub is_default: i64,
    pub is_active: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct SalesUnitDto {
    pub id: i64,
    pub product_id: i64,
    pub variant_id: Option<i64>,
    pub packaging_id: Option<i64>,
    pub code: Option<String>,
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
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ProductSupplierDto {
    pub id: i64,
    pub product_id: i64,
    pub supplier_id: i64,
    pub supplier_name: Option<String>,
    pub supplier_product_code: Option<String>,
    pub preferred_supplier: i64,
    pub purchase_unit: String,
    pub units_per_purchase_package: i64,
    pub last_purchase_price: Option<i64>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct DepositRuleDto {
    pub id: i64,
    pub product_id: Option<i64>,
    pub variant_id: Option<i64>,
    pub packaging_id: Option<i64>,
    pub returnable_id: i64,
    pub returnable_name: Option<String>,
    pub deposit_kind: String,
    pub amount: i64,
    pub currency: String,
    pub effective_from: String,
    pub effective_to: Option<String>,
    pub supplier_id: Option<i64>,
    pub is_active: i64,
    pub created_at: String,
}
