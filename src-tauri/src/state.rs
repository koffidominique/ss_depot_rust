use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use depotpro_core::infrastructure::db::DepotDb;

pub struct DesktopState {
    pub db: Arc<RwLock<DepotDb>>,
    pub backup_dir: PathBuf,
    pub lock_path: PathBuf,
    pub tokens: Arc<RwLock<HashSet<String>>>,
}

impl DesktopState {
    pub fn new(db: DepotDb, backup_dir: PathBuf, lock_path: PathBuf) -> Self {
        Self {
            db: Arc::new(RwLock::new(db)),
            backup_dir,
            lock_path,
            tokens: Arc::new(RwLock::new(HashSet::new())),
        }
    }

    pub async fn db(&self) -> DepotDb {
        self.db.read().await.clone()
    }
}
