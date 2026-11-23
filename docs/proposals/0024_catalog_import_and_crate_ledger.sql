-- PROPOSAL ONLY — not an active SQLite migration.
-- Proposed internal schema version 24. Do not execute until reviewed, wired into
-- migrations.rs/sql_defs.rs, expected_schema_v24.json and migration tests.
-- Additive only: never rewrite/drop published migration/history tables.

PRAGMA foreign_keys = ON;

-- New physical-only operations must not be eligible for the legacy conversion
-- service. Preserve eligibility of every pre-cutover issue/policy.
ALTER TABLE deposit_issues
    ADD COLUMN conversion_legacy_eligible INTEGER NOT NULL DEFAULT 0
    CHECK (conversion_legacy_eligible IN (0, 1));
UPDATE deposit_issues SET conversion_legacy_eligible = 1;

ALTER TABLE packaging_policies
    ADD COLUMN conversion_legacy_eligible INTEGER NOT NULL DEFAULT 0
    CHECK (conversion_legacy_eligible IN (0, 1));
UPDATE packaging_policies SET conversion_legacy_eligible = 1;

-- Source catalog identity/snapshot and explicit link to operational records.
ALTER TABLE catalogue_products ADD COLUMN source_catalog_id TEXT NULL;
ALTER TABLE catalogue_products ADD COLUMN source_external_product_id TEXT NULL;
ALTER TABLE catalogue_products ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'to_verify'
    CHECK (verification_status IN ('verified', 'to_verify', 'historical', 'owner_configured', 'inactive'));
ALTER TABLE catalogue_products ADD COLUMN source_snapshot_json TEXT NULL
    CHECK (source_snapshot_json IS NULL OR json_valid(source_snapshot_json));
