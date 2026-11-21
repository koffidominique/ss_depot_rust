// ============================================================================
// Assemblage du routeur HTTP Axum & middleware de sécurité
// ============================================================================

use std::path::PathBuf;

use axum::middleware;
use axum::Router;
use tower_http::services::{ServeDir, ServeFile};

use crate::security::security_middleware;
use crate::state::AppState;

mod catalogue_routes;
mod commerce_routes;
mod orders_routes;

pub(crate) fn build_router(state: AppState) -> Router {
    let mut app = Router::new()
        .merge(commerce_routes::core_and_commerce_router())
        .merge(catalogue_routes::catalogue_router())
        .merge(orders_routes::orders_and_variants_router())
        .merge(commerce_routes::packaging_and_system_router())
        .layer(middleware::from_fn_with_state(
            state.clone(),
            security_middleware,
        ))
        .with_state(state);

    let dist_dir = PathBuf::from("./dist");
    if dist_dir.exists() {
        let index_file = dist_dir.join("index.html");
        app = app.fallback_service(ServeDir::new(&dist_dir).fallback(ServeFile::new(index_file)));
    }
    app
}
