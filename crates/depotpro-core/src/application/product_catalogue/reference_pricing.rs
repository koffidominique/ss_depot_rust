// ============================================================================
// Administration OWNER : statut actif & historique des prix de référence
// ============================================================================

use serde::{Deserialize, Serialize};

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

#[derive(Debug, Serialize)]
pub struct CatalogueProductStatusDto {
    pub id: i64,
    pub code: String,
    pub is_active: bool,
    pub is_sellable: bool,
}

#[derive(Debug, Deserialize)]
pub struct SetReferencePriceInput {
    pub reference_price: i64,
    pub reason: Option<String>,
    pub request_key: String,
}

#[derive(Debug, Serialize)]
pub struct ReferencePriceDto {
    pub id: i64,
    pub product_id: i64,
    pub reference_price: i64,
    pub previous_price: i64,
    pub reason: Option<String>,
    pub changed_by: Option<String>,
    pub created_at: String,
}

/// Archive (is_active = 0) ou réactive une référence du catalogue standard.
/// Une référence utilisée dans des opérations n'est jamais supprimée
/// physiquement (catalogue_seed.md §14) : l'historique des ventes conserve
/// ses propres désignations.
pub async fn set_catalogue_product_active(
    db: &DepotDb,
    product_id: i64,
    is_active: bool,
) -> CoreResult<CatalogueProductStatusDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;

    let (_guard, mut tx) = db.begin_write().await?;
    let row: Option<(String, String)> =
        sqlx::query_as("SELECT code, name FROM catalogue_products WHERE id = ?")
            .bind(product_id)
            .fetch_optional(&mut *tx)
            .await?;
    let (code, name) =
        row.ok_or_else(|| CoreError::Validation("Référence catalogue introuvable.".to_string()))?;

    sqlx::query(
        "UPDATE catalogue_products SET is_active = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(if is_active { 1 } else { 0 })
    .bind(product_id)
    .execute(&mut *tx)
    .await?;

    crate::application::sales::audit_log_tx(
        &mut tx,
        if is_active {
            "CATALOG_REACTIVATE"
        } else {
            "CATALOG_ARCHIVE"
        },
        "catalogue_products",
        Some(product_id.to_string()),
        &format!(
            "{} de la référence {code} ({name})",
            if is_active {
                "Réactivation"
            } else {
                "Archivage"
            }
        ),
    )
    .await?;
    tx.commit().await?;

    let (is_active_db, is_sellable): (i64, i64) =
        sqlx::query_as("SELECT is_active, is_sellable FROM catalogue_products WHERE id = ?")
            .bind(product_id)
            .fetch_one(&db.pool)
            .await?;
    Ok(CatalogueProductStatusDto {
        id: product_id,
        code,
        is_active: is_active_db == 1,
        is_sellable: is_sellable == 1,
    })
}

/// Définit le prix de référence d'une référence catalogue avec historique
/// complet (ancien prix, nouveau prix, auteur, motif). Les ventes
/// historiques ne sont jamais recalculées : elles portent leur propre
/// photographie de prix (catalogue_seed.md §8.1, critère 15).
pub async fn set_reference_price(
    db: &DepotDb,
    product_id: i64,
    input: SetReferencePriceInput,
    actor_name: Option<&str>,
) -> CoreResult<ReferencePriceDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    if input.reference_price < 0 {
        return Err(CoreError::Validation(
            "Le prix de référence ne peut pas être négatif.".to_string(),
        ));
    }
    if input.request_key.trim().is_empty() {
        return Err(CoreError::Validation(
            "Clé d'idempotence requise.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;

    // Idempotence.
    let replay: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM catalogue_reference_price_history WHERE request_key = ?",
    )
    .bind(input.request_key.trim())
    .fetch_optional(&mut *tx)
    .await?;
    if let Some(hist_id) = replay {
        let (price, prev): (i64, i64) = sqlx::query_as(
            "SELECT reference_price, previous_price FROM catalogue_reference_price_history
             WHERE request_key = ?",
        )
        .bind(input.request_key.trim())
        .fetch_one(&mut *tx)
        .await?;
        return Ok(ReferencePriceDto {
            id: hist_id,
            product_id,
            reference_price: price,
            previous_price: prev,
            reason: None,
            changed_by: actor_name.map(str::to_string),
            created_at: String::new(),
        });
    }

    let existing: Option<(String, i64)> =
        sqlx::query_as("SELECT code, unit_price FROM catalogue_products WHERE id = ?")
            .bind(product_id)
            .fetch_optional(&mut *tx)
            .await?;
    let (code, old_price) = existing
        .ok_or_else(|| CoreError::Validation("Référence catalogue introuvable.".to_string()))?;
    if old_price == input.reference_price {
        return Err(CoreError::Validation(
            "Le prix de référence est déjà à cette valeur.".to_string(),
        ));
    }

    sqlx::query(
        "UPDATE catalogue_products SET unit_price = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(input.reference_price)
    .bind(product_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO catalogue_reference_price_history
            (request_key, catalogue_product_id, previous_price, reference_price, reason, changed_by_name)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(input.request_key.trim())
    .bind(product_id)
    .bind(old_price)
    .bind(input.reference_price)
    .bind(input.reason.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(actor_name)
    .execute(&mut *tx)
    .await?;
    let hist_id = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM catalogue_reference_price_history WHERE request_key = ?",
    )
    .bind(input.request_key.trim())
    .fetch_one(&mut *tx)
    .await?;

    crate::application::sales::audit_log_tx(
        &mut tx,
        "CATALOG_PRICE_CHANGE",
        "catalogue_products",
        Some(product_id.to_string()),
        &format!(
            "Prix de référence {code} : {old_price} → {} FCFA",
            input.reference_price
        ),
    )
    .await?;
    tx.commit().await?;

    Ok(ReferencePriceDto {
        id: hist_id,
        product_id,
        reference_price: input.reference_price,
        previous_price: old_price,
        reason: input.reason,
        changed_by: actor_name.map(str::to_string),
        created_at: String::new(),
    })
}

/// Historique des prix de référence d'une référence (du plus récent au plus ancien).
pub async fn list_reference_price_history(
    db: &DepotDb,
    product_id: i64,
) -> CoreResult<Vec<ReferencePriceDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let rows = sqlx::query_as::<_, (i64, i64, i64, Option<String>, Option<String>, String)>(
        "SELECT id, catalogue_product_id, reference_price, reason, changed_by_name, created_at
         FROM catalogue_reference_price_history
         WHERE catalogue_product_id = ?
         ORDER BY id DESC",
    )
    .bind(product_id)
    .fetch_all(&db.pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(
            |(id, pid, price, reason, changed_by, created_at)| ReferencePriceDto {
                id,
                product_id: pid,
                reference_price: price,
                previous_price: 0,
                reason,
                changed_by,
                created_at,
            },
        )
        .collect())
}
