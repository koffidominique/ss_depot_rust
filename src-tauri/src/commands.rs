use crate::state::DesktopState;
use chrono::Utc;
use depotpro_core::application::auth::{self, Permission, SessionIdentity};
use depotpro_core::application::{
    cash, consignments, inventory, packaging_components, packaging_obligations, partial_returns,
    pdf, product_catalogue, products, purchases, reports, sales, sales_validation,
};
use depotpro_core::infrastructure::backup;
use tauri::State;

async fn verify_desktop_session(
    state: &DesktopState,
    token: &str,
) -> Result<SessionIdentity, String> {
    state
        .sessions
        .write()
        .await
        .validate_and_touch(token, Utc::now())
        .map_err(|e| e.to_string())
}

async fn verify_desktop_perm(
    state: &DesktopState,
    token: &str,
    permission: Permission,
) -> Result<SessionIdentity, String> {
    let actor = verify_desktop_session(state, token).await?;
    auth::require_permission(&actor, permission).map_err(|e| e.to_string())?;
    Ok(actor)
}

#[tauri::command]
pub async fn auth_status(state: State<'_, DesktopState>) -> Result<serde_json::Value, String> {
    let db = state.db().await;
    let res = auth::get_auth_status(&db)
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn auth_setup_pin(
    state: State<'_, DesktopState>,
    pin: String,
) -> Result<serde_json::Value, String> {
    let db = state.db().await;
    let identity = auth::setup_owner_pin(&db, &pin)
        .await
        .map_err(|e| e.to_string())?;
    let session = state.sessions.write().await.issue_session(identity.clone());
    Ok(serde_json::json!({ "token": session.token, "user": identity }))
}

#[tauri::command]
pub async fn auth_login(
    state: State<'_, DesktopState>,
    pin: String,
    username: Option<String>,
) -> Result<serde_json::Value, String> {
    let db = state.db().await;
    let identity = auth::verify_user_login(&db, username.as_deref(), &pin)
        .await
        .map_err(|e| e.to_string())?;
    let session = state.sessions.write().await.issue_session(identity.clone());
    Ok(serde_json::json!({ "token": session.token, "user": identity }))
}

#[tauri::command]
pub async fn auth_me(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_session(&state, &token).await?;
    Ok(serde_json::json!({ "user": actor }))
}

#[tauri::command]
pub async fn auth_lock(state: State<'_, DesktopState>, token: String) -> Result<(), String> {
    state.sessions.write().await.revoke(&token);
    Ok(())
}

#[tauri::command]
pub async fn change_owner_pin(
    state: State<'_, DesktopState>,
    token: String,
    current_pin: String,
    new_pin: String,
) -> Result<(), String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SecurityChangeOwnerPin).await?;
    let db = state.db().await;
    auth::with_actor(actor, auth::change_owner_pin(&db, &current_pin, &new_pin))
        .await
        .map_err(|e| e.to_string())?;
    state.sessions.write().await.revoke_except(Some(&token));
    Ok(())
}

