// ============================================================================
// Helpers V4 atomiques pour unités de vente et fournisseurs produit
// ============================================================================

use sqlx::{Sqlite, Transaction};

use crate::error::{CoreError, CoreResult};

use super::v4_types::{InitialProductSupplierInput, InitialSalesUnitInput};

pub(crate) async fn create_initial_sales_units_tx(
    tx: &mut Transaction<'_, Sqlite>,
    product_id: i64,
    variant_id: Option<i64>,
    default_pkg_id: Option<i64>,
    units: &[InitialSalesUnitInput],
) -> CoreResult<()> {
    for u in units {
        let label = u.label.trim();
        if label.is_empty() {
            return Err(CoreError::Validation(
                "Le libellé d'une unité de vente est obligatoire.".to_string(),
            ));
        }
        if u.conversion_factor <= 0 {
            return Err(CoreError::Validation(format!(
                "Conversion invalide pour l'unité \"{label}\"."
            )));
        }
        for p in [
            u.purchase_price,
            u.wholesale_price,
            u.semi_wholesale_price,
            u.retail_price,
            u.min_selling_price,
            u.bottle_deposit_amount,
            u.crate_deposit_amount,
        ]
        .into_iter()
        .flatten()
        {
            if p < 0 {
                return Err(CoreError::Validation(format!(
                    "Montant négatif interdit sur l'unité \"{label}\"."
                )));
            }
        }
        let clean_bc = u
            .barcode
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty());
        let su_id = sqlx::query(
            "INSERT INTO sales_units (
                product_id, variant_id, packaging_id, label, unit_type, conversion_factor,
                is_virtual, allow_fraction, purchase_price, wholesale_price, semi_wholesale_price,
                retail_price, min_selling_price, bottle_deposit_amount, crate_deposit_amount,
                barcode, is_default_sale, is_default_purchase
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(product_id)
        .bind(variant_id)
        .bind(default_pkg_id)
        .bind(label)
        .bind(&u.unit_type)
        .bind(u.conversion_factor)
        .bind(if u.is_virtual.unwrap_or(false) {
            1_i64
        } else {
            0_i64
        })
        .bind(if u.allow_fraction.unwrap_or(false) {
            1_i64
        } else {
            0_i64
        })
        .bind(u.purchase_price)
        .bind(u.wholesale_price)
        .bind(u.semi_wholesale_price)
        .bind(u.retail_price)
        .bind(u.min_selling_price)
        .bind(u.bottle_deposit_amount.unwrap_or(0))
        .bind(u.crate_deposit_amount.unwrap_or(0))
        .bind(clean_bc)
        .bind(if u.is_default_sale.unwrap_or(false) {
            1_i64
        } else {
            0_i64
        })
        .bind(if u.is_default_purchase.unwrap_or(false) {
            1_i64
        } else {
            0_i64
        })
        .execute(&mut **tx)
        .await?
        .last_insert_rowid();

        for (ptype, amt) in [
            ("PURCHASE", u.purchase_price),
            ("WHOLESALE", u.wholesale_price),
            ("RETAIL", u.retail_price),
            ("MINIMUM_SELLING_PRICE", u.min_selling_price),
        ] {
            if let Some(val) = amt {
                sqlx::query(
                    "INSERT INTO price_history (entity_type, entity_id, variant_id, sales_unit_id, price_type, new_price, currency, effective_from, reason)
                     VALUES ('product_packaging', ?, ?, ?, ?, ?, 'FCFA', datetime('now'), 'Création produit')",
                )
                .bind(default_pkg_id.unwrap_or(su_id))
                .bind(variant_id)
                .bind(su_id)
                .bind(ptype)
                .bind(val)
                .execute(&mut **tx)
                .await?;
            }
        }
    }
    Ok(())
}

pub(crate) async fn create_initial_product_suppliers_tx(
    tx: &mut Transaction<'_, Sqlite>,
    product_id: i64,
    suppliers: &[InitialProductSupplierInput],
) -> CoreResult<()> {
    for ps in suppliers {
        let sup_ok: Option<i64> = sqlx::query_scalar("SELECT id FROM suppliers WHERE id = ?")
            .bind(ps.supplier_id)
            .fetch_optional(&mut **tx)
            .await?;
        if sup_ok.is_none() {
            return Err(CoreError::Validation(
                "Fournisseur associé introuvable.".to_string(),
            ));
        }
        sqlx::query(
            "INSERT OR REPLACE INTO product_suppliers (
                product_id, supplier_id, supplier_product_code, preferred_supplier,
                purchase_unit, units_per_purchase_package, last_purchase_price, is_active
             ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
        )
        .bind(product_id)
        .bind(ps.supplier_id)
        .bind(
            ps.supplier_product_code
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty()),
        )
        .bind(if ps.preferred_supplier.unwrap_or(false) {
            1_i64
        } else {
            0_i64
        })
        .bind(ps.purchase_unit.as_deref().unwrap_or("casier"))
        .bind(ps.units_per_purchase_package.unwrap_or(1).max(1))
        .bind(ps.last_purchase_price)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}
