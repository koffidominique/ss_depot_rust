use tauri::State;
use uuid::Uuid;
use depotpro_core::application::{
    auth, cash, consignments, inventory, pdf, products, purchases, reports, sales,
};
use depotpro_core::infrastructure::backup;
use crate::state::DesktopState;

async fn verify_desktop_session(state: &DesktopState, token: &str) -> Result<(), String> {
    if !state.tokens.read().await.contains(token) {
        return Err("Session verrouillée ou expirée.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn auth_status(state: State<'_, DesktopState>) -> Result<serde_json::Value, String> {
    let db = state.db().await;
    let res = auth::get_auth_status(&db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn auth_setup_pin(
    state: State<'_, DesktopState>,
    pin: String,
) -> Result<serde_json::Value, String> {
    let db = state.db().await;
    auth::setup_owner_pin(&db, &pin)
        .await
        .map_err(|e| e.to_string())?;
    let token = Uuid::new_v4().to_string();
    state.tokens.write().await.insert(token.clone());
    Ok(serde_json::json!({ "token": token }))
}

#[tauri::command]
pub async fn auth_login(
    state: State<'_, DesktopState>,
    pin: String,
) -> Result<serde_json::Value, String> {
    let db = state.db().await;
    auth::verify_owner_pin(&db, &pin)
        .await
        .map_err(|e| e.to_string())?;
    let token = Uuid::new_v4().to_string();
    state.tokens.write().await.insert(token.clone());
    Ok(serde_json::json!({ "token": token }))
}

#[tauri::command]
pub async fn auth_lock(state: State<'_, DesktopState>, token: String) -> Result<(), String> {
    state.tokens.write().await.remove(&token);
    Ok(())
}

#[tauri::command]
pub async fn change_owner_pin(
    state: State<'_, DesktopState>,
    token: String,
    current_pin: String,
    new_pin: String,
) -> Result<(), String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    auth::change_owner_pin(&db, &current_pin, &new_pin)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_categories(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let items = products::list_categories(&db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(items).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn create_category(
    state: State<'_, DesktopState>,
    token: String,
    name: String,
    description: Option<String>,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let cat = products::create_category(&db, &name, description.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(cat).map_err(|e| e.to_string())?)
}

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
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let res = products::list_products(
        &db,
        search.as_deref(),
        category_id,
        include_archived.unwrap_or(false),
        low_stock_only.unwrap_or(false),
        page.unwrap_or(1),
        page_size.unwrap_or(25),
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn create_product(
    state: State<'_, DesktopState>,
    token: String,
    payload: products::CreateProductInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let prod = products::create_product(&db, payload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(prod).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn update_product(
    state: State<'_, DesktopState>,
    token: String,
    id: i64,
    payload: products::UpdateProductInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let prod = products::update_product(&db, id, payload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(prod).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn upsert_packaging(
    state: State<'_, DesktopState>,
    token: String,
    product_id: i64,
    pkg: products::PackagingInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let res = products::upsert_packaging(&db, product_id, pkg)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn export_products_csv(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<String, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    products::export_products_csv(&db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_products_csv(
    state: State<'_, DesktopState>,
    token: String,
    csv: String,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let created = products::import_products_csv(&db, &csv)
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
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let clients = sales::list_clients(&db, search.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(clients).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn create_client(
    state: State<'_, DesktopState>,
    token: String,
    payload: sales::CreateClientInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let client = sales::create_client(&db, payload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(client).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn update_client(
    state: State<'_, DesktopState>,
    token: String,
    client_id: i64,
    payload: sales::UpdateClientInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let client = sales::update_client(&db, client_id, payload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(client).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn update_client_credit(
    state: State<'_, DesktopState>,
    token: String,
    client_id: i64,
    payload: sales::UpdateCreditPolicyInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    sales::update_client_credit_policy(&db, client_id, payload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "ok": true }))
}

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
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let p = page.unwrap_or(1).max(1);
    let ps = page_size.unwrap_or(25).clamp(1, 100);
    let res = sales::list_sales(
        &db,
        search.as_deref(),
        status.as_deref(),
        from.as_deref(),
        to.as_deref(),
        ps,
        (p - 1) * ps,
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn get_sale_detail(
    state: State<'_, DesktopState>,
    token: String,
    sale_id: i64,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let detail = sales::get_sale_detail(&db, sale_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(detail).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn create_sale(
    state: State<'_, DesktopState>,
    token: String,
    payload: sales::CreateSaleInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let sale = sales::create_sale(&db, payload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(sale).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn cancel_sale(
    state: State<'_, DesktopState>,
    token: String,
    sale_id: i64,
    payload: sales::CancelSaleInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let sale = sales::cancel_sale(&db, sale_id, payload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(sale).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn create_sale_return(
    state: State<'_, DesktopState>,
    token: String,
    sale_id: i64,
    payload: sales::CreateSaleReturnInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let sale = sales::create_sale_return(&db, sale_id, payload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(sale).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn list_receivables(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let items = cash::list_receivables(&db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(items).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn pay_receivable(
    state: State<'_, DesktopState>,
    token: String,
    receivable_id: i64,
    payload: cash::PayReceivableInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let rec = cash::pay_receivable(&db, receivable_id, payload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(rec).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn list_suppliers(
    state: State<'_, DesktopState>,
    token: String,
    search: Option<String>,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let items = purchases::list_suppliers(&db, search.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(items).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn create_supplier(
    state: State<'_, DesktopState>,
    token: String,
    payload: purchases::CreateSupplierInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let s = purchases::create_supplier(&db, payload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(s).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn update_supplier(
    state: State<'_, DesktopState>,
    token: String,
    supplier_id: i64,
    payload: purchases::UpdateSupplierInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let s = purchases::update_supplier(&db, supplier_id, payload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(s).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn list_purchases(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let items = purchases::list_purchase_orders(&db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(items).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn create_purchase_order(
    state: State<'_, DesktopState>,
    token: String,
    payload: purchases::CreatePurchaseOrderInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let po = purchases::create_purchase_order(&db, payload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(po).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn receive_purchase_order(
    state: State<'_, DesktopState>,
    token: String,
    purchase_order_id: i64,
    payload: purchases::ReceivePurchaseOrderInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let rec = purchases::receive_purchase_order(&db, purchase_order_id, payload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(rec).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn cancel_purchase_order(
    state: State<'_, DesktopState>,
    token: String,
    purchase_order_id: i64,
    payload: purchases::CancelPurchaseOrderInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let po = purchases::cancel_purchase_order(&db, purchase_order_id, payload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(po).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn list_supplier_debts(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let items = purchases::list_supplier_debts(&db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(items).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn pay_supplier_debt(
    state: State<'_, DesktopState>,
    token: String,
    debt_id: i64,
    payload: purchases::PaySupplierDebtInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    purchases::pay_supplier_debt(&db, debt_id, payload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub async fn get_stock_overview(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let ov = inventory::get_stock_overview(&db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(ov).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn adjust_stock(
    state: State<'_, DesktopState>,
    token: String,
    payload: inventory::AdjustStockInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let mv = inventory::adjust_stock(&db, payload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(mv).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn list_inventories(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let items = inventory::list_inventories(&db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(items).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn create_inventory(
    state: State<'_, DesktopState>,
    token: String,
    notes: Option<String>,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let inv = inventory::create_inventory(&db, notes.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(inv).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn validate_inventory(
    state: State<'_, DesktopState>,
    token: String,
    inventory_id: i64,
    lines: Vec<inventory::ValidateInventoryLineInput>,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let inv = inventory::validate_inventory(&db, inventory_id, lines)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(inv).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn get_consignments_overview(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let ov = consignments::get_overview(&db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(ov).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn create_returnable_type(
    state: State<'_, DesktopState>,
    token: String,
    payload: consignments::CreateReturnableTypeInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let rt = consignments::create_returnable_type(&db, payload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(rt).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn adjust_returnable_stock(
    state: State<'_, DesktopState>,
    token: String,
    payload: consignments::AdjustReturnableStockInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    consignments::adjust_returnable_stock(&db, payload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub async fn return_client_empties(
    state: State<'_, DesktopState>,
    token: String,
    payload: consignments::ReturnClientEmptiesInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let reference = consignments::return_client_empties(&db, payload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "reference": reference }))
}

#[tauri::command]
pub async fn get_cash_status(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let s = cash::get_cash_status(&db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(s).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn open_cash_session(
    state: State<'_, DesktopState>,
    token: String,
    payload: cash::OpenCashInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let s = cash::open_cash_session(&db, payload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(s).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn close_cash_session(
    state: State<'_, DesktopState>,
    token: String,
    payload: cash::CloseCashInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let s = cash::close_cash_session(&db, payload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(s).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn list_expenses(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let ov = cash::list_expenses(&db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(ov).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn create_expense(
    state: State<'_, DesktopState>,
    token: String,
    payload: cash::CreateExpenseInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    cash::create_expense(&db, payload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub async fn get_dashboard(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let data = reports::get_dashboard_data(&db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(data).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn get_reports(
    state: State<'_, DesktopState>,
    token: String,
    from: Option<String>,
    to: Option<String>,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let rep = reports::get_reports_overview(&db, from.as_deref(), to.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(rep).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn get_settings(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let bundle = reports::get_settings_bundle(&db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(bundle).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn update_settings(
    state: State<'_, DesktopState>,
    token: String,
    payload: reports::UpdateSettingsInput,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let bundle = reports::update_settings(&db, payload)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(bundle).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn add_payment_method(
    state: State<'_, DesktopState>,
    token: String,
    label: String,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let pm = reports::add_payment_method(&db, &label)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(pm).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn toggle_payment_method(
    state: State<'_, DesktopState>,
    token: String,
    code: String,
    active: bool,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let pm = reports::toggle_payment_method(&db, &code, active)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(pm).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn generate_document_pdf(
    state: State<'_, DesktopState>,
    token: String,
    doc: pdf::DocumentPdfInput,
) -> Result<Vec<u8>, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let (_filename, bytes) = pdf::generate_document_pdf(&db, doc)
        .await
        .map_err(|e| e.to_string())?;
    Ok(bytes)
}

#[tauri::command]
pub async fn list_backups(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let items = backup::list_backups(&state.backup_dir).map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(items).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn create_backup(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let summary = backup::create_backup_summary(&db, &state.backup_dir)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(summary).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn verify_backup(
    state: State<'_, DesktopState>,
    token: String,
    name: String,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let res = backup::verify_backup(&state.backup_dir, &name)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn download_backup(
    state: State<'_, DesktopState>,
    token: String,
    name: String,
) -> Result<Vec<u8>, String> {
    verify_desktop_session(&state, &token).await?;
    let (_safe_name, bytes) =
        backup::read_backup_bytes(&state.backup_dir, &name).map_err(|e| e.to_string())?;
    Ok(bytes)
}

#[tauri::command]
pub async fn restore_backup(
    state: State<'_, DesktopState>,
    token: String,
    name: String,
) -> Result<serde_json::Value, String> {
    verify_desktop_session(&state, &token).await?;
    let res = backup::restore_and_reconnect(&state.db, &state.backup_dir, &name)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
}
