// ============================================================================
// Sessions d'inventaire physique : listing, création et validation
// ============================================================================

use std::collections::HashSet;

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::sales::audit_log_tx;
use crate::domain::quantity::Quantity;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{InventoryDto, InventoryLineDto, InventoryRow, ValidateInventoryLineInput};

pub async fn list_inventories(db: &DepotDb) -> CoreResult<Vec<InventoryDto>> {
    require_current_actor_permission(Permission::StockRead)?;
    let invs = sqlx::query_as::<_, InventoryRow>(
        "SELECT id, reference, status, notes, created_at, validated_at FROM inventories ORDER BY id DESC",
    )
    .fetch_all(&db.pool)
    .await?;

    let mut out = Vec::with_capacity(invs.len());
    for inv in invs {
        let lines = sqlx::query_as::<_, InventoryLineDto>(
            "SELECT il.id, il.inventory_id, il.product_id, p.name AS product_name, p.reference AS product_reference,
                    p.base_unit, il.theoretical_milli, il.counted_milli, il.reason
             FROM inventory_lines il
             JOIN products p ON p.id = il.product_id
             WHERE il.inventory_id = ?
             ORDER BY p.name ASC",
        )
        .bind(inv.id)
        .fetch_all(&db.pool)
        .await?;

        out.push(InventoryDto {
            id: inv.id,
            reference: inv.reference,
            status: inv.status,
            notes: inv.notes,
            created_at: inv.created_at,
            validated_at: inv.validated_at,
            lines,
        });
    }
    Ok(out)
}

pub async fn create_inventory(db: &DepotDb, notes: Option<&str>) -> CoreResult<InventoryDto> {
    require_current_actor_permission(Permission::InventoryValidate)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let reference = DepotDb::next_sequence(&mut tx, "INV").await?;
    let clean_notes = notes.map(str::trim).filter(|s| !s.is_empty());
    let inv_id =
        sqlx::query("INSERT INTO inventories (reference, status, notes) VALUES (?, 'draft', ?)")
            .bind(&reference)
            .bind(clean_notes)
            .execute(&mut *tx)
            .await?
            .last_insert_rowid();

    let prods: Vec<(i64, i64)> =
        sqlx::query_as("SELECT id, stock_milli FROM products WHERE is_active = 1")
            .fetch_all(&mut *tx)
            .await?;

    for (pid, stock_milli) in prods {
        sqlx::query(
            "INSERT INTO inventory_lines (inventory_id, product_id, theoretical_milli) VALUES (?, ?, ?)",
        )
        .bind(inv_id)
        .bind(pid)
        .bind(stock_milli)
        .execute(&mut *tx)
        .await?;
    }

    audit_log_tx(
        &mut tx,
        "CREATE_INVENTORY",
        "inventories",
        Some(inv_id.to_string()),
        &format!("Création inventaire {reference}"),
    )
    .await?;
    tx.commit().await?;

    list_inventories(db)
        .await?
        .into_iter()
        .find(|i| i.id == inv_id)
        .ok_or_else(|| CoreError::Internal("Inventaire créé introuvable.".to_string()))
}

pub async fn validate_inventory(
    db: &DepotDb,
    inventory_id: i64,
    lines: Vec<ValidateInventoryLineInput>,
) -> CoreResult<InventoryDto> {
    require_current_actor_permission(Permission::InventoryValidate)?;
    let mut seen_products = HashSet::with_capacity(lines.len());
    for l in &lines {
        if !seen_products.insert(l.product_id) {
            return Err(CoreError::Validation(format!(
                "Produit #{} dupliqué dans le même inventaire.",
                l.product_id
            )));
        }
    }
    let (_guard, mut tx) = db.begin_write().await?;
    let inv: Option<(i64, String, String)> =
        sqlx::query_as("SELECT id, reference, status FROM inventories WHERE id = ?")
            .bind(inventory_id)
            .fetch_optional(&mut *tx)
            .await?;
    let (_, reference, status) =
        inv.ok_or_else(|| CoreError::Validation("Inventaire introuvable.".to_string()))?;
    if status != "draft" {
        return Err(CoreError::HistoricalImmutable(
            "Cet inventaire a déjà été validé ou annulé.".to_string(),
        ));
    }

    for l in lines {
        let counted = Quantity::parse_str(&l.counted_quantity, "Quantité comptée")?;
        let line_id: Option<(i64,)> = sqlx::query_as(
            "SELECT id FROM inventory_lines WHERE inventory_id = ? AND product_id = ?",
        )
        .bind(inventory_id)
        .bind(l.product_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some((lid,)) = line_id else {
            continue;
        };

        let (stock_before, prod_name): (i64, String) =
            sqlx::query_as("SELECT stock_milli, name FROM products WHERE id = ?")
                .bind(l.product_id)
                .fetch_one(&mut *tx)
                .await?;
        let delta = counted.milli_units - stock_before;
        let reason = l.reason.as_deref().map(str::trim).unwrap_or("");
        if delta != 0 && reason.is_empty() {
            return Err(CoreError::Validation(format!(
                "Un motif est obligatoire pour l'écart d'inventaire sur \"{prod_name}\"."
            )));
        }

        sqlx::query("UPDATE inventory_lines SET counted_milli = ?, reason = ? WHERE id = ?")
            .bind(counted.milli_units)
            .bind(if reason.is_empty() {
                None
            } else {
                Some(reason)
            })
            .bind(lid)
            .execute(&mut *tx)
            .await?;

        if delta != 0 {
            sqlx::query("UPDATE products SET stock_milli = ? WHERE id = ?")
                .bind(counted.milli_units)
                .bind(l.product_id)
                .execute(&mut *tx)
                .await?;
            super::sync_stock_balance_tx(&mut tx, l.product_id, counted.milli_units).await?;

            sqlx::query(
                "INSERT INTO stock_movements (product_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, reason, reference_document)
                 VALUES (?, 'inventory_adjust', ?, ?, ?, ?, ?)",
            )
            .bind(l.product_id)
            .bind(delta)
            .bind(stock_before)
            .bind(counted.milli_units)
            .bind(format!("Inventaire {reference} : {reason}"))
            .bind(&reference)
            .execute(&mut *tx)
            .await?;
        }
    }

    sqlx::query(
        "UPDATE inventories SET status = 'validated', validated_at = datetime('now') WHERE id = ?",
    )
    .bind(inventory_id)
    .execute(&mut *tx)
    .await?;
    audit_log_tx(
        &mut tx,
        "VALIDATE_INVENTORY",
        "inventories",
        Some(inventory_id.to_string()),
        &format!("Validation inventaire {reference}"),
    )
    .await?;
    tx.commit().await?;

    list_inventories(db)
        .await?
        .into_iter()
        .find(|i| i.id == inventory_id)
        .ok_or_else(|| CoreError::Internal("Inventaire validé introuvable.".to_string()))
}
