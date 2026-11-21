// ============================================================================
// Commandes IPC Tauri : Catégories, produits, conditionnements & CSV
// ============================================================================

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::products;
use tauri::State;

use super::verify_desktop_perm;
use crate::state::DesktopState;

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
