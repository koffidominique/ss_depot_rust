-- Instantanés immuables : les données historiques antérieures restent inconnues ({}).
ALTER TABLE sale_lines ADD COLUMN product_snapshot_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE sale_lines ADD COLUMN packaging_snapshot_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE purchase_order_lines ADD COLUMN product_snapshot_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE purchase_order_lines ADD COLUMN packaging_snapshot_json TEXT NOT NULL DEFAULT '{}';

-- Composition physique calculée et figée à la création du CMD fournisseur.
CREATE TABLE IF NOT EXISTS purchase_order_packaging_requirements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_line_id INTEGER NOT NULL REFERENCES purchase_order_lines(id),
    returnable_id INTEGER NOT NULL REFERENCES returnable_packaging_types(id),
    code_snapshot TEXT NOT NULL,
    name_snapshot TEXT NOT NULL,
    kind_snapshot TEXT NOT NULL CHECK (kind_snapshot IN ('bottle', 'crate')),
    pieces_per_pack INTEGER NOT NULL CHECK (pieces_per_pack > 0),
    required_pieces INTEGER NOT NULL CHECK (required_pieces >= 0),
    reserved_pieces INTEGER NOT NULL CHECK (reserved_pieces >= 0),
    issued_pieces INTEGER NOT NULL DEFAULT 0 CHECK (issued_pieces >= 0),
    reservation_status TEXT NOT NULL DEFAULT 'reserved'
        CHECK (reservation_status IN ('reserved', 'partially_issued', 'issued', 'released')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (purchase_order_line_id, returnable_id),
    CHECK (reserved_pieces + issued_pieces <= required_pieces)
);
CREATE INDEX IF NOT EXISTS idx_po_packaging_req_returnable
    ON purchase_order_packaging_requirements(returnable_id, reservation_status);
CREATE INDEX IF NOT EXISTS idx_po_packaging_req_line
    ON purchase_order_packaging_requirements(purchase_order_line_id);

-- Historique des emballages effectivement remis pour chaque réception REC.
CREATE TABLE IF NOT EXISTS supplier_packaging_exchange_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id INTEGER NOT NULL REFERENCES purchase_receipts(id),
    purchase_order_line_id INTEGER NOT NULL REFERENCES purchase_order_lines(id),
    returnable_id INTEGER NOT NULL REFERENCES returnable_packaging_types(id),
    code_snapshot TEXT NOT NULL,
    name_snapshot TEXT NOT NULL,
    kind_snapshot TEXT NOT NULL CHECK (kind_snapshot IN ('bottle', 'crate')),
    pieces_issued INTEGER NOT NULL CHECK (pieces_issued > 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (receipt_id, purchase_order_line_id, returnable_id)
);
CREATE INDEX IF NOT EXISTS idx_supplier_exchange_receipt
    ON supplier_packaging_exchange_lines(receipt_id);
