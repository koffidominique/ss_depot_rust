-- Émission immuable des accusés de commande clientèle.
-- Une réimpression lit ce snapshot; toute correction future doit créer une nouvelle version.
CREATE TABLE IF NOT EXISTS customer_order_receipt_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    receipt_number TEXT NOT NULL UNIQUE,
    snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
    issued_at TEXT NOT NULL DEFAULT (datetime('now')),
    issued_by_user_id TEXT,
    issued_by_name TEXT NOT NULL,
    issued_by_role TEXT NOT NULL,
    UNIQUE (order_id, version)
);
CREATE INDEX IF NOT EXISTS idx_customer_order_receipt_order
    ON customer_order_receipt_snapshots(order_id, version DESC);
