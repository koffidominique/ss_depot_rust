use std::collections::HashSet;
use std::fmt::Write as _;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::Serialize;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};

use crate::application::sales::audit_log_tx;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::{
    CURRENT_SCHEMA_VERSION, DepotDb, MIN_SUPPORTED_SCHEMA_VERSION,
};

pub const MAX_RETAINED_BACKUPS: usize = 30;
pub const BACKUP_FORMAT_V3: &str = "sqlite3-depotpro-v3";
pub const MIN_APP_VERSION: &str = "3.0.0";
const SQLITE_HEADER_MAGIC: &[u8; 16] = b"SQLite format 3\0";

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

pub fn sha256_bytes(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize_hex()
}

pub fn sha256_file(path: &Path) -> CoreResult<String> {
    let mut file = File::open(path)
        .map_err(|e| CoreError::Internal(format!("Calcul SHA-256 impossible : {e}")))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65_536];
    loop {
        let n = file
            .read(&mut buf)
            .map_err(|e| CoreError::Internal(format!("Lecture archive impossible : {e}")))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize_hex())
}

struct Sha256 {
    state: [u32; 8],
    buffer: [u8; 64],
    buffer_len: usize,
    total_bits: u64,
}

impl Sha256 {
    const K: [u32; 64] = [
        0x428a_2f98, 0x7137_4491, 0xb5c0_fbcf, 0xe9b5_dba5, 0x3956_c25b, 0x59f1_11f1, 0x923f_82a4,
        0xab1c_5ed5, 0xd807_aa98, 0x1283_5b01, 0x2431_85be, 0x550c_7dc3, 0x72be_5d74, 0x80de_b1fe,
        0x9bdc_06a7, 0xc19b_f174, 0xe49b_69c1, 0xefbe_4786, 0x0fc1_9dc6, 0x240c_a1cc, 0x2de9_2c6f,
        0x4a74_84aa, 0x5cb0_a9dc, 0x76f9_88da, 0x983e_5152, 0xa831_c66d, 0xb003_27c8, 0xbf59_7fc7,
        0xc6e0_0bf3, 0xd5a7_9147, 0x06ca_6351, 0x1429_2967, 0x27b7_0a85, 0x2e1b_2138, 0x4d2c_6dfc,
        0x5338_0d13, 0x650a_7354, 0x766a_0abb, 0x81c2_c92e, 0x9272_2c85, 0xa2bf_e8a1, 0xa81a_664b,
        0xc24b_8b70, 0xc76c_51a3, 0xd192_e819, 0xd699_0624, 0xf40e_3585, 0x106a_a070, 0x19a4_c116,
        0x1e37_6c08, 0x2748_774c, 0x34b0_bcb5, 0x391c_0cb3, 0x4ed8_aa4a, 0x5b9c_ca4f, 0x682e_6ff3,
        0x748f_82ee, 0x78a5_636f, 0x84c8_7814, 0x8cc7_0208, 0x90be_fffa, 0xa450_6ceb, 0xbef9_a3f7,
        0xc671_78f2,
    ];

    fn new() -> Self {
        Self {
            state: [
                0x6a09_e667,
                0xbb67_ae85,
                0x3c6e_f372,
                0xa54f_f53a,
                0x510e_527f,
                0x9b05_688c,
                0x1f83_d9ab,
                0x5be0_cd19,
            ],
            buffer: [0u8; 64],
            buffer_len: 0,
            total_bits: 0,
        }
    }

    fn update(&mut self, data: &[u8]) {
        self.total_bits = self.total_bits.wrapping_add((data.len() as u64) * 8);
        let mut offset = 0;
        if self.buffer_len > 0 {
            let need = 64 - self.buffer_len;
            if data.len() < need {
                self.buffer[self.buffer_len..self.buffer_len + data.len()].copy_from_slice(data);
                self.buffer_len += data.len();
                return;
            }
            self.buffer[self.buffer_len..64].copy_from_slice(&data[..need]);
            let block = self.buffer;
            self.compress(&block);
            self.buffer_len = 0;
            offset = need;
        }
        while offset + 64 <= data.len() {
            let mut block = [0u8; 64];
            block.copy_from_slice(&data[offset..offset + 64]);
            self.compress(&block);
            offset += 64;
        }
        if offset < data.len() {
            let rem = data.len() - offset;
            self.buffer[..rem].copy_from_slice(&data[offset..]);
            self.buffer_len = rem;
        }
    }

