use crate::application::auth::{current_actor, require_current_actor_permission, Permission, Role};
use crate::application::sales::audit_log_tx;
use crate::domain::money::Money;
use crate::domain::quantity::Quantity;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;
use serde::{Deserialize, Deserializer, Serialize};
use sqlx::FromRow;
use std::collections::{HashMap, HashSet};

const ALLOWED_PACKAGING_NAMES: &[&str] = &["casier", "carton", "bouteille", "pack", "canette"];
const BREWERY_CATALOG_JSON: &str = include_str!("../../../../catalog/brewery_catalog.json");

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
            'À' | 'Á' | 'Â' | 'Ã' | 'Ä' | 'Å' | 'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' => out.push('a'),
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

async fn ensure_unique_product_name(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
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

pub(crate) fn deserialize_nullable_opt<'de, D, T>(
    deserializer: D,
) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Ok(Some(Option::<T>::deserialize(deserializer)?))
}

pub(crate) fn deserialize_qty_str<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    struct QtyVisitor;
    impl<'de> serde::de::Visitor<'de> for QtyVisitor {
        type Value = String;

        fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
            f.write_str("une quantité sous forme de chaîne ou de nombre")
        }

        fn visit_str<E: serde::de::Error>(self, v: &str) -> Result<String, E> {
            Ok(v.to_string())
        }

        fn visit_string<E: serde::de::Error>(self, v: String) -> Result<String, E> {
            Ok(v)
        }

        fn visit_i64<E: serde::de::Error>(self, v: i64) -> Result<String, E> {
            Ok(v.to_string())
        }

        fn visit_u64<E: serde::de::Error>(self, v: u64) -> Result<String, E> {
            Ok(v.to_string())
        }

        fn visit_f64<E: serde::de::Error>(self, v: f64) -> Result<String, E> {
            if !v.is_finite() {
                return Err(E::custom("Nombre invalide."));
            }
            Ok(v.to_string())
        }
    }
    deserializer.deserialize_any(QtyVisitor)
}

pub(crate) fn deserialize_opt_qty_str<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    struct OptQtyVisitor;
    impl<'de> serde::de::Visitor<'de> for OptQtyVisitor {
        type Value = Option<String>;

        fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
            f.write_str("une quantité optionnelle sous forme de chaîne, de nombre ou null")
        }

        fn visit_none<E: serde::de::Error>(self) -> Result<Option<String>, E> {
            Ok(None)
        }

        fn visit_unit<E: serde::de::Error>(self) -> Result<Option<String>, E> {
            Ok(None)
        }

        fn visit_some<D2: Deserializer<'de>>(
            self,
            deserializer: D2,
        ) -> Result<Option<String>, D2::Error> {
            deserialize_qty_str(deserializer).map(Some)
        }
    }
    deserializer.deserialize_option(OptQtyVisitor)
}

pub(crate) fn deserialize_opt_bool_or_int<'de, D>(deserializer: D) -> Result<Option<bool>, D::Error>
where
    D: Deserializer<'de>,
{
    struct OptBoolVisitor;
    impl<'de> serde::de::Visitor<'de> for OptBoolVisitor {
        type Value = Option<bool>;

        fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
            f.write_str("un booléen optionnel ou 0/1")
        }

        fn visit_none<E: serde::de::Error>(self) -> Result<Option<bool>, E> {
            Ok(None)
        }

        fn visit_unit<E: serde::de::Error>(self) -> Result<Option<bool>, E> {
            Ok(None)
        }

        fn visit_some<D2: Deserializer<'de>>(
            self,
            deserializer: D2,
        ) -> Result<Option<bool>, D2::Error> {
            struct Inner;
            impl<'de> serde::de::Visitor<'de> for Inner {
                type Value = bool;

                fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                    f.write_str("un booléen ou 0/1")
                }

                fn visit_bool<E: serde::de::Error>(self, v: bool) -> Result<bool, E> {
                    Ok(v)
                }

                fn visit_i64<E: serde::de::Error>(self, v: i64) -> Result<bool, E> {
                    Ok(v != 0)
                }

                fn visit_u64<E: serde::de::Error>(self, v: u64) -> Result<bool, E> {
                    Ok(v != 0)
                }
            }
            deserializer.deserialize_any(Inner).map(Some)
        }
    }
    deserializer.deserialize_option(OptBoolVisitor)
}

pub(crate) fn sanitize_image_path(raw: Option<&str>) -> CoreResult<Option<String>> {
    let Some(val) = raw else {
        return Ok(None);
    };
    let trimmed = val.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.len() > 350_000 {
        return Err(CoreError::Validation(
            "L'image est trop volumineuse (max 250 Ko).".to_string(),
        ));
    }
    let lower = trimmed.to_ascii_lowercase();
    let is_safe_data_uri = (lower.starts_with("data:image/png;base64,")
        || lower.starts_with("data:image/jpeg;base64,")
        || lower.starts_with("data:image/jpg;base64,")
        || lower.starts_with("data:image/webp;base64,"))
        && trimmed
            .split_once(";base64,")
            .map(|(_, b64)| {
                !b64.is_empty()
                    && b64
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '=')
            })
            .unwrap_or(false);
    let is_safe_rel = trimmed.starts_with("/images/")
        && !trimmed.contains("..")
        && trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '.' | '_' | '-'));

    if !is_safe_data_uri && !is_safe_rel {
        return Err(CoreError::Validation(
            "Format d'image invalide (utilisez PNG, JPEG ou WebP local).".to_string(),
        ));
    }
    Ok(Some(trimmed.to_string()))
}

