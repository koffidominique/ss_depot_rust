-- DEPOTPRO PREMIUM V3 — Schéma SQLite unifié
-- Règles strictes :
--   1. Tous les montants FCFA sont stockés en INTEGER exact (jamais REAL/FLOAT)
--   2. Toutes les quantités sont stockées en milli-unités INTEGER (1 unité = 1000)
--   3. Aucune suppression en cascade sur les écritures commerciales historiques
--   4. Clés d'idempotence obligatoires sur les opérations financières/stock sensibles

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS owner_security (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    pin_hash TEXT NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    locked_until TEXT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    company_name TEXT NOT NULL DEFAULT 'DEPOTPRO',
    company_legal_name TEXT NULL,
    address TEXT NULL,
    phone TEXT NULL,
    email TEXT NULL,
    city TEXT NULL,
    country TEXT NULL DEFAULT 'Côte d''Ivoire',
    currency TEXT NOT NULL DEFAULT 'FCFA',
    allow_negative_stock INTEGER NOT NULL DEFAULT 0 CHECK (allow_negative_stock IN (0, 1)),
    invoice_prefix TEXT NOT NULL DEFAULT 'FAC',
    sale_prefix TEXT NOT NULL DEFAULT 'VTE',
    purchase_prefix TEXT NOT NULL DEFAULT 'ACH',
    order_prefix TEXT NOT NULL DEFAULT 'CMD',
    receipt_prefix TEXT NOT NULL DEFAULT 'REC',
    credit_note_prefix TEXT NOT NULL DEFAULT 'AVO',
    theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
    logo_path TEXT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_sequences (
    prefix TEXT NOT NULL,
    year INTEGER NOT NULL,
    last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
    PRIMARY KEY (prefix, year)
);

CREATE TABLE IF NOT EXISTS payment_methods (
    code TEXT PRIMARY KEY CHECK (length(code) > 0),
    label TEXT NOT NULL CHECK (length(label) > 0),
    is_cash INTEGER NOT NULL DEFAULT 0 CHECK (is_cash IN (0, 1)),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
    description TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    company_name TEXT NULL,
    phone TEXT NOT NULL CHECK (length(trim(phone)) > 0),
    address TEXT NULL,
    email TEXT NULL,
    contact_person TEXT NULL,
    payment_terms_days INTEGER NOT NULL DEFAULT 0 CHECK (payment_terms_days >= 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE CHECK (length(trim(reference)) > 0),
    barcode TEXT NULL UNIQUE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    brand TEXT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    supplier_id INTEGER NULL REFERENCES suppliers(id),
    description TEXT NULL,
    base_unit TEXT NOT NULL DEFAULT 'bouteille' CHECK (length(trim(base_unit)) > 0),
    stock_milli INTEGER NOT NULL DEFAULT 0,
    min_stock_milli INTEGER NOT NULL DEFAULT 0 CHECK (min_stock_milli >= 0),
    max_stock_milli INTEGER NOT NULL DEFAULT 0 CHECK (max_stock_milli >= 0),
    average_cost_num TEXT NULL,
    average_cost_den TEXT NULL,
    purchase_price INTEGER NULL CHECK (purchase_price IS NULL OR purchase_price >= 0),
    wholesale_price INTEGER NULL CHECK (wholesale_price IS NULL OR wholesale_price >= 0),
    semi_wholesale_price INTEGER NULL CHECK (semi_wholesale_price IS NULL OR semi_wholesale_price >= 0),
    retail_price INTEGER NULL CHECK (retail_price IS NULL OR retail_price >= 0),
    image_path TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);

CREATE TABLE IF NOT EXISTS product_packagings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    name TEXT NOT NULL CHECK (name IN ('casier', 'carton', 'bouteille', 'pack', 'canette')),
    base_unit TEXT NOT NULL CHECK (length(trim(base_unit)) > 0),
    coefficient_milli INTEGER NOT NULL CHECK (coefficient_milli > 0),
    purchase_price INTEGER NULL CHECK (purchase_price IS NULL OR purchase_price >= 0),
    wholesale_price INTEGER NULL CHECK (wholesale_price IS NULL OR wholesale_price >= 0),
    semi_wholesale_price INTEGER NULL CHECK (semi_wholesale_price IS NULL OR semi_wholesale_price >= 0),
    retail_price INTEGER NULL CHECK (retail_price IS NULL OR retail_price >= 0),
    barcode TEXT NULL UNIQUE,
    allow_fraction INTEGER NOT NULL DEFAULT 0 CHECK (allow_fraction IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    UNIQUE (product_id, name)
);

CREATE INDEX IF NOT EXISTS idx_packagings_product ON product_packagings(product_id);

CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    client_type TEXT NOT NULL DEFAULT 'particulier' CHECK (client_type IN ('particulier', 'professionnel')),
    phone TEXT NULL,
    address TEXT NULL,
    city TEXT NULL,
    email TEXT NULL,
    contact_person TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);

CREATE TABLE IF NOT EXISTS client_credit_settings (
    client_id INTEGER PRIMARY KEY REFERENCES clients(id),
    policy TEXT NOT NULL DEFAULT 'forbidden' CHECK (policy IN ('forbidden', 'limited', 'unlimited')),
    credit_limit INTEGER NULL CHECK (
        (policy = 'limited' AND credit_limit IS NOT NULL AND credit_limit >= 0) OR
        (policy IN ('forbidden', 'unlimited') AND credit_limit IS NULL)
    ),
    payment_terms_days INTEGER NOT NULL DEFAULT 0 CHECK (payment_terms_days >= 0),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS returnable_packaging_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    producer TEXT NOT NULL CHECK (length(trim(producer)) > 0),
    kind TEXT NOT NULL CHECK (kind IN ('bottle', 'crate')),
    description TEXT NULL,
    deposit_value INTEGER NOT NULL DEFAULT 0 CHECK (deposit_value >= 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deposit_packaging_profiles (
    packaging_id INTEGER PRIMARY KEY REFERENCES product_packagings(id),
    mode TEXT NOT NULL CHECK (mode IN ('none', 'deposit'))
);

CREATE TABLE IF NOT EXISTS deposit_packaging_components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    packaging_id INTEGER NOT NULL REFERENCES deposit_packaging_profiles(packaging_id),
    returnable_id INTEGER NOT NULL REFERENCES returnable_packaging_types(id),
    pieces_per_pack INTEGER NOT NULL CHECK (pieces_per_pack > 0),
    UNIQUE (packaging_id, returnable_id)
);

CREATE TABLE IF NOT EXISTS returnable_stock_balances (
    packaging_id INTEGER PRIMARY KEY REFERENCES returnable_packaging_types(id),
    quantity INTEGER NOT NULL CHECK (quantity >= 0)
);

CREATE TABLE IF NOT EXISTS returnable_stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_key TEXT NOT NULL UNIQUE,
    packaging_id INTEGER NOT NULL REFERENCES returnable_packaging_types(id),
    date TEXT NOT NULL DEFAULT (datetime('now')),
    movement_type TEXT NOT NULL CHECK (movement_type IN ('initial', 'entry', 'exit', 'breakage', 'loss', 'correction_in', 'correction_out')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    stock_before INTEGER NULL CHECK (stock_before IS NULL OR stock_before >= 0),
    stock_after INTEGER NOT NULL CHECK (stock_after >= 0),
    reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
    reference_document TEXT NULL
);

CREATE TABLE IF NOT EXISTS cash_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    opening_key TEXT NOT NULL UNIQUE,
    closing_key TEXT NULL UNIQUE,
    opened_at TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at TEXT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    opening_cash INTEGER NOT NULL CHECK (opening_cash >= 0),
    theoretical_cash INTEGER NULL,
    physical_cash INTEGER NULL CHECK (physical_cash IS NULL OR physical_cash >= 0),
    difference INTEGER NULL,
    closing_notes TEXT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_session_single_open ON cash_sessions(status) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    request_key TEXT NOT NULL UNIQUE,
    client_id INTEGER NULL REFERENCES clients(id),
    sale_type TEXT NOT NULL CHECK (sale_type IN ('cash', 'credit')),
    price_tier TEXT NOT NULL DEFAULT 'retail' CHECK (price_tier IN ('wholesale', 'semi_wholesale', 'retail')),
    subtotal_merchandise INTEGER NOT NULL CHECK (subtotal_merchandise >= 0),
    discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    total_merchandise INTEGER NOT NULL CHECK (total_merchandise >= 0),
    total_deposit INTEGER NOT NULL DEFAULT 0 CHECK (total_deposit >= 0),
    total_amount INTEGER NOT NULL CHECK (total_amount > 0),
    paid_amount INTEGER NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    status TEXT NOT NULL DEFAULT 'validated' CHECK (status IN ('validated', 'cancelled', 'partially_returned', 'returned')),
    notes TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_client ON sales(client_id);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);

CREATE TABLE IF NOT EXISTS sale_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    packaging_id INTEGER NOT NULL REFERENCES product_packagings(id),
    product_name TEXT NOT NULL,
    packaging_name TEXT NOT NULL,
    base_unit TEXT NOT NULL,
    coefficient_milli INTEGER NOT NULL CHECK (coefficient_milli > 0),
    quantity_milli INTEGER NOT NULL CHECK (quantity_milli > 0),
    base_quantity_milli INTEGER NOT NULL CHECK (base_quantity_milli > 0),
    unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
    discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    line_total INTEGER NOT NULL CHECK (line_total >= 0),
    cost_num TEXT NULL,
    cost_den TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_sale_lines_sale ON sale_lines(sale_id);

CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    request_key TEXT NOT NULL UNIQUE,
    sale_id INTEGER NULL REFERENCES sales(id),
    client_id INTEGER NULL REFERENCES clients(id),
    payment_kind TEXT NOT NULL CHECK (payment_kind IN ('sale', 'receivable', 'supplier_debt', 'refund')),
    total_amount INTEGER NOT NULL CHECK (total_amount > 0),
    note TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payment_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id INTEGER NOT NULL REFERENCES payments(id),
    method_code TEXT NOT NULL REFERENCES payment_methods(code),
    amount INTEGER NOT NULL CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_payment_parts_payment ON payment_parts(payment_id);

CREATE TABLE IF NOT EXISTS customer_receivables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL UNIQUE REFERENCES sales(id),
    client_id INTEGER NOT NULL REFERENCES clients(id),
    initial_amount INTEGER NOT NULL CHECK (initial_amount > 0),
    remaining_amount INTEGER NOT NULL CHECK (remaining_amount >= 0 AND remaining_amount <= initial_amount),
    due_date TEXT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'paid', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_receivables_client ON customer_receivables(client_id);

CREATE TABLE IF NOT EXISTS payment_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id INTEGER NOT NULL REFERENCES payments(id),
    receivable_id INTEGER NOT NULL REFERENCES customer_receivables(id),
    amount INTEGER NOT NULL CHECK (amount > 0)
);