    fn compress(&mut self, block: &[u8; 64]) {
        let mut w = [0u32; 64];
        for (slot, chunk) in w[..16].iter_mut().zip(block.chunks_exact(4)) {
            *slot = u32::from_be_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }
        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = self.state;
        for (k, word) in Self::K.iter().zip(w.iter()) {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = h
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(*k)
                .wrapping_add(*word);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);
            h = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }
        self.state[0] = self.state[0].wrapping_add(a);
        self.state[1] = self.state[1].wrapping_add(b);
        self.state[2] = self.state[2].wrapping_add(c);
        self.state[3] = self.state[3].wrapping_add(d);
        self.state[4] = self.state[4].wrapping_add(e);
        self.state[5] = self.state[5].wrapping_add(f);
        self.state[6] = self.state[6].wrapping_add(g);
        self.state[7] = self.state[7].wrapping_add(h);
    }

    fn finalize_hex(mut self) -> String {
        let bit_len = self.total_bits;
        self.buffer[self.buffer_len] = 0x80;
        self.buffer_len += 1;
        if self.buffer_len > 56 {
            for b in &mut self.buffer[self.buffer_len..64] {
                *b = 0;
            }
            let block = self.buffer;
            self.compress(&block);
            self.buffer_len = 0;
        }
        for b in &mut self.buffer[self.buffer_len..56] {
            *b = 0;
        }
        self.buffer[56..64].copy_from_slice(&bit_len.to_be_bytes());
        let block = self.buffer;
        self.compress(&block);

        let mut out = String::with_capacity(64);
        for word in self.state {
            let _ = write!(&mut out, "{word:08x}");
        }
        out
    }
}

pub fn is_valid_backup_filename(filename: &str) -> bool {
    if filename.is_empty() || filename.len() > 128 {
        return false;
    }
    if filename.contains('/')
        || filename.contains('\\')
        || filename.contains('\0')
        || filename.contains("..")
        || filename.chars().any(char::is_whitespace)
    {
        return false;
    }
    let Some(rest) = filename.strip_prefix("depotpro_backup_") else {
        return false;
    };
    let Some(core) = rest.strip_suffix(".db") else {
        return false;
    };
    let bytes = core.as_bytes();
    if bytes.len() < 16 || bytes[14] != b'_' {
        return false;
    }
    if !bytes[..14].iter().all(u8::is_ascii_digit) {
        return false;
    }
    let suffix = &bytes[15..];
    !suffix.is_empty()
        && suffix.len() <= 32
        && suffix
            .iter()
            .all(|b| b.is_ascii_alphanumeric() || *b == b'_' || *b == b'-')
}

pub fn resolve_safe_backup_path(backup_dir: &Path, filename: &str) -> CoreResult<(String, PathBuf)> {
    if !is_valid_backup_filename(filename) {
        return Err(CoreError::Validation(
            "Nom de fichier de sauvegarde non autorisé.".to_string(),
        ));
    }

    std::fs::create_dir_all(backup_dir).map_err(|e| {
        CoreError::Internal(format!("Accès répertoire sauvegardes impossible : {e}"))
    })?;
    let canonical_dir = std::fs::canonicalize(backup_dir).map_err(|e| {
        CoreError::Internal(format!("Résolution répertoire sauvegardes impossible : {e}"))
    })?;

    let candidate = canonical_dir.join(filename);
    let sym_meta = std::fs::symlink_metadata(&candidate).map_err(|err| {
        if err.kind() == std::io::ErrorKind::NotFound {
            CoreError::Validation("Fichier de sauvegarde introuvable.".to_string())
        } else {
            CoreError::Validation(format!("Accès sauvegarde refusé : {err}"))
        }
    })?;

    if sym_meta.file_type().is_symlink() {
        return Err(CoreError::Validation(
            "Lien symbolique interdit dans le répertoire de sauvegarde.".to_string(),
        ));
    }
    if !sym_meta.is_file() {
        return Err(CoreError::Validation(
            "L'entrée de sauvegarde ciblée n'est pas un fichier régulier.".to_string(),
        ));
    }

    let canonical_file = std::fs::canonicalize(&candidate).map_err(|e| {
        CoreError::Validation(format!("Résolution canonique sauvegarde impossible : {e}"))
    })?;
    if canonical_file.parent() != Some(canonical_dir.as_path())
        || !canonical_file.starts_with(&canonical_dir)
    {
        return Err(CoreError::Validation(
            "Accès à un fichier hors du répertoire de sauvegarde interdit.".to_string(),
        ));
    }

    Ok((filename.to_string(), canonical_file))
}

