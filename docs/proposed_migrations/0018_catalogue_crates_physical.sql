-- PROPOSAL ONLY — Migration 0018
-- À NE PAS ACTIVER avant revue du schéma exact et tests sur une copie de base.
-- Aucun backfill destructif, aucune conversion d'obligation historique, aucune écriture financière.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS catalog_producers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    legal_name TEXT NULL,
    country TEXT NOT NULL,
    city TEXT NULL,
    website TEXT NULL,
    logo_url TEXT NULL,
    currency TEXT NOT NULL DEFAULT 'XOF' CHECK (currency = 'XOF'),
    description TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS producer_catalogues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producer_id INTEGER NOT NULL REFERENCES catalog_producers(id) ON DELETE RESTRICT,
    catalog_id TEXT NOT NULL UNIQUE CHECK (length(trim(catalog_id)) > 0),
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    reference_date TEXT NULL,
    source_description TEXT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_producer_catalogues_producer ON producer_catalogues(producer_id);

CREATE TABLE IF NOT EXISTS catalogue_master_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producer_catalogue_id INTEGER NOT NULL REFERENCES producer_catalogues(id) ON DELETE RESTRICT,
    external_product_id TEXT NOT NULL,
    brand_id INTEGER NULL REFERENCES brands(id) ON DELETE SET NULL,
    family_id INTEGER NULL REFERENCES product_families(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT NULL,
    official_url TEXT NULL,
    catalog_status TEXT NOT NULL DEFAULT 'to_verify'
        CHECK (catalog_status IN ('current','historical','discontinued','to_verify')),
    active_in_reference INTEGER NOT NULL DEFAULT 1 CHECK (active_in_reference IN (0,1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(producer_catalogue_id, external_product_id)
);
CREATE INDEX IF NOT EXISTS idx_catalogue_master_brand ON catalogue_master_products(brand_id);
CREATE INDEX IF NOT EXISTS idx_catalogue_master_family ON catalogue_master_products(family_id);

CREATE TABLE IF NOT EXISTS catalogue_import_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_key TEXT NOT NULL UNIQUE,
    producer_catalogue_id INTEGER NOT NULL REFERENCES producer_catalogues(id) ON DELETE RESTRICT,
    source_filename TEXT NULL,
    source_format TEXT NOT NULL,
    source_schema_version TEXT NULL,
    source_sha256 TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('preview','add','refresh','merge')),
    status TEXT NOT NULL CHECK (status IN ('previewed','confirmed','completed','failed','cancelled')),
    summary_json TEXT NULL,
    warnings_json TEXT NULL,
    created_by_user_id INTEGER NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT NULL
);
CREATE INDEX IF NOT EXISTS idx_catalogue_import_runs_catalogue ON catalogue_import_runs(producer_catalogue_id, created_at DESC);

CREATE TABLE IF NOT EXISTS catalogue_import_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_run_id INTEGER NOT NULL REFERENCES catalogue_import_runs(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('category','brand','master_product','variant','crate_type','compatibility')),
    external_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('create','update','unchanged','warning','skip','error')),
    target_table TEXT NULL,
    target_id INTEGER NULL,
    before_json TEXT NULL,
    after_json TEXT NULL,
    message TEXT NULL,
    UNIQUE(import_run_id, entity_type, external_id)
);

-- Réutiliser brands et catalogue_products : pas de seconde table SKU concurrente.
ALTER TABLE brands ADD COLUMN producer_id INTEGER NULL REFERENCES catalog_producers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_brands_producer ON brands(producer_id);

ALTER TABLE catalogue_products ADD COLUMN producer_catalogue_id INTEGER NULL REFERENCES producer_catalogues(id) ON DELETE RESTRICT;
ALTER TABLE catalogue_products ADD COLUMN master_product_id INTEGER NULL REFERENCES catalogue_master_products(id) ON DELETE RESTRICT;
ALTER TABLE catalogue_products ADD COLUMN external_variant_id TEXT NULL;
ALTER TABLE catalogue_products ADD COLUMN volume_ml INTEGER NULL CHECK (volume_ml IS NULL OR volume_ml > 0);
ALTER TABLE catalogue_products ADD COLUMN container_kind TEXT NULL
    CHECK (container_kind IS NULL OR container_kind IN ('bottle','can','carton','other'));
