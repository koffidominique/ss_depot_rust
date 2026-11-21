// ============================================================================
// Actifs d'emballage, soldes consignés client & retours d'emballages
// ============================================================================

use sqlx::{Sqlite, SqlitePool, Transaction};

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::dtos::{
    CustomerDepositBalanceDto, OrderDetailDto, OrderReturnInput, PackagingAssetDto,
    PackagingMovementDto,
};
use super::queries::get_order;

pub(crate) async fn load_customer_deposits(
    pool: &SqlitePool,
    customer_id: i64,
) -> CoreResult<Vec<CustomerDepositBalanceDto>> {
    let rows: Vec<CustomerDepositBalanceDto> = sqlx::query_as(
        "SELECT cdb.id, cdb.customer_id, cdb.packaging_asset_id, pa.name AS packaging_name,
                pa.compatibility_class, pa.deposit_value, cdb.quantity_held, cdb.amount_held_xof,
                cdb.last_movement_at
         FROM customer_deposit_balances cdb
         JOIN packaging_assets pa ON pa.id = cdb.packaging_asset_id
         WHERE cdb.customer_id = ?
         ORDER BY pa.name ASC",
    )
    .bind(customer_id)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn list_packaging_assets(db: &DepotDb) -> CoreResult<Vec<PackagingAssetDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let rows: Vec<PackagingAssetDto> = sqlx::query_as(
        "SELECT id, code, name, packaging_type_id, returnable_id, capacity, deposit_value,
                currency, returnable, compatibility_class, stock_empty, stock_full, is_active
         FROM packaging_assets WHERE is_active = 1 ORDER BY capacity DESC, name ASC",
    )
    .fetch_all(&db.pool)
    .await?;
    Ok(rows)
}

pub async fn get_packaging_stock(db: &DepotDb) -> CoreResult<Vec<PackagingAssetDto>> {
    require_current_actor_permission(Permission::StockRead)?;
    let rows: Vec<PackagingAssetDto> = sqlx::query_as(
        "SELECT id, code, name, packaging_type_id, returnable_id, capacity, deposit_value,
                currency, returnable, compatibility_class, stock_empty, stock_full, is_active
         FROM packaging_assets ORDER BY name ASC",
    )
    .fetch_all(&db.pool)
    .await?;
    Ok(rows)
}

pub async fn get_customer_deposits(
    db: &DepotDb,
    customer_id: i64,
) -> CoreResult<Vec<CustomerDepositBalanceDto>> {
    require_current_actor_permission(Permission::ConsignmentsRead)?;
    load_customer_deposits(&db.pool, customer_id).await
}

pub async fn get_customer_deposit_history(
    db: &DepotDb,
    customer_id: i64,
) -> CoreResult<Vec<PackagingMovementDto>> {
    require_current_actor_permission(Permission::ConsignmentsRead)?;
    let rows: Vec<PackagingMovementDto> = sqlx::query_as(
        "SELECT pm.id, pm.packaging_asset_id, pa.name AS packaging_name, pm.customer_id,
                pm.order_id, pm.order_packaging_allocation_id, pm.movement_type, pm.quantity,
                pm.unit_deposit_xof, pm.total_deposit_xof, pm.notes, pm.created_at
         FROM packaging_movements pm
         JOIN packaging_assets pa ON pa.id = pm.packaging_asset_id
         WHERE pm.customer_id = ?
         ORDER BY pm.id DESC LIMIT 200",
    )
    .bind(customer_id)
    .fetch_all(&db.pool)
    .await?;
    Ok(rows)
}

