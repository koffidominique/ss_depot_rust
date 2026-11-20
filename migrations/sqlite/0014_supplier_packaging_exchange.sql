-- Migration 0014: Add supplier packaging exchange movement type
-- This allows tracking empty packaging given to suppliers during replenishment

-- Add 'supplier_exchange' to the movement_type check constraint
-- SQLite doesn't support ALTER TABLE to modify CHECK constraints directly,
-- so we need to recreate the table

-- First, create a new table with the updated constraint
CREATE TABLE IF NOT EXISTS returnable_stock_movements_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_key TEXT NOT NULL UNIQUE,
    packaging_id INTEGER NOT NULL REFERENCES returnable_packaging_types(id),
    date TEXT NOT NULL DEFAULT (datetime('now')),
    movement_type TEXT NOT NULL CHECK (movement_type IN ('initial', 'entry', 'exit', 'breakage', 'loss', 'correction_in', 'correction_out', 'supplier_exchange')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    stock_before INTEGER NULL CHECK (stock_before IS NULL OR stock_before >= 0),
    stock_after INTEGER NOT NULL CHECK (stock_after >= 0),
    reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
    reference_document TEXT NULL
);

-- Copy data from old table
INSERT INTO returnable_stock_movements_new (id, request_key, packaging_id, date, movement_type, quantity, stock_before, stock_after, reason, reference_document)
SELECT id, request_key, packaging_id, date, movement_type, quantity, stock_before, stock_after, reason, reference_document
FROM returnable_stock_movements;

-- Drop old table and rename new one
DROP TABLE returnable_stock_movements;
ALTER TABLE returnable_stock_movements_new RENAME TO returnable_stock_movements;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_movements_packaging ON returnable_stock_movements(packaging_id);
CREATE INDEX IF NOT EXISTS idx_movements_date ON returnable_stock_movements(date DESC);
CREATE INDEX IF NOT EXISTS idx_movements_type ON returnable_stock_movements(movement_type);