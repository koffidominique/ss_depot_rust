// ============================================================================
// Commandes IPC Tauri : Sauvegardes, chiffrement, restauration & arrêt
// ============================================================================

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::infrastructure::backup;
use tauri::State;

use super::verify_desktop_perm;
use crate::state::DesktopState;

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
pub async fn get_local_db_status(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::BackupsRead).await?;
    let db = state.db().await;
    let status = auth::with_actor(actor, backup::inspect_local_db(&db, &state.backup_dir))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(status).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_backup_file(
    state: State<'_, DesktopState>,
    token: String,
    filename: String,
    bytes: Vec<u8>,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::BackupsCreate).await?;
    let db = state.db().await;
    let dto = auth::with_actor(
        actor,
        backup::import_backup_bytes(&db, &state.backup_dir, &filename, &bytes),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(dto).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn shutdown_app(
    app_handle: tauri::AppHandle,
    _state: State<'_, DesktopState>,
) -> Result<(), String> {
    app_handle.exit(0);
    Ok(())
}
