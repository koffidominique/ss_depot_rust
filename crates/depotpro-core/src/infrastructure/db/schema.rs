// ============================================================================
// Valeurs neutres initiales et introspection du schéma SQLite
// ============================================================================

use crate::error::CoreResult;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use super::DepotDb;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaColumnSnapshot {
    pub name: String,
    pub col_type: String,
    pub notnull: i64,
    pub pk: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaTableSnapshot {
    pub name: String,
    pub columns: Vec<SchemaColumnSnapshot>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaIndexSnapshot {
    pub name: String,
    pub table_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaVersionEntry {
    pub version: i64,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaSnapshot {
    pub tables: Vec<SchemaTableSnapshot>,
    pub indexes: Vec<SchemaIndexSnapshot>,
    pub schema_versions: Vec<SchemaVersionEntry>,
}

impl DepotDb {
    /// Initialise uniquement les paramètres applicatifs neutres nécessaires au premier démarrage
    /// (aucun fournisseur, produit, stock ni client fictif).
    pub async fn ensure_neutral_defaults(pool: &SqlitePool) -> CoreResult<()> {
        let settings_count_pre: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM app_settings")
            .fetch_one(pool)
            .await?;
        let methods_count_pre: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM payment_methods")
            .fetch_one(pool)
            .await?;
        let exp_cat_count_pre: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM expense_categories")
            .fetch_one(pool)
            .await?;
        let cat_count_pre: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM categories")
            .fetch_one(pool)
            .await?;
        let has_loc_tbl: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'stock_locations'",
        )
        .fetch_one(pool)
        .await?;
        let loc_count_pre: i64 = if has_loc_tbl > 0 {
            sqlx::query_scalar("SELECT COUNT(*) FROM stock_locations")
                .fetch_one(pool)
                .await?
        } else {
            1
        };

        if settings_count_pre > 0
            && methods_count_pre > 0
            && exp_cat_count_pre > 0
            && cat_count_pre > 0
            && loc_count_pre > 0
        {
            return Ok(());
        }

        let mut tx = pool.begin_with("BEGIN IMMEDIATE").await?;

        let settings_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM app_settings")
            .fetch_one(&mut *tx)
            .await?;
        if settings_count == 0 {
            sqlx::query(
                "INSERT OR IGNORE INTO app_settings (
                    id, company_name, company_legal_name, address, phone, email, city, country, currency, setup_completed
                 ) VALUES (1, 'Mon Dépôt', NULL, NULL, NULL, NULL, NULL, NULL, 'FCFA', 0)",
            )
            .execute(&mut *tx)
            .await?;
        }

        let methods_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM payment_methods")
            .fetch_one(&mut *tx)
            .await?;
        if methods_count == 0 {
            for (code, label, is_cash) in [
                ("cash", "Espèces", 1_i64),
                ("wave", "Wave Mobile Money", 0_i64),
                ("orange_money", "Orange Money", 0_i64),
                ("mtn_money", "MTN MoMo", 0_i64),
                ("transfer", "Virement bancaire", 0_i64),
                ("cheque", "Chèque", 0_i64),
            ] {
                sqlx::query(
                    "INSERT OR IGNORE INTO payment_methods (code, label, is_cash, active) VALUES (?, ?, ?, 1)",
                )
                .bind(code)
                .bind(label)
                .bind(is_cash)
                .execute(&mut *tx)
                .await?;
            }
        }

        let exp_cat_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM expense_categories")
            .fetch_one(&mut *tx)
            .await?;
        if exp_cat_count == 0 {
            for cat in [
                "Carburant & Livraison",
                "Électricité & Eau",
                "Maintenance & Réparation",
                "Manutention",
                "Fournitures",
                "Divers",
            ] {
                sqlx::query("INSERT OR IGNORE INTO expense_categories (name) VALUES (?)")
                    .bind(cat)
                    .execute(&mut *tx)
                    .await?;
            }
        }

        let cat_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM categories")
            .fetch_one(&mut *tx)
            .await?;
        if cat_count == 0 {
            for (name, desc) in [
                ("Bières", "Bières en bouteille, canette ou casier"),
                ("Boissons gazeuses", "Sodas et boissons gazeuses"),
                ("Eaux minérales", "Eaux plates et gazeuses"),
                (
                    "Jus & Énergisants",
                    "Jus de fruits, nectars et boissons énergisantes",
                ),
                ("Eau gazeuse", "Eaux minérales gazeuses et tonics"),
                ("Jus", "Jus de fruits naturels et conditionnés"),
                ("Nectar", "Nectars de fruits"),
                (
                    "Boisson énergisante",
                    "Boissons énergisantes et stimulantes",
                ),
                ("Boisson maltée sans alcool", "Boissons maltées sans alcool"),
                ("Vin", "Vins rouges, blancs et rosés"),
                ("Champagne / mousseux", "Champagnes et vins mousseux"),
                ("Spiritueux", "Spiritueux et liqueurs"),
                (
                    "Cocktail prêt à boire",
                    "Cocktails et panachés prêts à boire",
                ),
                ("Autres", "Autres boissons et produits divers"),
            ] {
                sqlx::query("INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)")
                    .bind(name)
                    .bind(desc)
                    .execute(&mut *tx)
                    .await?;
            }
        }

        if loc_count_pre == 0 {
            sqlx::query(
                "INSERT OR IGNORE INTO stock_locations (code, name, location_type, is_default)
                 VALUES ('LOC-MAIN', 'Dépôt principal', 'depot', 1)",
            )
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    pub async fn extract_schema_snapshot(pool: &SqlitePool) -> CoreResult<SchemaSnapshot> {
        let table_names: Vec<String> = sqlx::query_scalar(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC",
        )
        .fetch_all(pool)
        .await?;

        let mut tables = Vec::with_capacity(table_names.len());
        for tname in table_names {
            let cols: Vec<(String, String, i64, i64)> =
                sqlx::query_as("SELECT name, type, \"notnull\", pk FROM pragma_table_info(?)")
                    .bind(&tname)
                    .fetch_all(pool)
                    .await?;
            tables.push(SchemaTableSnapshot {
                name: tname,
                columns: cols
                    .into_iter()
                    .map(|(name, col_type, notnull, pk)| SchemaColumnSnapshot {
                        name,
                        col_type: col_type.to_uppercase(),
                        notnull,
                        pk,
                    })
                    .collect(),
            });
        }

        let idx_rows: Vec<(String, String)> = sqlx::query_as(
            "SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%' ORDER BY name ASC",
        )
        .fetch_all(pool)
        .await?;
        let indexes = idx_rows
            .into_iter()
            .map(|(name, table_name)| SchemaIndexSnapshot { name, table_name })
            .collect();

        let has_sv: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'",
        )
        .fetch_one(pool)
        .await?;
        let schema_versions = if has_sv > 0 {
            let rows: Vec<(i64, String)> =
                sqlx::query_as("SELECT version, name FROM schema_version ORDER BY version ASC")
                    .fetch_all(pool)
                    .await?;
            rows.into_iter()
                .map(|(version, name)| SchemaVersionEntry { version, name })
                .collect()
        } else {
            Vec::new()
        };

        Ok(SchemaSnapshot {
            tables,
            indexes,
            schema_versions,
        })
    }
}
