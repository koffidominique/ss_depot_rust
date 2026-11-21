// ============================================================================
// Commandes IPC Tauri : Authentification, PIN & utilisateurs
// ============================================================================

use depotpro_core::application::auth::{self, Permission};
use tauri::State;

use super::{verify_desktop_perm, verify_desktop_session};
use crate::state::DesktopState;

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
