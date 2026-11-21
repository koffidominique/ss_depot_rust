// ============================================================================
// Hydratation complète d'un produit (conditionnements, variantes, unités)
// ============================================================================

use crate::error::CoreResult;
use crate::infrastructure::db::DepotDb;

use super::{
    DepositComponentDto, PackagingRow, ProductPackagingDto, ProductRow, ProductSalesUnitDto,
    ProductSummaryDto, ProductVariantSummaryDto,
};

pub(crate) async fn hydrate_products(
    db: &DepotDb,
    rows: Vec<ProductRow>,
) -> CoreResult<Vec<ProductSummaryDto>> {
    let mut items = Vec::with_capacity(rows.len());
    for prod in rows {
        let pkg_rows = sqlx::query_as::<_, PackagingRow>(
            "SELECT pk.id, pk.product_id, pk.variant_id, pk.packaging_type_id, pk.name,
                    pk.display_label, pk.package_sku, pk.base_unit, pk.coefficient_milli,
                    pk.purchase_price, pk.wholesale_price, pk.semi_wholesale_price, pk.retail_price,
                    pk.min_selling_price, pk.barcode, pk.allow_fraction, pk.is_reusable, pk.is_returnable,
                    pk.package_deposit_amount, pk.bottle_deposit_amount, pk.package_cost,
                    pk.is_default_sale, pk.is_default_purchase, pk.is_active, dp.mode AS deposit_mode
             FROM product_packagings pk
             LEFT JOIN deposit_packaging_profiles dp ON dp.packaging_id = pk.id
             WHERE pk.product_id = ?
             ORDER BY pk.coefficient_milli ASC",
        )
        .bind(prod.id)
        .fetch_all(&db.pool)
        .await?;

        let mut packagings = Vec::with_capacity(pkg_rows.len());
        for pk in pkg_rows {
            let comps = sqlx::query_as::<_, DepositComponentDto>(
                "SELECT dpc.returnable_id, dpc.pieces_per_pack, rpt.code, rpt.name, rpt.deposit_value, rpt.kind
                 FROM deposit_packaging_components dpc
                 JOIN returnable_packaging_types rpt ON rpt.id = dpc.returnable_id
                 WHERE dpc.packaging_id = ?",
            )
            .bind(pk.id)
            .fetch_all(&db.pool)
            .await?;

            packagings.push(ProductPackagingDto {
                id: pk.id,
                product_id: pk.product_id,
                variant_id: pk.variant_id,
                packaging_type_id: pk.packaging_type_id,
                name: pk.name,
                display_label: pk.display_label,
                package_sku: pk.package_sku,
                base_unit: pk.base_unit,
                coefficient_milli: pk.coefficient_milli,
                purchase_price: pk.purchase_price,
                wholesale_price: pk.wholesale_price,
                semi_wholesale_price: pk.semi_wholesale_price,
                retail_price: pk.retail_price,
                min_selling_price: pk.min_selling_price,
                barcode: pk.barcode,
                allow_fraction: pk.allow_fraction,
                is_reusable: pk.is_reusable,
                is_returnable: pk.is_returnable,
                package_deposit_amount: pk.package_deposit_amount,
                bottle_deposit_amount: pk.bottle_deposit_amount,
                package_cost: pk.package_cost,
                is_default_sale: pk.is_default_sale,
                is_default_purchase: pk.is_default_purchase,
                is_active: pk.is_active,
                deposit_mode: pk.deposit_mode,
                components: comps,
            });
        }

        let variants = sqlx::query_as::<_, ProductVariantSummaryDto>(
            "SELECT id, product_id, name, sku, barcode, volume_ml, container_type, container_type_id,
                    container_material, container_returnable, container_recyclable, container_deposit_amount,
                    native_crate_capacity, compatibility_class, is_active
             FROM product_variants WHERE product_id = ? ORDER BY id ASC",
        )
        .bind(prod.id)
        .fetch_all(&db.pool)
        .await?;

        let sales_units = sqlx::query_as::<_, ProductSalesUnitDto>(
            "SELECT id, product_id, variant_id, packaging_id, label, unit_type, conversion_factor,
                    is_virtual, allow_fraction, purchase_price, wholesale_price, semi_wholesale_price,
                    retail_price, min_selling_price, bottle_deposit_amount, crate_deposit_amount,
                    barcode, is_default_sale, is_default_purchase, is_active
             FROM sales_units WHERE product_id = ? AND is_active = 1 ORDER BY conversion_factor ASC, id ASC",
        )
        .bind(prod.id)
        .fetch_all(&db.pool)
        .await?;

        let avg_cost = prod
            .average_cost_num
            .as_deref()
            .and_then(|n| n.parse::<i128>().ok())
            .zip(
                prod.average_cost_den
                    .as_deref()
                    .and_then(|d| d.parse::<i128>().ok()),
            )
            .and_then(|(num, den)| {
                if den > 0 {
                    Some(((num + den / 2) / den) as i64)
                } else {
                    None
                }
            });

        items.push(ProductSummaryDto {
            id: prod.id,
            reference: prod.reference,
            barcode: prod.barcode,
            name: prod.name,
            brand: prod.brand,
            brewery_id: prod.brewery_id,
            brewery_name: prod.brewery_name,
            brand_id: prod.brand_id,
            variant_id: prod.variant_id,
            variant_label: prod.variant_label,
            category_id: prod.category_id,
            category_name: prod.category_name,
            subcategory_id: prod.subcategory_id,
            subcategory_name: prod.subcategory_name,
            supplier_id: prod.supplier_id,
            supplier_name: prod.supplier_name,
            description: prod.description,
            alcohol_degree_milli: prod.alcohol_degree_milli,
            is_alcoholic: prod.is_alcoholic,
            ingredients: prod.ingredients,
            beverage_color: prod.beverage_color,
            storage_temp: prod.storage_temp,
            shelf_life_days: prod.shelf_life_days,
            is_perishable: prod.is_perishable,
            track_batches: prod.track_batches,
            track_expiry: prod.track_expiry,
            allow_credit_sale: prod.allow_credit_sale,
            allow_unit_sale: prod.allow_unit_sale,
            allow_mixed_sale: prod.allow_mixed_sale,
            default_location_id: prod.default_location_id,
            status: prod.status,
            base_unit: prod.base_unit,
            stock_milli: prod.stock_milli,
            min_stock_milli: prod.min_stock_milli,
            max_stock_milli: prod.max_stock_milli,
            average_cost_fcfa: avg_cost,
            purchase_price: prod.purchase_price,
            wholesale_price: prod.wholesale_price,
            semi_wholesale_price: prod.semi_wholesale_price,
            retail_price: prod.retail_price,
            image_path: prod.image_path,
            is_active: prod.is_active,
            packagings,
            variants,
            sales_units,
        });
    }
    Ok(items)
}
