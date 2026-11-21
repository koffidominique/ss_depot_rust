// ============================================================================
// Export et import CSV du catalogue produits
// ============================================================================

use std::collections::HashSet;

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::sales::audit_log_tx;
use crate::domain::money::Money;
use crate::domain::quantity::Quantity;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::duplicate::normalize_product_name;

fn format_milli(milli: i64) -> String {
    let whole = milli / 1000;
    let frac = (milli % 1000).abs();
    if frac == 0 {
        whole.to_string()
    } else {
        format!("{whole}.{frac:03}")
            .trim_end_matches('0')
            .to_string()
    }
}

pub async fn export_products_csv(db: &DepotDb) -> CoreResult<String> {
    require_current_actor_permission(Permission::CatalogRead)?;
    type ExportProductRow = (
        String,
        Option<String>,
        String,
        Option<String>,
        String,
        String,
        i64,
        i64,
        Option<i64>,
        Option<i64>,
        Option<i64>,
        Option<i64>,
        i64,
    );
    let rows: Vec<ExportProductRow> = sqlx::query_as(
        "SELECT p.reference, p.barcode, p.name, p.brand, c.name, p.base_unit, p.stock_milli, p.min_stock_milli,
                p.purchase_price, p.wholesale_price, p.semi_wholesale_price, p.retail_price, p.is_active
         FROM products p JOIN categories c ON c.id = p.category_id ORDER BY p.reference",
    )
    .fetch_all(&db.pool)
    .await?;

    let mut lines = vec![
        "\"reference\";\"barcode\";\"name\";\"brand\";\"category\";\"base_unit\";\"stock\";\"min_stock\";\"purchase_price\";\"wholesale_price\";\"semi_wholesale_price\";\"retail_price\";\"is_active\"".to_string(),
    ];
    let esc = |s: &str| format!("\"{}\"", s.replace('"', "\"\""));
    for r in rows {
        let opt_num = |v: Option<i64>| v.map(|n| n.to_string()).unwrap_or_default();
        lines.push(
            [
                esc(&r.0),
                esc(r.1.as_deref().unwrap_or("")),
                esc(&r.2),
                esc(r.3.as_deref().unwrap_or("")),
                esc(&r.4),
                esc(&r.5),
                esc(&format_milli(r.6)),
                esc(&format_milli(r.7)),
                esc(&opt_num(r.8)),
                esc(&opt_num(r.9)),
                esc(&opt_num(r.10)),
                esc(&opt_num(r.11)),
                esc(&r.12.to_string()),
            ]
            .join(";"),
        );
    }
    Ok(lines.join("\n"))
}

