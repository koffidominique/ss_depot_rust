// ============================================================================
// Commandes IPC Tauri : Catalogue V4 (brasseries, marques, contenants, unités)
// ============================================================================

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::catalogue;
use tauri::State;

use super::verify_desktop_perm;
use crate::state::DesktopState;

#[tauri::command]
pub async fn list_breweries(
    state: State<'_, DesktopState>,
    token: String,
    search: Option<String>,
    include_archived: Option<bool>,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogRead).await?;
    let db = state.db().await;
    let q = catalogue::PaginatedQuery {
        page: 1,
        page_size: 200,
        search,
        include_archived,
    };
    let res = auth::with_actor(actor, catalogue::list_breweries(&db, q))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_brewery(
    state: State<'_, DesktopState>,
    token: String,
    payload: catalogue::CreateBreweryInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, catalogue::create_brewery(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_brands_v4(
    state: State<'_, DesktopState>,
    token: String,
    search: Option<String>,
    include_archived: Option<bool>,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogRead).await?;
    let db = state.db().await;
    let q = catalogue::PaginatedQuery {
        page: 1,
        page_size: 200,
        search,
        include_archived,
    };
    let res = auth::with_actor(actor, catalogue::list_brand(&db, q))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_brand_v4(
    state: State<'_, DesktopState>,
    token: String,
    payload: catalogue::CreateBrandInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, catalogue::create_brand(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_container_types_v4(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogRead).await?;
    let db = state.db().await;
    let q = catalogue::PaginatedQuery {
        page: 1,
        page_size: 200,
        search: None,
        include_archived: Some(false),
    };
    let res = auth::with_actor(actor, catalogue::list_container_type(&db, q))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_packaging_types_v4(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogRead).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, catalogue::list_packaging_types(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_stock_locations_v4(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogRead).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, catalogue::list_stock_locations(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_sales_units_v4(
    state: State<'_, DesktopState>,
    token: String,
    product_id: i64,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogRead).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, catalogue::list_sales_units(&db, product_id))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_sales_unit_v4(
    state: State<'_, DesktopState>,
    token: String,
    payload: catalogue::CreateSalesUnitInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, catalogue::create_sales_unit(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_sales_unit_v4(
    state: State<'_, DesktopState>,
    token: String,
    id: i64,
    payload: catalogue::UpdateSalesUnitInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, catalogue::update_sales_unit(&db, id, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_sales_unit_v4(
    state: State<'_, DesktopState>,
    token: String,
    id: i64,
) -> Result<(), String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    auth::with_actor(actor, catalogue::delete_sales_unit(&db, id))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_product_suppliers_v4(
    state: State<'_, DesktopState>,
    token: String,
    product_id: i64,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogRead).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, catalogue::list_product_suppliers(&db, product_id))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_product_supplier_v4(
    state: State<'_, DesktopState>,
    token: String,
    payload: catalogue::UpsertProductSupplierInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, catalogue::upsert_product_supplier(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_deposit_rules_v4(
    state: State<'_, DesktopState>,
    token: String,
    product_id: Option<i64>,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogRead).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, catalogue::list_deposit_rules(&db, product_id))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}
