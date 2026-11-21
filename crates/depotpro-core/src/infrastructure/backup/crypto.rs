// ============================================================================
// Chiffrement AES-256-GCM / PBKDF2-HMAC-SHA256 des archives .dpbkp
// ============================================================================

use std::fs::File;
use std::path::Path;

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD as BASE64_STD;
use base64::Engine as _;
use pbkdf2::pbkdf2_hmac;
use serde::{Deserialize, Serialize};
use sha2::Sha256 as CrateSha256;

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::sales::audit_log_tx;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::create_and_list::{export_consistent_sqlite_to_path, prune_old_backups};
use super::paths::{resolve_safe_backup_path, sync_parent_dir, TempFileCleanup};
use super::restore_engine::restore_from_plain_path_with_hook;
use super::{
    sha256_bytes, verify_backup_path_read_only, BackupFileDto, BackupRestoreDto, BackupVerifyDto,
    RestoreFailureHook, ENCRYPTED_BACKUP_MAGIC, ENCRYPTED_BACKUP_VERSION,
    ENCRYPTED_PBKDF2_ITERATIONS, MAX_RETAINED_BACKUPS, MIN_BACKUP_PASSPHRASE_LEN,
};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncryptedBackupHeader {
    v: u16,
    cipher: String,
    kdf: String,
    iterations: u32,
    salt_b64: String,
    nonce_b64: String,
    plaintext_sha256: String,
}

fn validate_backup_passphrase(passphrase: &str) -> CoreResult<()> {
    if passphrase.len() < MIN_BACKUP_PASSPHRASE_LEN {
        return Err(CoreError::Validation(format!(
            "La clé de chiffrement doit contenir au moins {MIN_BACKUP_PASSPHRASE_LEN} caractères."
        )));
    }
    Ok(())
}

