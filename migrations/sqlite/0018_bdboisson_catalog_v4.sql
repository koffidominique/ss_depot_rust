-- ============================================================================
-- Migration 0018 : Unification & extension catalogue boissons Côte d'Ivoire
-- (BDBoisson.md — brasseries, hiérarchie catégories, variantes physiques,
--  types de contenants/emballages, unités de vente configurables, consignes
--  bouteille/casier distinctes, fournisseurs produit, emplacements & stock)
-- ============================================================================

-- 1. Brasseries / fabricants
CREATE TABLE IF NOT EXISTS breweries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
    short_name TEXT NULL,
    country_code TEXT NOT NULL DEFAULT 'CI',
    address TEXT NULL,
    phone TEXT NULL,
    email TEXT NULL,
    website TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_breweries_name ON breweries(name);
CREATE INDEX IF NOT EXISTS idx_breweries_active ON breweries(is_active);

INSERT OR IGNORE INTO breweries (code, name, short_name, country_code)
VALUES
    ('BRW-SOLIBRA', 'SOLIBRA', 'SOLIBRA', 'CI'),
    ('BRW-BRASSIVOIRE', 'Brassivoire', 'Brassivoire', 'CI'),
    ('BRW-AUTRES', 'Autres fabricants & importateurs', 'Autres', 'CI');

-- 2. Marques liées aux brasseries / fabricants
ALTER TABLE brands ADD COLUMN brewery_id INTEGER NULL REFERENCES breweries(id);
ALTER TABLE brands ADD COLUMN updated_at TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_brands_brewery ON brands(brewery_id);

UPDATE brands
SET brewery_id = (SELECT id FROM breweries WHERE code = 'BRW-SOLIBRA')
WHERE code = 'BR-SOLIBRA' AND brewery_id IS NULL;

-- 3. Catégories hiérarchiques (catégorie / sous-catégorie)
ALTER TABLE categories ADD COLUMN parent_id INTEGER NULL REFERENCES categories(id);
ALTER TABLE categories ADD COLUMN slug TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

-- 4. Types de contenants enrichis (verre consigné/perdu, PET, canette, brique, sachet, fût)
ALTER TABLE container_types ADD COLUMN material TEXT NOT NULL DEFAULT 'other'
    CHECK (material IN ('glass', 'pet', 'aluminium', 'carton', 'plastic', 'wood', 'other'));
ALTER TABLE container_types ADD COLUMN is_recyclable INTEGER NOT NULL DEFAULT 0 CHECK (is_recyclable IN (0, 1));
ALTER TABLE container_types ADD COLUMN default_volume_ml INTEGER NULL CHECK (default_volume_ml IS NULL OR default_volume_ml > 0);
ALTER TABLE container_types ADD COLUMN default_deposit_value INTEGER NOT NULL DEFAULT 0 CHECK (default_deposit_value >= 0);
ALTER TABLE container_types ADD COLUMN updated_at TEXT NULL;

INSERT OR IGNORE INTO container_types (code, name, is_returnable, description, is_active, material, is_recyclable, default_volume_ml, default_deposit_value)
VALUES
    ('CT-GLASS-RET',  'Bouteille en verre consignée', 1, 'Bouteille en verre réutilisable et consignée', 1, 'glass',     1, 330,   0),
    ('CT-GLASS-DISP', 'Bouteille en verre perdu',     0, 'Bouteille en verre non consignée',             1, 'glass',     1, 330,   0),
    ('CT-PET',        'Bouteille en plastique (PET)', 0, 'Bouteille plastique PET recyclable',           1, 'pet',       1, 500,   0),
    ('CT-CAN',        'Canette aluminium',            0, 'Canette aluminium',                            1, 'aluminium', 1, 330,   0),
    ('CT-TETRA',      'Tetrapak / carton liquide',    0, 'Brique ou carton liquide',                     1, 'carton',    1, 1000,  0),
    ('CT-POUCH',      'Sachet',                       0, 'Sachet boisson',                               1, 'plastic',   0, 250,   0),
    ('CT-KEG',        'Fût',                          1, 'Fût réutilisable / consigné',                  1, 'other',     1, 20000, 0),
    ('CT-OTHER',      'Autre contenant',              0, 'Autre format de contenant',                    1, 'other',     0, NULL,  0);