async fn apply_customer_empty_return_tx(
    tx: &mut Transaction<'_, Sqlite>,
    customer_id: i64,
    order_id: Option<i64>,
    alloc_id: Option<i64>,
    packaging_asset_id: i64,
    quantity: i64,
    notes: Option<&str>,
) -> CoreResult<()> {
    if quantity <= 0 {
        return Err(CoreError::Validation(
            "La quantité retournée doit être > 0.".into(),
        ));
    }
    let held_row: Option<(i64, i64, i64)> = sqlx::query_as(
        "SELECT cdb.quantity_held, cdb.amount_held_xof, pa.deposit_value
         FROM customer_deposit_balances cdb
         JOIN packaging_assets pa ON pa.id = cdb.packaging_asset_id
         WHERE cdb.customer_id = ? AND cdb.packaging_asset_id = ?",
    )
    .bind(customer_id)
    .bind(packaging_asset_id)
    .fetch_optional(&mut **tx)
    .await?;
    let (held_qty, held_amt, unit_dep) = held_row.ok_or_else(|| {
        CoreError::Validation(
            "Aucun solde consigné détenu par ce client pour cet emballage.".into(),
        )
    })?;
    if quantity > held_qty {
        return Err(CoreError::Validation(format!(
            "Quantité retournée ({quantity}) supérieure au solde détenu par le client ({held_qty})."
        )));
    }
    let dec_amt = (quantity * unit_dep).min(held_amt);
    sqlx::query(
        "UPDATE customer_deposit_balances
         SET quantity_held = quantity_held - ?, amount_held_xof = amount_held_xof - ?,
             last_movement_at = datetime('now')
         WHERE customer_id = ? AND packaging_asset_id = ?",
    )
    .bind(quantity)
    .bind(dec_amt)
    .bind(customer_id)
    .bind(packaging_asset_id)
    .execute(&mut **tx)
    .await?;

    sqlx::query("UPDATE packaging_assets SET stock_empty = stock_empty + ? WHERE id = ?")
        .bind(quantity)
        .bind(packaging_asset_id)
        .execute(&mut **tx)
        .await?;

    sqlx::query(
        "INSERT INTO packaging_movements (
            packaging_asset_id, customer_id, order_id, order_packaging_allocation_id,
            movement_type, quantity, unit_deposit_xof, total_deposit_xof, notes
         ) VALUES (?, ?, ?, ?, 'RETOUR_CLIENT', ?, ?, ?, ?)",
    )
    .bind(packaging_asset_id)
    .bind(customer_id)
    .bind(order_id)
    .bind(alloc_id)
    .bind(quantity)
    .bind(unit_dep)
    .bind(dec_amt)
    .bind(notes.unwrap_or("Retour d'emballage vide client"))
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn return_order_packaging(
    db: &DepotDb,
    order_id: i64,
    input: OrderReturnInput,
) -> CoreResult<OrderDetailDto> {
    require_current_actor_permission(Permission::ConsignmentsWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let row: Option<(i64, String)> =
        sqlx::query_as("SELECT customer_id, status FROM orders WHERE id = ?")
            .bind(order_id)
            .fetch_optional(&mut *tx)
            .await?;
    let (customer_id, status) =
        row.ok_or_else(|| CoreError::NotFound("Commande introuvable.".into()))?;
    if !matches!(status.as_str(), "delivered" | "invoiced" | "paid") {
        return Err(CoreError::Validation(
            "Seule une commande livrée peut enregistrer un retour d'emballage.".into(),
        ));
    }

    let alloc_row: Option<(i64, i64, i64)> = sqlx::query_as(
        "SELECT id, quantity, returned_quantity FROM order_packaging_allocations
         WHERE order_id = ? AND packaging_asset_id = ? LIMIT 1",
    )
    .bind(order_id)
    .bind(input.packaging_asset_id)
    .fetch_optional(&mut *tx)
    .await?;
    let (alloc_id, alloc_qty, ret_qty) = alloc_row.ok_or_else(|| {
        CoreError::NotFound("Allocation d'emballage introuvable sur cette commande.".into())
    })?;
    if ret_qty + input.quantity > alloc_qty {
        return Err(CoreError::Validation(
            "La quantité retournée dépasse la quantité allouée sur la commande.".into(),
        ));
    }

    apply_customer_empty_return_tx(
        &mut tx,
        customer_id,
        Some(order_id),
        Some(alloc_id),
        input.packaging_asset_id,
        input.quantity,
        input.notes.as_deref(),
    )
    .await?;

    sqlx::query(
        "UPDATE order_packaging_allocations SET returned_quantity = returned_quantity + ? WHERE id = ?",
    )
    .bind(input.quantity)
    .bind(alloc_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    get_order(db, order_id).await
}

pub async fn return_customer_deposits(
    db: &DepotDb,
    customer_id: i64,
    input: OrderReturnInput,
) -> CoreResult<Vec<CustomerDepositBalanceDto>> {
    require_current_actor_permission(Permission::ConsignmentsWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    apply_customer_empty_return_tx(
        &mut tx,
        customer_id,
        None,
        None,
        input.packaging_asset_id,
        input.quantity,
        input.notes.as_deref(),
    )
    .await?;
    tx.commit().await?;
    load_customer_deposits(&db.pool, customer_id).await
}

pub async fn get_variant_product_id(db: &DepotDb, variant_id: i64) -> CoreResult<i64> {
    let pid: Option<i64> =
        sqlx::query_scalar("SELECT product_id FROM product_variants WHERE id = ?")
            .bind(variant_id)
            .fetch_optional(&db.pool)
            .await?;
    pid.ok_or_else(|| CoreError::NotFound("Variante introuvable.".into()))
}

pub async fn add_variant_price(
    db: &DepotDb,
    variant_id: i64,
    price_type: &str,
    price_xof: i64,
    supplier_id: Option<i64>,
    reason: Option<&str>,
) -> CoreResult<serde_json::Value> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    if price_xof < 0 {
        return Err(CoreError::Validation("Le prix doit être >= 0.".into()));
    }
    let prod_id = get_variant_product_id(db, variant_id).await?;
    let pt = match price_type.trim().to_uppercase().as_str() {
        "PURCHASE"
        | "RETAIL"
        | "WHOLESALE"
        | "SEMI_WHOLESALE"
        | "UNIT"
        | "PACKAGE"
        | "MINIMUM_SELLING_PRICE" => price_type.trim().to_uppercase(),
        _ => "RETAIL".to_string(),
    };
    let (_guard, mut tx) = db.begin_write().await?;
    let res = sqlx::query(
        "INSERT INTO price_history (
            entity_type, entity_id, variant_id, supplier_id, price_type,
            new_price, currency, effective_from, reason
         ) VALUES ('product', ?, ?, ?, ?, ?, 'FCFA', date('now'), ?)",
    )
    .bind(prod_id)
    .bind(variant_id)
    .bind(supplier_id)
    .bind(&pt)
    .bind(price_xof)
    .bind(reason.unwrap_or("Tarif variante"))
    .execute(&mut *tx)
    .await?;
    let id = res.last_insert_rowid();
    tx.commit().await?;
    Ok(serde_json::json!({
        "id": id,
        "product_id": prod_id,
        "variant_id": variant_id,
        "price_type": pt,
        "price_xof": price_xof,
    }))
}
