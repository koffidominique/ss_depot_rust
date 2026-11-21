// ============================================================================
// Profil de consigne & historique tarifaire des conditionnements
// ============================================================================

use sqlx::{Sqlite, Transaction};

use crate::error::{CoreError, CoreResult};

use super::{DepositComponentInput, PackagingInput};

pub(crate) async fn record_packaging_price_changes_tx(
    tx: &mut Transaction<'_, Sqlite>,
    pkg_id: i64,
    variant_id: Option<i64>,
    prev: (Option<i64>, Option<i64>, Option<i64>, Option<i64>),
    pkg: &PackagingInput,
) -> CoreResult<()> {
    for (ptype, old_v, new_v) in [
        ("PURCHASE", prev.0, pkg.purchase_price),
        ("WHOLESALE", prev.1, pkg.wholesale_price),
        ("SEMI_WHOLESALE", prev.2, pkg.semi_wholesale_price),
        ("RETAIL", prev.3, pkg.retail_price),
    ] {
        if old_v != new_v {
            if let Some(nv) = new_v {
                sqlx::query(
                    "INSERT INTO price_history (entity_type, entity_id, variant_id, price_type, old_price, new_price, currency, effective_from, reason)
                     VALUES ('product_packaging', ?, ?, ?, ?, ?, 'FCFA', datetime('now'), 'Mise à jour conditionnement')",
                )
                .bind(pkg_id)
                .bind(variant_id)
                .bind(ptype)
                .bind(old_v)
                .bind(nv)
                .execute(&mut **tx)
                .await?;
            }
        }
    }
    Ok(())
}

pub(crate) async fn upsert_packaging_deposit_profile_tx(
    tx: &mut Transaction<'_, Sqlite>,
    pkg_id: i64,
    deposit_mode: Option<&str>,
    components: Option<Vec<DepositComponentInput>>,
) -> CoreResult<()> {
    let mode = if deposit_mode == Some("deposit") {
        "deposit"
    } else {
        "none"
    };
    sqlx::query(
        "INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, ?)
         ON CONFLICT(packaging_id) DO UPDATE SET mode = excluded.mode",
    )
    .bind(pkg_id)
    .bind(mode)
    .execute(&mut **tx)
    .await?;

    sqlx::query("DELETE FROM deposit_packaging_components WHERE packaging_id = ?")
        .bind(pkg_id)
        .execute(&mut **tx)
        .await?;

    if mode == "deposit" {
        if let Some(comps) = components {
            for c in comps {
                if c.pieces_per_pack <= 0 {
                    return Err(CoreError::Validation(
                        "Pièces par conditionnement invalides.".to_string(),
                    ));
                }
                let rt_exists: Option<i64> =
                    sqlx::query_scalar("SELECT id FROM returnable_packaging_types WHERE id = ?")
                        .bind(c.returnable_id)
                        .fetch_optional(&mut **tx)
                        .await?;
                if rt_exists.is_none() {
                    return Err(CoreError::Validation(
                        "Type d'emballage consigné introuvable.".to_string(),
                    ));
                }
                sqlx::query(
                    "INSERT INTO deposit_packaging_components (packaging_id, returnable_id, pieces_per_pack) VALUES (?, ?, ?)",
                )
                .bind(pkg_id)
                .bind(c.returnable_id)
                .bind(c.pieces_per_pack)
                .execute(&mut **tx)
                .await?;
            }
        }
    }
    Ok(())
}
