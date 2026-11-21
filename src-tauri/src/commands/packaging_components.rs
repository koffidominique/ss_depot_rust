// ============================================================================
// Commandes IPC Tauri : Composants emballages, assemblage & profils
// ============================================================================

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::packaging_components;
use tauri::State;

use super::verify_desktop_perm;
use crate::state::DesktopState;

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