fn validate_sqlite_archive_header(path: &Path) -> CoreResult<()> {
    let meta = std::fs::symlink_metadata(path).map_err(|e| {
        CoreError::Validation(format!("Impossible d'inspecter l'archive : {e}"))
    })?;
    if meta.file_type().is_symlink() || !meta.is_file() {
        return Err(CoreError::Validation(
            "L'archive doit être un fichier régulier non symbolique.".to_string(),
        ));
    }
    if meta.len() < 100 {
        return Err(CoreError::Validation(
            "Archive SQLite invalide ou tronquée (taille insuffisante).".to_string(),
        ));
    }
    let mut file = File::open(path).map_err(|e| {
        CoreError::Validation(format!("Ouverture archive impossible : {e}"))
    })?;
    let mut header = [0u8; 16];
    file.read_exact(&mut header).map_err(|e| {
        CoreError::Validation(format!("Lecture en-tête SQLite impossible : {e}"))
    })?;
    if &header != SQLITE_HEADER_MAGIC {
        return Err(CoreError::Validation(
            "Archive invalide : en-tête SQLite format 3 absent ou fichier corrompu.".to_string(),
        ));
    }
    Ok(())
}

pub async fn open_backup_read_only(path: &Path) -> CoreResult<SqlitePool> {
    validate_sqlite_archive_header(path)?;
    let opts = SqliteConnectOptions::new()
        .filename(path)
        .read_only(true)
        .create_if_missing(false);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .after_connect(|conn, _meta| {
            Box::pin(async move {
                sqlx::query("PRAGMA query_only = ON;")
                    .execute(conn)
                    .await?;
                Ok(())
            })
        })
        .connect_with(opts)
        .await
        .map_err(|e| {
            CoreError::Validation(format!(
                "Impossible d'ouvrir l'archive en lecture seule : {e}"
            ))
        })?;
    Ok(pool)
}

async fn table_has_column_ro(pool: &SqlitePool, table: &str, column: &str) -> CoreResult<bool> {
    let sql = format!("PRAGMA table_info({table})");
    let rows = sqlx::query(&sql).fetch_all(pool).await?;
    for row in rows {
        let name: String = row.try_get("name")?;
        if name == column {
            return Ok(true);
        }
    }
    Ok(false)
}

pub async fn collect_entity_counts(pool: &SqlitePool) -> CoreResult<BackupEntityCounts> {
    Ok(BackupEntityCounts {
        products: sqlx::query_scalar("SELECT COUNT(*) FROM products")
            .fetch_one(pool)
            .await?,
        stock_movements: sqlx::query_scalar("SELECT COUNT(*) FROM stock_movements")
            .fetch_one(pool)
            .await?,
        clients: sqlx::query_scalar("SELECT COUNT(*) FROM clients")
            .fetch_one(pool)
            .await?,
        suppliers: sqlx::query_scalar("SELECT COUNT(*) FROM suppliers")
            .fetch_one(pool)
            .await?,
        sales: sqlx::query_scalar("SELECT COUNT(*) FROM sales")
            .fetch_one(pool)
            .await?,
        sales_returns: sqlx::query_scalar("SELECT COUNT(*) FROM sales_returns")
            .fetch_one(pool)
            .await?,
        customer_receivables: sqlx::query_scalar("SELECT COUNT(*) FROM customer_receivables")
            .fetch_one(pool)
            .await?,
        purchase_orders: sqlx::query_scalar("SELECT COUNT(*) FROM purchase_orders")
            .fetch_one(pool)
            .await?,
        purchase_receipts: sqlx::query_scalar("SELECT COUNT(*) FROM purchase_receipts")
            .fetch_one(pool)
            .await?,
        supplier_debts: sqlx::query_scalar("SELECT COUNT(*) FROM supplier_debts")
            .fetch_one(pool)
            .await?,
        returnable_stock_movements: sqlx::query_scalar(
            "SELECT COUNT(*) FROM returnable_stock_movements",
        )
        .fetch_one(pool)
        .await?,
        cash_movements: sqlx::query_scalar("SELECT COUNT(*) FROM cash_movements")
            .fetch_one(pool)
            .await?,
        expenses: sqlx::query_scalar("SELECT COUNT(*) FROM expenses")
            .fetch_one(pool)
            .await?,
        audit_logs: sqlx::query_scalar("SELECT COUNT(*) FROM audit_logs")
            .fetch_one(pool)
            .await?,
    })
}

pub async fn verify_backup_path_read_only(
    path: &Path,
    display_name: &str,
) -> CoreResult<BackupVerifyDto> {
    let sha256 = sha256_file(path)?;
    let pool = open_backup_read_only(path).await?;

    let result = inspect_backup_pool(&pool, display_name, &sha256).await;
    pool.close().await;
    result
}

