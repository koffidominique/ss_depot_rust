// ============================================================================
// Commandes IPC Tauri — helpers de session/RBAC & sous-modules métier
// ============================================================================

use chrono::Utc;
use depotpro_core::application::auth::{self as core_auth, Permission, SessionIdentity};

use crate::state::DesktopState;

pub mod auth;
pub mod backups;
pub mod cash_and_reports;
pub mod commercial_documents;
pub mod catalogue_v3;
pub mod catalogue_v4;
pub mod consignments_and_obligations;
pub mod orders;
pub mod packaging_components;
pub mod partial_returns_and_validation;
pub mod products;
pub mod purchases_and_stock;
pub mod sales;

pub(crate) async fn verify_desktop_session(
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

pub(crate) async fn verify_desktop_perm(
    state: &DesktopState,
    token: &str,
    permission: Permission,
) -> Result<SessionIdentity, String> {
    let actor = verify_desktop_session(state, token).await?;
    core_auth::require_permission(&actor, permission).map_err(|e| e.to_string())?;
    Ok(actor)
}
