// ============================================================================
// Commandes IPC Tauri : Catégories, produits, conditionnements & CSV
// ============================================================================

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::products;
use serde::Deserialize;
use tauri::State;

use super::verify_desktop_perm;
use crate::state::DesktopState;

#[derive(Deserialize)]
pub struct CreateProductV4TauriPayload {
    #[serde(flatten)]
    pub base: products::CreateProductInput,
    #[serde(flatten)]
    pub extras: products::ProductV4CreateExtras,
}

#[derive(Deserialize)]
pub struct UpdateProductV4TauriPayload {
    #[serde(flatten)]
    pub base: products::UpdateProductInput,
    #[serde(flatten)]
    pub extras: products::ProductV4UpdateExtras,
}

#[derive(Deserialize)]
pub struct PackagingV4TauriPayload {
    #[serde(flatten)]
    pub base: products::PackagingInput,
    #[serde(flatten)]
    pub extras: products::PackagingV4Extras,
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
    parent_id: Option<i64>,
    description: Option<String>,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let cat = auth::with_actor(
        actor,
        products::create_category_with_parent(&db, &name, description.as_deref(), parent_id),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(cat).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_category(
    state: State<'_, DesktopState>,
    token: String,
    id: i64,
    name: Option<String>,
    parent_id: Option<i64>,
    description: Option<String>,
    is_active: Option<bool>,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let cat = auth::with_actor(
        actor,
        products::update_category(
            &db,
            id,
            name.as_deref(),
            description.as_deref(),
            parent_id.map(Some),
            is_active,
        ),
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
    payload: CreateProductV4TauriPayload,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let prod = auth::with_actor(
        actor,
        products::create_product_v4(&db, payload.base, payload.extras),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(prod).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_product(
    state: State<'_, DesktopState>,
    token: String,
    id: i64,
    payload: UpdateProductV4TauriPayload,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let prod = auth::with_actor(
        actor,
        products::update_product_v4(&db, id, payload.base, payload.extras),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(prod).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_product(
    state: State<'_, DesktopState>,
    token: String,
    id: i64,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogDelete).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, products::delete_product(&db, id))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_packaging(
    state: State<'_, DesktopState>,
    token: String,
    product_id: i64,
    pkg: PackagingV4TauriPayload,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let res = auth::with_actor(
        actor,
        products::upsert_packaging_v4(&db, product_id, pkg.base, pkg.extras),
    )
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
pub async fn list_catalog_presets(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogRead).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, products::list_catalog_presets(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn apply_catalog_presets(
    state: State<'_, DesktopState>,
    token: String,
    keys: Vec<String>,
    activate: Option<bool>,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogWrite).await?;
    let db = state.db().await;
    let res = auth::with_actor(
        actor,
        products::apply_catalog_presets(&db, products::ApplyCatalogPresetsInput { keys, activate }),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}