#[tauri::command]
pub async fn auth_list_users(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SecurityManageUsers).await?;
    let db = state.db().await;
    let users = auth::with_actor(actor, auth::list_users(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(users).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn auth_create_user(
    state: State<'_, DesktopState>,
    token: String,
    payload: auth::CreateUserInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SecurityManageUsers).await?;
    let db = state.db().await;
    let user = auth::with_actor(actor, auth::create_user(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(user).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn auth_toggle_user(
    state: State<'_, DesktopState>,
    token: String,
    user_id: i64,
    active: bool,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SecurityManageUsers).await?;
    let db = state.db().await;
    let user = auth::with_actor(actor, auth::set_user_active(&db, user_id, active))
        .await
        .map_err(|e| e.to_string())?;
    if !user.active {
        state
            .sessions
            .write()
            .await
            .revoke_user_sessions(&user.id.to_string());
    }
    serde_json::to_value(user).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_categories(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogRead).await?;
    let db = state.db().await;
    let items = auth::with_actor(actor, products::list_categories(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(items).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_category(
    state: State<'_, DesktopState>,
    token: String,
    name: String,
    description: Option<String>,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let cat = auth::with_actor(
        actor,
        products::create_category(&db, &name, description.as_deref()),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(cat).map_err(|e| e.to_string())
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn list_products(
    state: State<'_, DesktopState>,
    token: String,
    search: Option<String>,
    category_id: Option<i64>,
    include_archived: Option<bool>,
    low_stock_only: Option<bool>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogRead).await?;
    let db = state.db().await;
    let res = auth::with_actor(
        actor,
        products::list_products(
            &db,
            search.as_deref(),
            category_id,
            include_archived.unwrap_or(false),
            low_stock_only.unwrap_or(false),
            page.unwrap_or(1),
            page_size.unwrap_or(25),
        ),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_product(
    state: State<'_, DesktopState>,
    token: String,
    payload: products::CreateProductInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let prod = auth::with_actor(actor, products::create_product(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(prod).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_product(
    state: State<'_, DesktopState>,
    token: String,
    id: i64,
    payload: products::UpdateProductInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let prod = auth::with_actor(actor, products::update_product(&db, id, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(prod).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_packaging(
    state: State<'_, DesktopState>,
    token: String,
    product_id: i64,
    pkg: products::PackagingInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, products::upsert_packaging(&db, product_id, pkg))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_products_csv(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<String, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogRead).await?;
    let db = state.db().await;
    auth::with_actor(actor, products::export_products_csv(&db))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_products_csv(
    state: State<'_, DesktopState>,
    token: String,
    csv: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let created = auth::with_actor(actor, products::import_products_csv(&db, &csv))
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "created": created }))
}

#[tauri::command]
pub async fn list_clients(
    state: State<'_, DesktopState>,
    token: String,
    search: Option<String>,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesRead).await?;
    let db = state.db().await;
    let clients = auth::with_actor(actor, sales::list_clients(&db, search.as_deref()))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(clients).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_client(
    state: State<'_, DesktopState>,
    token: String,
    payload: sales::CreateClientInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesWrite).await?;
    let db = state.db().await;
    let client = auth::with_actor(actor, sales::create_client(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(client).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_client(
    state: State<'_, DesktopState>,
    token: String,
    client_id: i64,
    payload: sales::UpdateClientInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesWrite).await?;
    let db = state.db().await;
    let client = auth::with_actor(actor, sales::update_client(&db, client_id, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(client).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_client_credit(
    state: State<'_, DesktopState>,
    token: String,
    client_id: i64,
    payload: sales::UpdateCreditPolicyInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesWrite).await?;
    let db = state.db().await;
    let res = auth::with_actor(
        actor,
        sales::update_client_credit_policy(&db, client_id, payload),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn list_sales(
    state: State<'_, DesktopState>,
    token: String,
    search: Option<String>,
    status: Option<String>,
    from: Option<String>,
    to: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesRead).await?;
    let db = state.db().await;
    let p = page.unwrap_or(1).max(1);
    let ps = page_size.unwrap_or(25).clamp(1, 100);
    let res = auth::with_actor(
        actor,
        sales::list_sales(
            &db,
            search.as_deref(),
            status.as_deref(),
            from.as_deref(),
            to.as_deref(),
            ps,
            (p - 1) * ps,
        ),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_sale_detail(
    state: State<'_, DesktopState>,
    token: String,
    sale_id: i64,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesRead).await?;
    let db = state.db().await;
    let detail = auth::with_actor(actor, sales::get_sale_detail(&db, sale_id))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(detail).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_sale(
    state: State<'_, DesktopState>,
    token: String,
    payload: sales::CreateSaleInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesWrite).await?;
    let db = state.db().await;
    let sale = auth::with_actor(actor, sales::create_sale(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(sale).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_sale(
    state: State<'_, DesktopState>,
    token: String,
    sale_id: i64,
    payload: sales::CancelSaleInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesCancelReturn).await?;
    let db = state.db().await;
    let sale = auth::with_actor(actor, sales::cancel_sale(&db, sale_id, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(sale).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_sale_return(
    state: State<'_, DesktopState>,
    token: String,
    sale_id: i64,
    payload: sales::CreateSaleReturnInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesCancelReturn).await?;
    let db = state.db().await;
    let sale = auth::with_actor(actor, sales::create_sale_return(&db, sale_id, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(sale).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_receivables(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ReceivablesRead).await?;
    let db = state.db().await;
    let items = auth::with_actor(actor, cash::list_receivables(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(items).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pay_receivable(
    state: State<'_, DesktopState>,
    token: String,
    receivable_id: i64,
    payload: cash::PayReceivableInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ReceivablesPay).await?;
    let db = state.db().await;
    let rec = auth::with_actor(actor, cash::pay_receivable(&db, receivable_id, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(rec).map_err(|e| e.to_string())
}

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

#[tauri::command]
pub async fn get_consignments_overview(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsRead).await?;
    let db = state.db().await;
    let ov = auth::with_actor(actor, consignments::get_overview(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(ov).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_returnable_type(
    state: State<'_, DesktopState>,
    token: String,
    payload: consignments::CreateReturnableTypeInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsWrite).await?;
    let db = state.db().await;
    let rt = auth::with_actor(actor, consignments::create_returnable_type(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(rt).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn adjust_returnable_stock(
    state: State<'_, DesktopState>,
    token: String,
    payload: consignments::AdjustReturnableStockInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsWrite).await?;
    let db = state.db().await;
    let mv = auth::with_actor(actor, consignments::adjust_returnable_stock(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(mv).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn return_client_empties(
    state: State<'_, DesktopState>,
    token: String,
    payload: consignments::ReturnClientEmptiesInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsWrite).await?;
    let db = state.db().await;
    let ret = auth::with_actor(actor, consignments::return_client_empties(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(ret).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_cash_status(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CashRead).await?;
    let db = state.db().await;
    let s = auth::with_actor(actor, cash::get_cash_status(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(s).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_cash_session(
    state: State<'_, DesktopState>,
    token: String,
    payload: cash::OpenCashInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CashOperate).await?;
    let db = state.db().await;
    let s = auth::with_actor(actor, cash::open_cash_session(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(s).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn close_cash_session(
    state: State<'_, DesktopState>,
    token: String,
    payload: cash::CloseCashInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CashOperate).await?;
    let db = state.db().await;
    let s = auth::with_actor(actor, cash::close_cash_session(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(s).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_expenses(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CashRead).await?;
    let db = state.db().await;
    let ov = auth::with_actor(actor, cash::list_expenses(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(ov).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_expense(
    state: State<'_, DesktopState>,
    token: String,
    payload: cash::CreateExpenseInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ExpensesWrite).await?;
    let db = state.db().await;
    let exp = auth::with_actor(actor, cash::create_expense(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(exp).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_dashboard(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogRead).await?;
    let db = state.db().await;
    let data = auth::with_actor(actor, reports::get_dashboard_data(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_reports(
    state: State<'_, DesktopState>,
    token: String,
    from: Option<String>,
    to: Option<String>,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ReportsRead).await?;
    let db = state.db().await;
    let rep = auth::with_actor(
        actor,
        reports::get_reports_overview(&db, from.as_deref(), to.as_deref()),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(rep).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_settings(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SettingsRead).await?;
    let db = state.db().await;
    let bundle = auth::with_actor(actor, reports::get_settings_bundle(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(bundle).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_settings(
    state: State<'_, DesktopState>,
    token: String,
    payload: reports::UpdateSettingsInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SettingsWrite).await?;
    let db = state.db().await;
    let bundle = auth::with_actor(actor, reports::update_settings(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(bundle).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_payment_method(
    state: State<'_, DesktopState>,
    token: String,
    label: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SettingsWrite).await?;
    let db = state.db().await;
    let pm = auth::with_actor(actor, reports::add_payment_method(&db, &label))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(pm).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn toggle_payment_method(
    state: State<'_, DesktopState>,
    token: String,
    code: String,
    active: bool,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SettingsWrite).await?;
    let db = state.db().await;
    let pm = auth::with_actor(actor, reports::toggle_payment_method(&db, &code, active))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(pm).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn generate_document_pdf(
    state: State<'_, DesktopState>,
    token: String,
    doc: pdf::DocumentPdfInput,
) -> Result<Vec<u8>, String> {
    let needed = match doc.doc_type.as_str() {
        "BON_COMMANDE" | "BON_RECEPTION" => Permission::PurchasesRead,
        "CLOTURE_CAISSE" => Permission::CashRead,
        _ => Permission::SalesRead,
    };
    let actor = verify_desktop_perm(&state, &token, needed).await?;
    let db = state.db().await;
    let (_filename, bytes) = auth::with_actor(actor, pdf::generate_document_pdf(&db, doc))
        .await
        .map_err(|e| e.to_string())?;
    Ok(bytes)
}

#[tauri::command]
pub async fn list_backups(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::BackupsRead).await?;
    let dir = state.backup_dir.clone();
    let items = auth::with_actor(actor, async move { backup::list_backups(&dir) })
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(items).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_backup(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::BackupsCreate).await?;
    let db = state.db().await;
    let summary = auth::with_actor(actor, backup::create_backup_summary(&db, &state.backup_dir))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(summary).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_encrypted_backup(
    state: State<'_, DesktopState>,
    token: String,
    passphrase: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::BackupsCreate).await?;
    let db = state.db().await;
    let summary = auth::with_actor(
        actor,
        backup::create_encrypted_backup(&db, &state.backup_dir, &passphrase),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(summary).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn verify_backup(
    state: State<'_, DesktopState>,
    token: String,
    name: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::BackupsRead).await?;
    let res = auth::with_actor(actor, backup::verify_backup(&state.backup_dir, &name))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn verify_encrypted_backup(
    state: State<'_, DesktopState>,
    token: String,
    name: String,
    passphrase: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::BackupsRead).await?;
    let res = auth::with_actor(
        actor,
        backup::verify_encrypted_backup(&state.backup_dir, &name, &passphrase),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn download_backup(
    state: State<'_, DesktopState>,
    token: String,
    name: String,
) -> Result<Vec<u8>, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::BackupsRead).await?;
    let dir = state.backup_dir.clone();
    let (_safe_name, bytes) =
        auth::with_actor(actor, async move { backup::read_backup_bytes(&dir, &name) })
            .await
            .map_err(|e| e.to_string())?;
    Ok(bytes)
}

#[tauri::command]
pub async fn restore_backup(
    state: State<'_, DesktopState>,
    token: String,
    name: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::BackupsRestore).await?;
    let res = auth::with_actor(
        actor,
        backup::restore_and_reconnect(&state.db, &state.backup_dir, &name),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_encrypted_backup(
    state: State<'_, DesktopState>,
    token: String,
    name: String,
    passphrase: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::BackupsRestore).await?;
    let res = auth::with_actor(
        actor,
        backup::restore_encrypted_backup_and_reconnect(
            &state.db,
            &state.backup_dir,
            &name,
            &passphrase,
        ),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn shutdown_app(
    app_handle: tauri::AppHandle,
    _state: State<'_, DesktopState>,
) -> Result<(), String> {
    app_handle.exit(0);
    Ok(())
}

// ============ LOT 3-4 : Emballages composants, retours partiels, validation POS, catalogue ============

#[tauri::command]
pub async fn get_packaging_components_overview(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsRead).await?;
    let db = state.db().await;
    let ov = auth::with_actor(actor, packaging_components::get_components_overview(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(ov).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_crate_components_pc(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsRead).await?;
    let db = state.db().await;
    let list = auth::with_actor(actor, async {
        Ok::<_, depotpro_core::CoreError>(
            packaging_components::get_components_overview(&db)
                .await?
                .crate_components,
        )
    })
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(list).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_crate_component_pc(
    state: State<'_, DesktopState>,
    token: String,
    payload: packaging_components::CreateCrateComponentInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsWrite).await?;
    let db = state.db().await;
    let c = auth::with_actor(
        actor,
        packaging_components::create_crate_component(&db, payload),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(c).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_packaging_stock(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsRead).await?;
    let db = state.db().await;
    let list = auth::with_actor(actor, async {
        Ok::<_, depotpro_core::CoreError>(
            packaging_components::get_components_overview(&db)
                .await?
                .component_stock,
        )
    })
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(list).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_component_stock_pc(
    state: State<'_, DesktopState>,
    token: String,
    payload: packaging_components::UpdateComponentStockInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsWrite).await?;
    let db = state.db().await;
    let mv = auth::with_actor(
        actor,
        packaging_components::update_component_stock(&db, payload),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(mv).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn assemble_crates_pc(
    state: State<'_, DesktopState>,
    token: String,
    payload: packaging_components::AssembleCratesInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsWrite).await?;
    let db = state.db().await;
    let rec = auth::with_actor(actor, packaging_components::assemble_crates(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(rec).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn disassemble_crates_pc(
    state: State<'_, DesktopState>,
    token: String,
    payload: packaging_components::DisassembleCratesInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsWrite).await?;
    let db = state.db().await;
    let rec = auth::with_actor(
        actor,
        packaging_components::disassemble_crates(&db, payload),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(rec).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_bottle_profiles_pc_cmd(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogRead).await?;
    let db = state.db().await;
    let list = auth::with_actor(
        actor,
        packaging_components::get_bottle_profiles_by_material(&db, "glass".into()),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(list).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_bottle_profile_pc(
    state: State<'_, DesktopState>,
    token: String,
    payload: packaging_components::CreateBottleProfileInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let p = auth::with_actor(
        actor,
        packaging_components::create_bottle_profile(&db, payload),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(p).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_crate_types_pc_cmd(
    state: State<'_, DesktopState>,
    token: String,
    active_only: Option<bool>,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogRead).await?;
    let db = state.db().await;
    let list = auth::with_actor(
        actor,
        packaging_components::get_crate_types(&db, active_only.unwrap_or(true)),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(list).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_crate_type_pc(
    state: State<'_, DesktopState>,
    token: String,
    payload: packaging_components::CreateCrateTypeInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let t = auth::with_actor(actor, packaging_components::create_crate_type(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(t).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_partial_returns_overview_pc(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsRead).await?;
    let db = state.db().await;
    let ov = auth::with_actor(actor, partial_returns::get_partial_returns_overview(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(ov).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_partial_return_pc(
    state: State<'_, DesktopState>,
    token: String,
    payload: partial_returns::CreatePartialReturnInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsWrite).await?;
    let db = state.db().await;
    let items = auth::with_actor(actor, partial_returns::create_partial_return(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(items).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_pending_partial_returns_pc(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsRead).await?;
    let db = state.db().await;
    let list = auth::with_actor(actor, async {
        Ok::<_, depotpro_core::CoreError>(
            partial_returns::get_partial_returns_overview(&db)
                .await?
                .pending_returns,
        )
    })
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(list).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_pending_partial_return_pc(
    state: State<'_, DesktopState>,
    token: String,
    client_id: i64,
    sale_id: i64,
    total_expected_pieces: i64,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsWrite).await?;
    let db = state.db().await;
    let p = auth::with_actor(
        actor,
        partial_returns::create_pending_partial_return(
            &db,
            client_id,
            sale_id,
            total_expected_pieces,
        ),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(p).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_pending_partial_return_pc(
    state: State<'_, DesktopState>,
    token: String,
    payload: partial_returns::UpdatePendingReturnInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsWrite).await?;
    let db = state.db().await;
    let p = auth::with_actor(actor, partial_returns::update_pending_return(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(p).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_pos_validation_config_pc(
    state: State<'_, DesktopState>,
    token: String,
    terminal_id: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesRead).await?;
    let db = state.db().await;
    let c = auth::with_actor(
        actor,
        sales_validation::get_pos_validation_config(&db, &terminal_id),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(c).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_pos_validation_config_pc(
    state: State<'_, DesktopState>,
    token: String,
    payload: sales_validation::UpdatePosConfigInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SettingsWrite).await?;
    let db = state.db().await;
    let c = auth::with_actor(
        actor,
        sales_validation::update_pos_validation_config(&db, payload),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(c).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn validate_sale_compatibility_pc(
    state: State<'_, DesktopState>,
    token: String,
    payload: sales_validation::ValidateSaleInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesRead).await?;
    let db = state.db().await;
    let r = auth::with_actor(
        actor,
        sales_validation::validate_sale_compatibility(&db, payload),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(r).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_compatibility_rules_pc(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesRead).await?;
    let db = state.db().await;
    let list = auth::with_actor(actor, sales_validation::get_compatibility_rules(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(list).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_compatibility_rule_pc(
    state: State<'_, DesktopState>,
    token: String,
    payload: sales_validation::CreateCompatibilityRuleInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SettingsWrite).await?;
    let db = state.db().await;
    let r = auth::with_actor(
        actor,
        sales_validation::create_compatibility_rule(&db, payload),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(r).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_product_catalogue_overview_pc(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogRead).await?;
    let db = state.db().await;
    let ov = auth::with_actor(actor, product_catalogue::get_catalogue_overview(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(ov).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_catalogue_brand_pc(
    state: State<'_, DesktopState>,
    token: String,
    payload: product_catalogue::CreateBrandInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let b = auth::with_actor(actor, product_catalogue::create_brand(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(b).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_catalogue_family_pc(
    state: State<'_, DesktopState>,
    token: String,
    payload: product_catalogue::CreateProductFamilyInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let f = auth::with_actor(
        actor,
        product_catalogue::create_product_family(&db, payload),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(f).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_catalogue_unit_pc(
    state: State<'_, DesktopState>,
    token: String,
    payload: product_catalogue::CreateUnitOfMeasureInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let u = auth::with_actor(
        actor,
        product_catalogue::create_unit_of_measure(&db, payload),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(u).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_catalogue_product_pc(
    state: State<'_, DesktopState>,
    token: String,
    payload: product_catalogue::CreateCatalogueProductInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let p = auth::with_actor(
        actor,
        product_catalogue::create_catalogue_product(&db, payload),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(p).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_catalogue_products_pc(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogRead).await?;
    let db = state.db().await;
    let list = auth::with_actor(actor, async {
        Ok::<_, depotpro_core::CoreError>(
            product_catalogue::get_catalogue_overview(&db)
                .await?
                .products,
        )
    })
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(list).map_err(|e| e.to_string())
}

// ---- PHASE 4 catalogue_seed.md : administration OWNER du catalogue standard ----

#[tauri::command]
pub async fn set_catalogue_product_active_pc(
    state: State<'_, DesktopState>,
    token: String,
    product_id: i64,
    is_active: bool,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let dto = auth::with_actor(
        actor,
        product_catalogue::set_catalogue_product_active(&db, product_id, is_active),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(dto).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_catalogue_reference_price_pc(
    state: State<'_, DesktopState>,
    token: String,
    product_id: i64,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let username = actor.username.clone();
    let input: product_catalogue::SetReferencePriceInput =
        serde_json::from_value(payload).map_err(|e| e.to_string())?;
    let dto = auth::with_actor(
        actor,
        product_catalogue::set_reference_price(&db, product_id, input, Some(&username)),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(dto).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_catalogue_reference_price_history_pc(
    state: State<'_, DesktopState>,
    token: String,
    product_id: i64,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogRead).await?;
    let db = state.db().await;
    let list = auth::with_actor(
        actor,
        product_catalogue::list_reference_price_history(&db, product_id),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(list).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn initialize_catalogue_pc(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    auth::with_actor(actor, product_catalogue::initialize_initial_catalogue(&db))
        .await
        .map_err(|e| e.to_string())
        .and_then(|rep| serde_json::to_value(rep).map_err(|e| e.to_string()))
}

// ---- PHASE 6/7 MAJ.md : créances financières d'emballages ----

#[tauri::command]
pub async fn list_packaging_obligations(
    state: State<'_, DesktopState>,
    token: String,
    client_id: Option<i64>,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsRead).await?;
    let db = state.db().await;
    let list = auth::with_actor(
        actor,
        packaging_obligations::list_obligations(&db, client_id),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(list).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_packaging_dashboard(
    state: State<'_, DesktopState>,
    token: String,
    client_id: i64,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsRead).await?;
    let db = state.db().await;
    let dto = auth::with_actor(
        actor,
        packaging_obligations::get_client_packaging_dashboard(&db, client_id),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(dto).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pay_packaging_debt(
    state: State<'_, DesktopState>,
    token: String,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ReceivablesPay).await?;
    let db = state.db().await;
    let username = actor.username.clone();
    let input: packaging_obligations::PayPackagingDebtInput =
        serde_json::from_value(payload).map_err(|e| e.to_string())?;
    let dto = auth::with_actor(
        actor,
        packaging_obligations::pay_packaging_financial_debt(&db, input, Some(&username)),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(dto).map_err(|e| e.to_string())
}
