// ============================================================================
// Magasin de sessions en mémoire avec expiration d'inactivité et durée max
// ============================================================================

use crate::error::{CoreError, CoreResult};
use chrono::{DateTime, Duration, Utc};
use std::collections::HashMap;
use uuid::Uuid;

use super::{SessionIdentity, DEFAULT_SESSION_IDLE_SECS, DEFAULT_SESSION_MAX_SECS};

#[derive(Debug, Clone)]
pub struct SessionConfig {
    pub idle_timeout: Duration,
    pub max_lifetime: Duration,
}

impl Default for SessionConfig {
    fn default() -> Self {
        let idle_secs = std::env::var("DEPOTPRO_SESSION_IDLE_SECS")
            .ok()
            .and_then(|v| v.parse::<i64>().ok())
            .filter(|v| *v > 0)
            .unwrap_or(DEFAULT_SESSION_IDLE_SECS);
        let max_secs = std::env::var("DEPOTPRO_SESSION_MAX_SECS")
            .ok()
            .and_then(|v| v.parse::<i64>().ok())
            .filter(|v| *v > 0)
            .unwrap_or(DEFAULT_SESSION_MAX_SECS);
        Self {
            idle_timeout: Duration::seconds(idle_secs),
            max_lifetime: Duration::seconds(max_secs),
        }
    }
}

#[derive(Debug, Clone)]
pub struct SessionRecord {
    pub token: String,
    pub created_at: DateTime<Utc>,
    pub last_activity_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub identity: SessionIdentity,
    pub revoked: bool,
}

#[derive(Debug, Default)]
pub struct SessionStore {
    sessions: HashMap<String, SessionRecord>,
    config: SessionConfig,
}

impl SessionStore {
    pub fn with_config(config: SessionConfig) -> Self {
        Self {
            sessions: HashMap::new(),
            config,
        }
    }

    pub fn issue_session(&mut self, identity: SessionIdentity) -> SessionRecord {
        self.issue_session_at(identity, Utc::now())
    }

    pub fn issue_session_at(
        &mut self,
        identity: SessionIdentity,
        now: DateTime<Utc>,
    ) -> SessionRecord {
        self.purge_expired_at(now);
        let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        let record = SessionRecord {
            token: token.clone(),
            created_at: now,
            last_activity_at: now,
            expires_at: now + self.config.max_lifetime,
            identity,
            revoked: false,
        };
        self.sessions.insert(token, record.clone());
        record
    }

    pub fn validate_and_touch(
        &mut self,
        token: &str,
        now: DateTime<Utc>,
    ) -> CoreResult<SessionIdentity> {
        let trimmed = token.trim();
        if trimmed.is_empty() {
            return Err(CoreError::Unauthorized(
                "Session verrouillée ou expirée.".to_string(),
            ));
        }

        let Some(entry) = self.sessions.get_mut(trimmed) else {
            return Err(CoreError::Unauthorized(
                "Session verrouillée ou expirée.".to_string(),
            ));
        };

        if entry.revoked {
            self.sessions.remove(trimmed);
            return Err(CoreError::Unauthorized("Session révoquée.".to_string()));
        }
        if now >= entry.expires_at {
            self.sessions.remove(trimmed);
            return Err(CoreError::Unauthorized(
                "Session expirée (durée maximale atteinte).".to_string(),
            ));
        }
        if now - entry.last_activity_at > self.config.idle_timeout {
            self.sessions.remove(trimmed);
            return Err(CoreError::Unauthorized(
                "Session expirée suite à une période d'inactivité.".to_string(),
            ));
        }

        entry.last_activity_at = now;
        let identity = entry.identity.clone();
        self.purge_expired_at(now);
        Ok(identity)
    }

    pub fn revoke(&mut self, token: &str) -> bool {
        if let Some(entry) = self.sessions.get_mut(token.trim()) {
            entry.revoked = true;
            self.sessions.remove(token.trim());
            true
        } else {
            false
        }
    }

    pub fn revoke_user_sessions(&mut self, user_id: &str) -> usize {
        let before = self.sessions.len();
        self.sessions
            .retain(|_, rec| rec.identity.user_id != user_id && !rec.revoked);
        before - self.sessions.len()
    }

    pub fn revoke_except(&mut self, keep_token: Option<&str>) {
        self.sessions
            .retain(|tok, _| keep_token.is_some_and(|k| tok == k));
    }

    pub fn revoke_all(&mut self) {
        self.sessions.clear();
    }

    pub fn purge_expired_at(&mut self, now: DateTime<Utc>) -> usize {
        let idle_timeout = self.config.idle_timeout;
        let before = self.sessions.len();
        self.sessions.retain(|_, rec| {
            !rec.revoked && now < rec.expires_at && (now - rec.last_activity_at <= idle_timeout)
        });
        before - self.sessions.len()
    }

    pub fn active_count(&self) -> usize {
        self.sessions.len()
    }
}