async fn inspect_backup_pool(
    pool: &SqlitePool,
    display_name: &str,
    sha256: &str,
) -> CoreResult<BackupVerifyDto> {
    let integrity_rows: Vec<String> = match sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_all(pool)
        .await
    {
        Ok(rows) => rows,
        Err(e) => {
            return Err(CoreError::Validation(format!(
                "Archive SQLite corrompue ou illisible : {e}"
            )));
        }
    };

    let integrity = if integrity_rows.is_empty() {
        "empty".to_string()
    } else if integrity_rows.len() == 1 {
        integrity_rows[0].clone()
    } else {
        integrity_rows.join("; ")
    };

    let foreign_key_errors = if integrity == "ok" {
        let fk_rows: Vec<(String, i64, String, i64)> =
            sqlx::query_as("PRAGMA foreign_key_check")
                .fetch_all(pool)
                .await
                .map_err(|e| {
                    CoreError::Validation(format!(
                        "Contrôle des clés étrangères impossible sur l'archive : {e}"
                    ))
                })?;
        fk_rows.len()
    } else {
        0
    };

    let table_names: Vec<String> =
        sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type = 'table'")
            .fetch_all(pool)
            .await
            .map_err(|e| {
                CoreError::Validation(format!("Lecture du catalogue SQLite impossible : {e}"))
            })?;
    let table_set: HashSet<String> = table_names.into_iter().collect();

    let missing_tables: Vec<&str> = REQUIRED_CORE_TABLES
        .iter()
        .copied()
        .filter(|t| !table_set.contains(*t))
        .collect();

    let mut applied_versions: Vec<i64> = Vec::new();
    if integrity == "ok" && table_set.contains("schema_version") {
        applied_versions =
            sqlx::query_scalar("SELECT version FROM schema_version ORDER BY version ASC")
                .fetch_all(pool)
                .await
                .map_err(|e| {
                    CoreError::Validation(format!(
                        "Lecture table schema_version impossible : {e}"
                    ))
                })?;
    }

    let schema_version = applied_versions.iter().copied().max().unwrap_or(0);

    let mut compatibility_reason: Option<String> = None;
    if integrity != "ok" {
        compatibility_reason = Some(format!(
            "Échec du contrôle d'intégrité SQLite : {integrity}"
        ));
    } else if foreign_key_errors > 0 {
        compatibility_reason = Some(format!(
            "Violations de clés étrangères détectées ({foreign_key_errors})."
        ));
    } else if !missing_tables.is_empty() {
        compatibility_reason = Some(format!(
            "Format d'archive incompatible : table(s) DEPOTPRO manquante(s) ({}).",
            missing_tables.join(", ")
        ));
    } else if applied_versions.is_empty() || schema_version < MIN_SUPPORTED_SCHEMA_VERSION {
        compatibility_reason = Some(
            "Version de schéma absente ou invalide dans schema_version.".to_string(),
        );
    } else if schema_version > CURRENT_SCHEMA_VERSION {
        compatibility_reason = Some(format!(
            "Version de schéma incompatible (v{schema_version} > v{CURRENT_SCHEMA_VERSION}) : mise à jour de l'application requise."
        ));
    } else if applied_versions.iter().any(|&v| v < 1) {
        compatibility_reason =
            Some("Entrée de migration invalide (< 1) dans schema_version.".to_string());
    } else if applied_versions.contains(&2)
        && !table_has_column_ro(pool, "app_settings", "logo_path").await?
    {
        compatibility_reason = Some(
            "Incohérence de migration v2 : colonne app_settings.logo_path absente.".to_string(),
        );
    } else if applied_versions.contains(&3)
        && !table_has_column_ro(pool, "expenses", "receipt_path").await?
    {
        compatibility_reason = Some(
            "Incohérence de migration v3 : colonne expenses.receipt_path absente.".to_string(),
        );
    } else if applied_versions.contains(&4)
        && !table_has_column_ro(pool, "app_settings", "setup_completed").await?
    {
        compatibility_reason = Some(
            "Incohérence de migration v4 : colonne app_settings.setup_completed absente."
                .to_string(),
        );
    }

    let compatible = compatibility_reason.is_none();
    let counts = if compatible {
        Some(collect_entity_counts(pool).await?)
    } else {
        None
    };

    Ok(BackupVerifyDto {
        name: display_name.to_string(),
        integrity,
        foreign_key_errors,
        schema_version,
        applied_versions,
        backup_format: BACKUP_FORMAT_V3.to_string(),
        min_app_version: MIN_APP_VERSION.to_string(),
        compatible,
        compatibility_reason,
        sha256: sha256.to_string(),
        counts,
    })
}