pub fn encrypt_backup_bytes(plaintext: &[u8], passphrase: &str) -> CoreResult<Vec<u8>> {
    validate_backup_passphrase(passphrase)?;
    let salt = *uuid::Uuid::new_v4().as_bytes();
    let nonce_uuid = *uuid::Uuid::new_v4().as_bytes();
    let nonce_bytes = &nonce_uuid[..12];

    let mut key = [0u8; 32];
    pbkdf2_hmac::<CrateSha256>(
        passphrase.as_bytes(),
        &salt,
        ENCRYPTED_PBKDF2_ITERATIONS,
        &mut key,
    );

    let header = EncryptedBackupHeader {
        v: ENCRYPTED_BACKUP_VERSION,
        cipher: "aes-256-gcm".to_string(),
        kdf: "pbkdf2-hmac-sha256".to_string(),
        iterations: ENCRYPTED_PBKDF2_ITERATIONS,
        salt_b64: BASE64_STD.encode(salt),
        nonce_b64: BASE64_STD.encode(nonce_bytes),
        plaintext_sha256: sha256_bytes(plaintext),
    };
    let header_bytes = serde_json::to_vec(&header).map_err(|e| {
        CoreError::Internal(format!("Sérialisation en-tête chiffré impossible : {e}"))
    })?;
    let header_len: u32 = header_bytes
        .len()
        .try_into()
        .map_err(|_| CoreError::Internal("En-tête chiffré trop volumineux.".to_string()))?;

    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| CoreError::Internal(format!("Initialisation AES-256-GCM impossible : {e}")))?;
    let nonce = Nonce::from_slice(nonce_bytes);
    let ciphertext = cipher
        .encrypt(
            nonce,
            Payload {
                msg: plaintext,
                aad: &header_bytes,
            },
        )
        .map_err(|e| CoreError::Internal(format!("Chiffrement AES-256-GCM impossible : {e}")))?;

    let mut out = Vec::with_capacity(14 + header_bytes.len() + ciphertext.len());
    out.extend_from_slice(ENCRYPTED_BACKUP_MAGIC);
    out.extend_from_slice(&ENCRYPTED_BACKUP_VERSION.to_le_bytes());
    out.extend_from_slice(&header_len.to_le_bytes());
    out.extend_from_slice(&header_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

pub fn decrypt_backup_bytes(blob: &[u8], passphrase: &str) -> CoreResult<(Vec<u8>, String)> {
    validate_backup_passphrase(passphrase)?;
    if blob.len() < 14 + 16 || &blob[..8] != ENCRYPTED_BACKUP_MAGIC {
        return Err(CoreError::Validation(
            "Enveloppe de sauvegarde chiffrée invalide (magique DPBKP01 absent).".to_string(),
        ));
    }
    let ver = u16::from_le_bytes([blob[8], blob[9]]);
    if ver != ENCRYPTED_BACKUP_VERSION {
        return Err(CoreError::Validation(format!(
            "Version d'enveloppe chiffrée non supportée : {ver}."
        )));
    }
    let header_len = u32::from_le_bytes([blob[10], blob[11], blob[12], blob[13]]) as usize;
    if header_len == 0 || 14 + header_len + 16 > blob.len() {
        return Err(CoreError::Validation(
            "En-tête d'enveloppe chiffrée corrompu ou tronqué.".to_string(),
        ));
    }
    let header_bytes = &blob[14..14 + header_len];
    let ciphertext = &blob[14 + header_len..];

    let header: EncryptedBackupHeader = serde_json::from_slice(header_bytes).map_err(|e| {
        CoreError::Validation(format!(
            "Métadonnées de sauvegarde chiffrée invalides : {e}"
        ))
    })?;
    if header.cipher != "aes-256-gcm"
        || header.kdf != "pbkdf2-hmac-sha256"
        || header.iterations < 10_000
    {
        return Err(CoreError::Validation(
            "Algorithme de chiffrement non supporté.".to_string(),
        ));
    }
    let salt = BASE64_STD
        .decode(&header.salt_b64)
        .map_err(|_| CoreError::Validation("Sel cryptographique invalide.".to_string()))?;
    let nonce_vec = BASE64_STD
        .decode(&header.nonce_b64)
        .map_err(|_| CoreError::Validation("Nonce cryptographique invalide.".to_string()))?;
    if nonce_vec.len() != 12 || salt.len() < 8 {
        return Err(CoreError::Validation(
            "Paramètres cryptographiques invalides.".to_string(),
        ));
    }

    let mut key = [0u8; 32];
    pbkdf2_hmac::<CrateSha256>(passphrase.as_bytes(), &salt, header.iterations, &mut key);
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| CoreError::Internal(format!("Initialisation AES-256-GCM impossible : {e}")))?;
    let nonce = Nonce::from_slice(&nonce_vec);
    let plaintext = cipher
        .decrypt(
            nonce,
            Payload {
                msg: ciphertext,
                aad: header_bytes,
            },
        )
        .map_err(|_| {
            CoreError::Unauthorized(
                "Clé de déchiffrement invalide ou archive chiffrée altérée.".to_string(),
            )
        })?;

    let actual_sha = sha256_bytes(&plaintext);
    if actual_sha != header.plaintext_sha256 {
        return Err(CoreError::Validation(
            "Empreinte SHA-256 post-déchiffrement incohérente.".to_string(),
        ));
    }
    Ok((plaintext, actual_sha))
}

