-- DEPOTPRO V3 - Migration 0005 : Rôles utilisateurs (RBAC) et traçabilité acteur dans audit_logs
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'cashier', 'stock_manager', 'accountant')),
    pin_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    locked_until TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, active);

ALTER TABLE audit_logs ADD COLUMN actor_user_id TEXT NULL;
ALTER TABLE audit_logs ADD COLUMN actor_name TEXT NULL;
ALTER TABLE audit_logs ADD COLUMN actor_role TEXT NULL;