ALTER TABLE catalogue_products ADD COLUMN operational_product_id INTEGER NULL REFERENCES products(id);
ALTER TABLE catalogue_products ADD COLUMN operational_variant_id INTEGER NULL REFERENCES product_variants(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalogue_product_source
    ON catalogue_products(source_catalog_id, source_external_product_id)
    WHERE source_catalog_id IS NOT NULL AND source_external_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_catalogue_products_operational
    ON catalogue_products(operational_product_id, operational_variant_id);

-- Existing crate type/assets remain the operational references. Old values are
-- retained but are not automatically promoted to verified owner configuration.
ALTER TABLE crate_types ADD COLUMN capacity_status TEXT NOT NULL DEFAULT 'legacy_unverified'
    CHECK (capacity_status IN ('unknown', 'to_verify', 'verified', 'owner_configured', 'legacy_unverified'));
ALTER TABLE crate_types ADD COLUMN value_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (value_status IN ('unknown', 'to_verify', 'verified', 'owner_configured', 'legacy_unverified'));
ALTER TABLE packaging_assets ADD COLUMN crate_type_id INTEGER NULL REFERENCES crate_types(id);
ALTER TABLE packaging_assets ADD COLUMN capacity_status TEXT NOT NULL DEFAULT 'legacy_unverified'
    CHECK (capacity_status IN ('unknown', 'to_verify', 'verified', 'owner_configured', 'legacy_unverified'));
ALTER TABLE packaging_assets ADD COLUMN value_status TEXT NOT NULL DEFAULT 'legacy_unverified'
    CHECK (value_status IN ('unknown', 'to_verify', 'verified', 'owner_configured', 'legacy_unverified'));
UPDATE crate_types SET capacity_status = 'legacy_unverified', value_status = 'legacy_unverified';
UPDATE packaging_assets SET capacity_status = 'legacy_unverified', value_status = 'legacy_unverified';
CREATE INDEX IF NOT EXISTS idx_packaging_assets_crate_type
    ON packaging_assets(crate_type_id);

-- Import runs: preview and commit share the immutable payload hash.
CREATE TABLE IF NOT EXISTS catalog_import_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_key TEXT NOT NULL UNIQUE,
    catalog_id TEXT NOT NULL CHECK (length(trim(catalog_id)) > 0),
    schema_version TEXT NOT NULL,
    payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64),
    file_name TEXT NULL,
    status TEXT NOT NULL CHECK (status IN ('preview', 'committed', 'rejected', 'failed')),
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    preview_json TEXT NULL CHECK (preview_json IS NULL OR json_valid(preview_json)),
    summary_json TEXT NULL CHECK (summary_json IS NULL OR json_valid(summary_json)),
    actor_user_id TEXT NULL,
    actor_name TEXT NULL,
    actor_role TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    committed_at TEXT NULL,
    updated_at TEXT NULL
);
CREATE INDEX IF NOT EXISTS idx_catalog_import_runs_catalog
    ON catalog_import_runs(catalog_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_import_runs_status
    ON catalog_import_runs(status, id DESC);

-- Commit retries are keyed separately from the preview request.
CREATE TABLE IF NOT EXISTS catalog_import_commit_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_run_id INTEGER NOT NULL REFERENCES catalog_import_runs(id),
    request_key TEXT NOT NULL UNIQUE,
    payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64),
    result_json TEXT NOT NULL CHECK (json_valid(result_json)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_catalog_import_commit_run
    ON catalog_import_commit_requests(import_run_id);

-- Polymorphic source-to-internal mapping. The service validates internal_table/id
-- before writing; no false FK is declared across multiple entity tables.
CREATE TABLE IF NOT EXISTS catalog_external_refs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    catalog_id TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN
        ('producer', 'brand', 'category', 'container_type', 'packaging_type', 'product', 'variant', 'crate_asset')),
    external_id TEXT NOT NULL,
    internal_table TEXT NULL CHECK (internal_table IS NULL OR internal_table IN
        ('breweries', 'brands', 'categories', 'container_types', 'packaging_types',
         'catalogue_products', 'products', 'product_variants', 'crate_types', 'packaging_assets')),
    internal_id INTEGER NULL,
    source_hash TEXT NULL,
    source_status TEXT NULL,
    local_override_fields_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(local_override_fields_json)),
    source_snapshot_json TEXT NULL CHECK (source_snapshot_json IS NULL OR json_valid(source_snapshot_json)),
    last_import_run_id INTEGER NULL REFERENCES catalog_import_runs(id),
    first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    archived_at TEXT NULL,
    UNIQUE (catalog_id, entity_type, external_id)
);
CREATE INDEX IF NOT EXISTS idx_catalog_external_refs_internal
    ON catalog_external_refs(internal_table, internal_id);
CREATE INDEX IF NOT EXISTS idx_catalog_external_refs_run
    ON catalog_external_refs(last_import_run_id);

CREATE TABLE IF NOT EXISTS catalog_import_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_run_id INTEGER NOT NULL REFERENCES catalog_import_runs(id),
    entity_type TEXT NOT NULL,
    external_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'update_source', 'no_change', 'protected_local', 'warning', 'error')),
    status TEXT NOT NULL CHECK (status IN ('preview', 'applied', 'skipped', 'failed')),
    internal_table TEXT NULL,
    internal_id INTEGER NULL,
    before_json TEXT NULL CHECK (before_json IS NULL OR json_valid(before_json)),
    source_json TEXT NULL CHECK (source_json IS NULL OR json_valid(source_json)),
    diff_json TEXT NULL CHECK (diff_json IS NULL OR json_valid(diff_json)),
    errors_json TEXT NULL CHECK (errors_json IS NULL OR json_valid(errors_json)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (import_run_id, entity_type, external_id)
);
CREATE INDEX IF NOT EXISTS idx_catalog_import_items_run
    ON catalog_import_items(import_run_id, status);