#[derive(Debug, Serialize, FromRow)]
pub struct CategoryDto {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub is_active: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct DepositComponentDto {
    pub returnable_id: i64,
    pub pieces_per_pack: i64,
    pub code: String,
    pub name: String,
    pub deposit_value: i64,
    pub kind: String,
}

#[derive(Debug, Serialize, FromRow)]
struct PackagingRow {
    pub id: i64,
    pub product_id: i64,
    pub name: String,
    pub base_unit: String,
    pub coefficient_milli: i64,
    pub purchase_price: Option<i64>,
    pub wholesale_price: Option<i64>,
    pub semi_wholesale_price: Option<i64>,
    pub retail_price: Option<i64>,
    pub barcode: Option<String>,
    pub allow_fraction: i64,
    pub is_active: i64,
    pub deposit_mode: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ProductPackagingDto {
    pub id: i64,
    pub product_id: i64,
    pub name: String,
    pub base_unit: String,
    pub coefficient_milli: i64,
    pub purchase_price: Option<i64>,
    pub wholesale_price: Option<i64>,
    pub semi_wholesale_price: Option<i64>,
    pub retail_price: Option<i64>,
    pub barcode: Option<String>,
    pub allow_fraction: i64,
    pub is_active: i64,
    pub deposit_mode: Option<String>,
    pub components: Vec<DepositComponentDto>,
}

#[derive(Debug, Serialize, FromRow)]
struct ProductRow {
    pub id: i64,
    pub reference: String,
    pub barcode: Option<String>,
    pub name: String,
    pub brand: Option<String>,
    pub category_id: i64,
    pub category_name: String,
    pub supplier_id: Option<i64>,
    pub supplier_name: Option<String>,
    pub description: Option<String>,
    pub base_unit: String,
    pub stock_milli: i64,
    pub min_stock_milli: i64,
    pub max_stock_milli: i64,
    pub average_cost_num: Option<String>,
    pub average_cost_den: Option<String>,
    pub purchase_price: Option<i64>,
    pub wholesale_price: Option<i64>,
    pub semi_wholesale_price: Option<i64>,
    pub retail_price: Option<i64>,
    pub image_path: Option<String>,
    pub is_active: i64,
}

#[derive(Debug, Serialize)]
pub struct ProductSummaryDto {
    pub id: i64,
    pub reference: String,
    pub barcode: Option<String>,
    pub name: String,
    pub brand: Option<String>,
    pub category_id: i64,
    pub category_name: String,
    pub supplier_id: Option<i64>,
    pub supplier_name: Option<String>,
    pub description: Option<String>,
    pub base_unit: String,
    pub stock_milli: i64,
    pub min_stock_milli: i64,
    pub max_stock_milli: i64,
    pub average_cost_fcfa: Option<i64>,
    pub purchase_price: Option<i64>,
    pub wholesale_price: Option<i64>,
    pub semi_wholesale_price: Option<i64>,
    pub retail_price: Option<i64>,
    pub image_path: Option<String>,
    pub is_active: i64,
    pub packagings: Vec<ProductPackagingDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedProductsDto {
    pub items: Vec<ProductSummaryDto>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
    pub total_pages: i64,
}

#[derive(Debug, Deserialize)]
pub struct DepositComponentInput {
    pub returnable_id: i64,
    pub pieces_per_pack: i64,
}

#[derive(Debug, Deserialize)]
pub struct PackagingInput {
    pub id: Option<i64>,
    pub name: String,
    #[serde(deserialize_with = "deserialize_qty_str")]
    pub coefficient: String,
    pub purchase_price: Option<i64>,
    pub wholesale_price: Option<i64>,
    pub semi_wholesale_price: Option<i64>,
    pub retail_price: Option<i64>,
    pub barcode: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub allow_fraction: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
    pub deposit_mode: Option<String>,
    pub components: Option<Vec<DepositComponentInput>>,
}

#[derive(Debug, Default, Deserialize)]
pub struct CreateProductInput {
    pub name: String,
    pub brand: Option<String>,
    pub barcode: Option<String>,
    pub category_id: i64,
    pub supplier_id: Option<i64>,
    pub description: Option<String>,
    pub base_unit: String,
    #[serde(default, deserialize_with = "deserialize_opt_qty_str")]
    pub initial_stock: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_qty_str")]
    pub min_stock: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_qty_str")]
    pub max_stock: Option<String>,
    pub purchase_price: Option<i64>,
    pub wholesale_price: Option<i64>,
    pub semi_wholesale_price: Option<i64>,
    pub retail_price: Option<i64>,
    pub image_path: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
    pub packagings: Option<Vec<PackagingInput>>,
}

#[derive(Debug, Default, Deserialize)]
pub struct UpdateProductInput {
    pub name: Option<String>,
    pub brand: Option<String>,
    pub barcode: Option<String>,
    pub category_id: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_nullable_opt")]
    pub supplier_id: Option<Option<i64>>,
    pub description: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_qty_str")]
    pub min_stock: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_qty_str")]
    pub max_stock: Option<String>,
    pub purchase_price: Option<i64>,
    pub wholesale_price: Option<i64>,
    pub semi_wholesale_price: Option<i64>,
    pub retail_price: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_nullable_opt")]
    pub image_path: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

pub async fn list_categories(db: &DepotDb) -> CoreResult<Vec<CategoryDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let rows = sqlx::query_as::<_, CategoryDto>(
        "SELECT id, name, description, is_active FROM categories ORDER BY name ASC",
    )
    .fetch_all(&db.pool)
    .await?;
    Ok(rows)
}

pub async fn create_category(
    db: &DepotDb,
    name: &str,
    description: Option<&str>,
) -> CoreResult<CategoryDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let clean = name.trim();
    if clean.is_empty() {
        return Err(CoreError::Validation(
            "Le nom de la catégorie est obligatoire.".to_string(),
        ));
    }
    let (_guard, mut tx) = db.begin_write().await?;
    let dup: Option<(i64,)> =
        sqlx::query_as("SELECT id FROM categories WHERE lower(name) = lower(?)")
            .bind(clean)
            .fetch_optional(&mut *tx)
            .await?;
    if dup.is_some() {
        return Err(CoreError::DuplicateOperation(
            "Cette catégorie existe déjà.".to_string(),
        ));
    }
    let id = sqlx::query("INSERT INTO categories (name, description) VALUES (?, ?)")
        .bind(clean)
        .bind(description.map(str::trim).filter(|s| !s.is_empty()))
        .execute(&mut *tx)
        .await?
        .last_insert_rowid();
    tx.commit().await?;

