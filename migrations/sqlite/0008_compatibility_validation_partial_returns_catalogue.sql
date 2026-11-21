-- Migration 0008 : Validation de compatibilité, retours partiels et catalogue produits initial
-- Cette migration implémente les 3 fonctionnalités prioritaires suivantes :
-- 1. Validation de compatibilité lors des ventes
-- 2. Gestion des retours partiels
-- 3. Catalogue initial des produits et marques

PRAGMA foreign_keys = ON;

-- 1. Product compatibility rules (règles de compatibilité produit) : valide les combinaisons lors des ventes
CREATE TABLE IF NOT EXISTS product_compatibility_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_type TEXT NOT NULL CHECK (rule_type IN ('same_crate', 'same_brand', 'same_family', 'excluded', 'required')),
    product_id INTEGER NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id INTEGER NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    crate_type_id INTEGER NULL REFERENCES crate_types(id) ON DELETE CASCADE,
    required_quantity INTEGER NOT NULL DEFAULT 0 CHECK (required_quantity >= 0),
    validation_level TEXT NOT NULL DEFAULT 'warning' CHECK (validation_level IN ('strict', 'warning', 'disabled')),
    error_message TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_compatibility_rules_product ON product_compatibility_rules(product_id);
CREATE INDEX IF NOT EXISTS idx_compatibility_rules_crate ON product_compatibility_rules(crate_type_id);
CREATE INDEX IF NOT EXISTS idx_compatibility_rules_type ON product_compatibility_rules(rule_type);

