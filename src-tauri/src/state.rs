use depotpro_core::application::auth::SessionStore;
use depotpro_core::infrastructure::db::DepotDb;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct DesktopState {
    pub db: Arc<RwLock<DepotDb>>,
    pub backup_dir: PathBuf,
    pub lock_path: PathBuf,
    pub sessions: Arc<RwLock<SessionStore>>,
}

impl DesktopState {
    pub fn new(db: DepotDb, backup_dir: PathBuf, lock_path: PathBuf) -> Self {
        Self {
            db: Arc::new(RwLock::new(db)),
            backup_dir,
            lock_path,
            sessions: Arc::new(RwLock::new(SessionStore::default())),
        }
    }

    pub async fn db(&self) -> DepotDb {
        self.db.read().await.clone()
    }
}
