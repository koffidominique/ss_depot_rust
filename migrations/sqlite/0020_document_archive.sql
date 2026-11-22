-- Migration 0020 : archive des reçus et bons de commande client.
-- Les données sources (sales / orders) restent les registres opérationnels.
-- Cette table conserve un instantané immuable du document réellement généré,
-- afin de permettre sa consultation et sa réimpression sans recalcul rétroactif.

CREATE TABLE IF NOT EXISTS document_archive (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_type TEXT NOT NULL
        CHECK (document_type IN ('sales_receipt', 'sales_invoice', 'order_confirmation')),
    source_type TEXT NOT NULL CHECK (source_type IN ('sale', 'order')),
    source_id INTEGER NOT NULL CHECK (source_id > 0),
    source_reference TEXT NOT NULL CHECK (length(trim(source_reference)) > 0),
    document_reference TEXT NOT NULL CHECK (length(trim(document_reference)) > 0),
    customer_id INTEGER NULL,
    customer_name TEXT NOT NULL CHECK (length(trim(customer_name)) > 0),
    customer_phone TEXT NULL,
    source_status TEXT NOT NULL,
    payment_status TEXT NOT NULL CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
    subtotal_xof INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_xof >= 0),
    deposit_xof INTEGER NOT NULL DEFAULT 0 CHECK (deposit_xof >= 0),
    total_to_collect_xof INTEGER NOT NULL DEFAULT 0 CHECK (total_to_collect_xof >= 0),
    paid_xof INTEGER NOT NULL DEFAULT 0 CHECK (paid_xof >= 0),
    balance_xof INTEGER NOT NULL DEFAULT 0 CHECK (balance_xof >= 0),
    document_date TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    generated_by_user_id INTEGER NULL,
    generated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (document_type, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_document_archive_date
    ON document_archive(document_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_document_archive_type_date
    ON document_archive(document_type, document_date DESC);
CREATE INDEX IF NOT EXISTS idx_document_archive_customer
    ON document_archive(customer_id, document_date DESC);
CREATE INDEX IF NOT EXISTS idx_document_archive_source
    ON document_archive(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_document_archive_status
    ON document_archive(source_status, payment_status);
CREATE INDEX IF NOT EXISTS idx_document_archive_reference
    ON document_archive(document_reference);

INSERT OR REPLACE INTO schema_version (version, name, applied_at)
VALUES (20, '0020_document_archive', datetime('now'));
