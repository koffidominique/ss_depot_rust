// ============================================================================
// Authentification PIN, RBAC, sessions en mémoire et contexte acteur
// ============================================================================

use crate::error::{CoreError, CoreResult};
use std::future::Future;

mod pin_and_login;
mod rbac;
mod sessions;
mod user_login;
mod users;

pub use pin_and_login::{
    change_owner_pin, get_auth_status, setup_owner_pin, validate_pin_format, verify_owner_pin,
    AuthStatusDto,
};
pub use rbac::{Permission, Role, SessionIdentity};
pub use sessions::{SessionConfig, SessionRecord, SessionStore};
pub use user_login::verify_user_login;
pub use users::{create_user, list_users, set_user_active, CreateUserInput, UserDto};

pub const DEFAULT_SESSION_IDLE_SECS: i64 = 10 * 60;
pub const DEFAULT_SESSION_MAX_SECS: i64 = 12 * 60 * 60;
pub const PIN_MAX_ATTEMPTS: i64 = 5;
pub const PIN_LOCK_SECONDS: i64 = 30;

pub fn require_permission(identity: &SessionIdentity, permission: Permission) -> CoreResult<()> {
    if !identity.has_permission(permission) {
        return Err(CoreError::Forbidden(format!(
            "Accès refusé pour le rôle {} : permission requise ({}).",
            identity.role.label_fr(),
            permission.code()
        )));
    }
    Ok(())
}

tokio::task_local! {
    static ACTOR_CONTEXT: SessionIdentity;
}

pub async fn with_actor<F, T>(actor: SessionIdentity, fut: F) -> T
where
    F: Future<Output = T>,
{
    ACTOR_CONTEXT.scope(actor, fut).await
}

pub fn current_actor() -> Option<SessionIdentity> {
    ACTOR_CONTEXT.try_with(Clone::clone).ok()
}

pub fn require_current_actor_permission(permission: Permission) -> CoreResult<()> {
    if let Some(actor) = current_actor() {
        require_permission(&actor, permission)?;
    }
    Ok(())
}