pub async fn create_encrypted_backup(
    db: &DepotDb,
    backup_dir: &Path,
    passphrase: &str,
) -> CoreResult<BackupFileDto> {
    require_current_actor_permission(Permission::BackupsCreate)?;
    validate_backup_passphrase(passphrase)?;
    std::fs::create_dir_all(backup_dir).map_err(|e| {
        CoreError::Internal(format!("Création répertoire sauvegarde impossible : {e}"))
    })?;

    let ts = chrono::Utc::now().format("%Y%m%d%H%M%S");
    let uid_suffix = uuid::Uuid::new_v4().to_string()[..6].to_string();
    let enc_filename = format!("depotpro_backup_{ts}_{uid_suffix}.dpbkp");
    let enc_dest = backup_dir.join(&enc_filename);

    let temp_plain = backup_dir.join(format!(".depotpro_enc_stage_{}.db", uuid::Uuid::new_v4()));
    let _temp_guard = TempFileCleanup(temp_plain.clone());

    export_consistent_sqlite_to_path(db, &temp_plain, &enc_filename).await?;
    let plain_bytes = std::fs::read(&temp_plain)
        .map_err(|e| CoreError::Internal(format!("Lecture archive temporaire impossible : {e}")))?;
    let encrypted_blob = encrypt_backup_bytes(&plain_bytes, passphrase)?;

    std::fs::write(&enc_dest, &encrypted_blob).map_err(|e| {
        CoreError::Internal(format!("Écriture sauvegarde chiffrée impossible : {e}"))
    })?;
    let enc_file = File::open(&enc_dest).map_err(|e| {
        CoreError::Internal(format!(
            "Synchronisation sauvegarde chiffrée impossible : {e}"
        ))
    })?;
    enc_file
        .sync_all()
        .map_err(|e| CoreError::Internal(format!("Fsync sauvegarde chiffrée impossible : {e}")))?;
    drop(enc_file);
    sync_parent_dir(backup_dir)?;

    let archive_sha256 = sha256_bytes(&encrypted_blob);
    let (_wg, mut tx) = db.begin_write().await?;
    audit_log_tx(
        &mut tx,
        "CREATE_ENCRYPTED_BACKUP",
        "backups",
        Some(enc_filename.clone()),
        &format!(
            "Sauvegarde chiffrée AES-256-GCM créée : {enc_filename} (sha256={})",
            &archive_sha256[..12]
        ),
    )
    .await?;
    tx.commit().await?;

    prune_old_backups(backup_dir, MAX_RETAINED_BACKUPS);

    Ok(BackupFileDto {
        name: enc_filename,
        size: encrypted_blob.len() as u64,
        created_at: chrono::Utc::now().to_rfc3339(),
        integrity: Some("ok".to_string()),
        sha256: Some(archive_sha256),
        encrypted: true,
    })
}

pub async fn verify_encrypted_backup(
    backup_dir: &Path,
    filename: &str,
    passphrase: &str,
) -> CoreResult<BackupVerifyDto> {
    require_current_actor_permission(Permission::BackupsRead)?;
    let (safe_name, full_path) = resolve_safe_backup_path(backup_dir, filename)?;
    let blob = std::fs::read(&full_path).map_err(|e| {
        CoreError::Internal(format!("Lecture sauvegarde chiffrée impossible : {e}"))
    })?;
    let (plaintext, _plain_sha) = decrypt_backup_bytes(&blob, passphrase)?;

    let temp_plain =
        std::env::temp_dir().join(format!("depotpro_verify_dec_{}.db", uuid::Uuid::new_v4()));
    let _temp_guard = TempFileCleanup(temp_plain.clone());
    std::fs::write(&temp_plain, &plaintext).map_err(|e| {
        CoreError::Internal(format!(
            "Écriture archive déchiffrée temporaire impossible : {e}"
        ))
    })?;

    verify_backup_path_read_only(&temp_plain, &safe_name).await
}

pub async fn restore_encrypted_backup_and_reconnect(
    db_lock: &tokio::sync::RwLock<DepotDb>,
    backup_dir: &Path,
    filename: &str,
    passphrase: &str,
) -> CoreResult<BackupRestoreDto> {
    require_current_actor_permission(Permission::BackupsRestore)?;
    let (safe_name, full_path) = resolve_safe_backup_path(backup_dir, filename)?;
    let blob = std::fs::read(&full_path).map_err(|e| {
        CoreError::Internal(format!("Lecture sauvegarde chiffrée impossible : {e}"))
    })?;
    let (plaintext, _) = decrypt_backup_bytes(&blob, passphrase)?;

    let temp_plain = backup_dir.join(format!(".depotpro_restore_dec_{}.db", uuid::Uuid::new_v4()));
    let _temp_guard = TempFileCleanup(temp_plain.clone());
    std::fs::write(&temp_plain, &plaintext).map_err(|e| {
        CoreError::Internal(format!("Préparation archive déchiffrée impossible : {e}"))
    })?;

    let mut guard = db_lock.write().await;
    restore_from_plain_path_with_hook(
        &mut guard,
        backup_dir,
        &temp_plain,
        &safe_name,
        RestoreFailureHook::None,
    )
    .await
}
