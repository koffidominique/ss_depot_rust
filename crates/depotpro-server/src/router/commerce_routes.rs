// ============================================================================
// Routes Axum : Authentification, produits, commerce, emballages & système
// ============================================================================

use axum::routing::{get, post, put};
use axum::Router;

use crate::handlers::{
    auth, backups, cash_and_reports, consignments, health, packaging_components,
    partial_returns_and_validation, products, purchases, sales, stock,
};
use crate::state::AppState;

pub(crate) fn core_and_commerce_router() -> Router<AppState> {
    Router::new()
        // Santé, authentification & tableau de bord
        .route("/api/health", get(health))
        .route("/api/auth/status", get(auth::auth_status))
        .route("/api/auth/setup", post(auth::auth_setup))
        .route("/api/auth/login", post(auth::auth_login))
        .route("/api/auth/me", get(auth::auth_me))
        .route("/api/auth/lock", post(auth::auth_lock))
        .route("/api/auth/change-pin", post(auth::auth_change_pin))
        .route(
            "/api/auth/users",
            get(auth::auth_list_users).post(auth::auth_create_user),
        )
        .route("/api/auth/users/:id/status", put(auth::auth_toggle_user))
        .route("/api/dashboard", get(auth::dashboard))
        // Produits & catégories
        .route(
            "/api/categories",
            get(products::list_categories).post(products::create_category),
        )
        .route(
            "/api/products",
            get(products::list_products).post(products::create_product),
        )
        .route("/api/products/:id", put(products::update_product))
        .route(
            "/api/products/:id/packagings",
            post(products::upsert_packaging),
        )
        .route(
            "/api/products/export/csv",
            get(products::export_products_csv),
        )
        .route(
            "/api/products/import/csv",
            post(products::import_products_csv),
        )
        // Ventes, clients & créances
        .route(
            "/api/clients",
            get(sales::list_clients).post(sales::create_client),
        )
        .route("/api/clients/:id", put(sales::update_client))
        .route("/api/clients/:id/credit", put(sales::update_client_credit))
        .route(
            "/api/sales",
            get(sales::list_sales).post(sales::create_sale),
        )
        .route("/api/sales/:id", get(sales::get_sale))
        .route("/api/sales/:id/cancel", post(sales::cancel_sale))
        .route("/api/sales/:id/returns", post(sales::return_sale))
        .route("/api/receivables", get(cash_and_reports::list_receivables))
        .route(
            "/api/receivables/:id/pay",
            post(cash_and_reports::pay_receivable),
        )
        // Achats & fournisseurs
        .route(
            "/api/suppliers",
            get(purchases::list_suppliers).post(purchases::create_supplier),
        )
        .route("/api/suppliers/:id", put(purchases::update_supplier))
        .route(
            "/api/purchases",
            get(purchases::list_purchases).post(purchases::create_purchase),
        )
        .route(
            "/api/purchases/:id/receive",
            post(purchases::receive_purchase),
        )
        .route(
            "/api/purchases/:id/cancel",
            post(purchases::cancel_purchase),
        )
        .route("/api/supplier-debts", get(purchases::list_supplier_debts))
        .route(
            "/api/supplier-debts/:id/pay",
            post(purchases::pay_supplier_debt),
        )
        // Stock & inventaires
        .route("/api/stock", get(stock::stock_overview))
        .route("/api/stock/adjust", post(stock::adjust_stock))
        .route(
            "/api/inventories",
            get(stock::list_inventories).post(stock::create_inventory),
        )
        .route(
            "/api/inventories/:id/validate",
            post(stock::validate_inventory),
        )
}