-- 5. Référentiel des types d'emballages commerciaux
CREATE TABLE IF NOT EXISTS packaging_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
    default_name TEXT NOT NULL CHECK (default_name IN ('casier', 'carton', 'bouteille', 'pack', 'canette')),
    is_reusable INTEGER NOT NULL DEFAULT 0 CHECK (is_reusable IN (0, 1)),
    is_returnable INTEGER NOT NULL DEFAULT 0 CHECK (is_returnable IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO packaging_types (code, name, default_name, is_reusable, is_returnable)
VALUES
    ('PT-CRATE',    'Casier plastique',             'casier',    1, 1),
    ('PT-CARTON',   'Carton',                       'carton',    0, 0),
    ('PT-PACK',     'Pack plastique',               'pack',      0, 0),
    ('PT-FILM',     'Film rétractable',             'pack',      0, 0),
    ('PT-PALLET',   'Palette',                      'casier',    1, 0),
    ('PT-UNIT-BTL', 'Vente à l''unité (bouteille)', 'bouteille', 0, 0),
    ('PT-UNIT-CAN', 'Vente à l''unité (canette)',   'canette',   0, 0),
    ('PT-OTHER',    'Autre',                        'carton',    0, 0);

-- 6. Emplacements de stock (dépôt, magasin, zone, chambre froide)
CREATE TABLE IF NOT EXISTS stock_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
    location_type TEXT NOT NULL DEFAULT 'depot' CHECK (location_type IN ('depot', 'shop', 'zone', 'cold_room', 'other')),
    is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO stock_locations (code, name, location_type, is_default)
VALUES ('LOC-MAIN', 'Dépôt principal', 'depot', 1);

-- 7. Enrichissement des produits (identité commerciale, alcool, traçabilité, règles POS)
ALTER TABLE products ADD COLUMN brewery_id INTEGER NULL REFERENCES breweries(id);
ALTER TABLE products ADD COLUMN subcategory_id INTEGER NULL REFERENCES categories(id);
ALTER TABLE products ADD COLUMN variant_label TEXT NULL;
ALTER TABLE products ADD COLUMN alcohol_degree_milli INTEGER NULL CHECK (alcohol_degree_milli IS NULL OR alcohol_degree_milli >= 0);
ALTER TABLE products ADD COLUMN is_alcoholic INTEGER NOT NULL DEFAULT 0 CHECK (is_alcoholic IN (0, 1));
ALTER TABLE products ADD COLUMN ingredients TEXT NULL;
ALTER TABLE products ADD COLUMN beverage_color TEXT NULL;
ALTER TABLE products ADD COLUMN storage_temp TEXT NULL;
ALTER TABLE products ADD COLUMN shelf_life_days INTEGER NULL CHECK (shelf_life_days IS NULL OR shelf_life_days > 0);
ALTER TABLE products ADD COLUMN is_perishable INTEGER NOT NULL DEFAULT 0 CHECK (is_perishable IN (0, 1));
ALTER TABLE products ADD COLUMN track_batches INTEGER NOT NULL DEFAULT 0 CHECK (track_batches IN (0, 1));
ALTER TABLE products ADD COLUMN track_expiry INTEGER NOT NULL DEFAULT 0 CHECK (track_expiry IN (0, 1));
ALTER TABLE products ADD COLUMN allow_credit_sale INTEGER NOT NULL DEFAULT 1 CHECK (allow_credit_sale IN (0, 1));
ALTER TABLE products ADD COLUMN allow_unit_sale INTEGER NOT NULL DEFAULT 1 CHECK (allow_unit_sale IN (0, 1));
ALTER TABLE products ADD COLUMN allow_mixed_sale INTEGER NOT NULL DEFAULT 1 CHECK (allow_mixed_sale IN (0, 1));
ALTER TABLE products ADD COLUMN default_location_id INTEGER NULL REFERENCES stock_locations(id);
ALTER TABLE products ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'inactive'));
ALTER TABLE products ADD COLUMN updated_at TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_products_brewery ON products(brewery_id);
CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_products_location ON products(default_location_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

-- 8. Enrichissement des variantes physiques
ALTER TABLE product_variants ADD COLUMN sku TEXT NULL;
ALTER TABLE product_variants ADD COLUMN container_type_id INTEGER NULL REFERENCES container_types(id);
ALTER TABLE product_variants ADD COLUMN container_material TEXT NULL
    CHECK (container_material IS NULL OR container_material IN ('glass', 'pet', 'aluminium', 'carton', 'plastic', 'other'));
ALTER TABLE product_variants ADD COLUMN container_returnable INTEGER NOT NULL DEFAULT 0 CHECK (container_returnable IN (0, 1));
ALTER TABLE product_variants ADD COLUMN container_recyclable INTEGER NOT NULL DEFAULT 0 CHECK (container_recyclable IN (0, 1));
ALTER TABLE product_variants ADD COLUMN container_deposit_amount INTEGER NOT NULL DEFAULT 0 CHECK (container_deposit_amount >= 0);
ALTER TABLE product_variants ADD COLUMN net_weight_g INTEGER NULL CHECK (net_weight_g IS NULL OR net_weight_g > 0);
ALTER TABLE product_variants ADD COLUMN updated_at TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_variants_sku ON product_variants(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_variants_container_type ON product_variants(container_type_id);

-- 9. Enrichissement des conditionnements commerciaux
ALTER TABLE product_packagings ADD COLUMN variant_id INTEGER NULL REFERENCES product_variants(id);
ALTER TABLE product_packagings ADD COLUMN packaging_type_id INTEGER NULL REFERENCES packaging_types(id);
ALTER TABLE product_packagings ADD COLUMN display_label TEXT NULL;
ALTER TABLE product_packagings ADD COLUMN package_sku TEXT NULL;
ALTER TABLE product_packagings ADD COLUMN is_reusable INTEGER NOT NULL DEFAULT 0 CHECK (is_reusable IN (0, 1));
ALTER TABLE product_packagings ADD COLUMN is_returnable INTEGER NOT NULL DEFAULT 0 CHECK (is_returnable IN (0, 1));
ALTER TABLE product_packagings ADD COLUMN package_deposit_amount INTEGER NOT NULL DEFAULT 0 CHECK (package_deposit_amount >= 0);
ALTER TABLE product_packagings ADD COLUMN bottle_deposit_amount INTEGER NOT NULL DEFAULT 0 CHECK (bottle_deposit_amount >= 0);
ALTER TABLE product_packagings ADD COLUMN package_cost INTEGER NOT NULL DEFAULT 0 CHECK (package_cost >= 0);
ALTER TABLE product_packagings ADD COLUMN min_selling_price INTEGER NULL CHECK (min_selling_price IS NULL OR min_selling_price >= 0);
ALTER TABLE product_packagings ADD COLUMN is_default_sale INTEGER NOT NULL DEFAULT 0 CHECK (is_default_sale IN (0, 1));
ALTER TABLE product_packagings ADD COLUMN is_default_purchase INTEGER NOT NULL DEFAULT 0 CHECK (is_default_purchase IN (0, 1));

CREATE UNIQUE INDEX IF NOT EXISTS uq_packagings_package_sku ON product_packagings(package_sku) WHERE package_sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_packagings_variant ON product_packagings(variant_id);
CREATE INDEX IF NOT EXISTS idx_packagings_type ON product_packagings(packaging_type_id);

-- 10. Unités commerciales de vente (y compris demi-casier virtuel, casier 12/20/24, unité, pack, carton, palette)
CREATE TABLE IF NOT EXISTS sales_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id INTEGER NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    packaging_id INTEGER NULL REFERENCES product_packagings(id) ON DELETE SET NULL,
    code TEXT NULL,
    label TEXT NOT NULL CHECK (length(trim(label)) > 0),
    unit_type TEXT NOT NULL CHECK (unit_type IN ('bottle', 'can', 'pack', 'carton', 'half_crate', 'crate', 'film', 'pallet', 'custom')),
    conversion_factor INTEGER NOT NULL CHECK (conversion_factor > 0),
    is_virtual INTEGER NOT NULL DEFAULT 0 CHECK (is_virtual IN (0, 1)),
    allow_fraction INTEGER NOT NULL DEFAULT 0 CHECK (allow_fraction IN (0, 1)),
    purchase_price INTEGER NULL CHECK (purchase_price IS NULL OR purchase_price >= 0),
    wholesale_price INTEGER NULL CHECK (wholesale_price IS NULL OR wholesale_price >= 0),
    semi_wholesale_price INTEGER NULL CHECK (semi_wholesale_price IS NULL OR semi_wholesale_price >= 0),
    retail_price INTEGER NULL CHECK (retail_price IS NULL OR retail_price >= 0),
    min_selling_price INTEGER NULL CHECK (min_selling_price IS NULL OR min_selling_price >= 0),
    bottle_deposit_amount INTEGER NOT NULL DEFAULT 0 CHECK (bottle_deposit_amount >= 0),
    crate_deposit_amount INTEGER NOT NULL DEFAULT 0 CHECK (crate_deposit_amount >= 0),
    barcode TEXT NULL,
    is_default_sale INTEGER NOT NULL DEFAULT 0 CHECK (is_default_sale IN (0, 1)),
    is_default_purchase INTEGER NOT NULL DEFAULT 0 CHECK (is_default_purchase IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sales_units_product ON sales_units(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_units_variant ON sales_units(variant_id);
CREATE INDEX IF NOT EXISTS idx_sales_units_packaging ON sales_units(packaging_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_units_barcode ON sales_units(barcode) WHERE barcode IS NOT NULL;

-- 11. Relation produit <-> fournisseurs
CREATE TABLE IF NOT EXISTS product_suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    supplier_product_code TEXT NULL,
    preferred_supplier INTEGER NOT NULL DEFAULT 0 CHECK (preferred_supplier IN (0, 1)),
    purchase_unit TEXT NOT NULL DEFAULT 'casier',
    units_per_purchase_package INTEGER NOT NULL DEFAULT 1 CHECK (units_per_purchase_package > 0),
    last_purchase_price INTEGER NULL CHECK (last_purchase_price IS NULL OR last_purchase_price >= 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (product_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_product_suppliers_product ON product_suppliers(product_id);
CREATE INDEX IF NOT EXISTS idx_product_suppliers_supplier ON product_suppliers(supplier_id);

-- 12. Enrichissement de returnable_packaging_types (actifs d'emballage) + règles de consigne
ALTER TABLE returnable_packaging_types ADD COLUMN packaging_type_id INTEGER NULL REFERENCES packaging_types(id);
ALTER TABLE returnable_packaging_types ADD COLUMN owner_type TEXT NOT NULL DEFAULT 'brewery'
    CHECK (owner_type IN ('brewery', 'depot', 'supplier', 'other'));
ALTER TABLE returnable_packaging_types ADD COLUMN owner_id INTEGER NULL;
ALTER TABLE returnable_packaging_types ADD COLUMN capacity INTEGER NULL CHECK (capacity IS NULL OR capacity > 0);
ALTER TABLE returnable_packaging_types ADD COLUMN currency TEXT NOT NULL DEFAULT 'FCFA';
ALTER TABLE returnable_packaging_types ADD COLUMN is_reusable INTEGER NOT NULL DEFAULT 1 CHECK (is_reusable IN (0, 1));

CREATE TABLE IF NOT EXISTS deposit_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id INTEGER NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    packaging_id INTEGER NULL REFERENCES product_packagings(id) ON DELETE CASCADE,
    returnable_id INTEGER NOT NULL REFERENCES returnable_packaging_types(id) ON DELETE CASCADE,
    deposit_kind TEXT NOT NULL CHECK (deposit_kind IN ('bottle', 'crate', 'pallet', 'other')),
    amount INTEGER NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'FCFA',
    effective_from TEXT NOT NULL DEFAULT (date('now')),
    effective_to TEXT NULL,
    supplier_id INTEGER NULL REFERENCES suppliers(id) ON DELETE SET NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_deposit_rules_product ON deposit_rules(product_id);
CREATE INDEX IF NOT EXISTS idx_deposit_rules_variant ON deposit_rules(variant_id);
CREATE INDEX IF NOT EXISTS idx_deposit_rules_returnable ON deposit_rules(returnable_id);
CREATE INDEX IF NOT EXISTS idx_deposit_rules_supplier ON deposit_rules(supplier_id);

-- 13. Enrichissement de price_history (historique complet par variante, unité de vente, fournisseur et type de prix)
ALTER TABLE price_history ADD COLUMN variant_id INTEGER NULL REFERENCES product_variants(id);
ALTER TABLE price_history ADD COLUMN sales_unit_id INTEGER NULL REFERENCES sales_units(id);
ALTER TABLE price_history ADD COLUMN supplier_id INTEGER NULL REFERENCES suppliers(id);
ALTER TABLE price_history ADD COLUMN price_type TEXT NULL
    CHECK (price_type IS NULL OR price_type IN ('PURCHASE', 'RETAIL', 'WHOLESALE', 'SEMI_WHOLESALE', 'UNIT', 'PACKAGE', 'MINIMUM_SELLING_PRICE'));
ALTER TABLE price_history ADD COLUMN currency TEXT NOT NULL DEFAULT 'FCFA';
ALTER TABLE price_history ADD COLUMN effective_from TEXT NULL;
ALTER TABLE price_history ADD COLUMN effective_to TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_price_history_variant ON price_history(variant_id);
CREATE INDEX IF NOT EXISTS idx_price_history_supplier ON price_history(supplier_id);

-- 14. Soldes de stock par emplacement & enrichissement des mouvements
CREATE TABLE IF NOT EXISTS stock_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id INTEGER NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    location_id INTEGER NOT NULL REFERENCES stock_locations(id) ON DELETE CASCADE,
    quantity_milli INTEGER NOT NULL DEFAULT 0 CHECK (quantity_milli >= 0),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (product_id, variant_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_balances_product ON stock_balances(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_balances_location ON stock_balances(location_id);

ALTER TABLE stock_movements ADD COLUMN location_id INTEGER NULL REFERENCES stock_locations(id);
ALTER TABLE stock_movements ADD COLUMN variant_id INTEGER NULL REFERENCES product_variants(id);
ALTER TABLE stock_movements ADD COLUMN batch_number TEXT NULL;
ALTER TABLE stock_movements ADD COLUMN expiry_date TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_location ON stock_movements(location_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_variant ON stock_movements(variant_id);

ALTER TABLE returnable_stock_movements ADD COLUMN customer_id INTEGER NULL REFERENCES clients(id);
ALTER TABLE returnable_stock_movements ADD COLUMN supplier_id INTEGER NULL REFERENCES suppliers(id);
ALTER TABLE returnable_stock_movements ADD COLUMN unit_deposit_value INTEGER NOT NULL DEFAULT 0;
ALTER TABLE returnable_stock_movements ADD COLUMN total_value INTEGER NOT NULL DEFAULT 0;
ALTER TABLE returnable_stock_movements ADD COLUMN user_id INTEGER NULL;
ALTER TABLE returnable_stock_movements ADD COLUMN location_id INTEGER NULL REFERENCES stock_locations(id);

CREATE INDEX IF NOT EXISTS idx_returnable_mvt_customer ON returnable_stock_movements(customer_id);
CREATE INDEX IF NOT EXISTS idx_returnable_mvt_supplier ON returnable_stock_movements(supplier_id);

ALTER TABLE sale_lines ADD COLUMN variant_id INTEGER NULL REFERENCES product_variants(id);
ALTER TABLE sale_lines ADD COLUMN sales_unit_id INTEGER NULL REFERENCES sales_units(id);
ALTER TABLE sale_lines ADD COLUMN sales_unit_label TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_sale_lines_variant ON sale_lines(variant_id);
CREATE INDEX IF NOT EXISTS idx_sale_lines_sales_unit ON sale_lines(sales_unit_id);

-- 15. Enregistrement de la version 18
INSERT OR REPLACE INTO schema_version (version, name, applied_at)
VALUES (18, '0018_bdboisson_catalog_v4', datetime('now'));
