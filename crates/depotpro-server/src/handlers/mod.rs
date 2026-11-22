// ============================================================================
// Regroupement des handlers HTTP Axum par domaine métier
// ============================================================================

use axum::response::{IntoResponse, Json};

pub(crate) mod auth;
pub(crate) mod backups;
pub(crate) mod cash_and_reports;
pub(crate) mod commercial_documents;
pub(crate) mod catalogue_disposables;
pub(crate) mod catalogue_price_items_and_history;
pub(crate) mod catalogue_refs;
pub(crate) mod catalogue_units;
pub(crate) mod catalogue_v3;
pub(crate) mod catalogue_v4;
pub(crate) mod catalogue_variants_and_prices;
pub(crate) mod consignments;
pub(crate) mod orders;
pub(crate) mod orders_packaging;
pub(crate) mod packaging_components;
pub(crate) mod partial_returns_and_validation;
pub(crate) mod products;
pub(crate) mod products_presets;
pub(crate) mod purchases;
pub(crate) mod sales;
pub(crate) mod stock;

pub(crate) async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "status": "ok", "engine": "depotpro-axum" }))
}
