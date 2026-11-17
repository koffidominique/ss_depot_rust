use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::application::sales::audit_log_tx;
use crate::domain::quantity::Quantity;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

#[derive(Debug, Serialize, FromRow)]
pub struct StockProductDto {
    pub id: i64,
    pub reference: String,
    pub name: String,
    pub brand: Option<String>,
    pub category_name: String,
    pub base_unit: String,
    pub stock_milli: i64,
    pub min_stock_milli: i64,
    pub max_stock_milli: i64,
    pub average_cost_num: Option<String>,
    pub average_cost_den: Option<String>,
    pub is_active: i64,
}

#[derive(Debug, Serialize)]
pub struct StockProductEnrichedDto {
    pub id: i64,
    pub reference: String,
    pub name: String,
    pub brand: Option<String>,
    pub category_name: String,
    pub base_unit: String,
    pub stock_milli: i64,
    pub min_stock_milli: i64,
    pub max_stock_milli: i64,
    pub average_cost_num: Option<String>,
    pub average_cost_den: Option<String>,
    pub is_active: i64,
    pub average_cost_fcfa: Option<i64>,
    pub valuation_fcfa: Option<i64>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct StockMovementDto {
    pub id: i64,
    pub product_id: i64,
    pub product_name: String,
    pub product_reference: String,
    pub base_unit: String,
    pub movement_type: String,
    pub quantity_milli: i64,
    pub stock_before_milli: i64,
    pub stock_after_milli: i64,
    pub unit_cost: Option<i64>,
    pub reason: Option<String>,
    pub reference_document: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct StockOverviewDto {
    pub products: Vec<StockProductEnrichedDto>,
    pub movements: Vec<StockMovementDto>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct InventoryLineDto {
    pub id: i64,
    pub inventory_id: i64,
    pub product_id: i64,
    pub product_name: String,
    pub product_reference: String,
    pub base_unit: String,
    pub theoretical_milli: i64,
    pub counted_milli: Option<i64>,
    pub reason: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
struct InventoryRow {
    pub id: i64,
    pub reference: String,
    pub status: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub validated_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct InventoryDto {
    pub id: i64,
    pub reference: String,
    pub status: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub validated_at: Option<String>,
    pub lines: Vec<InventoryLineDto>,
}

#[derive(Debug, Deserialize)]
pub struct ValidateInventoryLineInput {
    pub product_id: i64,
    pub counted_quantity: String,
    pub reason: Option<String>,
}

pub async fn get_stock_overview(db: &DepotDb) -> CoreResult<StockOverviewDto> {
    let rows = sqlx::query_as::<_, StockProductDto>(
        "SELECT p.id, p.reference, p.name, p.brand, c.name AS category_name, p.base_unit,
                p.stock_milli, p.min_stock_milli, p.max_stock_milli, p.average_cost_num, p.average_cost_den, p.is_active
         FROM products p
         JOIN categories c ON c.id = p.category_id
         WHERE p.is_active = 1
         ORDER BY p.name ASC",
    )
    .fetch_all(&db.pool)
    .await?;

    let products = rows
        .into_iter()
        .map(|p| {
            let parsed = p
                .average_cost_num
                .as_deref()
                .and_then(|n| n.parse::<i128>().ok())
                .zip(p.average_cost_den.as_deref().and_then(|d| d.parse::<i128>().ok()));
            let (avg_cost, valuation) = match parsed {
                Some((num, den)) if den > 0 => {
                    let avg = ((num + den / 2) / den) as i64;
                    let val = (((p.stock_milli as i128) * (avg as i128) + 500) / 1000) as i64;
                    (Some(avg), Some(val))
                }
                _ => (None, None),
            };
            StockProductEnrichedDto {
                id: p.id,
                reference: p.reference,
                name: p.name,
                brand: p.brand,
                category_name: p.category_name,
                base_unit: p.base_unit,
                stock_milli: p.stock_milli,
                min_stock_milli: p.min_stock_milli,
                max_stock_milli: p.max_stock_milli,
                average_cost_num: p.average_cost_num,
                average_cost_den: p.average_cost_den,
                is_active: p.is_active,
                average_cost_fcfa: avg_cost,
                valuation_fcfa: valuation,
            }
        })
        .collect();

    let movements = sqlx::query_as::<_, StockMovementDto>(
        "SELECT sm.id, sm.product_id, p.name AS product_name, p.reference AS product_reference, p.base_unit,
                sm.movement_type, sm.quantity_milli, sm.stock_before_milli, sm.stock_after_milli,
                sm.unit_cost, sm.reason, sm.reference_document, sm.created_at
         FROM stock_movements sm
         JOIN products p ON p.id = sm.product_id
         ORDER BY sm.id DESC LIMIT 100",
    )
    .fetch_all(&db.pool)
    .await?;

    Ok(StockOverviewDto { products, movements })
}

pub async fn list_inventories(db: &DepotDb) -> CoreResult<Vec<InventoryDto>> {
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
    let (_guard, mut tx) = db.begin_write().await?;
    let reference = DepotDb::next_sequence(&mut tx, "INV").await?;
    let clean_notes = notes.map(str::trim).filter(|s| !s.is_empty());
    let inv_id = sqlx::query("INSERT INTO inventories (reference, status, notes) VALUES (?, 'draft', ?)")
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
            .bind(if reason.is_empty() { None } else { Some(reason) })
            .bind(lid)
            .execute(&mut *tx)
            .await?;

        if delta != 0 {
            sqlx::query("UPDATE products SET stock_milli = ? WHERE id = ?")
                .bind(counted.milli_units)
                .bind(l.product_id)
                .execute(&mut *tx)
                .await?;

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

    sqlx::query("UPDATE inventories SET status = 'validated', validated_at = datetime('now') WHERE id = ?")
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