pub async fn create_consistent_backup(db: &DepotDb, backup_dir: &Path) -> CoreResult<PathBuf> {
    std::fs::create_dir_all(backup_dir).map_err(|e| {
        CoreError::Internal(format!("Création répertoire sauvegarde impossible : {e}"))
    })?;
    let ts = chrono::Utc::now().format("%Y%m%d%H%M%S");
    let uid_suffix = uuid::Uuid::new_v4().to_string()[..6].to_string();
    let filename = format!("depotpro_backup_{ts}_{uid_suffix}.db");
    let dest = backup_dir.join(&filename);
    let escaped = dest.to_string_lossy().replace('\'', "''");

    let _guard = db.lock_write().await;
    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(&db.pool)
        .await?;
    sqlx::query(&format!("VACUUM INTO '{escaped}'"))
        .execute(&db.pool)
        .await?;
    drop(_guard);

    let dest_file = File::open(&dest).map_err(|e| {
        CoreError::Internal(format!("Synchronisation sauvegarde impossible : {e}"))
    })?;
    dest_file.sync_all().map_err(|e| {
        CoreError::Internal(format!("Fsync sauvegarde impossible : {e}"))
    })?;
    drop(dest_file);

    // Vérification immédiate en lecture seule (aucune écriture ni sidecar WAL/SHM)
    let verify_res = verify_backup_path_read_only(&dest, &filename).await;
    let check = match verify_res {
        Ok(v) if v.compatible && v.integrity == "ok" && v.foreign_key_errors == 0 => v,
        Ok(v) => {
            let _ = std::fs::remove_file(&dest);
            return Err(CoreError::Database(
                v.compatibility_reason
                    .unwrap_or_else(|| "La sauvegarde a échoué au contrôle d'intégrité.".to_string()),
            ));
        }
        Err(e) => {
            let _ = std::fs::remove_file(&dest);
            return Err(e);
        }
    };

    let (_guard2, mut tx) = db.begin_write().await?;
    audit_log_tx(
        &mut tx,
        "CREATE_BACKUP",
        "backups",
        Some(filename.clone()),
        &format!(
            "Sauvegarde cohérente créée et vérifiée : {filename} (sha256={})",
            &check.sha256[..12]
        ),
    )
    .await?;
    tx.commit().await?;

    prune_old_backups(backup_dir, MAX_RETAINED_BACKUPS);

    Ok(dest)
}

fn prune_old_backups(backup_dir: &Path, keep_count: usize) {
    let Ok(entries) = std::fs::read_dir(backup_dir) else {
        return;
    };
    let mut files: Vec<(PathBuf, std::time::SystemTime)> = entries
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if !is_valid_backup_filename(&name) {
                return None;
            }
            let meta = std::fs::symlink_metadata(e.path()).ok()?;
            if meta.file_type().is_symlink() || !meta.is_file() {
                return None;
            }
            let modified = meta.modified().ok()?;
            Some((e.path(), modified))
        })
        .collect();
    files.sort_by_key(|a| std::cmp::Reverse(a.1));
    for (obsolete_path, _) in files.into_iter().skip(keep_count) {
        let _ = std::fs::remove_file(obsolete_path);
    }
}

pub async fn create_backup_summary(db: &DepotDb, backup_dir: &Path) -> CoreResult<BackupFileDto> {
    let path = create_consistent_backup(db, backup_dir).await?;
    let meta = std::fs::metadata(&path).map_err(|e| {
        CoreError::Internal(format!("Lecture métadonnées sauvegarde impossible : {e}"))
    })?;
    let name = path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let sha256 = sha256_file(&path)?;
    Ok(BackupFileDto {
        name,
        size: meta.len(),
        created_at: chrono::Utc::now().to_rfc3339(),
        integrity: Some("ok".to_string()),
        sha256: Some(sha256),
    })
}

pub fn list_backups(backup_dir: &Path) -> CoreResult<Vec<BackupFileDto>> {
    std::fs::create_dir_all(backup_dir).map_err(|e| {
        CoreError::Internal(format!("Accès répertoire sauvegardes impossible : {e}"))
    })?;
    let mut items = Vec::new();
    let entries = std::fs::read_dir(backup_dir).map_err(|e| {
        CoreError::Internal(format!("Lecture répertoire sauvegardes impossible : {e}"))
    })?;

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !is_valid_backup_filename(&name) {
            continue;
        }
        let path = entry.path();
        let Ok(meta) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        if meta.file_type().is_symlink() || !meta.is_file() {
            continue;
        }
        let created_at = meta
            .modified()
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
            .unwrap_or_else(|_| chrono::Utc::now().to_rfc3339());
        let sha256 = sha256_file(&path).ok();
        items.push(BackupFileDto {
            name,
            size: meta.len(),
            created_at,
            integrity: None,
            sha256,
        });
    }
    items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(items)
}

pub async fn verify_backup(backup_dir: &Path, filename: &str) -> CoreResult<BackupVerifyDto> {
    let (safe_name, full_path) = resolve_safe_backup_path(backup_dir, filename)?;
    verify_backup_path_read_only(&full_path, &safe_name).await
}

fn sync_parent_dir(dir: &Path) -> CoreResult<()> {
    #[cfg(unix)]
    {
        if let Ok(d) = File::open(dir) {
            let _ = d.sync_all();
        }
    }
    #[cfg(not(unix))]
    let _ = dir;
    Ok(())
}

