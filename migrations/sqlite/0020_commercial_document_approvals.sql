-- Workflow and audit trail layered over the existing sales, orders and purchasing tables.
-- Existing business tables remain the source of truth; no duplicate amounts or items are stored.
CREATE TABLE IF NOT EXISTS commercial_document_workflows (
    document_type TEXT NOT NULL CHECK (document_type IN ('customer_order', 'purchase_order')),
    document_id INTEGER NOT NULL CHECK (document_id > 0),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending_owner_approval', 'approved', 'rejected', 'changes_requested')),
    submitted_by INTEGER NULL REFERENCES users(id),
    submitted_at TEXT NULL,
    reviewed_by INTEGER NULL REFERENCES users(id),
    reviewed_at TEXT NULL,
    review_reason TEXT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (document_type, document_id)
);

CREATE INDEX IF NOT EXISTS idx_commercial_workflows_status
    ON commercial_document_workflows(status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS document_approval_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_type TEXT NOT NULL CHECK (document_type IN ('customer_order', 'purchase_order')),
    document_id INTEGER NOT NULL CHECK (document_id > 0),
    action TEXT NOT NULL CHECK (action IN ('submitted', 'approved', 'rejected', 'changes_requested')),
    actor_user_id INTEGER NULL REFERENCES users(id),
    actor_role TEXT NULL,
    reason TEXT NULL,
    snapshot_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_document_approval_events_document
    ON document_approval_events(document_type, document_id, created_at DESC);
