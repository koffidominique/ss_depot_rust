// ============================================================================
// Suppression définitive d'un produit vierge (réservée au Propriétaire)
// ============================================================================

use serde::Serialize;

use crate::application::auth::{current_actor, require_current_actor_permission, Permission, Role};
use crate::application::sales::audit_log_tx;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

#[derive(Debug, Serialize)]
pub struct DeleteProductResultDto {
    pub deleted: bool,
    pub id: i64,
    pub reference: String,
    pub name: String,
}

pub async fn delete_product(db: &DepotDb, id: i64) -> CoreResult<DeleteProductResultDto> {
    require_current_actor_permission(Permission::CatalogDelete)?;
    if let Some(actor) = current_actor() {
        if actor.role != Role::Owner {
            return Err(CoreError::Forbidden(
                "Seul le Propriétaire peut supprimer définitivement un produit.".to_string(),
            ));
        }
    }

    let (_guard, mut tx) = db.begin_write().await?;
    let existing: Option<(i64, String, String)> =
        sqlx::query_as("SELECT id, reference, name FROM products WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let (prod_id, reference, name) =
        existing.ok_or_else(|| CoreError::NotFound("Produit introuvable.".to_string()))?;

    let has_sale: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM sale_lines WHERE product_id = ? LIMIT 1")
            .bind(prod_id)
            .fetch_optional(&mut *tx)
            .await?;
    let has_po: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM purchase_order_lines WHERE product_id = ? LIMIT 1")
            .bind(prod_id)
            .fetch_optional(&mut *tx)
            .await?;
    let has_inv: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM inventory_lines WHERE product_id = ? LIMIT 1")
            .bind(prod_id)
            .fetch_optional(&mut *tx)
            .await?;
    let has_move: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM stock_movements WHERE product_id = ? LIMIT 1")
            .bind(prod_id)
            .fetch_optional(&mut *tx)
            .await?;
    let has_order: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM order_lines WHERE product_id = ? LIMIT 1")
            .bind(prod_id)
            .fetch_optional(&mut *tx)
            .await?;

    if has_sale.is_some()
        || has_po.is_some()
        || has_inv.is_some()
        || has_move.is_some()
        || has_order.is_some()
    {
        return Err(CoreError::HistoricalImmutable(
            "Produit utilisé dans ventes, achats, commandes ou stocks : archivez-le.".to_string(),
        ));
    }

    sqlx::query(
        "DELETE FROM price_history
         WHERE (entity_type = 'product' AND entity_id = ?)
            OR (entity_type = 'product_packaging' AND entity_id IN (
                    SELECT id FROM product_packagings WHERE product_id = ?
                ))
            OR variant_id IN (SELECT id FROM product_variants WHERE product_id = ?)
            OR sales_unit_id IN (SELECT id FROM sales_units WHERE product_id = ?)",
    )
    .bind(prod_id)
    .bind(prod_id)
    .bind(prod_id)
    .bind(prod_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query("UPDATE products SET variant_id = NULL WHERE id = ?")
        .bind(prod_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE product_packagings SET variant_id = NULL WHERE product_id = ?")
        .bind(prod_id)
        .execute(&mut *tx)
        .await?;

    sqlx::query(
        "DELETE FROM deposit_packaging_components
         WHERE packaging_id IN (SELECT id FROM product_packagings WHERE product_id = ?)",
    )
    .bind(prod_id)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "DELETE FROM deposit_packaging_profiles
         WHERE packaging_id IN (SELECT id FROM product_packagings WHERE product_id = ?)",
    )
    .bind(prod_id)
    .execute(&mut *tx)
    .await?;
    sqlx::query("DELETE FROM deposit_rules WHERE product_id = ?")
        .bind(prod_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM product_compatibility_rules WHERE product_id = ?")
        .bind(prod_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM stock_balances WHERE product_id = ?")
        .bind(prod_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM sales_units WHERE product_id = ?")
        .bind(prod_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM product_suppliers WHERE product_id = ?")
        .bind(prod_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM product_packagings WHERE product_id = ?")
        .bind(prod_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM product_variants WHERE product_id = ?")
        .bind(prod_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM products WHERE id = ?")
        .bind(prod_id)
        .execute(&mut *tx)
        .await?;

    audit_log_tx(
        &mut tx,
        "DELETE_PRODUCT",
        "products",
        Some(prod_id.to_string()),
        &format!("Suppression définitive produit {reference} — {name}"),
    )
    .await?;
    tx.commit().await?;

    Ok(DeleteProductResultDto {
        deleted: true,
        id: prod_id,
        reference,
        name,
    })
}
