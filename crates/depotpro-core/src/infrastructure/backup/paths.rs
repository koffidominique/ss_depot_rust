// ============================================================================
// Validation des chemins, résolution sûre, sidecars SQLite et nettoyage temp
// ============================================================================

#[cfg(unix)]
use std::fs::File;
use std::path::{Path, PathBuf};

use crate::error::{CoreError, CoreResult};

pub(crate) struct TempFileCleanup(pub PathBuf);

impl Drop for TempFileCleanup {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
        remove_sqlite_sidecars(&self.0);
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
    let core = if let Some(c) = rest.strip_suffix(".db") {
        c
    } else if let Some(c) = rest.strip_suffix(".dpbkp") {
        c
    } else {
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

pub fn resolve_safe_backup_path(
    backup_dir: &Path,
    filename: &str,
) -> CoreResult<(String, PathBuf)> {
    if !is_valid_backup_filename(filename) {
        return Err(CoreError::Validation(
            "Nom de fichier de sauvegarde non autorisé.".to_string(),
        ));
    }

    std::fs::create_dir_all(backup_dir).map_err(|e| {
        CoreError::Internal(format!("Accès répertoire sauvegardes impossible : {e}"))
    })?;
    let canonical_dir = std::fs::canonicalize(backup_dir).map_err(|e| {
        CoreError::Internal(format!(
            "Résolution répertoire sauvegardes impossible : {e}"
        ))
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

pub(crate) fn sync_parent_dir(dir: &Path) -> CoreResult<()> {
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

pub(crate) fn remove_sqlite_sidecars(db_path: &Path) {
    for suffix in ["-wal", "-shm", "-journal"] {
        let sidecar = PathBuf::from(format!("{}{}", db_path.to_string_lossy(), suffix));
        if sidecar.exists() {
            let _ = std::fs::remove_file(sidecar);
        }
    }
}
