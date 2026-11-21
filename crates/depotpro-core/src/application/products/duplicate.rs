// ============================================================================
// Normalisation des libellés produits & prévention des doublons
// ============================================================================

use sqlx::{Sqlite, Transaction};

use crate::error::{CoreError, CoreResult};

pub fn normalize_product_name(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut prev_space = true;
    for ch in raw.trim().chars() {
        if ch.is_whitespace() {
            if !prev_space {
                out.push(' ');
                prev_space = true;
            }
            continue;
        }
        prev_space = false;
        match ch {
            'À' | 'Á' | 'Â' | 'Ã' | 'Ä' | 'Å' | 'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' => {
                out.push('a')
            }
            'È' | 'É' | 'Ê' | 'Ë' | 'è' | 'é' | 'ê' | 'ë' => out.push('e'),
            'Ì' | 'Í' | 'Î' | 'Ï' | 'ì' | 'í' | 'î' | 'ï' => out.push('i'),
            'Ò' | 'Ó' | 'Ô' | 'Õ' | 'Ö' | 'ò' | 'ó' | 'ô' | 'õ' | 'ö' => out.push('o'),
            'Ù' | 'Ú' | 'Û' | 'Ü' | 'ù' | 'ú' | 'û' | 'ü' => out.push('u'),
            'Ç' | 'ç' => out.push('c'),
            'Ñ' | 'ñ' => out.push('n'),
            'Ý' | 'Ÿ' | 'ý' | 'ÿ' => out.push('y'),
            'Œ' | 'œ' => out.push_str("oe"),
            'Æ' | 'æ' => out.push_str("ae"),
            '\u{0300}'..='\u{036F}' => {}
            other => {
                for lc in other.to_lowercase() {
                    out.push(lc);
                }
            }
        }
    }
    out.trim_end().to_string()
}

pub(crate) async fn ensure_unique_product_name(
    tx: &mut Transaction<'_, Sqlite>,
    name: &str,
    exclude_id: Option<i64>,
) -> CoreResult<()> {
    let target = normalize_product_name(name);
    let rows: Vec<(i64, String, String)> =
        sqlx::query_as("SELECT id, name, reference FROM products")
            .fetch_all(&mut **tx)
            .await?;
    for (pid, existing_name, existing_ref) in rows {
        if exclude_id == Some(pid) {
            continue;
        }
        if normalize_product_name(&existing_name) == target {
            return Err(CoreError::DuplicateOperation(format!(
                "Doublon : le produit \"{existing_name}\" ({existing_ref}) existe déjà."
            )));
        }
    }
    Ok(())
}
