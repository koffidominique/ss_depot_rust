// ============================================================================
// Commandes IPC Tauri : Fournisseurs, achats, dettes, stock & inventaires
// ============================================================================

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::{inventory, purchases};
use tauri::State;

use super::verify_desktop_perm;
use crate::state::DesktopState;

// ----------------------------------------------------------------------------
// 1. Fournisseurs & bons de commande
// ----------------------------------------------------------------------------

#[tauri::command]
pub async fn list_suppliers(
    state: State<'_, DesktopState>,
    token: String,
    search: Option<String>,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::PurchasesRead).await?;
    let db = state.db().await;
    let items = auth::with_actor(actor, purchases::list_suppliers(&db, search.as_deref()))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(items).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_supplier(
    state: State<'_, DesktopState>,
    token: String,
    payload: purchases::CreateSupplierInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::PurchasesWrite).await?;
    let db = state.db().await;
    let s = auth::with_actor(actor, purchases::create_supplier(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(s).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_supplier(
    state: State<'_, DesktopState>,
    token: String,
    supplier_id: i64,
    payload: purchases::UpdateSupplierInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::PurchasesWrite).await?;
    let db = state.db().await;
    let s = auth::with_actor(actor, purchases::update_supplier(&db, supplier_id, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(s).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_purchases(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::PurchasesRead).await?;
    let db = state.db().await;
    let items = auth::with_actor(actor, purchases::list_purchase_orders(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(items).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_purchase_order(
    state: State<'_, DesktopState>,
    token: String,
    payload: purchases::CreatePurchaseOrderInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::PurchasesWrite).await?;
    let db = state.db().await;
    let po = auth::with_actor(actor, purchases::create_purchase_order(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(po).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_purchase_order(
    state: State<'_, DesktopState>,
    token: String,
    purchase_order_id: i64,
    payload: purchases::UpdatePurchaseOrderInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::PurchasesWrite).await?;
    let db = state.db().await;
    let po = auth::with_actor(actor, purchases::update_purchase_order(&db, purchase_order_id, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(po).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn receive_purchase_order(
    state: State<'_, DesktopState>,
    token: String,
    purchase_order_id: i64,
    payload: purchases::ReceivePurchaseOrderInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::PurchasesWrite).await?;
    let db = state.db().await;
    let rec = auth::with_actor(
        actor,
        purchases::receive_purchase_order(&db, purchase_order_id, payload),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(rec).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_purchase_order(
    state: State<'_, DesktopState>,
    token: String,
    purchase_order_id: i64,
    payload: purchases::CancelPurchaseOrderInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::PurchasesWrite).await?;
    let db = state.db().await;
    let po = auth::with_actor(
        actor,
        purchases::cancel_purchase_order(&db, purchase_order_id, payload),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(po).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_supplier_debts(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::PurchasesRead).await?;
    let db = state.db().await;
    let items = auth::with_actor(actor, purchases::list_supplier_debts(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(items).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pay_supplier_debt(
    state: State<'_, DesktopState>,
    token: String,
    debt_id: i64,
    payload: purchases::PaySupplierDebtInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SupplierDebtsPay).await?;
    let db = state.db().await;
    let debt = auth::with_actor(actor, purchases::pay_supplier_debt(&db, debt_id, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(debt).map_err(|e| e.to_string())
}

// ----------------------------------------------------------------------------
// 2. Stock & inventaires physiques
// ----------------------------------------------------------------------------

#[tauri::command]
pub async fn get_stock_overview(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::StockRead).await?;
    let db = state.db().await;
    let ov = auth::with_actor(actor, inventory::get_stock_overview(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(ov).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn adjust_stock(
    state: State<'_, DesktopState>,
    token: String,
    payload: inventory::AdjustStockInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::StockAdjust).await?;
    let db = state.db().await;
    let mv = auth::with_actor(actor, inventory::adjust_stock(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(mv).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_inventories(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::StockRead).await?;
    let db = state.db().await;
    let items = auth::with_actor(actor, inventory::list_inventories(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(items).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_inventory(
    state: State<'_, DesktopState>,
    token: String,
    notes: Option<String>,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::InventoryValidate).await?;
    let db = state.db().await;
    let inv = auth::with_actor(actor, inventory::create_inventory(&db, notes.as_deref()))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(inv).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn validate_inventory(
    state: State<'_, DesktopState>,
    token: String,
    inventory_id: i64,
    lines: Vec<inventory::ValidateInventoryLineInput>,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::InventoryValidate).await?;
    let db = state.db().await;
    let inv = auth::with_actor(
        actor,
        inventory::validate_inventory(&db, inventory_id, lines),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(inv).map_err(|e| e.to_string())
}
