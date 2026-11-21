-- ============================================================================
-- Migration 0019 : Commandes clientèle mixtes, allocations d'emballages
-- physiques & soldes de consigne client (DEPOTPRO PREMIUM V3)
-- ============================================================================

-- 1. Enrichissement de product_variants (capacité casier natif & classe de compatibilité)
ALTER TABLE product_variants ADD COLUMN native_crate_capacity INTEGER NULL CHECK (native_crate_capacity IS NULL OR native_crate_capacity > 0);
ALTER TABLE product_variants ADD COLUMN compatibility_class TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_pv_compat ON product_variants(compatibility_class);

-- Backfill des variantes existantes
UPDATE product_variants
SET
    compatibility_class = CASE
        WHEN container_type IN ('glass_returnable', 'glass_bottle') AND volume_ml = 330 THEN 'bottle_33cl_glass'
        WHEN container_type IN ('glass_returnable', 'glass_bottle') AND volume_ml = 500 THEN 'bottle_50cl_glass'
        WHEN container_type IN ('glass_returnable', 'glass_bottle') AND volume_ml = 650 THEN 'bottle_65cl_glass'
        WHEN container_type IN ('glass_returnable', 'glass_bottle') AND volume_ml = 1000 THEN 'bottle_100cl_glass'
        WHEN container_type = 'can' AND volume_ml = 330 THEN 'can_33cl'
        WHEN container_type = 'can' AND volume_ml = 500 THEN 'can_50cl'
        WHEN container_type IN ('pet', 'pet_bottle', 'plastic_bottle') AND volume_ml IS NOT NULL THEN 'pet_' || volume_ml || 'ml'
        WHEN container_type = 'glass_disposable' AND volume_ml IS NOT NULL THEN 'glass_disp_' || volume_ml || 'ml'
        ELSE 'other'
    END,
    native_crate_capacity = CASE
        WHEN container_type IN ('glass_returnable', 'glass_bottle') AND volume_ml = 330 THEN 24
        WHEN container_type IN ('glass_returnable', 'glass_bottle') AND volume_ml IN (500, 650, 1000) THEN 12
        WHEN container_type = 'can' AND volume_ml IN (330, 500) THEN 24
        ELSE NULL
    END
WHERE compatibility_class IS NULL;

