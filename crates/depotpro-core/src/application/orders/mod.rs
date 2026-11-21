// ============================================================================
// Commandes clientèle mixtes, allocation de casiers & soldes de consigne
// ============================================================================

pub mod composition;
mod composition_resolve;
pub mod create_and_update;
mod create_helpers;
pub mod dtos;
pub mod lifecycle;
pub mod lifecycle_settlement;
pub mod packaging_and_returns;
pub mod queries;

pub use composition::{
    compose_order_allocations, compose_preview, compute_compatibility_class,
    compute_native_crate_capacity, compute_order_totals, link_lines_to_allocations,
};
pub use create_and_update::{create_order, update_order};
pub use dtos::*;
pub use lifecycle::{confirm_order, deliver_order};
pub use lifecycle_settlement::{cancel_order, invoice_order, pay_order};
pub use packaging_and_returns::{
    add_variant_price, get_customer_deposit_history, get_customer_deposits, get_packaging_stock,
    get_variant_product_id, list_packaging_assets, return_customer_deposits,
    return_order_packaging,
};
pub use queries::{get_order, list_orders};
