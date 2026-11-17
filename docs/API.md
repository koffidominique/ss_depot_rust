# CONTRATS API HTTP & COMMANDES TAURI

## Endpoints HTTP (`/api/*`)

- Auth : `GET /api/auth/status`, `POST /api/auth/setup`, `POST /api/auth/login`, `POST /api/auth/lock`, `POST /api/auth/change-pin`
- Pilotage : `GET /api/dashboard`, `GET /api/reports?from=&to=`
- Catalogue : `GET /api/categories`, `POST /api/categories`, `GET /api/products`, `POST /api/products`, `PUT /api/products/:id`, `POST /api/products/:id/packagings`, `GET /api/products/export/csv`, `POST /api/products/import/csv`
- Clients & Ventes : `GET /api/clients`, `POST /api/clients`, `PUT /api/clients/:id/credit`, `GET /api/sales`, `GET /api/sales/:id`, `POST /api/sales`, `POST /api/sales/:id/cancel`, `POST /api/sales/:id/returns`
- Créances : `GET /api/receivables`, `POST /api/receivables/:id/pay`
- Fournisseurs & Achats : `GET /api/suppliers`, `POST /api/suppliers`, `GET /api/purchases`, `POST /api/purchases`, `POST /api/purchases/:id/receive`, `GET /api/supplier-debts`, `POST /api/supplier-debts/:id/pay`
- Stock & Inventaires : `GET /api/stock`, `GET /api/inventories`, `POST /api/inventories`, `POST /api/inventories/:id/validate`
- Consignations : `GET /api/consignments`, `POST /api/consignments/types`, `POST /api/consignments/stock-movements`, `POST /api/consignments/returns`
- Caisse & Dépenses : `GET /api/cash`, `POST /api/cash/open`, `POST /api/cash/close`, `GET /api/expenses`, `POST /api/expenses`
- Paramètres & Sauvegardes : `GET /api/settings`, `PUT /api/settings`, `POST /api/payment-methods`, `PUT /api/payment-methods/:code`, `GET /api/backups`, `POST /api/backups`, `GET /api/backups/:name/verify`, `GET /api/backups/:name/download`, `POST /api/backups/:name/restore`

## Parité Rust Axum & Commandes IPC Tauri 2

- **Axum (`crates/depotpro-server/src/main.rs`)** : expose l'ensemble des routes REST `/api/*` (strictement liées sur `127.0.0.1`) adossées aux services `depotpro-core` (`auth`, `products`, `sales`, `purchases`, `cash`, `inventory`, `consignments`, `reports`, `backup`).
- **Tauri 2 (`src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`)** : enregistre toutes les commandes invoquées par `TauriApiClient.ts` (`auth_status`, `auth_setup_pin`, `auth_login`, `auth_lock`, `change_owner_pin`, `list_categories`, `create_category`, `list_products`, `create_product`, `update_product`, `upsert_packaging`, `export_products_csv`, `import_products_csv`, `list_clients`, `create_client`, `update_client_credit`, `list_sales`, `get_sale_detail`, `create_sale`, `cancel_sale`, `create_sale_return`, `list_receivables`, `pay_receivable`, `list_suppliers`, `create_supplier`, `list_purchases`, `create_purchase_order`, `receive_purchase_order`, `list_supplier_debts`, `pay_supplier_debt`, `get_stock_overview`, `list_inventories`, `create_inventory`, `validate_inventory`, `get_consignments_overview`, `create_returnable_type`, `adjust_returnable_stock`, `return_client_empties`, `get_cash_status`, `open_cash_session`, `close_cash_session`, `list_expenses`, `create_expense`, `get_dashboard`, `get_reports`, `get_settings`, `update_settings`, `add_payment_method`, `toggle_payment_method`, `list_backups`, `create_backup`, `verify_backup`, `restore_backup`).