pub async fn import_products_csv(db: &DepotDb, csv: &str) -> CoreResult<i64> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let lines: Vec<&str> = csv
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();
    if lines.len() < 2 {
        return Err(CoreError::Validation(
            "Le fichier CSV doit contenir un en-tête et au moins une ligne.".to_string(),
        ));
    }
    let sep = if lines[0].contains(';') { ';' } else { ',' };
    let parse_row = |line: &str| -> Vec<String> {
        line.split(sep)
            .map(|c| c.trim().trim_matches('"').replace("\"\"", "\""))
            .collect()
    };
    let headers: Vec<String> = parse_row(lines[0])
        .into_iter()
        .map(|h| h.to_lowercase())
        .collect();
    let idx = |name: &str| headers.iter().position(|h| h == name);
    let name_idx = idx("name").ok_or_else(|| {
        CoreError::Validation("Colonnes obligatoires manquantes : name, base_unit.".to_string())
    })?;
    let unit_idx = idx("base_unit").ok_or_else(|| {
        CoreError::Validation("Colonnes obligatoires manquantes : name, base_unit.".to_string())
    })?;

    let (_guard, mut tx) = db.begin_write().await?;
    let existing_prod_names: Vec<String> = sqlx::query_scalar("SELECT name FROM products")
        .fetch_all(&mut *tx)
        .await?;
    let mut seen_norm_names: HashSet<String> = existing_prod_names
        .iter()
        .map(|n| normalize_product_name(n))
        .collect();
    let mut created: i64 = 0;

    for (line_num, line) in lines.iter().enumerate().skip(1) {
        let cols = parse_row(line);
        let name = cols.get(name_idx).map(String::as_str).unwrap_or("").trim();
        if name.is_empty() {
            continue;
        }
        let norm_name = normalize_product_name(name);
        if !seen_norm_names.insert(norm_name) {
            return Err(CoreError::DuplicateOperation(format!(
                "Ligne {} : un produit nommé « {name} » existe déjà.",
                line_num + 1
            )));
        }
        let base_unit = cols
            .get(unit_idx)
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .unwrap_or("bouteille");
        let cat_name = idx("category")
            .and_then(|i| cols.get(i))
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .unwrap_or("Divers");

        let cat_id: i64 = match sqlx::query_scalar::<_, i64>(
            "SELECT id FROM categories WHERE lower(name) = lower(?)",
        )
        .bind(cat_name)
        .fetch_optional(&mut *tx)
        .await?
        {
            Some(id) => id,
            None => sqlx::query("INSERT INTO categories (name) VALUES (?)")
                .bind(cat_name)
                .execute(&mut *tx)
                .await?
                .last_insert_rowid(),
        };

        let barcode = idx("barcode")
            .and_then(|i| cols.get(i))
            .map(|s| s.trim())
            .filter(|s| !s.is_empty());
        if let Some(bc) = barcode {
            let dup_prod =
                sqlx::query_scalar::<_, i64>("SELECT id FROM products WHERE barcode = ?")
                    .bind(bc)
                    .fetch_optional(&mut *tx)
                    .await?
                    .is_some();
            let dup_pkg =
                sqlx::query_scalar::<_, i64>("SELECT id FROM product_packagings WHERE barcode = ?")
                    .bind(bc)
                    .fetch_optional(&mut *tx)
                    .await?
                    .is_some();
            if dup_prod || dup_pkg {
                return Err(CoreError::DuplicateOperation(format!(
                    "Ligne {} : code-barres {bc} déjà existant.",
                    line_num + 1
                )));
            }
        }

        let stock_milli = idx("stock")
            .and_then(|i| cols.get(i))
            .filter(|s| !s.is_empty())
            .map(|s| Quantity::parse_str(s, "Stock CSV").map(|q| q.milli_units))
            .transpose()?
            .unwrap_or(0);
        let min_milli = idx("min_stock")
            .and_then(|i| cols.get(i))
            .filter(|s| !s.is_empty())
            .map(|s| Quantity::parse_str(s, "Seuil CSV").map(|q| q.milli_units))
            .transpose()?
            .unwrap_or(0);

        let parse_opt_fcfa = |col: &str| -> CoreResult<Option<i64>> {
            let Some(val) = idx(col).and_then(|i| cols.get(i)).filter(|s| !s.is_empty()) else {
                return Ok(None);
            };
            let n: i64 = val
                .parse()
                .map_err(|_| CoreError::Validation(format!("Montant invalide ({col}) : {val}")))?;
            Ok(Some(Money::from_non_negative(n, col)?.value()))
        };

        let p_buy = parse_opt_fcfa("purchase_price")?;
        let p_whole: Option<i64> = None;
        let p_semi: Option<i64> = None;
        let p_ret = parse_opt_fcfa("retail_price")?;
        let brand = idx("brand")
            .and_then(|i| cols.get(i))
            .map(|s| s.trim())
            .filter(|s| !s.is_empty());

        let reference = DepotDb::next_sequence(&mut tx, "PROD").await?;
        let prod_id = sqlx::query(
            "INSERT INTO products (reference, barcode, name, brand, category_id, base_unit, stock_milli, min_stock_milli,
                                   purchase_price, wholesale_price, semi_wholesale_price, retail_price, average_cost_num, average_cost_den)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&reference)
        .bind(barcode)
        .bind(name)
        .bind(brand)
        .bind(cat_id)
        .bind(base_unit)
        .bind(stock_milli)
        .bind(min_milli)
        .bind(p_buy)
        .bind(p_whole)
        .bind(p_semi)
        .bind(p_ret)
        .bind(p_buy.map(|v| v.to_string()))
        .bind(p_buy.map(|_| "1".to_string()))
        .execute(&mut *tx)
        .await?
        .last_insert_rowid();

        let pkg_name = "casier";
        let pkg_id = sqlx::query(
            "INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price)
             VALUES (?, ?, ?, 1000, ?, ?, ?, ?)",
        )
        .bind(prod_id)
        .bind(pkg_name)
        .bind(base_unit)
        .bind(p_buy)
        .bind(p_whole)
        .bind(p_semi)
        .bind(p_ret)
        .execute(&mut *tx)
        .await?
        .last_insert_rowid();

        sqlx::query(
            "INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, 'none')",
        )
        .bind(pkg_id)
        .execute(&mut *tx)
        .await?;

        if stock_milli > 0 {
            sqlx::query(
                "INSERT INTO stock_movements (product_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, reason, reference_document)
                 VALUES (?, 'manual_adjust', ?, 0, ?, 'Import initial CSV', ?)",
            )
            .bind(prod_id)
            .bind(stock_milli)
            .bind(stock_milli)
            .bind(&reference)
            .execute(&mut *tx)
            .await?;
        }

        created += 1;
    }

    audit_log_tx(
        &mut tx,
        "IMPORT_CSV",
        "products",
        None,
        &format!("{created} produit(s) importé(s) via CSV"),
    )
    .await?;
    tx.commit().await?;
    Ok(created)
}
