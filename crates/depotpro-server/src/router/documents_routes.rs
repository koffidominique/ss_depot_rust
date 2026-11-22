// ============================================================================
// Routes Axum : archive documentaire commerciale
// ============================================================================

use axum::routing::{get, post};
use axum::Router;

use crate::handlers::documents;
use crate::state::AppState;

pub(crate) fn document_archive_router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/document-archive",
            get(documents::list_document_archive),
        )
        .route(
            "/api/document-archive/:id",
            get(documents::get_document_archive),
        )
        .route(
            "/api/document-archive/sales/:id",
            post(documents::archive_sale_document),
        )
        .route(
            "/api/document-archive/orders/:id",
            post(documents::archive_order_document),
        )
}