fn remove_sqlite_sidecars(db_path: &Path) {
    for suffix in ["-wal", "-shm", "-journal"] {
        let sidecar = PathBuf::from(format!("{}{}", db_path.to_string_lossy(), suffix));
        if sidecar.exists() {
            let _ = std::fs::remove_file(sidecar);
        }
    }
}

pub async fn restore_backup(
    db: &DepotDb,
    backup_dir: &Path,
    filename: &str,
) -> CoreResult<BackupRestoreDto> {
    let (safe_name, src_path) = resolve_safe_backup_path(backup_dir, filename)?;
    let check = verify_backup_path_read_only(&src_path, &safe_name).await?;
    if !check.compatible || check.integrity != "ok" || check.foreign_key_errors > 0 {
        return Err(CoreError::Validation(
            check.compatibility_reason.unwrap_or_else(|| {
                "Sauvegarde corrompue ou incompatible : restauration refusée.".to_string()
            }),
        ));
    }

    let safety_path = create_consistent_backup(db, backup_dir).await?;
    let safety_name = safety_path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let safety_check = verify_backup_path_read_only(&safety_path, &safety_name).await?;
    if !safety_check.compatible || safety_check.integrity != "ok" || safety_check.foreign_key_errors > 0
    {
        return Err(CoreError::Database(
            "La sauvegarde de sécurité préalable a échoué au contrôle d'intégrité.".to_string(),
        ));
    }

    let dest_path = PathBuf::from(&db.db_path);
    let dest_dir = dest_path
        .parent()
        .ok_or_else(|| CoreError::Internal("Chemin base cible invalide.".to_string()))?;
    std::fs::create_dir_all(dest_dir)
        .map_err(|e| CoreError::Internal(format!("Répertoire cible inaccessible : {e}")))?;

    let uid = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let staging_path = dest_dir.join(format!(".depotpro_restore_tmp_{uid}.db"));
    let rollback_path = dest_dir.join(format!(".depotpro_restore_prev_{uid}.db"));

    std::fs::copy(&src_path, &staging_path)
        .map_err(|e| CoreError::Internal(format!("Copie temporaire impossible : {e}")))?;
    {
        let f = File::open(&staging_path)
            .map_err(|e| CoreError::Internal(format!("Ouverture fichier temporaire impossible : {e}")))?;
        f.sync_all()
            .map_err(|e| CoreError::Internal(format!("Fsync fichier temporaire impossible : {e}")))?;
    }
    let staged_check = match verify_backup_path_read_only(&staging_path, &safe_name).await {
        Ok(v) if v.compatible && v.integrity == "ok" && v.foreign_key_errors == 0 && v.sha256 == check.sha256 => v,
        Ok(_) => {
            let _ = std::fs::remove_file(&staging_path);
            return Err(CoreError::Database(
                "Le fichier temporaire restauré diffère ou est incohérent.".to_string(),
            ));
        }
        Err(e) => {
            let _ = std::fs::remove_file(&staging_path);
            return Err(e);
        }
    };

    let _guard = db.lock_write().await;
    let _ = sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(&db.pool)
        .await;
    db.pool.close().await;

    remove_sqlite_sidecars(&dest_path);
    let had_dest = dest_path.exists();
    if had_dest {
        if let Err(e) = std::fs::rename(&dest_path, &rollback_path) {
            let _ = std::fs::remove_file(&staging_path);
            return Err(CoreError::Internal(format!(
                "Sauvegarde temporaire base précédente impossible : {e}"
            )));
        }
    }
    if let Err(e) = std::fs::rename(&staging_path, &dest_path) {
        let _ = std::fs::remove_file(&staging_path);
        if rollback_path.exists() {
            let _ = std::fs::rename(&rollback_path, &dest_path);
        }
        return Err(CoreError::Internal(format!(
            "Remplacement atomique impossible : {e}"
        )));
    }
    let _ = sync_parent_dir(dest_dir);
    if rollback_path.exists() {
        let _ = std::fs::remove_file(&rollback_path);
    }

    Ok(BackupRestoreDto {
        restored: safe_name,
        safety_backup: safety_name,
        restored_sha256: staged_check.sha256,
        integrity: staged_check.integrity,
        foreign_key_errors: staged_check.foreign_key_errors,
        schema_version: staged_check.schema_version,
        counts: staged_check.counts.unwrap_or(BackupEntityCounts {
            products: 0,
            stock_movements: 0,
            clients: 0,
            suppliers: 0,
            sales: 0,
            sales_returns: 0,
            customer_receivables: 0,
            purchase_orders: 0,
            purchase_receipts: 0,
            supplier_debts: 0,
            returnable_stock_movements: 0,
            cash_movements: 0,
            expenses: 0,
            audit_logs: 0,
        }),
    })
}

