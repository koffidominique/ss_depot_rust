// ============================================================================
// Point d'entrée serveur HTTP Axum DEPOTPRO
// ============================================================================

use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::RwLock;

use depotpro_core::application::auth::SessionStore;
use depotpro_core::infrastructure::db::DepotDb;

mod dto;
mod handlers;
mod router;
mod security;
mod state;
#[cfg(test)]
mod tests;

use router::build_router;
use state::{AppState, AuthRateLimiter};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    let db_path = std::env::var("DEPOTPRO_DB_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("./data/depotpro_v3.db"));
    let backup_dir = std::env::var("DEPOTPRO_BACKUP_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("./data/Sauvegardes"));

    let db = DepotDb::connect(&db_path)
        .await
        .expect("Impossible de connecter SQLite via SQLx");

    let state = AppState {
        db: Arc::new(RwLock::new(db)),
        backup_dir,
        sessions: Arc::new(RwLock::new(SessionStore::default())),
        auth_limiter: Arc::new(RwLock::new(AuthRateLimiter::default())),
    };

    let app = build_router(state);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);
    let host: IpAddr = std::env::var("DEPOTPRO_HOST")
        .ok()
        .and_then(|h| h.parse().ok())
        .unwrap_or_else(|| IpAddr::from([127, 0, 0, 1]));
    let addr = SocketAddr::from((host, port));
    tracing::info!("DEPOTPRO Axum server listening on http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .unwrap();
}