    let created = sqlx::query_as::<_, CategoryDto>(
        "SELECT id, name, description, is_active FROM categories WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(created)
}

pub async fn list_products(
    db: &DepotDb,
    search: Option<&str>,
    category_id: Option<i64>,
    include_archived: bool,
    low_stock_only: bool,
    page: i64,
    page_size: i64,
) -> CoreResult<PaginatedProductsDto> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = page.max(1);
    let ps = page_size.clamp(1, 100);
    let offset = (p - 1) * ps;
    let pattern = format!("%{}%", search.unwrap_or("").trim());
    let has_search = !search.unwrap_or("").trim().is_empty();
    let cat_filter = category_id.unwrap_or(0);

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM products p
         WHERE (? = 1 OR p.is_active = 1)
           AND (? = 0 OR p.category_id = ?)
           AND (? = 0 OR p.stock_milli <= p.min_stock_milli)
           AND (? = 0 OR (
             p.name LIKE ? OR p.reference LIKE ? OR COALESCE(p.barcode, '') LIKE ?
             OR COALESCE(p.brand, '') LIKE ?
             OR EXISTS (SELECT 1 FROM product_packagings pk WHERE pk.product_id = p.id AND pk.barcode LIKE ?)
           ))",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(cat_filter)
    .bind(cat_filter)
    .bind(if low_stock_only { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .bind(&pattern)
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, ProductRow>(
        "SELECT p.id, p.reference, p.barcode, p.name, p.brand, p.category_id, c.name AS category_name,
                p.supplier_id, s.name AS supplier_name, p.description, p.base_unit,
                p.stock_milli, p.min_stock_milli, p.max_stock_milli, p.average_cost_num, p.average_cost_den,
                p.purchase_price, p.wholesale_price, p.semi_wholesale_price, p.retail_price, p.image_path, p.is_active
         FROM products p
         JOIN categories c ON c.id = p.category_id
         LEFT JOIN suppliers s ON s.id = p.supplier_id
         WHERE (? = 1 OR p.is_active = 1)
           AND (? = 0 OR p.category_id = ?)
           AND (? = 0 OR p.stock_milli <= p.min_stock_milli)
           AND (? = 0 OR (
             p.name LIKE ? OR p.reference LIKE ? OR COALESCE(p.barcode, '') LIKE ?
             OR COALESCE(p.brand, '') LIKE ?
             OR EXISTS (SELECT 1 FROM product_packagings pk WHERE pk.product_id = p.id AND pk.barcode LIKE ?)
           ))
         ORDER BY p.is_active DESC, p.name ASC
         LIMIT ? OFFSET ?",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(cat_filter)
    .bind(cat_filter)
    .bind(if low_stock_only { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .bind(&pattern)
    .bind(&pattern)
    .bind(&pattern)
    .bind(ps)
    .bind(offset)
    .fetch_all(&db.pool)
    .await?;

    let items = hydrate_products(db, rows).await?;
    let total_pages = ((total + ps - 1) / ps).max(1);
    Ok(PaginatedProductsDto {
        items,
        total,
        page: p,
        page_size: ps,
        total_pages,
    })
}

async fn hydrate_products(
    db: &DepotDb,
    rows: Vec<ProductRow>,
) -> CoreResult<Vec<ProductSummaryDto>> {
    let mut items = Vec::with_capacity(rows.len());
    for prod in rows {
        let pkg_rows = sqlx::query_as::<_, PackagingRow>(
            "SELECT pk.id, pk.product_id, pk.name, pk.base_unit, pk.coefficient_milli,
                    pk.purchase_price, pk.wholesale_price, pk.semi_wholesale_price, pk.retail_price,
                    pk.barcode, pk.allow_fraction, pk.is_active, dp.mode AS deposit_mode
             FROM product_packagings pk
             LEFT JOIN deposit_packaging_profiles dp ON dp.packaging_id = pk.id
             WHERE pk.product_id = ?
             ORDER BY pk.coefficient_milli ASC",
        )
        .bind(prod.id)
        .fetch_all(&db.pool)
        .await?;

        let mut packagings = Vec::with_capacity(pkg_rows.len());
        for pk in pkg_rows {
            let comps = sqlx::query_as::<_, DepositComponentDto>(
                "SELECT dpc.returnable_id, dpc.pieces_per_pack, rpt.code, rpt.name, rpt.deposit_value, rpt.kind
                 FROM deposit_packaging_components dpc
                 JOIN returnable_packaging_types rpt ON rpt.id = dpc.returnable_id
                 WHERE dpc.packaging_id = ?",
            )
            .bind(pk.id)
            .fetch_all(&db.pool)
            .await?;

            packagings.push(ProductPackagingDto {
                id: pk.id,
                product_id: pk.product_id,
                name: pk.name,
                base_unit: pk.base_unit,
                coefficient_milli: pk.coefficient_milli,
                purchase_price: pk.purchase_price,
                wholesale_price: pk.wholesale_price,
                semi_wholesale_price: pk.semi_wholesale_price,
                retail_price: pk.retail_price,
                barcode: pk.barcode,
                allow_fraction: pk.allow_fraction,
                is_active: pk.is_active,
                deposit_mode: pk.deposit_mode,
                components: comps,
            });
        }

        let avg_cost = prod
            .average_cost_num
            .as_deref()
            .and_then(|n| n.parse::<i128>().ok())
            .zip(
                prod.average_cost_den
                    .as_deref()
                    .and_then(|d| d.parse::<i128>().ok()),
            )
            .and_then(|(num, den)| {
                if den > 0 {
                    Some(((num + den / 2) / den) as i64)
                } else {
                    None
                }
            });

        items.push(ProductSummaryDto {
            id: prod.id,
            reference: prod.reference,
            barcode: prod.barcode,
            name: prod.name,
            brand: prod.brand,
            category_id: prod.category_id,
            category_name: prod.category_name,
            supplier_id: prod.supplier_id,
            supplier_name: prod.supplier_name,
            description: prod.description,
            base_unit: prod.base_unit,
            stock_milli: prod.stock_milli,
            min_stock_milli: prod.min_stock_milli,
            max_stock_milli: prod.max_stock_milli,
            average_cost_fcfa: avg_cost,
            purchase_price: prod.purchase_price,
            wholesale_price: prod.wholesale_price,
            semi_wholesale_price: prod.semi_wholesale_price,
            retail_price: prod.retail_price,
            image_path: prod.image_path,
            is_active: prod.is_active,
            packagings,
        });
    }
    Ok(items)
}

pub async fn list_active_products(
    db: &DepotDb,
    search: Option<&str>,
    limit: i64,
    offset: i64,
) -> CoreResult<Vec<ProductSummaryDto>> {
    let page = (offset / limit.max(1)) + 1;
    let res = list_products(db, search, None, false, false, page, limit).await?;
    Ok(res.items)
}

async fn get_product_by_id(db: &DepotDb, id: i64) -> CoreResult<ProductSummaryDto> {
    let row = sqlx::query_as::<_, ProductRow>(
        "SELECT p.id, p.reference, p.barcode, p.name, p.brand, p.category_id, c.name AS category_name,
                p.supplier_id, s.name AS supplier_name, p.description, p.base_unit,
                p.stock_milli, p.min_stock_milli, p.max_stock_milli, p.average_cost_num, p.average_cost_den,
                p.purchase_price, p.wholesale_price, p.semi_wholesale_price, p.retail_price, p.image_path, p.is_active
         FROM products p
         JOIN categories c ON c.id = p.category_id
         LEFT JOIN suppliers s ON s.id = p.supplier_id
         WHERE p.id = ?",
    )
    .bind(id)
    .fetch_optional(&db.pool)
    .await?
    .ok_or_else(|| CoreError::Validation("Produit introuvable.".to_string()))?;

    let mut items = hydrate_products(db, vec![row]).await?;
    items
        .pop()
        .ok_or_else(|| CoreError::Validation("Produit introuvable.".to_string()))
}

fn validate_packaging_prices(pkg: &PackagingInput) -> CoreResult<()> {
    if let Some(v) = pkg.purchase_price {
        Money::from_non_negative(v, "Prix d'achat (conditionnement)")?;
    }
    if let Some(v) = pkg.wholesale_price {
        Money::from_non_negative(v, "Prix gros (conditionnement)")?;
    }
    if let Some(v) = pkg.semi_wholesale_price {
        Money::from_non_negative(v, "Prix demi-gros (conditionnement)")?;
    }
    if let Some(v) = pkg.retail_price {
        Money::from_non_negative(v, "Prix détail (conditionnement)")?;
    }
    Ok(())
}

pub async fn create_product(
    db: &DepotDb,
    input: CreateProductInput,
) -> CoreResult<ProductSummaryDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let name = input.name.trim().to_string();
    let base_unit = input.base_unit.trim().to_string();
    if name.is_empty() {
        return Err(CoreError::Validation(
            "Le nom du produit est obligatoire.".to_string(),
        ));
    }
    if base_unit.is_empty() {
        return Err(CoreError::Validation(
            "L'unité de base est obligatoire.".to_string(),
        ));
    }

    let initial_stock = Quantity::parse_str(
        input.initial_stock.as_deref().unwrap_or("0"),
        "Stock initial",
    )?;
    let min_stock =
        Quantity::parse_str(input.min_stock.as_deref().unwrap_or("0"), "Stock minimum")?;
    let max_stock =
        Quantity::parse_str(input.max_stock.as_deref().unwrap_or("0"), "Stock maximum")?;

    let purchase_price = input
        .purchase_price
        .map(|v| Money::from_non_negative(v, "Prix d'achat").map(|m| m.value()))
        .transpose()?;
    let wholesale_price = input
        .wholesale_price
        .map(|v| Money::from_non_negative(v, "Prix gros").map(|m| m.value()))
        .transpose()?;
    let semi_price = input
        .semi_wholesale_price
        .map(|v| Money::from_non_negative(v, "Prix demi-gros").map(|m| m.value()))
        .transpose()?;
    let retail_price = input
        .retail_price
        .map(|v| Money::from_non_negative(v, "Prix détail").map(|m| m.value()))
        .transpose()?;
    let image_path = sanitize_image_path(input.image_path.as_deref())?;

    let default_pkg_name = if ALLOWED_PACKAGING_NAMES.contains(&base_unit.as_str()) {
        base_unit.clone()
    } else {
        "bouteille".to_string()
    };

    let packagings = match input.packagings {
        Some(list) if !list.is_empty() => list,
        _ => vec![PackagingInput {
            id: None,
            name: default_pkg_name,
            coefficient: "1".to_string(),
            purchase_price,
            wholesale_price,
            semi_wholesale_price: semi_price,
            retail_price,
            barcode: None,
            allow_fraction: Some(false),
            is_active: Some(true),
            deposit_mode: Some("none".to_string()),
            components: None,
        }],
    };

    let mut seen_pkg_names = HashSet::with_capacity(packagings.len());
    for pkg in &packagings {
        if !ALLOWED_PACKAGING_NAMES.contains(&pkg.name.as_str()) {
            return Err(CoreError::Validation(format!(
                "Conditionnement non autorisé : {}",
                pkg.name
            )));
        }
        if !seen_pkg_names.insert(pkg.name.clone()) {
            return Err(CoreError::DuplicateOperation(format!(
                "Conditionnement \"{}\" dupliqué sur le même produit.",
                pkg.name
            )));
        }
        let coeff = Quantity::parse_str(&pkg.coefficient, &format!("Coefficient ({})", pkg.name))?;
        if coeff.milli_units <= 0 {
            return Err(CoreError::Validation(
                "Coefficient nul interdit.".to_string(),
            ));
        }
        validate_packaging_prices(pkg)?;
    }

    let (_guard, mut tx) = db.begin_write().await?;

    if sqlx::query_scalar::<_, i64>("SELECT id FROM categories WHERE id = ?")
        .bind(input.category_id)
        .fetch_optional(&mut *tx)
        .await?
        .is_none()
    {
        return Err(CoreError::Validation("Catégorie introuvable.".to_string()));
    }
    if let Some(sup_id) = input.supplier_id {
        if sqlx::query_scalar::<_, i64>("SELECT id FROM suppliers WHERE id = ?")
            .bind(sup_id)
            .fetch_optional(&mut *tx)
            .await?
            .is_none()
        {
            return Err(CoreError::Validation(
                "Fournisseur introuvable.".to_string(),
            ));
        }
    }

    ensure_unique_product_name(&mut tx, &name, None).await?;

    let clean_barcode = input
        .barcode
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if let Some(bc) = clean_barcode {
        let dup: Option<(i64,)> = sqlx::query_as(
            "SELECT id FROM products WHERE barcode = ? UNION SELECT id FROM product_packagings WHERE barcode = ?",
        )
        .bind(bc)
        .bind(bc)
        .fetch_optional(&mut *tx)
        .await?;
        if dup.is_some() {
            return Err(CoreError::DuplicateOperation(
                "Ce code-barres est déjà utilisé.".to_string(),
            ));
        }
    }

    let reference = DepotDb::next_sequence(&mut tx, "PROD").await?;
    let avg_num = purchase_price.map(|v| v.to_string());
    let avg_den = purchase_price.map(|_| "1".to_string());
    let is_active = if input.is_active.unwrap_or(true) {
        1_i64
    } else {
        0_i64
    };

    let product_id = sqlx::query(
        "INSERT INTO products (reference, barcode, name, brand, category_id, supplier_id, description, base_unit,
                               stock_milli, min_stock_milli, max_stock_milli, average_cost_num, average_cost_den,
                               purchase_price, wholesale_price, semi_wholesale_price, retail_price, image_path, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&reference)
    .bind(clean_barcode)
    .bind(&name)
    .bind(input.brand.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.category_id)
    .bind(input.supplier_id)
    .bind(input.description.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(&base_unit)
    .bind(initial_stock.milli_units)
    .bind(min_stock.milli_units)
    .bind(max_stock.milli_units)
    .bind(avg_num)
    .bind(avg_den)
    .bind(purchase_price)
    .bind(wholesale_price)
    .bind(semi_price)
    .bind(retail_price)
    .bind(image_path)
    .bind(is_active)
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    if initial_stock.milli_units > 0 {
        sqlx::query(
            "INSERT INTO stock_movements (product_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, unit_cost, reason, reference_document)
             VALUES (?, 'manual_adjust', ?, 0, ?, ?, 'Stock initial à la création', ?)",
        )
        .bind(product_id)
        .bind(initial_stock.milli_units)
        .bind(initial_stock.milli_units)
        .bind(purchase_price)
        .bind(&reference)
        .execute(&mut *tx)
        .await?;
    }

    for pkg in packagings {
        let coeff = Quantity::parse_str(&pkg.coefficient, &format!("Coefficient ({})", pkg.name))?;
        let pkg_bc = pkg
            .barcode
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty());
        if let Some(bc) = pkg_bc {
            let dup: Option<(i64,)> = sqlx::query_as(
                "SELECT id FROM products WHERE barcode = ? UNION SELECT id FROM product_packagings WHERE barcode = ?",
            )
            .bind(bc)
            .bind(bc)
            .fetch_optional(&mut *tx)
            .await?;
            if dup.is_some() {
                return Err(CoreError::DuplicateOperation(format!(
                    "Code-barres déjà utilisé : {bc}"
                )));
            }
        }

        let pkg_id = sqlx::query(
            "INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, barcode, allow_fraction)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(product_id)
        .bind(&pkg.name)
        .bind(&base_unit)
        .bind(coeff.milli_units)
        .bind(pkg.purchase_price)
        .bind(pkg.wholesale_price)
        .bind(pkg.semi_wholesale_price)
        .bind(pkg.retail_price)
        .bind(pkg_bc)
        .bind(if pkg.allow_fraction.unwrap_or(false) { 1_i64 } else { 0_i64 })
        .execute(&mut *tx)
        .await?
        .last_insert_rowid();

        let mode = if pkg.deposit_mode.as_deref() == Some("deposit") {
            "deposit"
        } else {
            "none"
        };
        sqlx::query("INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, ?)")
            .bind(pkg_id)
            .bind(mode)
            .execute(&mut *tx)
            .await?;

        if mode == "deposit" {
            if let Some(comps) = pkg.components {
                for comp in comps {
                    if comp.pieces_per_pack <= 0 {
                        return Err(CoreError::Validation(
                            "Nombre de pièces par conditionnement invalide.".to_string(),
                        ));
                    }
                    let rt_exists: Option<i64> = sqlx::query_scalar(
                        "SELECT id FROM returnable_packaging_types WHERE id = ?",
                    )
                    .bind(comp.returnable_id)
                    .fetch_optional(&mut *tx)
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
                    .bind(comp.returnable_id)
                    .bind(comp.pieces_per_pack)
                    .execute(&mut *tx)
                    .await?;
                }
            }
        }
    }

    audit_log_tx(
        &mut tx,
        "CREATE_PRODUCT",
        "products",
        Some(product_id.to_string()),
        &format!("Création produit {reference} — {name}"),
    )
    .await?;
    tx.commit().await?;
    get_product_by_id(db, product_id).await
}

pub async fn update_product(
    db: &DepotDb,
    id: i64,
    input: UpdateProductInput,
) -> CoreResult<ProductSummaryDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    type ExistingProductRow = (
        String,
        String,
        Option<String>,
        Option<String>,
        i64,
        Option<i64>,
        Option<String>,
        i64,
        i64,
        Option<i64>,
        Option<i64>,
        Option<i64>,
        Option<i64>,
        Option<String>,
        i64,
    );
    let (_guard, mut tx) = db.begin_write().await?;
    let existing: Option<ExistingProductRow> = sqlx::query_as(
        "SELECT reference, name, brand, barcode, category_id, supplier_id, description,
                min_stock_milli, max_stock_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, image_path, is_active
         FROM products WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;

    let cur = existing.ok_or_else(|| CoreError::Validation("Produit introuvable.".to_string()))?;

    let has_name_update = input.name.is_some();
    let name = match input.name {
        Some(n) => {
            let trimmed = n.trim().to_string();
            if trimmed.is_empty() {
                return Err(CoreError::Validation("Nom produit invalide.".to_string()));
            }
            trimmed
        }
        None => cur.1.clone(),
    };
    if has_name_update {
        ensure_unique_product_name(&mut tx, &name, Some(id)).await?;
    }

    if let Some(cid) = input.category_id {
        if sqlx::query_scalar::<_, i64>("SELECT id FROM categories WHERE id = ?")
            .bind(cid)
            .fetch_optional(&mut *tx)
            .await?
            .is_none()
        {
            return Err(CoreError::Validation("Catégorie introuvable.".to_string()));
        }
    }
    if let Some(Some(sid)) = input.supplier_id {
        if sqlx::query_scalar::<_, i64>("SELECT id FROM suppliers WHERE id = ?")
            .bind(sid)
            .fetch_optional(&mut *tx)
            .await?
            .is_none()
        {
            return Err(CoreError::Validation(
                "Fournisseur introuvable.".to_string(),
            ));
        }
    }

    let barcode = match input.barcode {
        Some(b) => {
            let trimmed = b.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }
        None => cur.3.clone(),
    };
    if let Some(ref bc) = barcode {
        let dup: Option<(i64,)> = sqlx::query_as(
            "SELECT id FROM products WHERE barcode = ? AND id != ? UNION SELECT id FROM product_packagings WHERE barcode = ?",
        )
        .bind(bc)
        .bind(id)
        .bind(bc)
        .fetch_optional(&mut *tx)
        .await?;
        if dup.is_some() {
            return Err(CoreError::DuplicateOperation(
                "Code-barres déjà utilisé.".to_string(),
            ));
        }
    }

    let min_stock = match input.min_stock {
        Some(s) => Quantity::parse_str(&s, "Stock minimum")?.milli_units,
        None => cur.7,
    };
    let max_stock = match input.max_stock {
        Some(s) => Quantity::parse_str(&s, "Stock maximum")?.milli_units,
        None => cur.8,
    };

    let purchase_price = match input.purchase_price {
        Some(v) => Some(Money::from_non_negative(v, "Prix d'achat")?.value()),
        None => cur.9,
    };
    let wholesale_price = match input.wholesale_price {
        Some(v) => Some(Money::from_non_negative(v, "Prix gros")?.value()),
        None => cur.10,
    };
    let semi_price = match input.semi_wholesale_price {
        Some(v) => Some(Money::from_non_negative(v, "Prix demi-gros")?.value()),
        None => cur.11,
    };
    let retail_price = match input.retail_price {
        Some(v) => Some(Money::from_non_negative(v, "Prix détail")?.value()),
        None => cur.12,
    };
    let image_path = match input.image_path {
        Some(opt) => sanitize_image_path(opt.as_deref())?,
        None => cur.13.clone(),
    };
    let is_active = input
        .is_active
        .map(|b| if b { 1_i64 } else { 0_i64 })
        .unwrap_or(cur.14);
    let brand = match input.brand {
        Some(b) => {
            let trimmed = b.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }
        None => cur.2,
    };
    let supplier_id = input.supplier_id.unwrap_or(cur.5);
    let description = match input.description {
        Some(d) => {
            let trimmed = d.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }
        None => cur.6,
    };

    sqlx::query(
        "UPDATE products
         SET name = ?, brand = ?, barcode = ?, category_id = ?, supplier_id = ?, description = ?,
             min_stock_milli = ?, max_stock_milli = ?, purchase_price = ?, wholesale_price = ?,
             semi_wholesale_price = ?, retail_price = ?, image_path = ?, is_active = ?
         WHERE id = ?",
    )
    .bind(&name)
    .bind(brand)
    .bind(&barcode)
    .bind(input.category_id.unwrap_or(cur.4))
    .bind(supplier_id)
    .bind(description)
    .bind(min_stock)
    .bind(max_stock)
    .bind(purchase_price)
    .bind(wholesale_price)
    .bind(semi_price)
    .bind(retail_price)
    .bind(image_path)
    .bind(is_active)
    .bind(id)
    .execute(&mut *tx)
    .await?;

    audit_log_tx(
        &mut tx,
        "UPDATE_PRODUCT",
        "products",
        Some(id.to_string()),
        &format!("Mise à jour produit {}", cur.0),
    )
    .await?;
    tx.commit().await?;
    get_product_by_id(db, id).await
}

#[derive(Debug, Serialize)]
pub struct DeleteProductResultDto {
    pub deleted: bool,
    pub id: i64,
    pub reference: String,
    pub name: String,
}

pub async fn delete_product(db: &DepotDb, id: i64) -> CoreResult<DeleteProductResultDto> {
    require_current_actor_permission(Permission::CatalogDelete)?;
    if let Some(actor) = current_actor() {
        if actor.role != Role::Owner {
            return Err(CoreError::Forbidden(
                "Seul le Propriétaire peut supprimer définitivement un produit.".to_string(),
            ));
        }
    }

    let (_guard, mut tx) = db.begin_write().await?;
    let existing: Option<(i64, String, String)> =
        sqlx::query_as("SELECT id, reference, name FROM products WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let (prod_id, reference, name) =
        existing.ok_or_else(|| CoreError::Validation("Produit introuvable.".to_string()))?;

    let has_sale: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM sale_lines WHERE product_id = ? LIMIT 1")
            .bind(prod_id)
            .fetch_optional(&mut *tx)
            .await?;
    let has_po: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM purchase_order_lines WHERE product_id = ? LIMIT 1")
            .bind(prod_id)
            .fetch_optional(&mut *tx)
            .await?;
    let has_inv: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM inventory_lines WHERE product_id = ? LIMIT 1")
            .bind(prod_id)
            .fetch_optional(&mut *tx)
            .await?;
    let has_move: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM stock_movements WHERE product_id = ? LIMIT 1")
            .bind(prod_id)
            .fetch_optional(&mut *tx)
            .await?;

    if has_sale.is_some() || has_po.is_some() || has_inv.is_some() || has_move.is_some() {
        return Err(CoreError::HistoricalImmutable(
            "Produit utilisé dans ventes, achats ou stocks : archivez-le.".to_string(),
        ));
    }

    sqlx::query(
        "DELETE FROM deposit_packaging_components WHERE packaging_id IN (SELECT id FROM product_packagings WHERE product_id = ?)",
    )
    .bind(prod_id)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "DELETE FROM deposit_packaging_profiles WHERE packaging_id IN (SELECT id FROM product_packagings WHERE product_id = ?)",
    )
    .bind(prod_id)
    .execute(&mut *tx)
    .await?;
    sqlx::query("DELETE FROM product_packagings WHERE product_id = ?")
        .bind(prod_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM products WHERE id = ?")
        .bind(prod_id)
        .execute(&mut *tx)
        .await?;

    audit_log_tx(
        &mut tx,
        "DELETE_PRODUCT",
        "products",
        Some(prod_id.to_string()),
        &format!("Suppression définitive produit {reference} — {name}"),
    )
    .await?;
    tx.commit().await?;

    Ok(DeleteProductResultDto {
        deleted: true,
        id: prod_id,
        reference,
        name,
    })
}

pub async fn upsert_packaging(
    db: &DepotDb,
    product_id: i64,
    pkg: PackagingInput,
) -> CoreResult<ProductPackagingDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    if !ALLOWED_PACKAGING_NAMES.contains(&pkg.name.as_str()) {
        return Err(CoreError::Validation(
            "Type de conditionnement invalide.".to_string(),
        ));
    }
    let coeff = Quantity::parse_str(&pkg.coefficient, "Coefficient")?;
    if coeff.milli_units <= 0 {
        return Err(CoreError::Validation(
            "Coefficient nul interdit.".to_string(),
        ));
    }
    validate_packaging_prices(&pkg)?;

    let (_guard, mut tx) = db.begin_write().await?;
    let base_unit: Option<(String,)> =
        sqlx::query_as("SELECT base_unit FROM products WHERE id = ?")
            .bind(product_id)
            .fetch_optional(&mut *tx)
            .await?;
    let (base_unit,) =
        base_unit.ok_or_else(|| CoreError::Validation("Produit introuvable.".to_string()))?;

    let pkg_bc = pkg
        .barcode
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if let Some(bc) = pkg_bc {
        let dup: Option<(i64,)> = sqlx::query_as(
            "SELECT id FROM products WHERE barcode = ? UNION SELECT id FROM product_packagings WHERE barcode = ? AND id != ?",
        )
        .bind(bc)
        .bind(bc)
        .bind(pkg.id.unwrap_or(-1))
        .fetch_optional(&mut *tx)
        .await?;
        if dup.is_some() {
            return Err(CoreError::DuplicateOperation(
                "Code-barres déjà utilisé.".to_string(),
            ));
        }
    }

    let dup_name: Option<(i64,)> = sqlx::query_as(
        "SELECT id FROM product_packagings WHERE product_id = ? AND name = ? AND id != ?",
    )
    .bind(product_id)
    .bind(&pkg.name)
    .bind(pkg.id.unwrap_or(-1))
    .fetch_optional(&mut *tx)
    .await?;
    if dup_name.is_some() {
        return Err(CoreError::DuplicateOperation(format!(
            "Un conditionnement \"{}\" existe déjà pour ce produit. Sélectionnez-le pour le modifier.",
            pkg.name
        )));
    }

    let pkg_id = if let Some(id) = pkg.id {
        let exists: Option<(i64,)> =
            sqlx::query_as("SELECT id FROM product_packagings WHERE id = ? AND product_id = ?")
                .bind(id)
                .bind(product_id)
                .fetch_optional(&mut *tx)
                .await?;
        if exists.is_none() {
            return Err(CoreError::Validation(
                "Conditionnement introuvable pour ce produit.".to_string(),
            ));
        }
        sqlx::query(
            "UPDATE product_packagings
             SET name = ?, coefficient_milli = ?, purchase_price = ?, wholesale_price = ?,
                 semi_wholesale_price = ?, retail_price = ?, barcode = ?, allow_fraction = ?, is_active = ?
             WHERE id = ? AND product_id = ?",
        )
        .bind(&pkg.name)
        .bind(coeff.milli_units)
        .bind(pkg.purchase_price)
        .bind(pkg.wholesale_price)
        .bind(pkg.semi_wholesale_price)
        .bind(pkg.retail_price)
        .bind(pkg_bc)
        .bind(if pkg.allow_fraction.unwrap_or(false) { 1_i64 } else { 0_i64 })
        .bind(if pkg.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
        .bind(id)
        .bind(product_id)
        .execute(&mut *tx)
        .await?;
        id
    } else {
        sqlx::query(
            "INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, barcode, allow_fraction)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(product_id)
        .bind(&pkg.name)
        .bind(&base_unit)
        .bind(coeff.milli_units)
        .bind(pkg.purchase_price)
        .bind(pkg.wholesale_price)
        .bind(pkg.semi_wholesale_price)
        .bind(pkg.retail_price)
        .bind(pkg_bc)
        .bind(if pkg.allow_fraction.unwrap_or(false) { 1_i64 } else { 0_i64 })
        .execute(&mut *tx)
        .await?
        .last_insert_rowid()
    };

    let mode = if pkg.deposit_mode.as_deref() == Some("deposit") {
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
    .execute(&mut *tx)
    .await?;

    sqlx::query("DELETE FROM deposit_packaging_components WHERE packaging_id = ?")
        .bind(pkg_id)
        .execute(&mut *tx)
        .await?;

    if mode == "deposit" {
        if let Some(comps) = pkg.components {
            for c in comps {
                if c.pieces_per_pack <= 0 {
                    return Err(CoreError::Validation(
                        "Pièces par conditionnement invalides.".to_string(),
                    ));
                }
                let rt_exists: Option<i64> =
                    sqlx::query_scalar("SELECT id FROM returnable_packaging_types WHERE id = ?")
                        .bind(c.returnable_id)
                        .fetch_optional(&mut *tx)
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
                .execute(&mut *tx)
                .await?;
            }
        }
    }

    audit_log_tx(
        &mut tx,
        "UPSERT_PACKAGING",
        "product_packagings",
        Some(pkg_id.to_string()),
        &format!("Conditionnement {}", pkg.name),
    )
    .await?;
    tx.commit().await?;

    let prod = get_product_by_id(db, product_id).await?;
    prod.packagings
        .into_iter()
        .find(|p| p.id == pkg_id)
        .ok_or_else(|| CoreError::Internal("Conditionnement introuvable.".to_string()))
}

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
        let p_whole = parse_opt_fcfa("wholesale_price")?;
        let p_semi = parse_opt_fcfa("semi_wholesale_price")?;
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

        let pkg_name = if ALLOWED_PACKAGING_NAMES.contains(&base_unit) {
            base_unit
        } else {
            "bouteille"
        };
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

#[derive(Debug, Clone, Deserialize)]
struct PresetBreweryMeta {
    brewery: String,
    name: String,
    company_name: String,
    phone: String,
    address: String,
    payment_terms_days: i64,
}

#[derive(Debug, Clone, Deserialize)]
struct PresetReturnableMeta {
    code: String,
    name: String,
    producer: String,
    kind: String,
    description: Option<String>,
    deposit_value: i64,
}

#[derive(Debug, Clone, Deserialize)]
struct PresetComponentRaw {
    returnable_code: String,
    pieces_per_pack: i64,
}

#[derive(Debug, Clone, Deserialize)]
struct PresetPackagingRaw {
    name: String,
    coefficient: String,
    purchase_price: i64,
    wholesale_price: i64,
    semi_wholesale_price: i64,
    retail_price: i64,
    barcode: Option<String>,
    allow_fraction: bool,
    deposit_mode: String,
    #[serde(default)]
    components: Vec<PresetComponentRaw>,
}

#[derive(Debug, Clone, Deserialize)]
struct PresetProductRaw {
    key: String,
    brewery: String,
    name: String,
    brand: String,
    barcode: String,
    category: String,
    base_unit: String,
    initial_stock: String,
    min_stock: String,
    purchase_price: i64,
    wholesale_price: i64,
    semi_wholesale_price: i64,
    retail_price: i64,
    description: String,
    packagings: Vec<PresetPackagingRaw>,
}

#[derive(Debug, Deserialize)]
struct BreweryCatalogFile {
    breweries: Vec<PresetBreweryMeta>,
    returnables: Vec<PresetReturnableMeta>,
    products: Vec<PresetProductRaw>,
}

#[derive(Debug, Serialize)]
pub struct CatalogPresetComponentDto {
    pub returnable_code: String,
    pub returnable_name: String,
    pub pieces_per_pack: i64,
}

#[derive(Debug, Serialize)]
pub struct CatalogPresetPackagingDto {
    pub name: String,
    pub coefficient: String,
    pub purchase_price: i64,
    pub wholesale_price: i64,
    pub semi_wholesale_price: i64,
    pub retail_price: i64,
    pub barcode: Option<String>,
    pub allow_fraction: bool,
    pub deposit_mode: String,
    pub components: Vec<CatalogPresetComponentDto>,
}

#[derive(Debug, Serialize)]
pub struct CatalogPresetItemDto {
    pub key: String,
    pub brewery: String,
    pub name: String,
    pub brand: String,
    pub barcode: String,
    pub category: String,
    pub base_unit: String,
    pub initial_stock: String,
    pub min_stock: String,
    pub purchase_price: i64,
    pub wholesale_price: i64,
    pub semi_wholesale_price: i64,
    pub retail_price: i64,
    pub description: String,
    pub packagings: Vec<CatalogPresetPackagingDto>,
    pub existing_product_id: Option<i64>,
    pub existing_reference: Option<String>,
    pub existing_is_active: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct CatalogPresetListDto {
    pub items: Vec<CatalogPresetItemDto>,
}

#[derive(Debug, Deserialize)]
pub struct ApplyCatalogPresetsInput {
    pub keys: Vec<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub activate: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct ApplyCatalogPresetsResultDto {
    pub created: i64,
    pub reactivated: i64,
    pub skipped: i64,
    pub activate: bool,
    pub products: Vec<ProductSummaryDto>,
}

#[derive(Debug, FromRow)]
struct ExistingPresetProductRow {
    id: i64,
    reference: String,
    name: String,
    barcode: Option<String>,
    is_active: i64,
}

fn parse_brewery_catalog() -> CoreResult<BreweryCatalogFile> {
    serde_json::from_str(BREWERY_CATALOG_JSON)
        .map_err(|e| CoreError::Internal(format!("Catalogue prédéfini invalide : {e}")))
}

pub async fn list_catalog_presets(db: &DepotDb) -> CoreResult<CatalogPresetListDto> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let catalog = parse_brewery_catalog()?;
    let ret_names: HashMap<String, String> = catalog
        .returnables
        .iter()
        .map(|r| (r.code.clone(), r.name.clone()))
        .collect();

    let existing_rows = sqlx::query_as::<_, ExistingPresetProductRow>(
        "SELECT id, reference, name, barcode, is_active FROM products",
    )
    .fetch_all(&db.pool)
    .await?;
    let mut by_barcode: HashMap<String, (i64, String, i64)> = HashMap::new();
    let mut by_norm_name: HashMap<String, (i64, String, i64)> = HashMap::new();
    for r in existing_rows {
        let info = (r.id, r.reference, r.is_active);
        if let Some(bc) = r.barcode {
            by_barcode.insert(bc, info.clone());
        }
        by_norm_name.insert(normalize_product_name(&r.name), info);
    }

    let mut items = Vec::with_capacity(catalog.products.len());
    for p in catalog.products {
        let existing = by_barcode
            .get(&p.barcode)
            .or_else(|| by_norm_name.get(&normalize_product_name(&p.name)))
            .cloned();

        let packagings = p
            .packagings
            .into_iter()
            .map(|pk| CatalogPresetPackagingDto {
                name: pk.name,
                coefficient: pk.coefficient,
                purchase_price: pk.purchase_price,
                wholesale_price: pk.wholesale_price,
                semi_wholesale_price: pk.semi_wholesale_price,
                retail_price: pk.retail_price,
                barcode: pk.barcode,
                allow_fraction: pk.allow_fraction,
                deposit_mode: pk.deposit_mode,
                components: pk
                    .components
                    .into_iter()
                    .map(|c| {
                        let rname = ret_names
                            .get(&c.returnable_code)
                            .cloned()
                            .unwrap_or_else(|| c.returnable_code.clone());
                        CatalogPresetComponentDto {
                            returnable_code: c.returnable_code,
                            returnable_name: rname,
                            pieces_per_pack: c.pieces_per_pack,
                        }
                    })
                    .collect(),
            })
            .collect();

        items.push(CatalogPresetItemDto {
            key: p.key,
            brewery: p.brewery,
            name: p.name,
            brand: p.brand,
            barcode: p.barcode,
            category: p.category,
            base_unit: p.base_unit,
            initial_stock: p.initial_stock,
            min_stock: p.min_stock,
            purchase_price: p.purchase_price,
            wholesale_price: p.wholesale_price,
            semi_wholesale_price: p.semi_wholesale_price,
            retail_price: p.retail_price,
            description: p.description,
            packagings,
            existing_product_id: existing.as_ref().map(|r| r.0),
            existing_reference: existing.as_ref().map(|r| r.1.clone()),
            existing_is_active: existing.as_ref().map(|r| r.2),
        });
    }

    Ok(CatalogPresetListDto { items })
}

pub async fn apply_catalog_presets(
    db: &DepotDb,
    input: ApplyCatalogPresetsInput,
) -> CoreResult<ApplyCatalogPresetsResultDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let catalog = parse_brewery_catalog()?;
    let preset_map: HashMap<&str, &PresetProductRaw> = catalog
        .products
        .iter()
        .map(|p| (p.key.as_str(), p))
        .collect();
    let brewery_map: HashMap<&str, &PresetBreweryMeta> = catalog
        .breweries
        .iter()
        .map(|b| (b.brewery.as_str(), b))
        .collect();
    let returnable_map: HashMap<&str, &PresetReturnableMeta> = catalog
        .returnables
        .iter()
        .map(|r| (r.code.as_str(), r))
        .collect();

    let mut dedup_keys = Vec::new();
    let mut seen_keys = HashSet::new();
    for raw_key in &input.keys {
        let trimmed = raw_key.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !preset_map.contains_key(trimmed) {
            return Err(CoreError::Validation(format!(
                "Produit prédéfini introuvable : {trimmed}"
            )));
        }
        if seen_keys.insert(trimmed.to_string()) {
            dedup_keys.push(trimmed.to_string());
        }
    }
    if dedup_keys.is_empty() {
        return Err(CoreError::Validation(
            "Sélectionnez au moins un produit du catalogue prédéfini.".to_string(),
        ));
    }

    let activate = input.activate.unwrap_or(true);
    let (_guard, mut tx) = db.begin_write().await?;

    let existing_rows = sqlx::query_as::<_, ExistingPresetProductRow>(
        "SELECT id, reference, name, barcode, is_active FROM products",
    )
    .fetch_all(&mut *tx)
    .await?;
    let mut by_barcode: HashMap<String, (i64, String, i64)> = HashMap::new();
    let mut by_norm_name: HashMap<String, (i64, String, i64)> = HashMap::new();
    for r in existing_rows {
        let info = (r.id, r.reference, r.is_active);
        if let Some(bc) = r.barcode {
            by_barcode.insert(bc, info.clone());
        }
        by_norm_name.insert(normalize_product_name(&r.name), info);
    }

    let mut created = 0_i64;
    let mut reactivated = 0_i64;
    let mut skipped = 0_i64;
    let mut affected_ids: Vec<i64> = Vec::new();

    for key in &dedup_keys {
        let preset = preset_map[key.as_str()];
        let norm_preset_name = normalize_product_name(&preset.name);
        let existing = by_barcode
            .get(&preset.barcode)
            .or_else(|| by_norm_name.get(&norm_preset_name))
            .cloned();

        if let Some((cur_id, cur_ref, cur_active)) = existing {
            if activate && cur_active == 0 {
                sqlx::query("UPDATE products SET is_active = 1 WHERE id = ?")
                    .bind(cur_id)
                    .execute(&mut *tx)
                    .await?;
                let updated_info = (cur_id, cur_ref, 1_i64);
                by_barcode.insert(preset.barcode.clone(), updated_info.clone());
                by_norm_name.insert(norm_preset_name, updated_info);
                reactivated += 1;
                affected_ids.push(cur_id);
            } else {
                skipped += 1;
            }
            continue;
        }

        let sup_pattern = format!("%{}%", preset.brewery.to_uppercase());
        let existing_sup: Option<i64> = sqlx::query_scalar(
            "SELECT id FROM suppliers
             WHERE upper(name) LIKE ? OR upper(COALESCE(company_name, '')) LIKE ?
             ORDER BY id ASC LIMIT 1",
        )
        .bind(&sup_pattern)
        .bind(&sup_pattern)
        .fetch_optional(&mut *tx)
        .await?;

        let supplier_id = match existing_sup {
            Some(sid) => sid,
            None => {
                let meta = brewery_map.get(preset.brewery.as_str()).ok_or_else(|| {
                    CoreError::Internal(format!(
                        "Métadonnées brasserie introuvables : {}",
                        preset.brewery
                    ))
                })?;
                let sup_code = DepotDb::next_sequence(&mut tx, "FRN").await?;
                sqlx::query(
                    "INSERT INTO suppliers (code, name, company_name, phone, address, payment_terms_days)
                     VALUES (?, ?, ?, ?, ?, ?)",
                )
                .bind(&sup_code)
                .bind(&meta.name)
                .bind(&meta.company_name)
                .bind(&meta.phone)
                .bind(&meta.address)
                .bind(meta.payment_terms_days)
                .execute(&mut *tx)
                .await?
                .last_insert_rowid()
            }
        };

        let existing_cat: Option<i64> =
            sqlx::query_scalar("SELECT id FROM categories WHERE lower(name) = lower(?)")
                .bind(&preset.category)
                .fetch_optional(&mut *tx)
                .await?;
        let category_id = match existing_cat {
            Some(cid) => cid,
            None => sqlx::query("INSERT INTO categories (name) VALUES (?)")
                .bind(&preset.category)
                .execute(&mut *tx)
                .await?
                .last_insert_rowid(),
        };

        let dup_pkg_bc: Option<i64> =
            sqlx::query_scalar("SELECT id FROM product_packagings WHERE barcode = ? LIMIT 1")
                .bind(&preset.barcode)
                .fetch_optional(&mut *tx)
                .await?;
        if dup_pkg_bc.is_some() {
            return Err(CoreError::DuplicateOperation(format!(
                "Code-barres déjà utilisé sur un conditionnement : {}",
                preset.barcode
            )));
        }

        let initial_stock = Quantity::parse_str(&preset.initial_stock, "Stock initial")?;
        let min_stock = Quantity::parse_str(&preset.min_stock, "Stock minimum")?;
        let purchase_price = Money::from_non_negative(preset.purchase_price, "Prix d'achat")?;
        let wholesale_price = Money::from_non_negative(preset.wholesale_price, "Prix gros")?;
        let semi_price = Money::from_non_negative(preset.semi_wholesale_price, "Prix demi-gros")?;
        let retail_price = Money::from_non_negative(preset.retail_price, "Prix détail")?;
        let is_active = if activate { 1_i64 } else { 0_i64 };

        let reference = DepotDb::next_sequence(&mut tx, "PROD").await?;
        let prod_id = sqlx::query(
            "INSERT INTO products (reference, barcode, name, brand, category_id, supplier_id, description, base_unit,
                                   stock_milli, min_stock_milli, max_stock_milli, average_cost_num, average_cost_den,
                                   purchase_price, wholesale_price, semi_wholesale_price, retail_price, image_path, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, '1', ?, ?, ?, ?, NULL, ?)",
        )
        .bind(&reference)
        .bind(&preset.barcode)
        .bind(&preset.name)
        .bind(&preset.brand)
        .bind(category_id)
        .bind(supplier_id)
        .bind(&preset.description)
        .bind(&preset.base_unit)
        .bind(initial_stock.milli_units)
        .bind(min_stock.milli_units)
        .bind(purchase_price.value().to_string())
        .bind(purchase_price.value())
        .bind(wholesale_price.value())
        .bind(semi_price.value())
        .bind(retail_price.value())
        .bind(is_active)
        .execute(&mut *tx)
        .await?
        .last_insert_rowid();

        for pk in &preset.packagings {
            if !ALLOWED_PACKAGING_NAMES.contains(&pk.name.as_str()) {
                return Err(CoreError::Validation(format!(
                    "Conditionnement non autorisé : {}",
                    pk.name
                )));
            }
            let coeff = Quantity::parse_str(&pk.coefficient, "Coefficient")?;
            let pkg_bc = pk
                .barcode
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty());
            if let Some(bc) = pkg_bc {
                let dup: Option<(i64,)> = sqlx::query_as(
                    "SELECT id FROM products WHERE barcode = ? UNION SELECT id FROM product_packagings WHERE barcode = ?",
                )
                .bind(bc)
                .bind(bc)
                .fetch_optional(&mut *tx)
                .await?;
                if dup.is_some() {
                    return Err(CoreError::DuplicateOperation(format!(
                        "Code-barres déjà utilisé : {bc}"
                    )));
                }
            }

            let pkg_id = sqlx::query(
                "INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, barcode, allow_fraction)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(prod_id)
            .bind(&pk.name)
            .bind(&preset.base_unit)
            .bind(coeff.milli_units)
            .bind(pk.purchase_price)
            .bind(pk.wholesale_price)
            .bind(pk.semi_wholesale_price)
            .bind(pk.retail_price)
            .bind(pkg_bc)
            .bind(if pk.allow_fraction { 1_i64 } else { 0_i64 })
            .execute(&mut *tx)
            .await?
            .last_insert_rowid();

            let mode = if pk.deposit_mode == "deposit" {
                "deposit"
            } else {
                "none"
            };
            sqlx::query(
                "INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, ?)",
            )
            .bind(pkg_id)
            .bind(mode)
            .execute(&mut *tx)
            .await?;

            if mode == "deposit" {
                for comp in &pk.components {
                    let existing_rt: Option<i64> = sqlx::query_scalar(
                        "SELECT id FROM returnable_packaging_types WHERE code = ?",
                    )
                    .bind(&comp.returnable_code)
                    .fetch_optional(&mut *tx)
                    .await?;

                    let rt_id = match existing_rt {
                        Some(id) => id,
                        None => {
                            let rmeta = returnable_map
                                .get(comp.returnable_code.as_str())
                                .ok_or_else(|| {
                                    CoreError::Internal(format!(
                                        "Emballage consigné prédéfini introuvable : {}",
                                        comp.returnable_code
                                    ))
                                })?;
                            let new_rt_id = sqlx::query(
                                "INSERT INTO returnable_packaging_types (code, name, producer, kind, description, deposit_value)
                                 VALUES (?, ?, ?, ?, ?, ?)",
                            )
                            .bind(&rmeta.code)
                            .bind(&rmeta.name)
                            .bind(&rmeta.producer)
                            .bind(&rmeta.kind)
                            .bind(&rmeta.description)
                            .bind(rmeta.deposit_value)
                            .execute(&mut *tx)
                            .await?
                            .last_insert_rowid();

                            sqlx::query(
                                "INSERT INTO returnable_stock_balances (packaging_id, quantity) VALUES (?, 0)",
                            )
                            .bind(new_rt_id)
                            .execute(&mut *tx)
                            .await?;
                            new_rt_id
                        }
                    };

                    sqlx::query(
                        "INSERT INTO deposit_packaging_components (packaging_id, returnable_id, pieces_per_pack)
                         VALUES (?, ?, ?)",
                    )
                    .bind(pkg_id)
                    .bind(rt_id)
                    .bind(comp.pieces_per_pack)
                    .execute(&mut *tx)
                    .await?;
                }
            }
        }

        let info = (prod_id, reference, is_active);
        by_barcode.insert(preset.barcode.clone(), info.clone());
        by_norm_name.insert(norm_preset_name, info);
        created += 1;
        affected_ids.push(prod_id);
    }

    if created > 0 || reactivated > 0 {
        audit_log_tx(
            &mut tx,
            "APPLY_CATALOG_PRESETS",
            "products",
            None,
            &format!(
                "Catalogue brasseries : {created} créé(s), {reactivated} réactivé(s), {skipped} ignoré(s) (actif={activate})"
            ),
        )
        .await?;
    }
    tx.commit().await?;

    let mut products = Vec::with_capacity(affected_ids.len());
    for pid in affected_ids {
        products.push(get_product_by_id(db, pid).await?);
    }

    Ok(ApplyCatalogPresetsResultDto {
        created,
        reactivated,
        skipped,
        activate,
        products,
    })
}