pub fn read_backup_bytes(backup_dir: &Path, filename: &str) -> CoreResult<(String, Vec<u8>)> {
    let (safe_name, full_path) = resolve_safe_backup_path(backup_dir, filename)?;
    let bytes = std::fs::read(&full_path)
        .map_err(|e| CoreError::Internal(format!("Lecture sauvegarde impossible : {e}")))?;
    Ok((safe_name, bytes))
}

pub async fn restore_and_reconnect(
    db_lock: &tokio::sync::RwLock<DepotDb>,
    backup_dir: &Path,
    filename: &str,
) -> CoreResult<BackupRestoreDto> {
    restore_and_reconnect_with_hook(db_lock, backup_dir, filename, RestoreFailureHook::None).await
}

pub async fn restore_and_reconnect_with_hook(
    db_lock: &tokio::sync::RwLock<DepotDb>,
    backup_dir: &Path,
    filename: &str,
    failure_hook: RestoreFailureHook,
) -> CoreResult<BackupRestoreDto> {
    let mut guard = db_lock.write().await;

    // 1. Validation chemin + vérification en lecture seule de la source
    let (safe_name, src_path) = resolve_safe_backup_path(backup_dir, filename)?;
    let source_check = verify_backup_path_read_only(&src_path, &safe_name).await?;
    if !source_check.compatible || source_check.integrity != "ok" || source_check.foreign_key_errors > 0 {
        return Err(CoreError::Validation(
            source_check.compatibility_reason.unwrap_or_else(|| {
                "Sauvegarde corrompue ou incompatible : restauration refusée.".to_string()
            }),
        ));
    }

    // 2. Sauvegarde de sécurité de la base courante + 3. Vérification en lecture seule
    let safety_path = create_consistent_backup(&guard, backup_dir).await?;
    let safety_name = safety_path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let safety_check = verify_backup_path_read_only(&safety_path, &safety_name).await?;
    if !safety_check.compatible || safety_check.integrity != "ok" || safety_check.foreign_key_errors > 0
    {
        return Err(CoreError::Database(
            "La sauvegarde de sécurité préalable est invalide : restauration annulée.".to_string(),
        ));
    }

    // 5. Copie dans un fichier temporaire sur le même système de fichiers + 6. Vérification + 7. Fsync
    let dest_path = PathBuf::from(&guard.db_path);
    let dest_dir = dest_path
        .parent()
        .ok_or_else(|| CoreError::Internal("Répertoire base cible invalide.".to_string()))?
        .to_path_buf();
    std::fs::create_dir_all(&dest_dir)
        .map_err(|e| CoreError::Internal(format!("Création répertoire base impossible : {e}")))?;

    let uid = uuid::Uuid::new_v4().to_string()[..8].to_string();
    let staging_path = dest_dir.join(format!(".depotpro_restore_tmp_{uid}.db"));
    let rollback_path = dest_dir.join(format!(".depotpro_restore_prev_{uid}.db"));

    std::fs::copy(&src_path, &staging_path)
        .map_err(|e| CoreError::Internal(format!("Copie vers fichier temporaire impossible : {e}")))?;
    {
        let staged_file = File::open(&staging_path).map_err(|e| {
            let _ = std::fs::remove_file(&staging_path);
            CoreError::Internal(format!("Ouverture fichier temporaire impossible : {e}"))
        })?;
        if let Err(e) = staged_file.sync_all() {
            let _ = std::fs::remove_file(&staging_path);
            return Err(CoreError::Internal(format!(
                "Synchronisation disque fichier temporaire impossible : {e}"
            )));
        }
    }

    let staged_check = match verify_backup_path_read_only(&staging_path, &safe_name).await {
        Ok(v) if v.compatible && v.integrity == "ok" && v.foreign_key_errors == 0 && v.sha256 == source_check.sha256 => v,
        Ok(_) => {
            let _ = std::fs::remove_file(&staging_path);
            return Err(CoreError::Database(
                "Échec vérification du fichier temporaire de restauration.".to_string(),
            ));
        }
        Err(e) => {
            let _ = std::fs::remove_file(&staging_path);
            return Err(e);
        }
    };

    // 4. Fermeture propre des connexions actives avant remplacement atomique
    {
        let _write_guard = guard.lock_write().await;
        let _ = sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
            .execute(&guard.pool)
            .await;
    }
    guard.pool.close().await;

    let phase_result: CoreResult<(DepotDb, BackupRestoreDto)> = async {
        remove_sqlite_sidecars(&dest_path);

        if failure_hook == RestoreFailureHook::BeforeAtomicReplace {
            return Err(CoreError::Internal(
                "Interruption simulée avant remplacement atomique.".to_string(),
            ));
        }

        if dest_path.exists() {
            std::fs::rename(&dest_path, &rollback_path).map_err(|e| {
                CoreError::Internal(format!("Mise en réserve base courante impossible : {e}"))
            })?;
        }

        // 8. Remplacement atomique sur le même système de fichiers + synchronisation
        std::fs::rename(&staging_path, &dest_path).map_err(|e| {
            CoreError::Internal(format!("Remplacement atomique de la base impossible : {e}"))
        })?;
        if let Ok(f) = File::open(&dest_path) {
            let _ = f.sync_all();
        }
        sync_parent_dir(&dest_dir)?;

        if failure_hook == RestoreFailureHook::BeforeReconnect {
            return Err(CoreError::Database(
                "Échec simulé de reconnexion SQLite après remplacement.".to_string(),
            ));
        }

        // 9. Reconnecter SQLite (applique d'éventuelles migrations si archive v1..v3 -> v4)
        let new_db = DepotDb::connect(&dest_path).await?;

        // 10. Vérification complète post-restauration
        let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
            .fetch_one(&new_db.pool)
            .await?;
        let fk_rows: Vec<(String, i64, String, i64)> =
            sqlx::query_as("PRAGMA foreign_key_check")
                .fetch_all(&new_db.pool)
                .await?;
        if integrity != "ok" || !fk_rows.is_empty() {
            new_db.pool.close().await;
            return Err(CoreError::Database(format!(
                "Vérification post-restauration échouée (integrity={integrity}, fk={}).",
                fk_rows.len()
            )));
        }
        let schema_version: i64 =
            sqlx::query_scalar("SELECT COALESCE(MAX(version), 0) FROM schema_version")
                .fetch_one(&new_db.pool)
                .await?;

        if failure_hook == RestoreFailureHook::AfterReconnectPostVerify {
            new_db.pool.close().await;
            return Err(CoreError::Database(
                "Échec simulé de vérification post-restauration.".to_string(),
            ));
        }

        // Journaliser la restauration puis capturer les compteurs finaux des 14 entités
        let (_wg, mut tx) = new_db.begin_write().await?;
        audit_log_tx(
            &mut tx,
            "RESTORE_BACKUP",
            "backups",
            Some(safe_name.clone()),
            &format!(
                "Base restaurée depuis {safe_name} (sauvegarde sécurité : {safety_name})"
            ),
        )
        .await?;
        tx.commit().await?;

        let counts = collect_entity_counts(&new_db.pool).await?;

        Ok((
            new_db,
            BackupRestoreDto {
                restored: safe_name.clone(),
                safety_backup: safety_name.clone(),
                restored_sha256: staged_check.sha256.clone(),
                integrity,
                foreign_key_errors: fk_rows.len(),
                schema_version,
                counts,
            },
        ))
    }
    .await;

    match phase_result {
        Ok((new_db, dto)) => {
            let _ = std::fs::remove_file(&rollback_path);
            let _ = std::fs::remove_file(&staging_path);
            *guard = new_db;
            Ok(dto)
        }
        Err(err) => {
            // Récupération obligatoire : rétablir la base précédente et réouvrir le pool
            let _ = std::fs::remove_file(&staging_path);
            remove_sqlite_sidecars(&dest_path);
            if rollback_path.exists() {
                let _ = std::fs::remove_file(&dest_path);
                let _ = std::fs::rename(&rollback_path, &dest_path);
            } else if !dest_path.exists() && safety_path.exists() {
                let _ = std::fs::copy(&safety_path, &dest_path);
            }
            let _ = sync_parent_dir(&dest_dir);

            if let Ok(recovered_db) = DepotDb::connect(&dest_path).await {
                *guard = recovered_db;
            }
            Err(err)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[allow(dead_code)]
    fn assert_backup_futures_are_send(
        db: &DepotDb,
        dir: &Path,
        lock: &tokio::sync::RwLock<DepotDb>,
    ) {
        fn assert_send<F: std::future::Future + Send>(_: F) {}
        assert_send(open_backup_read_only(dir));
        assert_send(create_backup_summary(db, dir));
        assert_send(verify_backup(dir, "dummy.db"));
        assert_send(restore_and_reconnect(lock, dir, "dummy.db"));
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
    fn backup_filename_allowlist_rejects_traversal_and_invalid_names() {
        assert!(is_valid_backup_filename("depotpro_backup_20261117123045_a1b2c3.db"));
        assert!(is_valid_backup_filename("depotpro_backup_20250101000000_stale0.db"));
        assert!(!is_valid_backup_filename("../depotpro_backup_20261117123045_a1b2c3.db"));
        assert!(!is_valid_backup_filename("sub/depotpro_backup_20261117123045_a1b2c3.db"));
        assert!(!is_valid_backup_filename("depotpro_v3.db"));
        assert!(!is_valid_backup_filename("depotpro_backup_bad_a1b2c3.db"));
    }
}
