-- LOT 2 — Modèle de données catalogue
-- Tables manquantes pour le catalogue complet (brands, variants, bottle profiles, crate types, compatibilities, disposable packaging, pricing)

PRAGMA foreign_keys = ON;

-- 1. Brands (marques) — séparées des produits
CREATE TABLE IF NOT EXISTS brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
    description TEXT NULL,
    logo_path TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_brands_name ON brands(name);
CREATE INDEX IF NOT EXISTS idx_brands_active ON brands(is_active);

-- 2. Product variants (variantes de produits)
CREATE TABLE IF NOT EXISTS product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    volume_ml INTEGER NULL CHECK (volume_ml IS NULL OR volume_ml > 0),
    container_type TEXT NULL CHECK (container_type IN ('glass_returnable', 'glass_disposable', 'pet', 'can', 'plastic_bottle', 'other')),
    bottle_profile_id INTEGER NULL, -- FK to bottle_profiles, added after table creation
    crate_type_id INTEGER NULL, -- FK to crate_types, added after table creation
    compatibility_group_id INTEGER NULL, -- FK to crate_compatibility_groups
    disposable_packaging_id INTEGER NULL, -- FK to disposable_packaging_types
    barcode TEXT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (product_id, name)
);

CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_active ON product_variants(is_active);

-- 3. Bottle profiles (profils de bouteilles) — spécifications détaillées
CREATE TABLE IF NOT EXISTS bottle_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    producer TEXT NOT NULL CHECK (length(trim(producer)) > 0),
    material TEXT NOT NULL CHECK (material IN ('glass', 'plastic', 'other')),
    capacity_ml INTEGER NOT NULL CHECK (capacity_ml > 0),
    diameter_mm INTEGER NULL CHECK (diameter_mm IS NULL OR diameter_mm > 0),
    height_mm INTEGER NULL CHECK (height_mm IS NULL OR height_mm > 0),
    weight_g INTEGER NULL CHECK (weight_g IS NULL OR weight_g > 0),
    base_type TEXT NULL CHECK (base_type IN ('flat', 'push_up', 'champagne', 'other')),
    neck_type TEXT NULL CHECK (neck_type IN ('standard', 'crown', 'screw', 'other')),
    compatibility_group_id INTEGER NULL, -- FK to crate_compatibility_groups
    deposit_value INTEGER NOT NULL DEFAULT 0 CHECK (deposit_value >= 0),
    description TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bottle_profiles_code ON bottle_profiles(code);
CREATE INDEX IF NOT EXISTS idx_bottle_profiles_active ON bottle_profiles(is_active);

-- 4. Crate types (types de casiers) — spécifications détaillées
CREATE TABLE IF NOT EXISTS crate_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    producer TEXT NOT NULL CHECK (length(trim(producer)) > 0),
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    bottle_capacity_ml INTEGER NOT NULL CHECK (bottle_capacity_ml > 0),
    bottle_profile_id INTEGER NOT NULL REFERENCES bottle_profiles(id),
    compatibility_group_id INTEGER NULL, -- FK to crate_compatibility_groups
    dimensions TEXT NULL, -- JSON: {length_mm, width_mm, height_mm}
    weight_g INTEGER NULL CHECK (weight_g IS NULL OR weight_g > 0),
    material TEXT NOT NULL CHECK (material IN ('plastic', 'wood', 'metal', 'other')),
    deposit_value INTEGER NOT NULL DEFAULT 0 CHECK (deposit_value >= 0),
    description TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_crate_types_code ON crate_types(code);
CREATE INDEX IF NOT EXISTS idx_crate_types_active ON crate_types(is_active);

