// ============================================================================
// Sauvegardes cohérentes, vérification lecture seule, chiffrement & restauration
// ============================================================================

use serde::Serialize;

mod create_and_list;
mod crypto;
mod local_db_info;
mod paths;
mod restore;
mod restore_engine;
mod sha256;
mod verify;

pub use create_and_list::{
    create_backup_summary, create_consistent_backup, list_backups, read_backup_bytes, verify_backup,
};
pub use crypto::{
    create_encrypted_backup, decrypt_backup_bytes, encrypt_backup_bytes,
    restore_encrypted_backup_and_reconnect, verify_encrypted_backup,
};
pub use local_db_info::{import_backup_bytes, inspect_local_db, LocalDbStatusDto};
pub use paths::{is_valid_backup_filename, resolve_safe_backup_path};
pub use restore::{restore_and_reconnect, restore_and_reconnect_with_hook, restore_backup};
pub use sha256::{sha256_bytes, sha256_file};
pub use verify::{collect_entity_counts, open_backup_read_only, verify_backup_path_read_only};

pub const MAX_RETAINED_BACKUPS: usize = 30;
pub const BACKUP_FORMAT_V3: &str = "sqlite3-depotpro-v3";
pub const MIN_APP_VERSION: &str = "3.0.0";
pub(crate) const SQLITE_HEADER_MAGIC: &[u8; 16] = b"SQLite format 3\0";
pub const ENCRYPTED_BACKUP_MAGIC: &[u8; 8] = b"DPBKP01\0";
pub const ENCRYPTED_BACKUP_VERSION: u16 = 1;
pub const ENCRYPTED_PBKDF2_ITERATIONS: u32 = 100_000;
pub(crate) const MIN_BACKUP_PASSPHRASE_LEN: usize = 8;

pub const REQUIRED_CORE_TABLES: &[&str] = &[
    "schema_version",
    "app_settings",
    "owner_security",
    "categories",
    "payment_methods",
    "suppliers",
    "products",
    "product_packagings",
    "clients",
    "sales",
    "sale_lines",
    "payments",
    "payment_parts",
    "sales_returns",
    "customer_receivables",
    "purchase_orders",
    "purchase_order_lines",
    "purchase_receipts",
    "supplier_debts",
    "stock_movements",
    "cash_sessions",
    "cash_movements",
    "expenses",
    "returnable_packaging_types",
    "returnable_stock_movements",
    "audit_logs",
    "document_sequences",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFileDto {
    pub name: String,
    pub size: u64,
    pub created_at: String,
    pub integrity: Option<String>,
    pub sha256: Option<String>,
    pub encrypted: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntityCounts {
    pub products: i64,
    pub stock_movements: i64,
    pub clients: i64,
    pub suppliers: i64,
    pub sales: i64,
    pub sales_returns: i64,
    pub customer_receivables: i64,
    pub purchase_orders: i64,
    pub purchase_receipts: i64,
    pub supplier_debts: i64,
    pub returnable_stock_movements: i64,
    pub cash_movements: i64,
    pub expenses: i64,
    pub audit_logs: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupVerifyDto {
    pub name: String,
    pub integrity: String,
    pub foreign_key_errors: usize,
    pub schema_version: i64,
    pub applied_versions: Vec<i64>,
    pub backup_format: String,
    pub min_app_version: String,
    pub compatible: bool,
    pub compatibility_reason: Option<String>,
    pub sha256: String,
    pub counts: Option<BackupEntityCounts>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRestoreDto {
    pub restored: String,
    pub safety_backup: String,
    pub restored_sha256: String,
    pub integrity: String,
    pub foreign_key_errors: usize,
    pub schema_version: i64,
    pub counts: BackupEntityCounts,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RestoreFailureHook {
    None,
    BeforeAtomicReplace,
    BeforeReconnect,
    AfterReconnectPostVerify,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::db::DepotDb;
    use std::path::Path;

    #[allow(dead_code)]
    fn assert_backup_futures_are_send(
        db: &DepotDb,
        dir: &Path,
        lock: &tokio::sync::RwLock<DepotDb>,
    ) {
        fn assert_send<F: std::future::Future + Send>(_: F) {}
        assert_send(open_backup_read_only(dir));
        assert_send(create_backup_summary(db, dir));
        assert_send(create_encrypted_backup(db, dir, "MotDePasseTest123"));
        assert_send(verify_backup(dir, "dummy.db"));
        assert_send(verify_encrypted_backup(
            dir,
            "dummy.dpbkp",
            "MotDePasseTest123",
        ));
        assert_send(restore_and_reconnect(lock, dir, "dummy.db"));
        assert_send(restore_encrypted_backup_and_reconnect(
            lock,
            dir,
            "dummy.dpbkp",
            "MotDePasseTest123",
        ));
    }

    #[test]
    fn sha256_matches_nist_vectors() {
        assert_eq!(
            sha256_bytes(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            sha256_bytes(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn encrypted_backup_envelope_roundtrip_and_tamper_detection() {
        let payload = b"SQLite format 3\0test payload for aes-256-gcm verification";
        let blob = encrypt_backup_bytes(payload, "CleSecrete2026!").expect("encrypt ok");
        let (dec, _) = decrypt_backup_bytes(&blob, "CleSecrete2026!").expect("decrypt ok");
        assert_eq!(dec, payload);

        assert!(decrypt_backup_bytes(&blob, "MauvaiseCle!").is_err());

        let mut tampered = blob.clone();
        let last = tampered.len() - 1;
        tampered[last] ^= 0x01;
        assert!(decrypt_backup_bytes(&tampered, "CleSecrete2026!").is_err());
    }

    #[test]
    fn backup_filename_allowlist_rejects_traversal_and_invalid_names() {
        assert!(is_valid_backup_filename(
            "depotpro_backup_20261117123045_a1b2c3.db"
        ));
        assert!(is_valid_backup_filename(
            "depotpro_backup_20261117123045_a1b2c3.dpbkp"
        ));
        assert!(is_valid_backup_filename(
            "depotpro_backup_20250101000000_stale0.db"
        ));
        assert!(!is_valid_backup_filename(
            "../depotpro_backup_20261117123045_a1b2c3.db"
        ));
        assert!(!is_valid_backup_filename(
            "sub/depotpro_backup_20261117123045_a1b2c3.db"
        ));
        assert!(!is_valid_backup_filename("depotpro_v3.db"));
        assert!(!is_valid_backup_filename("depotpro_backup_bad_a1b2c3.db"));
    }
}