-- 2. POS validation configuration (configuration de validation par terminal)
CREATE TABLE IF NOT EXISTS pos_validation_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    terminal_id TEXT NOT NULL UNIQUE,
    compatibility_validation_level TEXT NOT NULL DEFAULT 'warning' CHECK (compatibility_validation_level IN ('strict', 'warning', 'disabled')),
    partial_return_enabled INTEGER NOT NULL DEFAULT 1 CHECK (partial_return_enabled IN (0, 1)),
    auto_assemble_crates INTEGER NOT NULL DEFAULT 1 CHECK (auto_assemble_crates IN (0, 1)),
    require_condition_for_returns INTEGER NOT NULL DEFAULT 1 CHECK (require_condition_for_returns IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pos_config_terminal ON pos_validation_config(terminal_id);

-- 3. Partial return items (lignes de retour partiel détaillées)
CREATE TABLE IF NOT EXISTS partial_return_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_id INTEGER NOT NULL REFERENCES deposit_returns(id) ON DELETE CASCADE,
    line_item_index INTEGER NOT NULL,
    component_type TEXT NOT NULL CHECK (component_type IN ('crate_support', 'bottle', 'cap', 'label', 'crate_assembled', 'other')),
    component_profile_id INTEGER,
    crate_type_id INTEGER,
    pieces_returned INTEGER NOT NULL CHECK (pieces_returned > 0),
    condition_state TEXT NOT NULL CHECK (condition_state IN ('good', 'damaged', 'broken', 'lost')),
    unit_deposit_value INTEGER NOT NULL CHECK (unit_deposit_value >= 0),
    line_amount INTEGER NOT NULL CHECK (line_amount >= 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_partial_return_items_return ON partial_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_partial_return_items_type ON partial_return_items(component_type);

-- 4. Pending partial returns (retours partiels en attente de traitement)
CREATE TABLE IF NOT EXISTS pending_partial_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    sale_id INTEGER NULL REFERENCES sales(id) ON DELETE SET NULL,
    expected_components TEXT NOT NULL, -- JSON array of expected components
    received_components TEXT NOT NULL, -- JSON array of received components
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
    total_expected_deposit INTEGER NOT NULL DEFAULT 0 CHECK (total_expected_deposit >= 0),
    total_refunded_amount INTEGER NOT NULL DEFAULT 0 CHECK (total_refunded_amount >= 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pending_returns_client ON pending_partial_returns(client_id);
CREATE INDEX IF NOT EXISTS idx_pending_returns_status ON pending_partial_returns(status);

-- 5. Brands (marques de produits) : catalogue des marques initial
CREATE TABLE IF NOT EXISTS brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NULL,
    logo_url TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_brands_code ON brands(code);
CREATE INDEX IF NOT EXISTS idx_brands_active ON brands(is_active);

-- 6. Product families (familles de produits) : classification des produits
CREATE TABLE IF NOT EXISTS product_families (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NULL,
    parent_family_id INTEGER NULL REFERENCES product_families(id) ON DELETE SET NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_families_code ON product_families(code);
CREATE INDEX IF NOT EXISTS idx_families_parent ON product_families(parent_family_id);
CREATE INDEX IF NOT EXISTS idx_families_active ON product_families(is_active);

-- 7. Units of measure : la table existe déjà depuis 0006 (schéma conversion_factor_num/den).
-- Complétion seulement des unités de base ; pas de colonne REAL (montants/quantités exactes).
INSERT OR IGNORE INTO units_of_measure (code, name, symbol, conversion_factor_num, conversion_factor_den, is_active) VALUES
('piece', 'Pièce', 'pce', 1, 1, 1),
('crate', 'Casier', 'caisse', 1, 1, 1),
('liter', 'Litre', 'L', 1000, 1, 1),
('centiliter', 'Centilitre', 'cl', 10, 1000, 1),
('milliliter', 'Millilitre', 'ml', 1, 1000, 1),
('pack', 'Pack', 'pack', 1, 1, 1);

-- 8. Insert initial brands (marques initiales)
INSERT OR IGNORE INTO brands (code, name, description, is_active) VALUES
('coca', 'Coca-Cola', 'Coca-Cola Company', 1),
('pepsi', 'Pepsi', 'PepsiCo', 1),
('heineken', 'Heineken', 'Heineken International', 1),
('corona', 'Corona', 'Grupo Modelo', 1),
('perrier', 'Perrier', 'Nestlé Waters', 1),
('evian', 'Evian', 'Danone', 1),
('orangina', 'Orangina', 'Suntory', 1),
('fanta', 'Fanta', 'Coca-Cola Company', 1),
('sprite', 'Sprite', 'Coca-Cola Company', 1),
('redbull', 'Red Bull', 'Red Bull GmbH', 1);

-- 9. Insert initial product families (familles de produits initiales)
INSERT OR IGNORE INTO product_families (code, name, description, sort_order, is_active) VALUES
('sodas', 'Sodas', 'Boissons gazeuses', 1, 1),
('beers', 'Bières', 'Bières et alcools', 2, 1),
('waters', 'Eaux', 'Eaux minérales et plates', 3, 1),
('juices', 'Jus', 'Jus de fruits', 4, 1),
('energy', 'Energétiques', 'Boissons énergétiques', 5, 1),
('other', 'Autres', 'Autres boissons', 6, 1);

-- 10. Insert initial units of measure (unités de mesure initiales)
INSERT OR IGNORE INTO units_of_measure (code, name, symbol, conversion_factor_num, conversion_factor_den, is_active) VALUES
('piece', 'Pièce', 'pce', 1, 1, 1),
('crate', 'Casier', 'caisse', 1, 1, 1),
('liter', 'Litre', 'L', 1000, 1, 1),
('centiliter', 'Centilitre', 'cl', 10, 1000, 1),
('milliliter', 'Millilitre', 'ml', 1, 1000, 1),
('pack', 'Pack', 'pack', 1, 1, 1);

-- 11. Insert initial compatibility rules (règles de compatibilité initiales)
INSERT OR IGNORE INTO product_compatibility_rules (rule_type, required_quantity, validation_level, error_message, is_active) VALUES
('same_crate', 24, 'warning', 'Le nombre de bouteilles ne correspond pas à la capacité du casier', 1),
('same_brand', 0, 'warning', 'Mélange de marques dans le même casier', 1),
('same_family', 0, 'warning', 'Mélange de familles de produits dans le même casier', 1);