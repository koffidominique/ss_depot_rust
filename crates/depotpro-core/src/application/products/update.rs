// ============================================================================
// Mise à jour d'une fiche produit et de sa variante physique
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::sales::audit_log_tx;
use crate::domain::money::Money;
use crate::domain::quantity::Quantity;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{
    get_product_by_id, sanitize_image_path, ProductSummaryDto, UpdateProductInput,
    ALLOWED_CONTAINER_TYPES,
};

pub async fn update_product(
    db: &DepotDb,
    id: i64,
    input: UpdateProductInput,
) -> CoreResult<ProductSummaryDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;

    type ExistingProductRow = (
        String, String, Option<String>, Option<String>, i64, Option<i64>, Option<String>,
        i64, i64, Option<i64>, Option<i64>, Option<i64>, Option<i64>, Option<String>, i64,
        Option<i64>, Option<i64>,
    );
    type ExistingVariantRow = (
        String, Option<i64>, Option<String>, Option<f64>,
        Option<i64>, Option<i64>, Option<i64>,
    );

    let (_guard, mut tx) = db.begin_write().await?;
    let existing: Option<ExistingProductRow> = sqlx::query_as(
        "SELECT reference, name, brand, barcode, category_id, supplier_id, description,
                min_stock_milli, max_stock_milli, purchase_price, wholesale_price,
                semi_wholesale_price, retail_price, image_path, is_active, brand_id, variant_id
         FROM products WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;

    let cur = existing.ok_or_else(|| CoreError::Validation("Produit introuvable.".to_string()))?;

    let name = input.name.as_deref().map(str::trim).filter(|v| !v.is_empty())
        .map(str::to_string).unwrap_or_else(|| cur.1.clone());
    if name.is_empty() {
        return Err(CoreError::Validation("Nom produit invalide.".to_string()));
    }

    if let Some(cid) = input.category_id {
        if sqlx::query_scalar::<_, i64>("SELECT id FROM categories WHERE id = ?")
            .bind(cid).fetch_optional(&mut *tx).await?.is_none() {
            return Err(CoreError::Validation("Catégorie introuvable.".to_string()));
        }
    }
    if let Some(sid) = input.supplier_id {
        if sqlx::query_scalar::<_, i64>("SELECT id FROM suppliers WHERE id = ?")
            .bind(sid).fetch_optional(&mut *tx).await?.is_none() {
            return Err(CoreError::Validation("Fournisseur introuvable.".to_string()));
        }
    }

    // La relation marque -> brasserie est canonique. Le champ texte historique
    // "brand" reste rempli pour compatibilité avec les écrans plus anciens.
    let (brand_id, brand_label) = if let Some(selected_brand_id) = input.brand_id {
        let brand = sqlx::query_as::<_, (String, Option<i64>)>(
            "SELECT name, brewery_id FROM brands WHERE id = ? AND is_active = 1",
        )
        .bind(selected_brand_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| CoreError::Validation("Marque introuvable ou inactive.".to_string()))?;
        if input.brewery_id.is_some() && input.brewery_id != brand.1 {
            return Err(CoreError::Validation(
                "La marque sélectionnée n'appartient pas à la brasserie choisie.".to_string(),
            ));
        }
        (Some(selected_brand_id), Some(brand.0))
    } else if let Some(legacy_brand) = input.brand.as_deref() {
        if input.brewery_id.is_some() {
            return Err(CoreError::Validation("Sélectionnez une marque pour cette brasserie.".to_string()));
        }
        let clean = legacy_brand.trim();
        (None, if clean.is_empty() { None } else { Some(clean.to_string()) })
    } else {
        (cur.15, cur.2.clone())
    };

    let barcode = match input.barcode.as_deref() {
        Some(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
        }
        None => cur.3.clone(),
    };
    if let Some(ref bc) = barcode {
        let dup: Option<(i64,)> = sqlx::query_as(
            "SELECT id FROM products WHERE barcode = ? AND id != ?
             UNION SELECT id FROM product_packagings WHERE barcode = ?",
        )
        .bind(bc).bind(id).bind(bc)
        .fetch_optional(&mut *tx).await?;
        if dup.is_some() {
            return Err(CoreError::DuplicateOperation("Code-barres déjà utilisé.".to_string()));
        }
    }

    let min_stock = match input.min_stock.as_deref() {
        Some(value) => Quantity::parse_str(value, "Stock minimum")?.milli_units,
        None => cur.7,
    };
    let max_stock = match input.max_stock.as_deref() {
        Some(value) => Quantity::parse_str(value, "Stock maximum")?.milli_units,
        None => cur.8,
    };
    let purchase_price = input.purchase_price
        .map(|v| Money::from_non_negative(v, "Prix d'achat").map(|m| m.value()))
        .transpose()?.or(cur.9);
    let wholesale_price = input.wholesale_price
        .map(|v| Money::from_non_negative(v, "Prix gros").map(|m| m.value()))
        .transpose()?.or(cur.10);
    let semi_price = input.semi_wholesale_price
        .map(|v| Money::from_non_negative(v, "Prix demi-gros").map(|m| m.value()))
        .transpose()?.or(cur.11);
    let retail_price = input.retail_price
        .map(|v| Money::from_non_negative(v, "Prix détail").map(|m| m.value()))
        .transpose()?.or(cur.12);
    let image_path = match input.image_path.as_ref() {
        Some(opt) => sanitize_image_path(opt.as_deref())?,
        None => cur.13.clone(),
    };
    let is_active = input.is_active.map(|b| if b { 1_i64 } else { 0_i64 }).unwrap_or(cur.14);

    sqlx::query(
        "UPDATE products
         SET name = ?, brand = ?, brand_id = ?, barcode = ?, category_id = ?, supplier_id = ?, description = ?,
             min_stock_milli = ?, max_stock_milli = ?, purchase_price = ?, wholesale_price = ?,
             semi_wholesale_price = ?, retail_price = ?, image_path = ?, is_active = ?
         WHERE id = ?",
    )
    .bind(&name)
    .bind(brand_label.as_deref())
    .bind(brand_id)
    .bind(&barcode)
    .bind(input.category_id.unwrap_or(cur.4))
    .bind(input.supplier_id.or(cur.5))
    .bind(input.description.as_deref().or(cur.6.as_deref()))
    .bind(min_stock).bind(max_stock).bind(purchase_price).bind(wholesale_price)
    .bind(semi_price).bind(retail_price).bind(image_path).bind(is_active).bind(id)
    .execute(&mut *tx).await?;

    // Mise à jour en place de la variante liée. On ne supprime jamais une
    // variante existante : ses références restent disponibles pour l'historique.
    let variant_changes_requested = input.variant_name.is_some()
        || input.volume_ml.is_some()
        || input.container_type.is_some()
        || input.alcohol_degree.is_some()
        || input.bottle_profile_id.is_some()
        || input.crate_type_id.is_some()
        || input.compatibility_group_id.is_some();

    if variant_changes_requested {
        let current_variant: Option<ExistingVariantRow> = if let Some(variant_id) = cur.16 {
            sqlx::query_as(
                "SELECT name, volume_ml, container_type, alcohol_degree,
                        bottle_profile_id, crate_type_id, compatibility_group_id
                 FROM product_variants WHERE id = ? AND product_id = ?",
            )
            .bind(variant_id).bind(id)
            .fetch_optional(&mut *tx).await?
        } else {
            None
        };

        let variant_name = input.variant_name.as_deref()
            .map(str::trim).filter(|v| !v.is_empty())
            .map(str::to_string)
            .or_else(|| current_variant.as_ref().map(|v| v.0.clone()))
            .unwrap_or_else(|| name.clone());
        let volume_ml = input.volume_ml.or_else(|| current_variant.as_ref().and_then(|v| v.1));
        let container_type = input.container_type.clone()
            .or_else(|| current_variant.as_ref().and_then(|v| v.2.clone()));
        let alcohol_degree = input.alcohol_degree.or_else(|| current_variant.as_ref().and_then(|v| v.3));
        let bottle_profile_id = input.bottle_profile_id.or_else(|| current_variant.as_ref().and_then(|v| v.4));
        let crate_type_id = input.crate_type_id.or_else(|| current_variant.as_ref().and_then(|v| v.5));
        let compatibility_group_id = input.compatibility_group_id.or_else(|| current_variant.as_ref().and_then(|v| v.6));

        if volume_ml.is_some() != container_type.is_some() {
            return Err(CoreError::Validation(
                "Le volume et le type de contenant doivent être renseignés ensemble.".to_string(),
            ));
        }
        if let Some(volume) = volume_ml {
            if volume <= 0 {
                return Err(CoreError::Validation("Le volume du contenant doit être positif.".to_string()));
            }
        }
        if let Some(ref kind) = container_type {
            if !ALLOWED_CONTAINER_TYPES.contains(&kind.as_str()) {
                return Err(CoreError::Validation("Type de contenant invalide.".to_string()));
            }
        }
        if let Some(degree) = alcohol_degree {
            if !degree.is_finite() || !(0.0..=100.0).contains(&degree) {
                return Err(CoreError::Validation("Le degré d'alcool doit être compris entre 0 et 100 %.".to_string()));
            }
        }
        if let Some(profile_id) = bottle_profile_id {
            if sqlx::query_scalar::<_, i64>("SELECT id FROM bottle_profiles WHERE id = ?")
                .bind(profile_id).fetch_optional(&mut *tx).await?.is_none() {
                return Err(CoreError::Validation("Profil de bouteille introuvable.".to_string()));
            }
        }
        if let Some(crate_id) = crate_type_id {
            if sqlx::query_scalar::<_, i64>("SELECT id FROM crate_types WHERE id = ?")
                .bind(crate_id).fetch_optional(&mut *tx).await?.is_none() {
                return Err(CoreError::Validation("Type de casier introuvable.".to_string()));
            }
        }
        if let Some(group_id) = compatibility_group_id {
            if sqlx::query_scalar::<_, i64>("SELECT id FROM crate_compatibility_groups WHERE id = ?")
                .bind(group_id).fetch_optional(&mut *tx).await?.is_none() {
                return Err(CoreError::Validation("Groupe de compatibilité introuvable.".to_string()));
            }
        }

        if let Some(variant_id) = cur.16 {
            if current_variant.is_none() {
                return Err(CoreError::Validation("Variante physique liée introuvable.".to_string()));
            }
            sqlx::query(
                "UPDATE product_variants
                 SET name = ?, volume_ml = ?, container_type = ?, alcohol_degree = ?,
                     bottle_profile_id = ?, crate_type_id = ?, compatibility_group_id = ?,
                     updated_at = datetime('now')
                 WHERE id = ? AND product_id = ?",
            )
            .bind(&variant_name).bind(volume_ml).bind(container_type.as_deref())
            .bind(alcohol_degree).bind(bottle_profile_id).bind(crate_type_id)
            .bind(compatibility_group_id).bind(variant_id).bind(id)
            .execute(&mut *tx).await?;
        } else {
            if volume_ml.is_none() || container_type.is_none() {
                return Err(CoreError::Validation(
                    "Pour créer une variante, renseignez son volume et son type de contenant.".to_string(),
                ));
            }
            let variant_id = sqlx::query(
                "INSERT INTO product_variants
                    (product_id, name, volume_ml, container_type, alcohol_degree,
                     bottle_profile_id, crate_type_id, compatibility_group_id, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
            )
            .bind(id).bind(&variant_name).bind(volume_ml).bind(container_type.as_deref())
            .bind(alcohol_degree).bind(bottle_profile_id).bind(crate_type_id)
            .bind(compatibility_group_id)
            .execute(&mut *tx).await?
            .last_insert_rowid();

            sqlx::query("UPDATE products SET variant_id = ? WHERE id = ?")
                .bind(variant_id).bind(id).execute(&mut *tx).await?;
        }
    }

    audit_log_tx(
        &mut tx,
        "UPDATE_PRODUCT",
        "products",
        Some(id.to_string()),
        &format!("Mise à jour produit {}", cur.0),
    )
    .await?;
    tx.commit().await?;
    get_product_by_id(db, id).await
}