-- 2. Actifs d'emballage physique (casiers, cartons répertoriés par classe de compatibilité)
CREATE TABLE IF NOT EXISTS packaging_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
    packaging_type_id INTEGER NULL REFERENCES packaging_types(id),
    returnable_id INTEGER NULL REFERENCES returnable_packaging_types(id),
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    deposit_value INTEGER NOT NULL DEFAULT 0 CHECK (deposit_value >= 0),
    currency TEXT NOT NULL DEFAULT 'XOF',
    returnable INTEGER NOT NULL DEFAULT 1 CHECK (returnable IN (0, 1)),
    compatibility_class TEXT NOT NULL DEFAULT 'other',
    stock_empty INTEGER NOT NULL DEFAULT 0 CHECK (stock_empty >= 0),
    stock_full INTEGER NOT NULL DEFAULT 0 CHECK (stock_full >= 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pa_compat ON packaging_assets(compatibility_class);
CREATE INDEX IF NOT EXISTS idx_pa_active ON packaging_assets(is_active);

-- Seed référentiel standard brasseries ivoiriennes
INSERT OR IGNORE INTO packaging_assets (code, name, packaging_type_id, capacity, deposit_value, currency, returnable, compatibility_class)
VALUES
    ('PA-CASIER-24X33',  'Casier 24 × 33cl verre',   (SELECT id FROM packaging_types WHERE code = 'PT-CRATE'),  24, 1000, 'XOF', 1, 'bottle_33cl_glass'),
    ('PA-CASIER-12X50',  'Casier 12 × 50cl verre',   (SELECT id FROM packaging_types WHERE code = 'PT-CRATE'),  12, 1000, 'XOF', 1, 'bottle_50cl_glass'),
    ('PA-CASIER-12X65',  'Casier 12 × 65cl verre',   (SELECT id FROM packaging_types WHERE code = 'PT-CRATE'),  12, 1200, 'XOF', 1, 'bottle_65cl_glass'),
    ('PA-CASIER-12X100', 'Casier 12 × 100cl verre',  (SELECT id FROM packaging_types WHERE code = 'PT-CRATE'),  12, 1500, 'XOF', 1, 'bottle_100cl_glass'),
    ('PA-CASIER-20X50',  'Casier 20 × 50cl verre',   (SELECT id FROM packaging_types WHERE code = 'PT-CRATE'),  20, 1000, 'XOF', 1, 'bottle_50cl_glass'),
    ('PA-CARTON-24X33',  'Carton 24 × 33cl canette', (SELECT id FROM packaging_types WHERE code = 'PT-CARTON'), 24,    0, 'XOF', 0, 'can_33cl'),
    ('PA-CARTON-24X50',  'Carton 24 × 50cl canette', (SELECT id FROM packaging_types WHERE code = 'PT-CARTON'), 24,    0, 'XOF', 0, 'can_50cl');

-- 3. Commandes clientèle (en-tête)
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL UNIQUE CHECK (length(trim(order_number)) > 0),
    customer_id INTEGER NOT NULL REFERENCES clients(id),
    order_type TEXT NOT NULL DEFAULT 'vente' CHECK (order_type IN ('vente', 'retour', 'mixte')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'preparing', 'delivered', 'invoiced', 'paid', 'cancelled')),
    subtotal_xof INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_xof >= 0),
    deposit_total_xof INTEGER NOT NULL DEFAULT 0 CHECK (deposit_total_xof >= 0),
    discount_xof INTEGER NOT NULL DEFAULT 0 CHECK (discount_xof >= 0),
    tax_xof INTEGER NOT NULL DEFAULT 0 CHECK (tax_xof >= 0),
    total_xof INTEGER NOT NULL DEFAULT 0 CHECK (total_xof >= 0),
    deposit_due_xof INTEGER NOT NULL DEFAULT 0 CHECK (deposit_due_xof >= 0),
    total_to_collect_xof INTEGER NOT NULL DEFAULT 0 CHECK (total_to_collect_xof >= 0),
    paid_xof INTEGER NOT NULL DEFAULT 0 CHECK (paid_xof >= 0),
    payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
    payment_method TEXT NULL CHECK (payment_method IS NULL OR payment_method IN ('cash', 'mobile_money', 'credit', 'mixed')),
    delivery_date TEXT NULL,
    delivery_address TEXT NULL,
    notes TEXT NULL,
    created_by INTEGER NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(created_at);

-- 4. Lignes de commande (produits uniquement)
CREATE TABLE IF NOT EXISTS order_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    requested_unit TEXT NOT NULL CHECK (requested_unit IN ('unit', 'bottle', 'can', 'half_crate', 'crate', 'pack', 'carton', 'pallet', 'custom')),
    requested_quantity INTEGER NOT NULL CHECK (requested_quantity > 0),
    base_quantity INTEGER NOT NULL CHECK (base_quantity > 0),
    unit_price_xof INTEGER NOT NULL CHECK (unit_price_xof >= 0),
    line_total_xof INTEGER NOT NULL CHECK (line_total_xof >= 0),
    discount_xof INTEGER NOT NULL DEFAULT 0 CHECK (discount_xof >= 0),
    notes TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_order_lines_order ON order_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_order_lines_variant ON order_lines(variant_id);

