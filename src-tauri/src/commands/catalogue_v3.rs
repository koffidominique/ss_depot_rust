// ============================================================================
// Commandes IPC Tauri : Catalogue central V3 & tarifs de référence
// ============================================================================

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::product_catalogue;
use tauri::State;

use super::verify_desktop_perm;
use crate::state::DesktopState;

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