pub(crate) fn packaging_and_system_router() -> Router<AppState> {
    Router::new()
        // Consignations & obligations financières
        .route(
            "/api/consignments",
            get(consignments::consignments_overview),
        )
        .route(
            "/api/consignments/types",
            post(consignments::create_returnable_type),
        )
        .route(
            "/api/consignments/stock-movements",
            post(consignments::adjust_returnable_stock),
        )
        .route(
            "/api/consignments/returns",
            post(consignments::return_client_empties),
        )
        .route(
            "/api/packaging-obligations",
            get(consignments::packaging_obligations_list),
        )
        .route(
            "/api/packaging-obligations/dashboard/:client_id",
            get(consignments::packaging_dashboard),
        )
        .route(
            "/api/packaging-obligations/pay",
            post(consignments::packaging_pay_debt),
        )
        // Composants emballages, retours partiels & validation POS
        .route(
            "/api/packaging-components",
            get(packaging_components::packaging_components_overview),
        )
        .route(
            "/api/packaging-components/crate-components",
            get(packaging_components::list_crate_components)
                .post(packaging_components::create_crate_component),
        )
        .route(
            "/api/packaging-components/stock",
            get(packaging_components::packaging_stock_overview)
                .put(packaging_components::update_component_stock),
        )
        .route(
            "/api/packaging-components/assemble",
            post(packaging_components::assemble_crates),
        )
        .route(
            "/api/packaging-components/disassemble",
            post(packaging_components::disassemble_crates),
        )
        .route(
            "/api/packaging-components/bottle-profiles",
            get(packaging_components::list_bottle_profiles_pc)
                .post(packaging_components::create_bottle_profile_pc),
        )
        .route(
            "/api/packaging-components/crate-types",
            get(packaging_components::list_crate_types_pc)
                .post(packaging_components::create_crate_type_pc),
        )
        .route(
            "/api/partial-returns",
            get(partial_returns_and_validation::partial_returns_overview)
                .post(partial_returns_and_validation::create_partial_return),
        )
        .route(
            "/api/partial-returns/pending",
            get(partial_returns_and_validation::list_pending_partial_returns),
        )
        .route(
            "/api/partial-returns/pending/:client_id/:sale_id",
            post(partial_returns_and_validation::create_pending_partial_return),
        )
        .route(
            "/api/partial-returns/pending/update",
            put(partial_returns_and_validation::update_pending_partial_return),
        )
        .route(
            "/api/sales-validation/config/:terminal_id",
            get(partial_returns_and_validation::get_pos_validation_config),
        )
        .route(
            "/api/sales-validation/config",
            put(partial_returns_and_validation::update_pos_validation_config),
        )
        .route(
            "/api/sales-validation/validate",
            post(partial_returns_and_validation::validate_sale_compatibility),
        )
        .route(
            "/api/sales-validation/rules",
            get(partial_returns_and_validation::list_compatibility_rules)
                .post(partial_returns_and_validation::create_compatibility_rule),
        )
        // Caisse, dépenses, rapports, PDF, paramètres & sauvegardes
        .route("/api/cash", get(cash_and_reports::cash_status))
        .route("/api/cash/open", post(cash_and_reports::open_cash))
        .route("/api/cash/close", post(cash_and_reports::close_cash))
        .route(
            "/api/expenses",
            get(cash_and_reports::list_expenses).post(cash_and_reports::create_expense),
        )
        .route("/api/reports", get(cash_and_reports::reports_overview))
        .route(
            "/api/documents/pdf",
            post(cash_and_reports::generate_document_pdf),
        )
        .route(
            "/api/settings",
            get(cash_and_reports::get_settings).put(cash_and_reports::update_settings),
        )
        .route(
            "/api/payment-methods",
            post(cash_and_reports::add_payment_method),
        )
        .route(
            "/api/payment-methods/:code",
            put(cash_and_reports::toggle_payment_method),
        )
        .route(
            "/api/backups",
            get(backups::list_backups).post(backups::create_backup),
        )
        .route(
            "/api/backups/encrypted",
            post(backups::create_encrypted_backup),
        )
        .route("/api/backups/:name/verify", get(backups::verify_backup))
        .route(
            "/api/backups/:name/verify-encrypted",
            post(backups::verify_encrypted_backup),
        )
        .route("/api/backups/:name/download", get(backups::download_backup))
        .route("/api/backups/:name/restore", post(backups::restore_backup))
        .route(
            "/api/backups/:name/restore-encrypted",
            post(backups::restore_encrypted_backup),
        )
}