-- 5. Allocation des emballages physiques à une commande (casiers partagés pour commandes mixtes)
CREATE TABLE IF NOT EXISTS order_packaging_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    packaging_asset_id INTEGER NOT NULL REFERENCES packaging_assets(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    is_consigned INTEGER NOT NULL DEFAULT 0 CHECK (is_consigned IN (0, 1)),
    deposit_amount_xof INTEGER NOT NULL DEFAULT 0 CHECK (deposit_amount_xof >= 0),
    provided_by TEXT NULL CHECK (provided_by IS NULL OR provided_by IN ('brewery', 'supplier', 'depot')),
    returned_quantity INTEGER NOT NULL DEFAULT 0 CHECK (returned_quantity >= 0),
    notes TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_opa_order ON order_packaging_allocations(order_id);
CREATE INDEX IF NOT EXISTS idx_opa_asset ON order_packaging_allocations(packaging_asset_id);

-- 6. Traçabilité : quelles bouteilles de quelle ligne vont dans quel casier alloué
CREATE TABLE IF NOT EXISTS order_line_packaging_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_line_id INTEGER NOT NULL REFERENCES order_lines(id) ON DELETE CASCADE,
    order_packaging_allocation_id INTEGER NOT NULL REFERENCES order_packaging_allocations(id) ON DELETE CASCADE,
    units_in_packaging INTEGER NOT NULL CHECK (units_in_packaging > 0)
);

CREATE INDEX IF NOT EXISTS idx_olpl_line ON order_line_packaging_links(order_line_id);
CREATE INDEX IF NOT EXISTS idx_olpl_allocation ON order_line_packaging_links(order_packaging_allocation_id);

-- 7. Soldes consignés par client (dettes d'emballage physique)
CREATE TABLE IF NOT EXISTS customer_deposit_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES clients(id),
    packaging_asset_id INTEGER NOT NULL REFERENCES packaging_assets(id),
    quantity_held INTEGER NOT NULL DEFAULT 0 CHECK (quantity_held >= 0),
    amount_held_xof INTEGER NOT NULL DEFAULT 0 CHECK (amount_held_xof >= 0),
    last_movement_at TEXT NULL,
    UNIQUE(customer_id, packaging_asset_id)
);

CREATE INDEX IF NOT EXISTS idx_cdb_customer ON customer_deposit_balances(customer_id);

-- 8. Journal explicite des mouvements d'emballages physiques liés aux commandes & retours
CREATE TABLE IF NOT EXISTS packaging_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    packaging_asset_id INTEGER NOT NULL REFERENCES packaging_assets(id),
    customer_id INTEGER NULL REFERENCES clients(id),
    order_id INTEGER NULL REFERENCES orders(id),
    order_packaging_allocation_id INTEGER NULL REFERENCES order_packaging_allocations(id),
    movement_type TEXT NOT NULL CHECK (movement_type IN ('LIVRAISON_CLIENT', 'RETOUR_CLIENT', 'AJUSTEMENT_ENTREE', 'AJUSTEMENT_SORTIE', 'CASSE')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_deposit_xof INTEGER NOT NULL DEFAULT 0 CHECK (unit_deposit_xof >= 0),
    total_deposit_xof INTEGER NOT NULL DEFAULT 0 CHECK (total_deposit_xof >= 0),
    notes TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pm_asset ON packaging_movements(packaging_asset_id);
CREATE INDEX IF NOT EXISTS idx_pm_customer ON packaging_movements(customer_id);
CREATE INDEX IF NOT EXISTS idx_pm_order ON packaging_movements(order_id);

-- 9. Traçabilité des mouvements de stock produits liés aux commandes
ALTER TABLE stock_movements ADD COLUMN order_id INTEGER NULL REFERENCES orders(id);
ALTER TABLE stock_movements ADD COLUMN order_line_id INTEGER NULL REFERENCES order_lines(id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_order ON stock_movements(order_id);

-- 10. Enregistrement de la version 19
INSERT OR REPLACE INTO schema_version (version, name, applied_at)
VALUES (19, '0019_orders_and_packaging', datetime('now'));
