-- Migration 0010 : Crate compatibility groups (groupes de compatibilité de casiers)
-- Permet de définir quels produits peuvent être mélangés dans le même casier
-- en fonction de la compatibilité physique (diamètre, hauteur, base, forme, etc.)

PRAGMA foreign_keys = ON;

-- Table des groupes de compatibilité de casiers
CREATE TABLE IF NOT EXISTS crate_compatibility_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    description TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index pour des recherches rapides
CREATE INDEX IF NOT EXISTS idx_crate_groups_code ON crate_compatibility_groups(code);
CREATE INDEX IF NOT EXISTS idx_crate_groups_active ON crate_compatibility_groups(is_active);

-- Table de liaison produits <-> groupes de compatibilité
-- Un produit peut appartenir à plusieurs groupes, un groupe peut avoir plusieurs produits
CREATE TABLE IF NOT EXISTS product_crate_compatibility (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    crate_compatibility_group_id INTEGER NOT NULL REFERENCES crate_compatibility_groups(id) ON DELETE CASCADE,
    is_allowed INTEGER NOT NULL DEFAULT 1 CHECK (is_allowed IN (0, 1)),
    verification_note TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (product_id, crate_compatibility_group_id)
);

-- Index pour des performances optimisées
CREATE INDEX IF NOT EXISTS idx_product_compatibility_product ON product_crate_compatibility(product_id);
CREATE INDEX IF NOT EXISTS idx_product_compatibility_group ON product_crate_compatibility(crate_compatibility_group_id);
CREATE INDEX IF NOT EXISTS idx_product_compatibility_allowed ON product_crate_compatibility(is_allowed);

-- Table de vérification de compatibilité physique (options par groupe)
-- Stocke les critères de compatibilité définis par le propriétaire
CREATE TABLE IF NOT EXISTS crate_compatibility_criteria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crate_compatibility_group_id INTEGER NOT NULL REFERENCES crate_compatibility_groups(id) ON DELETE CASCADE,
    criterion_name TEXT NOT NULL CHECK (criterion_name IN ('max_diameter_mm', 'max_height_mm', 'max_base_mm', 'shape', 'crate_location')),
    criterion_value TEXT NULL,
    is_required INTEGER NOT NULL DEFAULT 1 CHECK (is_required IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index
CREATE INDEX IF NOT EXISTS idx_crate_criteria_group ON crate_compatibility_criteria(crate_compatibility_group_id);
CREATE INDEX IF NOT EXISTS idx_crate_criteria_name ON crate_compatibility_criteria(criterion_name);

-- Commentaire documenting the new schema
-- Ces tables permettent au propriétaire de définir quels produits peuvent
-- être mélangés dans le même casier en fonction de caractéristiques physiques
-- réelles (et non pas seulement du volume en centilitres), conformément à
-- la règle : "Ne jamais supposer qu'une bouteille est compatible simplement
-- parce qu'elle possède le même volume en centilitres."