CREATE TABLE IF NOT EXISTS cash_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES cash_sessions(id),
    request_key TEXT NOT NULL UNIQUE,
    payment_part_id INTEGER NULL REFERENCES payment_parts(id),
    kind TEXT NOT NULL CHECK (kind IN ('sale', 'receivable', 'expense', 'supplier_payment', 'deposit_refund', 'sale_refund', 'income', 'outflow')),
    method_code TEXT NOT NULL REFERENCES payment_methods(code),
    direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    description TEXT NOT NULL,
    reference_document TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_session ON cash_movements(session_id);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    request_key TEXT NOT NULL UNIQUE,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('draft', 'confirmed', 'partial', 'received', 'cancelled')),
    total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
    received_amount INTEGER NOT NULL DEFAULT 0 CHECK (received_amount >= 0),
    expected_date TEXT NULL,
    notes TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    packaging_id INTEGER NOT NULL REFERENCES product_packagings(id),
    product_name TEXT NOT NULL,
    packaging_name TEXT NOT NULL,
    base_unit TEXT NOT NULL,
    coefficient_milli INTEGER NOT NULL CHECK (coefficient_milli > 0),
    ordered_quantity_milli INTEGER NOT NULL CHECK (ordered_quantity_milli > 0),
    received_quantity_milli INTEGER NOT NULL DEFAULT 0 CHECK (received_quantity_milli >= 0 AND received_quantity_milli <= ordered_quantity_milli),
    unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
    line_total INTEGER NOT NULL CHECK (line_total >= 0)
);

