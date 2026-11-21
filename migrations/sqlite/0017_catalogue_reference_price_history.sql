-- Migration 0017 : historique des prix de référence du catalogue standard
-- (catalogue_seed.md §8 : ancien prix, nouveau prix, auteur, motif, idempotence).
CREATE TABLE IF NOT EXISTS catalogue_reference_price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_key TEXT NOT NULL UNIQUE,
    catalogue_product_id INTEGER NOT NULL REFERENCES catalogue_products(id),
    previous_price INTEGER NOT NULL CHECK (previous_price >= 0),
    reference_price INTEGER NOT NULL CHECK (reference_price >= 0),
    reason TEXT NULL,
    changed_by_name TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_catalog_price_history_product
    ON catalogue_reference_price_history(catalogue_product_id, id DESC);