-- 5. Crate compatibility groups (groupes de compatibilité)
CREATE TABLE IF NOT EXISTS crate_compatibility_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    description TEXT NULL,
    allows_mixed_brands INTEGER NOT NULL DEFAULT 1 CHECK (allows_mixed_brands IN (0, 1)),
    allows_mixed_volumes INTEGER NOT NULL DEFAULT 1 CHECK (allows_mixed_volumes IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_compat_groups_code ON crate_compatibility_groups(code);
CREATE INDEX IF NOT EXISTS idx_compat_groups_active ON crate_compatibility_groups(is_active);

-- 6. Disposable packaging types (conditionnements jetables)
CREATE TABLE IF NOT EXISTS disposable_packaging_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    packaging_type TEXT NOT NULL CHECK (packaging_type IN ('pet_pack', 'can_pack', 'carton_bottles', 'carton_cans', 'film', 'simple_carton', 'other')),
    units_per_pack INTEGER NOT NULL CHECK (units_per_pack > 0),
    unit_volume_ml INTEGER NOT NULL CHECK (unit_volume_ml > 0),
    material TEXT NOT NULL CHECK (material IN ('pet', 'aluminium', 'cardboard', 'plastic_film', 'other')),
    is_returnable INTEGER NOT NULL DEFAULT 0 CHECK (is_returnable IN (0, 1)),
    description TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_disposable_code ON disposable_packaging_types(code);
CREATE INDEX IF NOT EXISTS idx_disposable_active ON disposable_packaging_types(is_active);

-- 7. Packaging materials (matériaux d'emballage) — référentiel
CREATE TABLE IF NOT EXISTS packaging_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    category TEXT NOT NULL CHECK (category IN ('support', 'bottle', 'cap', 'label', 'other')),
    is_recyclable INTEGER NOT NULL DEFAULT 1 CHECK (is_recyclable IN (0, 1)),
    description TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 8. Container types (types de contenants) — référentiel
CREATE TABLE IF NOT EXISTS container_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    is_returnable INTEGER NOT NULL DEFAULT 0 CHECK (is_returnable IN (0, 1)),
    description TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 9. Units of measure (unités de mesure) — référentiel
CREATE TABLE IF NOT EXISTS units_of_measure (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    symbol TEXT NOT NULL CHECK (length(trim(symbol)) > 0),
    base_unit_id INTEGER NULL REFERENCES units_of_measure(id),
    conversion_factor_num INTEGER NOT NULL DEFAULT 1 CHECK (conversion_factor_num > 0),
    conversion_factor_den INTEGER NOT NULL DEFAULT 1 CHECK (conversion_factor_den > 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 10. Supplier product prices (tarifs fournisseurs)
CREATE TABLE IF NOT EXISTS supplier_product_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    packaging_id INTEGER NULL REFERENCES product_packagings(id) ON DELETE SET NULL,
    purchase_price INTEGER NOT NULL CHECK (purchase_price >= 0),
    packaging_value INTEGER NOT NULL DEFAULT 0 CHECK (packaging_value >= 0),
    fees INTEGER NOT NULL DEFAULT 0 CHECK (fees >= 0),
    valid_from TEXT NOT NULL DEFAULT (date('now')),
    valid_to TEXT NULL,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'catalog', 'contract', 'quote')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (supplier_id, product_id, packaging_id, valid_from)
);

CREATE INDEX IF NOT EXISTS idx_supplier_prices_supplier ON supplier_product_prices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_prices_product ON supplier_product_prices(product_id);
CREATE INDEX IF NOT EXISTS idx_supplier_prices_valid ON supplier_product_prices(valid_from, valid_to);

-- 11. Customer price lists (grilles tarifaires clients)
CREATE TABLE IF NOT EXISTS customer_price_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    description TEXT NULL,
    currency TEXT NOT NULL DEFAULT 'FCFA',
    is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    valid_from TEXT NOT NULL DEFAULT (date('now')),
    valid_to TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_price_lists_code ON customer_price_lists(code);
CREATE INDEX IF NOT EXISTS idx_price_lists_active ON customer_price_lists(is_active);

-- 12. Customer price list items (lignes de grille tarifaire)
CREATE TABLE IF NOT EXISTS customer_price_list_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    price_list_id INTEGER NOT NULL REFERENCES customer_price_lists(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    packaging_id INTEGER NULL REFERENCES product_packagings(id) ON DELETE SET NULL,
    price_tier TEXT NOT NULL CHECK (price_tier IN ('wholesale', 'semi_wholesale', 'retail')),
    price INTEGER NOT NULL CHECK (price >= 0),
    packaging_value INTEGER NOT NULL DEFAULT 0 CHECK (packaging_value >= 0),
    valid_from TEXT NOT NULL DEFAULT (date('now')),
    valid_to TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (price_list_id, product_id, packaging_id, price_tier, valid_from)
);

CREATE INDEX IF NOT EXISTS idx_price_items_list ON customer_price_list_items(price_list_id);
CREATE INDEX IF NOT EXISTS idx_price_items_product ON customer_price_list_items(product_id);
CREATE INDEX IF NOT EXISTS idx_price_items_valid ON customer_price_list_items(valid_from, valid_to);

-- 13. Packaging values (valeurs financières des emballages)
CREATE TABLE IF NOT EXISTS packaging_values (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    returnable_id INTEGER NOT NULL REFERENCES returnable_packaging_types(id) ON DELETE CASCADE,
    value_type TEXT NOT NULL CHECK (value_type IN ('deposit', 'replacement_cost', 'market_value', 'insurance_value')),
    amount INTEGER NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'FCFA',
    valid_from TEXT NOT NULL DEFAULT (date('now')),
    valid_to TEXT NULL,
    description TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_packaging_values_returnable ON packaging_values(returnable_id);
CREATE INDEX IF NOT EXISTS idx_packaging_values_type ON packaging_values(value_type);

-- 14. Price history (historique des prix)
CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('product', 'product_packaging', 'supplier_price', 'customer_price_list_item')),
    entity_id INTEGER NOT NULL,
    old_price INTEGER NULL,
    new_price INTEGER NULL,
    old_packaging_value INTEGER NULL,
    new_packaging_value INTEGER NULL,
    changed_by INTEGER NULL, -- user id
    reason TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_price_history_entity ON price_history(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_price_history_created ON price_history(created_at);

-- 15. Add FK columns to product_variants (already defined in CREATE TABLE)
-- ALTER TABLE product_variants ADD COLUMN bottle_profile_id INTEGER NULL REFERENCES bottle_profiles(id);
-- ALTER TABLE product_variants ADD COLUMN crate_type_id INTEGER NULL REFERENCES crate_types(id);
-- ALTER TABLE product_variants ADD COLUMN compatibility_group_id INTEGER NULL REFERENCES crate_compatibility_groups(id);
-- ALTER TABLE product_variants ADD COLUMN disposable_packaging_id INTEGER NULL REFERENCES disposable_packaging_types(id);

-- 16. Add FK columns to bottle_profiles and crate_types (already defined in CREATE TABLE)
-- ALTER TABLE bottle_profiles ADD COLUMN compatibility_group_id INTEGER NULL REFERENCES crate_compatibility_groups(id);
-- ALTER TABLE crate_types ADD COLUMN compatibility_group_id INTEGER NULL REFERENCES crate_compatibility_groups(id);

-- 17. Add brand_id to products (nullable, for backward compatibility with existing brand text field)
ALTER TABLE products ADD COLUMN brand_id INTEGER NULL REFERENCES brands(id);

-- 18. Add variant_id to products
ALTER TABLE products ADD COLUMN variant_id INTEGER NULL REFERENCES product_variants(id);

-- 19. Add packaging links to product_packagings
ALTER TABLE product_packagings ADD COLUMN bottle_profile_id INTEGER NULL REFERENCES bottle_profiles(id);
ALTER TABLE product_packagings ADD COLUMN crate_type_id INTEGER NULL REFERENCES crate_types(id);
ALTER TABLE product_packagings ADD COLUMN compatibility_group_id INTEGER NULL REFERENCES crate_compatibility_groups(id);
ALTER TABLE product_packagings ADD COLUMN disposable_packaging_id INTEGER NULL REFERENCES disposable_packaging_types(id);

-- 20. Create indexes for new FKs (after ALTER TABLE)
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_variant ON products(variant_id);
CREATE INDEX IF NOT EXISTS idx_packagings_bottle_profile ON product_packagings(bottle_profile_id);
CREATE INDEX IF NOT EXISTS idx_packagings_crate_type ON product_packagings(crate_type_id);
CREATE INDEX IF NOT EXISTS idx_packagings_compat_group ON product_packagings(compatibility_group_id);
CREATE INDEX IF NOT EXISTS idx_packagings_disposable ON product_packagings(disposable_packaging_id);

-- Note: SQLite ALTER TABLE ADD COLUMN with REFERENCES is supported in SQLite 3.35+
-- These will be applied programmatically after migration in the application layer

-- Record migration
INSERT OR REPLACE INTO schema_version (version, name, applied_at) VALUES (6, '0006_catalogue_v3', datetime('now'));