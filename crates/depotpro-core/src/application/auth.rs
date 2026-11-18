use std::collections::HashMap;
use std::future::Future;
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::application::sales::audit_log_tx;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

pub const DEFAULT_SESSION_IDLE_SECS: i64 = 30 * 60;
pub const DEFAULT_SESSION_MAX_SECS: i64 = 12 * 60 * 60;
pub const PIN_MAX_ATTEMPTS: i64 = 5;
pub const PIN_LOCK_SECONDS: i64 = 30;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Owner,
    Admin,
    Manager,
    Cashier,
    StockManager,
    Accountant,
}

impl Role {
    pub fn as_str(self) -> &'static str {
        match self {
            Role::Owner => "owner",
            Role::Admin => "admin",
            Role::Manager => "manager",
            Role::Cashier => "cashier",
            Role::StockManager => "stock_manager",
            Role::Accountant => "accountant",
        }
    }

    pub fn label_fr(self) -> &'static str {
        match self {
            Role::Owner => "Propriétaire",
            Role::Admin => "Administrateur",
            Role::Manager => "Responsable",
            Role::Cashier => "Caissier",
            Role::StockManager => "Gestionnaire de stock",
            Role::Accountant => "Comptable",
        }
    }

    pub fn from_db_str(raw: &str) -> CoreResult<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "owner" => Ok(Role::Owner),
            "admin" => Ok(Role::Admin),
            "manager" => Ok(Role::Manager),
            "cashier" => Ok(Role::Cashier),
            "stock_manager" => Ok(Role::StockManager),
            "accountant" => Ok(Role::Accountant),
            other => Err(CoreError::Validation(format!("Rôle inconnu : {other}"))),
        }
    }

    pub fn permissions(self) -> &'static [Permission] {
        match self {
            Role::Owner => Permission::ALL,
            Role::Admin => &[
                Permission::CatalogRead,
                Permission::CatalogWrite,
                Permission::SalesRead,
                Permission::SalesWrite,
                Permission::SalesCancelReturn,
                Permission::ReceivablesRead,
                Permission::ReceivablesPay,
                Permission::PurchasesRead,
                Permission::PurchasesWrite,
                Permission::SupplierDebtsPay,
                Permission::StockRead,
                Permission::StockAdjust,
                Permission::InventoryValidate,
                Permission::ConsignmentsRead,
                Permission::ConsignmentsWrite,
                Permission::CashRead,
                Permission::CashOperate,
                Permission::ExpensesWrite,
                Permission::ReportsRead,
                Permission::SettingsRead,
                Permission::SettingsWrite,
                Permission::BackupsRead,
                Permission::BackupsCreate,
                Permission::BackupsRestore,
                Permission::SecurityManageUsers,
            ],
            Role::Manager => &[
                Permission::CatalogRead,
                Permission::CatalogWrite,
                Permission::SalesRead,
                Permission::SalesWrite,
                Permission::SalesCancelReturn,
                Permission::ReceivablesRead,
                Permission::ReceivablesPay,
                Permission::PurchasesRead,
                Permission::PurchasesWrite,
                Permission::SupplierDebtsPay,
                Permission::StockRead,
                Permission::StockAdjust,
                Permission::InventoryValidate,
                Permission::ConsignmentsRead,
                Permission::ConsignmentsWrite,
                Permission::CashRead,
                Permission::CashOperate,
                Permission::ExpensesWrite,
                Permission::ReportsRead,
                Permission::SettingsRead,
                Permission::BackupsRead,
                Permission::BackupsCreate,
            ],
            Role::Cashier => &[
                Permission::CatalogRead,
                Permission::SalesRead,
                Permission::SalesWrite,
                Permission::SalesCancelReturn,
                Permission::ReceivablesRead,
                Permission::ReceivablesPay,
                Permission::ConsignmentsRead,
                Permission::ConsignmentsWrite,
                Permission::CashRead,
                Permission::CashOperate,
                Permission::ExpensesWrite,
                Permission::SettingsRead,
            ],
            Role::StockManager => &[
                Permission::CatalogRead,
                Permission::CatalogWrite,
                Permission::PurchasesRead,
                Permission::PurchasesWrite,
                Permission::StockRead,
                Permission::StockAdjust,
                Permission::InventoryValidate,
                Permission::ConsignmentsRead,
                Permission::ConsignmentsWrite,
                Permission::SettingsRead,
            ],
            Role::Accountant => &[
                Permission::CatalogRead,
                Permission::SalesRead,
                Permission::ReceivablesRead,
                Permission::PurchasesRead,
                Permission::StockRead,
                Permission::ConsignmentsRead,
                Permission::CashRead,
                Permission::ReportsRead,
                Permission::SettingsRead,
                Permission::BackupsRead,
            ],
        }
    }

    pub fn has_permission(self, permission: Permission) -> bool {
        self.permissions().contains(&permission)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Permission {
    CatalogRead,
    CatalogWrite,
    SalesRead,
    SalesWrite,
    SalesCancelReturn,
    ReceivablesRead,
    ReceivablesPay,
    PurchasesRead,
    PurchasesWrite,
    SupplierDebtsPay,
    StockRead,
    StockAdjust,
    InventoryValidate,
    ConsignmentsRead,
    ConsignmentsWrite,
    CashRead,
    CashOperate,
    ExpensesWrite,
    ReportsRead,
    SettingsRead,
    SettingsWrite,
    BackupsRead,
    BackupsCreate,
    BackupsRestore,
    SecurityManageUsers,
    SecurityChangeOwnerPin,
}

impl Permission {
    pub const ALL: &'static [Permission] = &[
        Permission::CatalogRead,
        Permission::CatalogWrite,
        Permission::SalesRead,
        Permission::SalesWrite,
        Permission::SalesCancelReturn,
        Permission::ReceivablesRead,
        Permission::ReceivablesPay,
        Permission::PurchasesRead,
        Permission::PurchasesWrite,
        Permission::SupplierDebtsPay,
        Permission::StockRead,
        Permission::StockAdjust,
        Permission::InventoryValidate,
        Permission::ConsignmentsRead,
        Permission::ConsignmentsWrite,
        Permission::CashRead,
        Permission::CashOperate,
        Permission::ExpensesWrite,
        Permission::ReportsRead,
        Permission::SettingsRead,
        Permission::SettingsWrite,
        Permission::BackupsRead,
        Permission::BackupsCreate,
        Permission::BackupsRestore,
        Permission::SecurityManageUsers,
        Permission::SecurityChangeOwnerPin,
    ];

    pub fn code(self) -> &'static str {
        match self {
            Permission::CatalogRead => "catalog:read",
            Permission::CatalogWrite => "catalog:write",
            Permission::SalesRead => "sales:read",
            Permission::SalesWrite => "sales:write",
            Permission::SalesCancelReturn => "sales:cancel_return",
            Permission::ReceivablesRead => "receivables:read",
            Permission::ReceivablesPay => "receivables:pay",
            Permission::PurchasesRead => "purchases:read",
            Permission::PurchasesWrite => "purchases:write",
            Permission::SupplierDebtsPay => "supplier_debts:pay",
            Permission::StockRead => "stock:read",
            Permission::StockAdjust => "stock:adjust",
            Permission::InventoryValidate => "inventory:validate",
            Permission::ConsignmentsRead => "consignments:read",
            Permission::ConsignmentsWrite => "consignments:write",
            Permission::CashRead => "cash:read",
            Permission::CashOperate => "cash:operate",
            Permission::ExpensesWrite => "expenses:write",
            Permission::ReportsRead => "reports:read",
            Permission::SettingsRead => "settings:read",
            Permission::SettingsWrite => "settings:write",
            Permission::BackupsRead => "backups:read",
            Permission::BackupsCreate => "backups:create",
            Permission::BackupsRestore => "backups:restore",
            Permission::SecurityManageUsers => "security:manage_users",
            Permission::SecurityChangeOwnerPin => "security:change_owner_pin",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionIdentity {
    pub user_id: String,
    pub username: String,
    pub display_name: String,
    pub role: Role,
    pub role_label: String,
    pub permissions: Vec<String>,
}

impl SessionIdentity {
    pub fn from_role(
        user_id: impl Into<String>,
        username: impl Into<String>,
        display_name: impl Into<String>,
        role: Role,
    ) -> Self {
        let permissions = role
            .permissions()
            .iter()
            .map(|p| p.code().to_string())
            .collect();
        Self {
            user_id: user_id.into(),
            username: username.into(),
            display_name: display_name.into(),
            role,
            role_label: role.label_fr().to_string(),
            permissions,
        }
    }

    pub fn owner() -> Self {
        Self::from_role("owner", "owner", "Propriétaire", Role::Owner)
    }

    pub fn has_permission(&self, permission: Permission) -> bool {
        self.role.has_permission(permission)
    }
}

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
        let token = format!(
            "{}{}",
            Uuid::new_v4().simple(),
            Uuid::new_v4().simple()
        );
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
            return Err(CoreError::Unauthorized("Session verrouillée ou expirée.".to_string()));
        }

        let Some(entry) = self.sessions.get_mut(trimmed) else {
            return Err(CoreError::Unauthorized("Session verrouillée ou expirée.".to_string()));
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatusDto {
    pub needs_setup: bool,
    pub locked_until: Option<String>,
    pub failed_attempts: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserDto {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub role: Role,
    pub role_label: String,
    pub active: bool,
    pub failed_attempts: i64,
    pub locked_until: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUserInput {
    pub username: String,
    pub display_name: String,
    pub role: Role,
    pub pin: String,
}

pub fn validate_pin_format(pin: &str) -> CoreResult<()> {
    if pin.len() != 6 || !pin.chars().all(|c| c.is_ascii_digit()) {
        return Err(CoreError::Validation(
            "Le code PIN doit contenir exactement 6 chiffres.".to_string(),
        ));
    }
    Ok(())
}

fn validate_username(username: &str) -> CoreResult<String> {
    let trimmed = username.trim().to_ascii_lowercase();
    if trimmed.len() < 3 || trimmed.len() > 32 {
        return Err(CoreError::Validation(
            "L'identifiant utilisateur doit contenir entre 3 et 32 caractères.".to_string(),
        ));
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '_' || c == '-')
    {
        return Err(CoreError::Validation(
            "L'identifiant utilisateur ne peut contenir que lettres minuscules, chiffres, '.', '_' ou '-'.".to_string(),
        ));
    }
    if trimmed == "owner" {
        return Err(CoreError::Validation(
            "L'identifiant 'owner' est réservé au compte Propriétaire.".to_string(),
        ));
    }
    Ok(trimmed)
}

pub async fn get_auth_status(db: &DepotDb) -> CoreResult<AuthStatusDto> {
    let row: Option<(i64, Option<String>)> = sqlx::query_as(
        "SELECT failed_attempts,
                CASE WHEN locked_until IS NOT NULL AND locked_until > datetime('now')
                     THEN locked_until
                     ELSE NULL
                END
         FROM owner_security
         WHERE id = 1",
    )
    .fetch_optional(&db.pool)
    .await?;

    Ok(match row {
        None => AuthStatusDto {
            needs_setup: true,
            locked_until: None,
            failed_attempts: 0,
        },
        Some((failed_attempts, locked_until)) => AuthStatusDto {
            needs_setup: false,
            locked_until,
            failed_attempts,
        },
    })
}

pub async fn setup_owner_pin(db: &DepotDb, pin: &str) -> CoreResult<SessionIdentity> {
    validate_pin_format(pin)?;
    let existing: Option<(i64,)> = sqlx::query_as("SELECT id FROM owner_security WHERE id = 1")
        .fetch_optional(&db.pool)
        .await?;
    if existing.is_some() {
        return Err(CoreError::Validation(
            "Le code PIN propriétaire est déjà configuré.".to_string(),
        ));
    }
    let hash = bcrypt::hash(pin, 10)
        .map_err(|e| CoreError::Internal(format!("Erreur hachage bcrypt : {e}")))?;

    let (_guard, mut tx) = db.begin_write().await?;
    let existing_tx: Option<(i64,)> = sqlx::query_as("SELECT id FROM owner_security WHERE id = 1")
        .fetch_optional(&mut *tx)
        .await?;
    if existing_tx.is_some() {
        return Err(CoreError::Validation(
            "Le code PIN propriétaire est déjà configuré.".to_string(),
        ));
    }

    sqlx::query("INSERT INTO owner_security (id, pin_hash, failed_attempts) VALUES (1, ?, 0)")
        .bind(&hash)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "INSERT INTO users (username, display_name, role, pin_hash, active, failed_attempts)
         VALUES ('owner', 'Propriétaire', 'owner', ?, 1, 0)
         ON CONFLICT(username) DO UPDATE SET pin_hash = excluded.pin_hash, active = 1, failed_attempts = 0, locked_until = NULL",
    )
    .bind(&hash)
    .execute(&mut *tx)
    .await?;

    audit_log_tx(
        &mut tx,
        "PIN_SETUP",
        "owner_security",
        Some("1".to_string()),
        "Configuration initiale du PIN propriétaire",
    )
    .await?;
    tx.commit().await?;
    Ok(SessionIdentity::owner())
}

pub async fn verify_owner_pin(db: &DepotDb, pin: &str) -> CoreResult<()> {
    validate_pin_format(pin)?;
    let row: Option<(String, Option<String>)> = sqlx::query_as(
        "SELECT pin_hash,
                CASE WHEN locked_until IS NOT NULL AND locked_until > datetime('now')
                     THEN locked_until
                     ELSE NULL
                END
         FROM owner_security
         WHERE id = 1",
    )
    .fetch_optional(&db.pool)
    .await?;

    let (pin_hash, active_lock) =
        row.ok_or_else(|| CoreError::Unauthorized("Aucun code PIN configuré.".to_string()))?;
    if active_lock.is_some() {
        return Err(CoreError::RateLimited(
            "Trop de tentatives incorrectes. Réessayez dans quelques secondes.".to_string(),
        ));
    }

    let ok = bcrypt::verify(pin, &pin_hash)
        .map_err(|e| CoreError::Internal(format!("Erreur vérification PIN : {e}")))?;

    // Lecture atomique des compteurs à l'intérieur de la transaction BEGIN IMMEDIATE
    let (_guard, mut tx) = db.begin_write().await?;
    let tx_row: Option<(i64, i64)> = sqlx::query_as(
        "SELECT failed_attempts,
                CASE WHEN locked_until IS NOT NULL AND locked_until > datetime('now') THEN 1 ELSE 0 END
         FROM owner_security
         WHERE id = 1",
    )
    .fetch_optional(&mut *tx)
    .await?;
    let (current_attempts, is_locked_now) =
        tx_row.ok_or_else(|| CoreError::Unauthorized("Aucun code PIN configuré.".to_string()))?;

    if is_locked_now == 1 {
        tx.rollback().await?;
        return Err(CoreError::RateLimited(
            "Trop de tentatives incorrectes. Réessayez dans quelques secondes.".to_string(),
        ));
    }

    if !ok {
        let next_attempts = current_attempts + 1;
        if next_attempts >= PIN_MAX_ATTEMPTS {
            sqlx::query(
                "UPDATE owner_security
                 SET failed_attempts = ?, locked_until = datetime('now', '+30 seconds'), updated_at = datetime('now')
                 WHERE id = 1",
            )
            .bind(next_attempts)
            .execute(&mut *tx)
            .await?;
        } else {
            sqlx::query(
                "UPDATE owner_security SET failed_attempts = ?, updated_at = datetime('now') WHERE id = 1",
            )
            .bind(next_attempts)
            .execute(&mut *tx)
            .await?;
        }
        audit_log_tx(
            &mut tx,
            "PIN_FAILED",
            "owner_security",
            Some("1".to_string()),
            &format!("Tentative PIN propriétaire échouée (#{next_attempts})"),
        )
        .await?;
        tx.commit().await?;
        return Err(CoreError::Unauthorized("Code PIN incorrect.".to_string()));
    }

    sqlx::query(
        "UPDATE owner_security SET failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = 1",
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE username = 'owner'",
    )
    .execute(&mut *tx)
    .await?;
    audit_log_tx(
        &mut tx,
        "PIN_LOGIN",
        "owner_security",
        Some("1".to_string()),
        "Connexion propriétaire réussie",
    )
    .await?;
    tx.commit().await?;
    Ok(())
}

pub async fn verify_user_login(
    db: &DepotDb,
    username: Option<&str>,
    pin: &str,
) -> CoreResult<SessionIdentity> {
    let normalized = username
        .map(|u| u.trim().to_ascii_lowercase())
        .filter(|u| !u.is_empty())
        .unwrap_or_else(|| "owner".to_string());

    if normalized == "owner" {
        verify_owner_pin(db, pin).await?;
        return Ok(SessionIdentity::owner());
    }

    validate_pin_format(pin)?;
    let row: Option<(i64, String, String, String, String, i64, i64)> = sqlx::query_as(
        "SELECT id, username, display_name, role, pin_hash, active,
                CASE WHEN locked_until IS NOT NULL AND locked_until > datetime('now') THEN 1 ELSE 0 END
         FROM users
         WHERE username = ?",
    )
    .bind(&normalized)
    .fetch_optional(&db.pool)
    .await?;

    let (uid, uname, display_name, role_raw, pin_hash, active, is_locked) =
        row.ok_or_else(|| CoreError::Unauthorized("Identifiant ou code PIN incorrect.".to_string()))?;

    if active != 1 {
        return Err(CoreError::Unauthorized("Compte utilisateur désactivé.".to_string()));
    }
    if is_locked == 1 {
        return Err(CoreError::RateLimited(
            "Trop de tentatives incorrectes. Réessayez dans quelques secondes.".to_string(),
        ));
    }

    let ok = bcrypt::verify(pin, &pin_hash)
        .map_err(|e| CoreError::Internal(format!("Erreur vérification PIN : {e}")))?;

    let (_guard, mut tx) = db.begin_write().await?;
    let tx_row: Option<(i64, i64, i64)> = sqlx::query_as(
        "SELECT active, failed_attempts,
                CASE WHEN locked_until IS NOT NULL AND locked_until > datetime('now') THEN 1 ELSE 0 END
         FROM users
         WHERE id = ?",
    )
    .bind(uid)
    .fetch_optional(&mut *tx)
    .await?;
    let (tx_active, current_attempts, tx_locked) =
        tx_row.ok_or_else(|| CoreError::Unauthorized("Compte introuvable.".to_string()))?;

    if tx_active != 1 {
        tx.rollback().await?;
        return Err(CoreError::Unauthorized("Compte utilisateur désactivé.".to_string()));
    }
    if tx_locked == 1 {
        tx.rollback().await?;
        return Err(CoreError::RateLimited(
            "Trop de tentatives incorrectes. Réessayez dans quelques secondes.".to_string(),
        ));
    }

    if !ok {
        let next_attempts = current_attempts + 1;
        if next_attempts >= PIN_MAX_ATTEMPTS {
            sqlx::query(
                "UPDATE users SET failed_attempts = ?, locked_until = datetime('now', '+30 seconds'), updated_at = datetime('now') WHERE id = ?",
            )
            .bind(next_attempts)
            .bind(uid)
            .execute(&mut *tx)
            .await?;
        } else {
            sqlx::query(
                "UPDATE users SET failed_attempts = ?, updated_at = datetime('now') WHERE id = ?",
            )
            .bind(next_attempts)
            .bind(uid)
            .execute(&mut *tx)
            .await?;
        }
        audit_log_tx(
            &mut tx,
            "USER_PIN_FAILED",
            "users",
            Some(uid.to_string()),
            &format!("Tentative échouée pour {uname} (#{next_attempts})"),
        )
        .await?;
        tx.commit().await?;
        return Err(CoreError::Unauthorized("Identifiant ou code PIN incorrect.".to_string()));
    }

    sqlx::query(
        "UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(uid)
    .execute(&mut *tx)
    .await?;
    let role = Role::from_db_str(&role_raw)?;
    let identity = SessionIdentity::from_role(uid.to_string(), uname.clone(), display_name, role);
    sqlx::query(
        "INSERT INTO audit_logs (action, entity_type, entity_id, details, actor_user_id, actor_name, actor_role)
         VALUES ('USER_LOGIN', 'users', ?, ?, ?, ?, ?)",
    )
    .bind(uid.to_string())
    .bind(format!("Connexion utilisateur {uname} ({})", role.label_fr()))
    .bind(&identity.user_id)
    .bind(&identity.display_name)
    .bind(identity.role.as_str())
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(identity)
}

pub async fn change_owner_pin(db: &DepotDb, current_pin: &str, new_pin: &str) -> CoreResult<()> {
    require_current_actor_permission(Permission::SecurityChangeOwnerPin)?;
    validate_pin_format(current_pin)?;
    validate_pin_format(new_pin)?;
    let row: Option<(String,)> = sqlx::query_as("SELECT pin_hash FROM owner_security WHERE id = 1")
        .fetch_optional(&db.pool)
        .await?;
    let (pin_hash,) = row.ok_or_else(|| CoreError::Unauthorized("Aucun code PIN configuré.".to_string()))?;

    let ok = bcrypt::verify(current_pin, &pin_hash)
        .map_err(|e| CoreError::Internal(format!("Erreur vérification PIN : {e}")))?;
    if !ok {
        return Err(CoreError::Unauthorized("Code PIN actuel incorrect.".to_string()));
    }

    let next_hash = bcrypt::hash(new_pin, 10)
        .map_err(|e| CoreError::Internal(format!("Erreur hachage bcrypt : {e}")))?;
    let (_guard, mut tx) = db.begin_write().await?;
    sqlx::query(
        "UPDATE owner_security SET pin_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = 1",
    )
    .bind(&next_hash)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "UPDATE users SET pin_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE username = 'owner'",
    )
    .bind(&next_hash)
    .execute(&mut *tx)
    .await?;
    audit_log_tx(
        &mut tx,
        "PIN_CHANGED",
        "owner_security",
        Some("1".to_string()),
        "Modification du code PIN propriétaire",
    )
    .await?;
    tx.commit().await?;
    Ok(())
}

pub async fn create_user(db: &DepotDb, input: CreateUserInput) -> CoreResult<UserDto> {
    require_current_actor_permission(Permission::SecurityManageUsers)?;
    let username = validate_username(&input.username)?;
    let display_name = input.display_name.trim().to_string();
    if display_name.is_empty() {
        return Err(CoreError::Validation(
            "Le nom complet de l'utilisateur est obligatoire.".to_string(),
        ));
    }
    if input.role == Role::Owner {
        return Err(CoreError::Validation(
            "Le rôle Propriétaire est unique.".to_string(),
        ));
    }
    validate_pin_format(&input.pin)?;
    let hash = bcrypt::hash(&input.pin, 10)
        .map_err(|e| CoreError::Internal(format!("Erreur hachage bcrypt : {e}")))?;

    let (_guard, mut tx) = db.begin_write().await?;
    let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE username = ?")
        .bind(&username)
        .fetch_one(&mut *tx)
        .await?;
    if exists > 0 {
        return Err(CoreError::DuplicateOperation(
            "Cet identifiant utilisateur existe déjà.".to_string(),
        ));
    }

    let res = sqlx::query(
        "INSERT INTO users (username, display_name, role, pin_hash, active, failed_attempts)
         VALUES (?, ?, ?, ?, 1, 0)",
    )
    .bind(&username)
    .bind(&display_name)
    .bind(input.role.as_str())
    .bind(&hash)
    .execute(&mut *tx)
    .await?;
    let uid = res.last_insert_rowid();

    audit_log_tx(
        &mut tx,
        "CREATE_USER",
        "users",
        Some(uid.to_string()),
        &format!("Création utilisateur {username} ({})", input.role.label_fr()),
    )
    .await?;
    tx.commit().await?;

    get_user_by_id(db, uid).await
}

type UserRow = (
    i64,
    String,
    String,
    String,
    i64,
    i64,
    Option<String>,
    String,
);

async fn get_user_by_id(db: &DepotDb, user_id: i64) -> CoreResult<UserDto> {
    let row: Option<UserRow> = sqlx::query_as(
        "SELECT id, username, display_name, role, active, failed_attempts,
                CASE WHEN locked_until IS NOT NULL AND locked_until > datetime('now')
                     THEN locked_until ELSE NULL END,
                created_at
         FROM users
         WHERE id = ?",
    )
    .bind(user_id)
    .fetch_optional(&db.pool)
    .await?;

    let (id, username, display_name, role_raw, active, failed_attempts, locked_until, created_at) =
        row.ok_or_else(|| CoreError::Validation("Utilisateur introuvable.".to_string()))?;
    let role = Role::from_db_str(&role_raw)?;
    Ok(UserDto {
        id,
        username,
        display_name,
        role,
        role_label: role.label_fr().to_string(),
        active: active == 1,
        failed_attempts,
        locked_until,
        created_at,
    })
}

pub async fn list_users(db: &DepotDb) -> CoreResult<Vec<UserDto>> {
    require_current_actor_permission(Permission::SecurityManageUsers)?;
    let rows: Vec<UserRow> = sqlx::query_as(
        "SELECT id, username, display_name, role, active, failed_attempts,
                CASE WHEN locked_until IS NOT NULL AND locked_until > datetime('now')
                     THEN locked_until ELSE NULL END,
                created_at
         FROM users
         ORDER BY id ASC",
    )
    .fetch_all(&db.pool)
    .await?;

    let mut out = Vec::with_capacity(rows.len());
    for (id, username, display_name, role_raw, active, failed_attempts, locked_until, created_at) in
        rows
    {
        let role = Role::from_db_str(&role_raw)?;
        out.push(UserDto {
            id,
            username,
            display_name,
            role,
            role_label: role.label_fr().to_string(),
            active: active == 1,
            failed_attempts,
            locked_until,
            created_at,
        });
    }
    Ok(out)
}

pub async fn set_user_active(db: &DepotDb, user_id: i64, active: bool) -> CoreResult<UserDto> {
    require_current_actor_permission(Permission::SecurityManageUsers)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let row: Option<(String, String)> =
        sqlx::query_as("SELECT username, role FROM users WHERE id = ?")
            .bind(user_id)
            .fetch_optional(&mut *tx)
            .await?;
    let (username, role_raw) =
        row.ok_or_else(|| CoreError::Validation("Utilisateur introuvable.".to_string()))?;
    if role_raw == "owner" || username == "owner" {
        return Err(CoreError::Validation(
            "Impossible de désactiver le compte Propriétaire.".to_string(),
        ));
    }

    sqlx::query(
        "UPDATE users SET active = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(if active { 1 } else { 0 })
    .bind(user_id)
    .execute(&mut *tx)
    .await?;

    audit_log_tx(
        &mut tx,
        if active { "ACTIVATE_USER" } else { "DEACTIVATE_USER" },
        "users",
        Some(user_id.to_string()),
        &format!(
            "{} du compte {username}",
            if active { "Activation" } else { "Désactivation" }
        ),
    )
    .await?;
    tx.commit().await?;

    get_user_by_id(db, user_id).await
}
