-- Migration 0012 : tables catalogue_products et colonnes manquantes pour product_catalogue.rs
-- Ces structures sont attendues par le service crates/depotpro-core/src/application/product_catalogue.rs :
--   - table catalogue_products (produits du nouveau catalogue V3)
--   - brands.country_of_origin (create_brand)
--   - product_families.category (create_product_family)
--   - units_of_measure.unit_type + conversion_factor (create_unit_of_measure)

CREATE TABLE IF NOT EXISTS catalogue_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    barcode TEXT NULL,
    brand_id INTEGER NULL REFERENCES brands(id) ON DELETE SET NULL,
    family_id INTEGER NULL REFERENCES product_families(id) ON DELETE SET NULL,
    bottle_profile_id INTEGER NULL REFERENCES bottle_profiles(id) ON DELETE SET NULL,
    crate_type_id INTEGER NULL REFERENCES crate_types(id) ON DELETE SET NULL,
    unit_id INTEGER NOT NULL REFERENCES units_of_measure(id),
    unit_price INTEGER NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    deposit_per_unit INTEGER NOT NULL DEFAULT 0 CHECK (deposit_per_unit >= 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    is_sellable INTEGER NOT NULL DEFAULT 1 CHECK (is_sellable IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_catalogue_products_code ON catalogue_products(code);
CREATE INDEX IF NOT EXISTS idx_catalogue_products_brand ON catalogue_products(brand_id);
CREATE INDEX IF NOT EXISTS idx_catalogue_products_family ON catalogue_products(family_id);
CREATE INDEX IF NOT EXISTS idx_catalogue_products_active ON catalogue_products(is_active);

-- Colonnes attendues par product_catalogue.rs (absentes du schéma v10)
ALTER TABLE brands ADD COLUMN country_of_origin TEXT NULL;
ALTER TABLE product_families ADD COLUMN category TEXT NULL;
ALTER TABLE units_of_measure ADD COLUMN unit_type TEXT NULL;
ALTER TABLE units_of_measure ADD COLUMN conversion_factor REAL NULL;
