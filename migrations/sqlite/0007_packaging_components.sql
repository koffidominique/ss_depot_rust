-- Migration 0007 : Distinction support plastique / bouteilles dans le système d'emballages
-- Cette migration implémente le concept fondamental du système d'emballages DEPOTPRO V3 :
-- Un casier B24-33 = 1 support plastique + 24 bouteilles, suivis séparément

PRAGMA foreign_keys = ON;

-- 1. Crate components (composants de casier) : définit la composition d'un type de casier
-- Exemple : Casier B24-33 = 1 support_plastique + 24 bouteilles_33cl
CREATE TABLE IF NOT EXISTS crate_components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crate_type_id INTEGER NOT NULL REFERENCES crate_types(id) ON DELETE CASCADE,
    component_type TEXT NOT NULL CHECK (component_type IN ('crate_support', 'bottle', 'cap', 'label', 'crate_assembled', 'other')),
    component_profile_id INTEGER, -- FK vers bottle_profiles si component_type = 'bottle'
    quantity_per_crate INTEGER NOT NULL CHECK (quantity_per_crate > 0),
    deposit_value INTEGER NOT NULL DEFAULT 0 CHECK (deposit_value >= 0),
    is_required INTEGER NOT NULL DEFAULT 1 CHECK (is_required IN (0, 1)),
    description TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (crate_type_id, component_type, component_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_crate_components_crate ON crate_components(crate_type_id);
CREATE INDEX IF NOT EXISTS idx_crate_components_type ON crate_components(component_type);

-- 2. Packaging component stock (stock des composants d'emballage) : suivi séparé des supports et bouteilles
CREATE TABLE IF NOT EXISTS packaging_component_stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    component_type TEXT NOT NULL CHECK (component_type IN ('crate_support', 'bottle', 'cap', 'label', 'crate_assembled', 'other')),
    component_profile_id INTEGER, -- FK vers bottle_profiles si component_type = 'bottle'
    crate_type_id INTEGER, -- FK vers crate_types si component_type = 'crate_support'
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
    deposit_value INTEGER NOT NULL DEFAULT 0 CHECK (deposit_value >= 0),
    last_counted_at TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (component_type, component_profile_id, crate_type_id)
);

CREATE INDEX IF NOT EXISTS idx_component_stock_type ON packaging_component_stock(component_type);
CREATE INDEX IF NOT EXISTS idx_component_stock_profile ON packaging_component_stock(component_profile_id);
CREATE INDEX IF NOT EXISTS idx_component_stock_crate ON packaging_component_stock(crate_type_id);

-- 3. Customer packaging component balances (soldes des composants par client) : suivi séparé des supports et bouteilles chez les clients
CREATE TABLE IF NOT EXISTS customer_packaging_component_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    component_type TEXT NOT NULL CHECK (component_type IN ('crate_support', 'bottle', 'cap', 'label', 'crate_assembled', 'other')),
    component_profile_id INTEGER, -- FK vers bottle_profiles si component_type = 'bottle'
    crate_type_id INTEGER, -- FK vers crate_types si component_type = 'crate_support'
    balance_pieces INTEGER NOT NULL DEFAULT 0,
    deposit_held_amount INTEGER NOT NULL DEFAULT 0 CHECK (deposit_held_amount >= 0),
    last_transaction_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (client_id, component_type, component_profile_id, crate_type_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_component_balances_client ON customer_packaging_component_balances(client_id);
CREATE INDEX IF NOT EXISTS idx_customer_component_balances_type ON customer_packaging_component_balances(component_type);

-- 4. Packaging component movements (mouvements de composants) : journal des mouvements séparés
CREATE TABLE IF NOT EXISTS packaging_component_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    component_type TEXT NOT NULL CHECK (component_type IN ('crate_support', 'bottle', 'cap', 'label', 'other')),
    component_profile_id INTEGER, -- FK vers bottle_profiles si component_type = 'bottle'
    crate_type_id INTEGER, -- FK vers crate_types si component_type = 'crate_support'
    movement_type TEXT NOT NULL CHECK (movement_type IN ('inbound', 'outbound', 'adjustment', 'return', 'loss', 'damage', 'assembly', 'disassembly')),
    quantity INTEGER NOT NULL,
    stock_before INTEGER NOT NULL,
    stock_after INTEGER NOT NULL,
    reason TEXT NOT NULL,
    reference_document TEXT NULL,
    reference_type TEXT NULL,
    actor_id INTEGER NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_component_movements_type ON packaging_component_movements(component_type);
CREATE INDEX IF NOT EXISTS idx_component_movements_date ON packaging_component_movements(created_at DESC);

-- 5. Crate assembly records (enregistrements d'assemblage de casiers) : quand on assemble des casiers à partir de composants
CREATE TABLE IF NOT EXISTS crate_assembly_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crate_type_id INTEGER NOT NULL REFERENCES crate_types(id),
    assembled_quantity INTEGER NOT NULL CHECK (assembled_quantity > 0),
    support_quantity_used INTEGER NOT NULL CHECK (support_quantity_used >= 0),
    bottle_quantity_used INTEGER NOT NULL CHECK (bottle_quantity_used >= 0),
    reason TEXT NULL,
    actor_id INTEGER NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_crate_assembly_crate ON crate_assembly_records(crate_type_id);
CREATE INDEX IF NOT EXISTS idx_crate_assembly_date ON crate_assembly_records(created_at DESC);

-- 6. Crate disassembly records (enregistrements de désassemblage de casiers) : quand on désassemble des casiers en composants
CREATE TABLE IF NOT EXISTS crate_disassembly_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crate_type_id INTEGER NOT NULL REFERENCES crate_types(id),
    disassembled_quantity INTEGER NOT NULL CHECK (disassembled_quantity > 0),
    support_quantity_recovered INTEGER NOT NULL CHECK (support_quantity_recovered >= 0),
    bottle_quantity_recovered INTEGER NOT NULL CHECK (bottle_quantity_recovered >= 0),
    reason TEXT NULL,
    actor_id INTEGER NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_crate_disassembly_crate ON crate_disassembly_records(crate_type_id);
CREATE INDEX IF NOT EXISTS idx_crate_disassembly_date ON crate_disassembly_records(created_at DESC);

-- 7. Update existing returnable_packaging_types to add component_type field for backward compatibility
ALTER TABLE returnable_packaging_types ADD COLUMN component_type TEXT CHECK (component_type IN ('crate_support', 'bottle', 'cap', 'label', 'other'));

-- 8. Insert initial component stock entries for existing returnable types (migration des données existantes)
INSERT OR IGNORE INTO packaging_component_stock (component_type, component_profile_id, crate_type_id, stock_quantity, deposit_value)
SELECT 
    CASE 
        WHEN rpt.kind = 'crate' THEN 'crate_support'
        WHEN rpt.kind = 'bottle' THEN 'bottle'
        ELSE 'other'
    END as component_type,
    NULL as component_profile_id,
    CASE WHEN rpt.kind = 'crate' THEN rpt.id ELSE NULL END as crate_type_id,
    COALESCE(rsb.quantity, 0) as stock_quantity,
    rpt.deposit_value as deposit_value
FROM returnable_packaging_types rpt
LEFT JOIN returnable_stock_balances rsb ON rsb.packaging_id = rpt.id;

-- 9. Insert initial crate components for existing crate types (1 support + placeholder bottles)
INSERT OR IGNORE INTO crate_components (crate_type_id, component_type, quantity_per_crate, deposit_value, is_required)
SELECT 
    rpt.id as crate_type_id,
    'crate_support' as component_type,
    1 as quantity_per_crate,
    rpt.deposit_value as deposit_value,
    1 as is_required
FROM returnable_packaging_types rpt
WHERE rpt.kind = 'crate'
AND NOT EXISTS (
    SELECT 1 FROM crate_components cc WHERE cc.crate_type_id = rpt.id AND cc.component_type = 'crate_support'
);