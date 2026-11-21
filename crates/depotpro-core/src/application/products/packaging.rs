// ============================================================================
// Validation et mise à jour des conditionnements & profils consignés
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::sales::audit_log_tx;
use crate::domain::money::Money;
use crate::domain::quantity::Quantity;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{get_product_by_id, PackagingInput, ProductPackagingDto, ALLOWED_PACKAGING_NAMES};

pub(crate) fn validate_packaging_prices(pkg: &PackagingInput) -> CoreResult<()> {
    if let Some(v) = pkg.purchase_price {
        Money::from_non_negative(v, "Prix d'achat (conditionnement)")?;
    }
    if let Some(v) = pkg.wholesale_price {
        Money::from_non_negative(v, "Prix gros (conditionnement)")?;
    }
    if let Some(v) = pkg.semi_wholesale_price {
        Money::from_non_negative(v, "Prix demi-gros (conditionnement)")?;
    }
    if let Some(v) = pkg.retail_price {
        Money::from_non_negative(v, "Prix détail (conditionnement)")?;
    }
    Ok(())
}

pub async fn upsert_packaging(
    db: &DepotDb,
    product_id: i64,
    pkg: PackagingInput,
) -> CoreResult<ProductPackagingDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    if !ALLOWED_PACKAGING_NAMES.contains(&pkg.name.as_str()) {
        return Err(CoreError::Validation(
            "Type de conditionnement invalide : seul \"casier\" est autorisé.".to_string(),
        ));
    }
    if pkg.deposit_mode.as_deref() == Some("deposit") && pkg.name != "casier" {
        return Err(CoreError::Validation(
            "Seul le conditionnement \"casier\" est soumis au système de retour d'emballage."
                .to_string(),
        ));
    }
    let coeff = Quantity::parse_str(&pkg.coefficient, "Coefficient")?;
    if coeff.milli_units <= 0 {
        return Err(CoreError::Validation(
            "Coefficient nul interdit.".to_string(),
        ));
    }
    validate_packaging_prices(&pkg)?;

    let (_guard, mut tx) = db.begin_write().await?;
    let base_unit: Option<(String,)> =
        sqlx::query_as("SELECT base_unit FROM products WHERE id = ?")
            .bind(product_id)
            .fetch_optional(&mut *tx)
            .await?;
    let (base_unit,) =
        base_unit.ok_or_else(|| CoreError::Validation("Produit introuvable.".to_string()))?;

    let pkg_bc = pkg
        .barcode
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if let Some(bc) = pkg_bc {
        let dup: Option<(i64,)> = sqlx::query_as(
            "SELECT id FROM products WHERE barcode = ? UNION SELECT id FROM product_packagings WHERE barcode = ? AND id != ?",
        )
        .bind(bc)
        .bind(bc)
        .bind(pkg.id.unwrap_or(-1))
        .fetch_optional(&mut *tx)
        .await?;
        if dup.is_some() {
            return Err(CoreError::DuplicateOperation(
                "Code-barres déjà utilisé.".to_string(),
            ));
        }
    }

    let dup_name: Option<(i64,)> = sqlx::query_as(
        "SELECT id FROM product_packagings WHERE product_id = ? AND name = ? AND id != ?",
    )
    .bind(product_id)
    .bind(&pkg.name)
    .bind(pkg.id.unwrap_or(-1))
    .fetch_optional(&mut *tx)
    .await?;
    if dup_name.is_some() {
        return Err(CoreError::DuplicateOperation(format!(
            "Un conditionnement \"{}\" existe déjà pour ce produit. Sélectionnez-le pour le modifier.",
            pkg.name
        )));
    }

    let pkg_id = if let Some(id) = pkg.id {
        let exists: Option<(i64,)> =
            sqlx::query_as("SELECT id FROM product_packagings WHERE id = ? AND product_id = ?")
                .bind(id)
                .bind(product_id)
                .fetch_optional(&mut *tx)
                .await?;
        if exists.is_none() {
            return Err(CoreError::Validation(
                "Conditionnement introuvable pour ce produit.".to_string(),
            ));
        }
        sqlx::query(
            "UPDATE product_packagings
             SET name = ?, coefficient_milli = ?, purchase_price = ?, wholesale_price = ?,
                 semi_wholesale_price = ?, retail_price = ?, barcode = ?, allow_fraction = ?, is_active = ?
             WHERE id = ? AND product_id = ?",
        )
        .bind(&pkg.name)
        .bind(coeff.milli_units)
        .bind(pkg.purchase_price)
        .bind(pkg.wholesale_price)
        .bind(pkg.semi_wholesale_price)
        .bind(pkg.retail_price)
        .bind(pkg_bc)
        .bind(if pkg.allow_fraction.unwrap_or(false) { 1_i64 } else { 0_i64 })
        .bind(if pkg.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
        .bind(id)
        .bind(product_id)
        .execute(&mut *tx)
        .await?;
        id
    } else {
        sqlx::query(
            "INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, barcode, allow_fraction)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(product_id)
        .bind(&pkg.name)
        .bind(&base_unit)
        .bind(coeff.milli_units)
        .bind(pkg.purchase_price)
        .bind(pkg.wholesale_price)
        .bind(pkg.semi_wholesale_price)
        .bind(pkg.retail_price)
        .bind(pkg_bc)
        .bind(if pkg.allow_fraction.unwrap_or(false) { 1_i64 } else { 0_i64 })
        .execute(&mut *tx)
        .await?
        .last_insert_rowid()
    };

    let mode = if pkg.deposit_mode.as_deref() == Some("deposit") {
        "deposit"
    } else {
        "none"
    };
    sqlx::query(
        "INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, ?)
         ON CONFLICT(packaging_id) DO UPDATE SET mode = excluded.mode",
    )
    .bind(pkg_id)
    .bind(mode)
    .execute(&mut *tx)
    .await?;

    sqlx::query("DELETE FROM deposit_packaging_components WHERE packaging_id = ?")
        .bind(pkg_id)
        .execute(&mut *tx)
        .await?;

    if mode == "deposit" {
        if let Some(comps) = pkg.components {
            for c in comps {
                if c.pieces_per_pack <= 0 {
                    return Err(CoreError::Validation(
                        "Pièces par conditionnement invalides.".to_string(),
                    ));
                }
                let rt_exists: Option<i64> =
                    sqlx::query_scalar("SELECT id FROM returnable_packaging_types WHERE id = ?")
                        .bind(c.returnable_id)
                        .fetch_optional(&mut *tx)
                        .await?;
                if rt_exists.is_none() {
                    return Err(CoreError::Validation(
                        "Type d'emballage consigné introuvable.".to_string(),
                    ));
                }
                sqlx::query(
                    "INSERT INTO deposit_packaging_components (packaging_id, returnable_id, pieces_per_pack) VALUES (?, ?, ?)",
                )
                .bind(pkg_id)
                .bind(c.returnable_id)
                .bind(c.pieces_per_pack)
                .execute(&mut *tx)
                .await?;
            }
        }
    }

    audit_log_tx(
        &mut tx,
        "UPSERT_PACKAGING",
        "product_packagings",
        Some(pkg_id.to_string()),
        &format!("Conditionnement {}", pkg.name),
    )
    .await?;
    tx.commit().await?;

    let prod = get_product_by_id(db, product_id).await?;
    prod.packagings
        .into_iter()
        .find(|p| p.id == pkg_id)
        .ok_or_else(|| CoreError::Internal("Conditionnement introuvable.".to_string()))
}