ALTER TABLE catalogue_products ADD COLUMN container_material TEXT NULL
    CHECK (container_material IS NULL OR container_material IN ('glass','pet','aluminium','cardboard','plastic','other'));
ALTER TABLE catalogue_products ADD COLUMN evidence_status TEXT NOT NULL DEFAULT 'to_verify'
    CHECK (evidence_status IN ('verified','to_verify','historical','custom','inactive'));
ALTER TABLE catalogue_products ADD COLUMN source_ids_json TEXT NULL;
ALTER TABLE catalogue_products ADD COLUMN last_seen_import_run_id INTEGER NULL REFERENCES catalogue_import_runs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_catalogue_products_catalogue ON catalogue_products(producer_catalogue_id);
CREATE INDEX IF NOT EXISTS idx_catalogue_products_master ON catalogue_products(master_product_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalogue_variant_external
    ON catalogue_products(producer_catalogue_id, external_variant_id)
    WHERE producer_catalogue_id IS NOT NULL AND external_variant_id IS NOT NULL;

ALTER TABLE products ADD COLUMN catalogue_product_id INTEGER NULL REFERENCES catalogue_products(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_catalogue_reference
    ON products(catalogue_product_id) WHERE catalogue_product_id IS NOT NULL;

-- Liaison explicite : une variante peut accepter plusieurs types de casiers,
-- avec capacité et statut de vérification propres à cette relation.
CREATE TABLE IF NOT EXISTS catalogue_variant_crate_compatibility (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    catalogue_product_id INTEGER NOT NULL REFERENCES catalogue_products(id) ON DELETE CASCADE,
    crate_type_id INTEGER NOT NULL REFERENCES crate_types(id) ON DELETE RESTRICT,
    bottles_per_crate INTEGER NULL CHECK (bottles_per_crate IS NULL OR bottles_per_crate > 0),
    status TEXT NOT NULL DEFAULT 'to_verify' CHECK (status IN ('confirmed','to_verify','rejected')),
    source_id TEXT NULL,
    note TEXT NULL,
    verified_by_user_id INTEGER NULL REFERENCES users(id),
    verified_at TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    UNIQUE(catalogue_product_id, crate_type_id)
);
CREATE INDEX IF NOT EXISTS idx_variant_crate_compat_variant ON catalogue_variant_crate_compatibility(catalogue_product_id);
CREATE INDEX IF NOT EXISTS idx_variant_crate_compat_crate ON catalogue_variant_crate_compatibility(crate_type_id);

-- Valorisation du casier : ces montants ne sont PAS des cautions ni des frais de vente.
CREATE TABLE IF NOT EXISTS crate_valuation_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_key TEXT NOT NULL UNIQUE,
    crate_type_id INTEGER NOT NULL REFERENCES crate_types(id) ON DELETE RESTRICT,
    value_kind TEXT NOT NULL CHECK (value_kind IN ('acquisition_cost','reference_value','empty_crate_sale_price')),
    amount_xof INTEGER NOT NULL CHECK (amount_xof >= 0),
    valid_from TEXT NOT NULL,
    valid_to TEXT NULL,
    reason TEXT NULL,
    changed_by_user_id INTEGER NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (valid_to IS NULL OR valid_to > valid_from)
);
CREATE INDEX IF NOT EXISTS idx_crate_valuation_lookup ON crate_valuation_history(crate_type_id, value_kind, valid_from);

-- Soldes physiques : depot, client ou fournisseur ; état plein/vide/endommage.
CREATE TABLE IF NOT EXISTS crate_inventory_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crate_type_id INTEGER NOT NULL REFERENCES crate_types(id) ON DELETE RESTRICT,
    location_type TEXT NOT NULL CHECK (location_type IN ('depot','customer','supplier')),
    client_id INTEGER NULL REFERENCES clients(id) ON DELETE RESTRICT,
    supplier_id INTEGER NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    physical_state TEXT NOT NULL CHECK (physical_state IN ('full','empty','damaged')),
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (
      (location_type = 'depot' AND client_id IS NULL AND supplier_id IS NULL) OR
      (location_type = 'customer' AND client_id IS NOT NULL AND supplier_id IS NULL) OR
      (location_type = 'supplier' AND client_id IS NULL AND supplier_id IS NOT NULL)
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_crate_balance_depot
    ON crate_inventory_balances(crate_type_id, physical_state) WHERE location_type='depot';
CREATE UNIQUE INDEX IF NOT EXISTS uq_crate_balance_customer
    ON crate_inventory_balances(crate_type_id, client_id, physical_state) WHERE location_type='customer';
CREATE UNIQUE INDEX IF NOT EXISTS uq_crate_balance_supplier
    ON crate_inventory_balances(crate_type_id, supplier_id, physical_state) WHERE location_type='supplier';

CREATE TABLE IF NOT EXISTS crate_inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_key TEXT NOT NULL UNIQUE,
    crate_type_id INTEGER NOT NULL REFERENCES crate_types(id) ON DELETE RESTRICT,
    movement_type TEXT NOT NULL CHECK (movement_type IN (
      'opening_balance','purchase_full_in','sale_full_out','customer_empty_return_in',
      'supplier_empty_exchange_out','supplier_crate_receipt_in','open_full_crate',
      'empty_crate_sale_out','empty_crate_purchase_in','adjustment_in','adjustment_out',
      'damage','loss','writeoff','transfer'
    )),
    physical_state TEXT NOT NULL CHECK (physical_state IN ('full','empty','damaged')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    from_location_type TEXT NULL CHECK (from_location_type IS NULL OR from_location_type IN ('depot','customer','supplier')),
    from_client_id INTEGER NULL REFERENCES clients(id),
    from_supplier_id INTEGER NULL REFERENCES suppliers(id),
    to_location_type TEXT NULL CHECK (to_location_type IS NULL OR to_location_type IN ('depot','customer','supplier')),
    to_client_id INTEGER NULL REFERENCES clients(id),
    to_supplier_id INTEGER NULL REFERENCES suppliers(id),
    reference_type TEXT NULL,
    reference_id INTEGER NULL,
    reference_document TEXT NULL,
    reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
    actor_user_id INTEGER NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (
      (from_location_type IS NULL OR
       (from_location_type='depot' AND from_client_id IS NULL AND from_supplier_id IS NULL) OR
       (from_location_type='customer' AND from_client_id IS NOT NULL AND from_supplier_id IS NULL) OR
       (from_location_type='supplier' AND from_client_id IS NULL AND from_supplier_id IS NOT NULL))
    ),
    CHECK (
      (to_location_type IS NULL OR
       (to_location_type='depot' AND to_client_id IS NULL AND to_supplier_id IS NULL) OR
       (to_location_type='customer' AND to_client_id IS NOT NULL AND to_supplier_id IS NULL) OR
       (to_location_type='supplier' AND to_client_id IS NULL AND to_supplier_id IS NOT NULL))
    )
);
CREATE INDEX IF NOT EXISTS idx_crate_movements_type_date ON crate_inventory_movements(crate_type_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crate_movements_from_customer ON crate_inventory_movements(from_client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crate_movements_to_customer ON crate_inventory_movements(to_client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crate_movements_supplier ON crate_inventory_movements(from_supplier_id, to_supplier_id, created_at DESC);

-- IMPORTANT : aucune donnée historique n'est reprise automatiquement ici.
-- Le rapprochement de returnable_packaging_types / customer_packaging_accounts
-- doit être fait dans un outil de staging puis validé explicitement par l'OWNER.
-- Ne jamais importer deposit_held_amount comme une valeur de casier ou une dette.