CREATE TABLE IF NOT EXISTS purchase_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    request_key TEXT NOT NULL UNIQUE,
    purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
    total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
    notes TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_receipt_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id INTEGER NOT NULL REFERENCES purchase_receipts(id),
    purchase_order_line_id INTEGER NOT NULL REFERENCES purchase_order_lines(id),
    quantity_milli INTEGER NOT NULL CHECK (quantity_milli > 0),
    base_quantity_milli INTEGER NOT NULL CHECK (base_quantity_milli > 0),
    unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
    amount INTEGER NOT NULL CHECK (amount >= 0),
    discrepancy_reason TEXT NULL
);

CREATE TABLE IF NOT EXISTS supplier_debts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id INTEGER NOT NULL UNIQUE REFERENCES purchase_receipts(id),
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    initial_amount INTEGER NOT NULL CHECK (initial_amount >= 0),
    remaining_amount INTEGER NOT NULL CHECK (remaining_amount >= 0 AND remaining_amount <= initial_amount),
    due_date TEXT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'paid')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    movement_type TEXT NOT NULL CHECK (movement_type IN ('purchase_in', 'sale_out', 'sale_cancel_in', 'return_in', 'inventory_adjust', 'manual_adjust')),
    quantity_milli INTEGER NOT NULL,
    stock_before_milli INTEGER NOT NULL,
    stock_after_milli INTEGER NOT NULL,
    unit_cost INTEGER NULL,
    reason TEXT NULL,
    reference_document TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at);

