// ============================================================================
// Catalogue V3 / V4 : brasseries, marques, contenants, variantes, unités & tarifs
// ============================================================================

#![allow(clippy::needless_borrows_for_generic_args, clippy::collapsible_match)]

mod bottle_profiles;
mod brands;
mod breweries;
mod catalog_v4_refs;
mod compatibility_groups;
mod container_types;
mod crate_types;
mod customer_price_list_items;
mod customer_price_lists;
mod disposable_packagings;
mod dtos;
mod dtos_v4;
mod helpers;
mod inputs_catalog;
mod inputs_catalog_packaging;
mod inputs_pricing;
mod inputs_v4;
mod packaging_materials;
mod packaging_values_and_history;
mod product_variants;
mod product_variants_update;
mod sales_units;
mod sales_units_update;
mod supplier_prices;
mod units_of_measure;

pub use bottle_profiles::{
    create_bottle_profile, delete_bottle_profile, list_bottle_profile, update_bottle_profile,
};
pub use brands::{create_brand, delete_brand, list_brand, update_brand};
pub use breweries::{create_brewery, delete_brewery, list_breweries, update_brewery};
pub use catalog_v4_refs::{
    create_deposit_rule, create_packaging_type, create_stock_location, list_deposit_rules,
    list_packaging_types, list_product_suppliers, list_stock_locations, upsert_product_supplier,
};
pub use compatibility_groups::{
    create_compatibility_group, delete_compatibility_group, list_compatibility_group,
    update_compatibility_group,
};
pub use container_types::{
    create_container_type, delete_container_type, list_container_type, update_container_type,
};
pub use crate_types::{create_crate_type, delete_crate_type, list_crate_type, update_crate_type};
pub use customer_price_list_items::{
    create_customer_price_list_item, delete_customer_price_list_item,
    list_customer_price_list_items, update_customer_price_list_item,
};
pub use customer_price_lists::{
    create_customer_price_list, delete_customer_price_list, list_customer_price_lists,
    update_customer_price_list,
};
pub use disposable_packagings::{
    create_disposable_packaging_type, delete_disposable_packaging_type,
    list_disposable_packaging_type, update_disposable_packaging_type,
};
pub use dtos::{
    BottleProfileDto, BrandDto, CompatibilityGroupDto, ContainerTypeDto, CrateTypeDto,
    CustomerPriceListDto, CustomerPriceListItemDto, DisposablePackagingTypeDto,
    PackagingMaterialDto, PackagingValueDto, PaginatedQuery, PaginatedResponse, PriceHistoryDto,
    ProductVariantDto, SupplierProductPriceDto, UnitOfMeasureDto,
};
pub use dtos_v4::{
    BreweryDto, DepositRuleDto, PackagingTypeDto, ProductSupplierDto, SalesUnitDto,
    StockLocationDto,
};
pub use inputs_catalog::{
    CreateBottleProfileInput, CreateBrandInput, CreateCompatibilityGroupInput,
    CreateCrateTypeInput, CreateProductVariantInput, UpdateBottleProfileInput, UpdateBrandInput,
    UpdateCompatibilityGroupInput, UpdateCrateTypeInput, UpdateProductVariantInput,
};
pub use inputs_catalog_packaging::{
    CreateContainerTypeInput, CreateDisposablePackagingTypeInput, CreatePackagingMaterialInput,
    CreateUnitOfMeasureInput, UpdateContainerTypeInput, UpdateDisposablePackagingTypeInput,
    UpdatePackagingMaterialInput, UpdateUnitOfMeasureInput,
};
pub use inputs_pricing::{
    CreateCustomerPriceListInput, CreateCustomerPriceListItemInput, CreatePackagingValueInput,
    CreateSupplierProductPriceInput, UpdateCustomerPriceListInput,
    UpdateCustomerPriceListItemInput, UpdatePackagingValueInput, UpdateSupplierProductPriceInput,
};
pub use inputs_v4::{
    CreateBreweryInput, CreateDepositRuleInput, CreatePackagingTypeInput, CreateSalesUnitInput,
    CreateStockLocationInput, UpdateBreweryInput, UpdateSalesUnitInput, UpsertProductSupplierInput,
};
pub use packaging_materials::{
    create_packaging_material, delete_packaging_material, list_packaging_material,
    update_packaging_material,
};
pub use packaging_values_and_history::{
    create_packaging_value, delete_packaging_value, list_packaging_values, list_price_history,
    update_packaging_value,
};
pub use product_variants::{create_product_variant, list_product_variants};
pub use product_variants_update::{delete_product_variant, update_product_variant};
pub use sales_units::{create_sales_unit, list_sales_units};
pub use sales_units_update::{delete_sales_unit, update_sales_unit};
pub use supplier_prices::{
    create_supplier_price, delete_supplier_price, list_supplier_prices, update_supplier_price,
};
pub use units_of_measure::{
    create_unit_of_measure, delete_unit_of_measure, list_unit_of_measure, update_unit_of_measure,
};