-- Physical balances are separate from customer commercial accounts and all
-- packaging conversion/consignment ledgers. Depot location_id is 0.
CREATE TABLE IF NOT EXISTS crate_physical_balances (
    packaging_asset_id INTEGER NOT NULL REFERENCES packaging_assets(id),
    location_type TEXT NOT NULL CHECK (location_type IN ('depot', 'client', 'supplier')),
    location_id INTEGER NOT NULL CHECK (location_id >= 0),
    state TEXT NOT NULL CHECK (state IN ('full', 'empty')),
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (packaging_asset_id, location_type, location_id, state),
    CHECK ((location_type = 'depot' AND location_id = 0)
        OR (location_type IN ('client', 'supplier') AND location_id > 0))
);
CREATE INDEX IF NOT EXISTS idx_crate_physical_balances_location
    ON crate_physical_balances(location_type, location_id, state);

-- One operation is idempotent; transfer produces two balance-ledger entries.
-- No financial/deposit/receivable columns are present.
CREATE TABLE IF NOT EXISTS crate_physical_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_key TEXT NOT NULL UNIQUE,
    packaging_asset_id INTEGER NOT NULL REFERENCES packaging_assets(id),
    movement_type TEXT NOT NULL CHECK (movement_type IN
        ('opening_balance', 'purchase_full_receipt', 'sale_full_issue',
         'customer_empty_return', 'customer_full_return', 'supplier_empty_issue',
         'supplier_full_receipt', 'supplier_empty_return', 'adjustment_in',
         'adjustment_out', 'breakage', 'loss', 'empty_sale')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    from_location_type TEXT NULL CHECK (from_location_type IS NULL OR from_location_type IN ('depot', 'client', 'supplier')),
    from_location_id INTEGER NULL CHECK (from_location_id IS NULL OR from_location_id >= 0),
    from_state TEXT NULL CHECK (from_state IS NULL OR from_state IN ('full', 'empty')),
    to_location_type TEXT NULL CHECK (to_location_type IS NULL OR to_location_type IN ('depot', 'client', 'supplier')),
    to_location_id INTEGER NULL CHECK (to_location_id IS NULL OR to_location_id >= 0),
    to_state TEXT NULL CHECK (to_state IS NULL OR to_state IN ('full', 'empty')),
    client_id INTEGER NULL REFERENCES clients(id),
    supplier_id INTEGER NULL REFERENCES suppliers(id),
    sale_id INTEGER NULL REFERENCES sales(id),
    sale_line_id INTEGER NULL REFERENCES sale_lines(id),
    purchase_receipt_id INTEGER NULL REFERENCES purchase_receipts(id),
    document_reference TEXT NULL,
    reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
    actor_user_id TEXT NULL,
    actor_name TEXT NULL,
    actor_role TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (from_location_type IS NOT NULL OR to_location_type IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_crate_physical_operations_asset
    ON crate_physical_operations(packaging_asset_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_crate_physical_operations_client
    ON crate_physical_operations(client_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_crate_physical_operations_supplier
    ON crate_physical_operations(supplier_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_crate_physical_operations_sale
    ON crate_physical_operations(sale_id, sale_line_id);
CREATE INDEX IF NOT EXISTS idx_crate_physical_operations_receipt
    ON crate_physical_operations(purchase_receipt_id);

CREATE TABLE IF NOT EXISTS crate_physical_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id INTEGER NOT NULL REFERENCES crate_physical_operations(id),
    location_type TEXT NOT NULL CHECK (location_type IN ('depot', 'client', 'supplier')),
    location_id INTEGER NOT NULL CHECK (location_id >= 0),
    state TEXT NOT NULL CHECK (state IN ('full', 'empty')),
    direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    balance_before INTEGER NOT NULL CHECK (balance_before >= 0),
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK ((location_type = 'depot' AND location_id = 0)
        OR (location_type IN ('client', 'supplier') AND location_id > 0)),
    CHECK ((direction = 'in' AND balance_after = balance_before + quantity)
        OR (direction = 'out' AND balance_after = balance_before - quantity))
);
CREATE INDEX IF NOT EXISTS idx_crate_physical_movements_operation
    ON crate_physical_movements(operation_id);
CREATE INDEX IF NOT EXISTS idx_crate_physical_movements_location
    ON crate_physical_movements(location_type, location_id, state, id DESC);