CREATE TABLE IF NOT EXISTS inventories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'validated', 'cancelled')),
    notes TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    validated_at TEXT NULL
);

CREATE TABLE IF NOT EXISTS inventory_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inventory_id INTEGER NOT NULL REFERENCES inventories(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    theoretical_milli INTEGER NOT NULL,
    counted_milli INTEGER NULL CHECK (counted_milli IS NULL OR counted_milli >= 0),
    reason TEXT NULL,
    UNIQUE (inventory_id, product_id)
);

CREATE TABLE IF NOT EXISTS customer_packaging_accounts (
    client_id INTEGER NOT NULL REFERENCES clients(id),
    returnable_id INTEGER NOT NULL REFERENCES returnable_packaging_types(id),
    balance_pieces INTEGER NOT NULL DEFAULT 0,
    deposit_held_amount INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (client_id, returnable_id)
);

CREATE TABLE IF NOT EXISTS deposit_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    sale_line_id INTEGER NOT NULL REFERENCES sale_lines(id),
    client_id INTEGER NULL REFERENCES clients(id),
    returnable_id INTEGER NOT NULL REFERENCES returnable_packaging_types(id),
    pieces INTEGER NOT NULL CHECK (pieces > 0),
    returned_pieces INTEGER NOT NULL DEFAULT 0 CHECK (returned_pieces >= 0 AND returned_pieces <= pieces),
    unit_value INTEGER NOT NULL CHECK (unit_value >= 0),
    amount INTEGER NOT NULL CHECK (amount >= 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deposit_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    request_key TEXT NOT NULL UNIQUE,
    issue_id INTEGER NULL REFERENCES deposit_issues(id),
    client_id INTEGER NULL REFERENCES clients(id),
    returnable_id INTEGER NOT NULL REFERENCES returnable_packaging_types(id),
    session_id INTEGER NOT NULL REFERENCES cash_sessions(id),
    stock_movement_id INTEGER NOT NULL REFERENCES returnable_stock_movements(id),
    pieces INTEGER NOT NULL CHECK (pieces > 0),
    condition_state TEXT NOT NULL DEFAULT 'good' CHECK (condition_state IN ('good', 'damaged')),
    refund_amount INTEGER NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
    credit_reduction INTEGER NOT NULL DEFAULT 0 CHECK (credit_reduction >= 0),
    method_code TEXT NOT NULL REFERENCES payment_methods(code),
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales_cancellations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL UNIQUE REFERENCES sales(id),
    session_id INTEGER NOT NULL REFERENCES cash_sessions(id),
    request_key TEXT NOT NULL UNIQUE,
    reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
    refund_method_code TEXT NULL REFERENCES payment_methods(code),
    refunded_amount INTEGER NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    credit_note_ref TEXT NOT NULL UNIQUE,
    request_key TEXT NOT NULL UNIQUE,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    session_id INTEGER NOT NULL REFERENCES cash_sessions(id),
    total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
    credit_reduction INTEGER NOT NULL DEFAULT 0 CHECK (credit_reduction >= 0),
    refund_amount INTEGER NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
    refund_method_code TEXT NULL REFERENCES payment_methods(code),
    restock_approved INTEGER NOT NULL DEFAULT 1 CHECK (restock_approved IN (0, 1)),
    reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales_return_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_id INTEGER NOT NULL REFERENCES sales_returns(id),
    sale_line_id INTEGER NOT NULL REFERENCES sale_lines(id),
    base_quantity_milli INTEGER NOT NULL CHECK (base_quantity_milli > 0),
    amount INTEGER NOT NULL CHECK (amount >= 0)
);

CREATE TABLE IF NOT EXISTS expense_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL UNIQUE,
    request_key TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    method_code TEXT NOT NULL REFERENCES payment_methods(code),
    session_id INTEGER NOT NULL REFERENCES cash_sessions(id),
    beneficiary TEXT NULL,
    notes TEXT NULL,
    receipt_path TEXT NULL,
    expense_date TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NULL,
    details TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
