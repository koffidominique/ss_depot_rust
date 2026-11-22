// ============================================================================
// Routes Axum : Commandes mixtes, emballages physiques & dépôts clients
// ============================================================================

use axum::routing::{get, patch, post};
use axum::Router;

use crate::handlers::{catalogue_variants_and_prices, orders, orders_packaging, products};
use crate::state::AppState;

pub(crate) fn orders_and_variants_router() -> Router<AppState> {
    Router::new()
        // Compléments catalogue §7.1
        .route(
            "/api/products/:id/variants",
            get(products::list_product_variants_by_product),
        )
        .route(
            "/api/variants/:id",
            patch(catalogue_variants_and_prices::update_product_variant),
        )
        .route(
            "/api/variants/:id/packagings",
            post(orders_packaging::add_variant_packaging),
        )
        .route(
            "/api/variants/:id/prices",
            post(orders_packaging::add_variant_price),
        )
        // Commandes mixtes §7.2 & §7.4
        .route("/api/orders/compose-preview", post(orders::compose_preview))
        .route(
            "/api/orders",
            get(orders::list_orders).post(orders::create_order),
        )
        .route(
            "/api/orders/:id",
            get(orders::get_order).patch(orders::update_order),
        )
        .route("/api/orders/:id/receipt", post(orders::issue_order_receipt))
        .route(
            "/api/orders/:id/receipts",
            get(orders::list_order_receipts).post(orders::revise_order_receipt),
        )
        .route("/api/orders/:id/confirm", post(orders::confirm_order))
        .route("/api/orders/:id/deliver", post(orders::deliver_order))
        .route("/api/orders/:id/invoice", post(orders::invoice_order))
        .route("/api/orders/:id/pay", post(orders::pay_order))
        .route("/api/orders/:id/cancel", post(orders::cancel_order))
        .route(
            "/api/orders/:id/returns",
            post(orders::return_order_packaging),
        )
        // Emballages physiques & dépôts clients §7.3
        .route(
            "/api/packaging/assets",
            get(orders_packaging::list_packaging_assets),
        )
        .route(
            "/api/packaging/stock",
            get(orders_packaging::get_packaging_stock),
        )
        .route(
            "/api/customers/:id/deposits",
            get(orders_packaging::get_customer_deposits),
        )
        .route(
            "/api/customers/:id/deposits/history",
            get(orders_packaging::get_customer_deposit_history),
        )
        .route(
            "/api/customers/:id/deposits/returns",
            post(orders_packaging::return_customer_deposits),
        )
}
