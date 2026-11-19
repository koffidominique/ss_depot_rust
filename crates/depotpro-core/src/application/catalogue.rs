#![allow(clippy::needless_borrows_for_generic_args, clippy::collapsible_match)]

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, FromRow)]
pub struct BrandDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ProductVariantDto {
    pub id: i64,
    pub product_id: i64,
    pub name: String,
    pub reference: Option<String>,
    pub barcode: Option<String>,
    pub volume_ml: Option<i64>,
    pub alcohol_degree: Option<f64>,
    pub bottle_profile_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub compatibility_group_id: Option<i64>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct BottleProfileDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub volume_ml: i64,
    pub diameter_mm: Option<i64>,
    pub height_mm: Option<i64>,
    pub weight_g: Option<i64>,
    pub material: Option<String>,
    pub color: Option<String>,
    pub is_returnable: i64,
    pub deposit_value: Option<i64>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CrateTypeDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub bottle_count: i64,
    pub bottle_profile_id: Option<i64>,
    pub dimensions_cm: Option<String>,
    pub weight_g: Option<i64>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CompatibilityGroupDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct DisposablePackagingTypeDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub material: Option<String>,
    pub volume_ml: Option<i64>,
    pub weight_g: Option<i64>,
    pub is_recyclable: i64,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PackagingMaterialDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ContainerTypeDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub material_id: i64,
    pub volume_ml: i64,
    pub weight_g: Option<i64>,
    pub dimensions_cm: Option<String>,
    pub is_returnable: i64,
    pub deposit_value: Option<i64>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct UnitOfMeasureDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub symbol: String,
    pub base_unit_id: Option<i64>,
    pub conversion_factor: Option<f64>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct SupplierProductPriceDto {
    pub id: i64,
    pub supplier_id: i64,
    pub product_id: Option<i64>,
    pub variant_id: Option<i64>,
    pub price_fcfa: i64,
    pub currency: String,
    pub valid_from: String,
    pub valid_to: Option<String>,
    pub min_order_qty: Option<i64>,
    pub lead_time_days: Option<i64>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CustomerPriceListDto {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub currency: String,
    pub is_default: i64,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CustomerPriceListItemDto {
    pub id: i64,
    pub price_list_id: i64,
    pub product_id: Option<i64>,
    pub variant_id: Option<i64>,
    pub packaging_id: Option<i64>,
    pub price_fcfa: i64,
    pub valid_from: String,
    pub valid_to: Option<String>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PackagingValueDto {
    pub id: i64,
    pub returnable_id: i64,
    pub packaging_type: String,
    pub value_fcfa: i64,
    pub effective_from: String,
    pub effective_to: Option<String>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PriceHistoryDto {
    pub id: i64,
    pub entity_type: String,
    pub entity_id: i64,
    pub field_name: String,
    pub old_value: Option<i64>,
    pub new_value: i64,
    pub changed_by: Option<i64>,
    pub reason: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBrandInput {
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBrandInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub description: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProductVariantInput {
    pub product_id: i64,
    pub name: String,
    pub reference: Option<String>,
    pub barcode: Option<String>,
    pub volume_ml: Option<i64>,
    pub alcohol_degree: Option<f64>,
    pub bottle_profile_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub compatibility_group_id: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProductVariantInput {
    pub name: Option<String>,
    pub reference: Option<Option<String>>,
    pub barcode: Option<Option<String>>,
    pub volume_ml: Option<Option<i64>>,
    pub alcohol_degree: Option<Option<f64>>,
    pub bottle_profile_id: Option<Option<i64>>,
    pub crate_type_id: Option<Option<i64>>,
    pub compatibility_group_id: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBottleProfileInput {
    pub code: String,
    pub name: String,
    pub volume_ml: i64,
    pub diameter_mm: Option<i64>,
    pub height_mm: Option<i64>,
    pub weight_g: Option<i64>,
    pub material: Option<String>,
    pub color: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_returnable: Option<bool>,
    pub deposit_value: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBottleProfileInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub volume_ml: Option<i64>,
    pub diameter_mm: Option<Option<i64>>,
    pub height_mm: Option<Option<i64>>,
    pub weight_g: Option<Option<i64>>,
    pub material: Option<Option<String>>,
    pub color: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_returnable: Option<bool>,
    pub deposit_value: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCrateTypeInput {
    pub code: String,
    pub name: String,
    pub bottle_count: i64,
    pub bottle_profile_id: Option<i64>,
    pub dimensions_cm: Option<String>,
    pub weight_g: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCrateTypeInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub bottle_count: Option<i64>,
    pub bottle_profile_id: Option<Option<i64>>,
    pub dimensions_cm: Option<Option<String>>,
    pub weight_g: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCompatibilityGroupInput {
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCompatibilityGroupInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub description: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDisposablePackagingTypeInput {
    pub code: String,
    pub name: String,
    pub material: Option<String>,
    pub volume_ml: Option<i64>,
    pub weight_g: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_recyclable: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDisposablePackagingTypeInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub material: Option<Option<String>>,
    pub volume_ml: Option<Option<i64>>,
    pub weight_g: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_recyclable: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePackagingMaterialInput {
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePackagingMaterialInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub description: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateContainerTypeInput {
    pub code: String,
    pub name: String,
    pub material_id: i64,
    pub volume_ml: i64,
    pub weight_g: Option<i64>,
    pub dimensions_cm: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_returnable: Option<bool>,
    pub deposit_value: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateContainerTypeInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub material_id: Option<i64>,
    pub volume_ml: Option<i64>,
    pub weight_g: Option<Option<i64>>,
    pub dimensions_cm: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_returnable: Option<bool>,
    pub deposit_value: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUnitOfMeasureInput {
    pub code: String,
    pub name: String,
    pub symbol: String,
    pub base_unit_id: Option<i64>,
    pub conversion_factor: Option<f64>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUnitOfMeasureInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub symbol: Option<String>,
    pub base_unit_id: Option<Option<i64>>,
    pub conversion_factor: Option<Option<f64>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSupplierProductPriceInput {
    pub supplier_id: i64,
    pub product_id: Option<i64>,
    pub variant_id: Option<i64>,
    pub price_fcfa: i64,
    pub currency: Option<String>,
    pub valid_from: String,
    pub valid_to: Option<String>,
    pub min_order_qty: Option<i64>,
    pub lead_time_days: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSupplierProductPriceInput {
    pub supplier_id: Option<i64>,
    pub product_id: Option<Option<i64>>,
    pub variant_id: Option<Option<i64>>,
    pub price_fcfa: Option<i64>,
    pub currency: Option<String>,
    pub valid_from: Option<String>,
    pub valid_to: Option<Option<String>>,
    pub min_order_qty: Option<Option<i64>>,
    pub lead_time_days: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCustomerPriceListInput {
    pub name: String,
    pub description: Option<String>,
    pub currency: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_default: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCustomerPriceListInput {
    pub name: Option<String>,
    pub description: Option<Option<String>>,
    pub currency: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_default: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCustomerPriceListItemInput {
    pub price_list_id: i64,
    pub product_id: Option<i64>,
    pub variant_id: Option<i64>,
    pub packaging_id: Option<i64>,
    pub price_fcfa: i64,
    pub valid_from: String,
    pub valid_to: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCustomerPriceListItemInput {
    pub price_list_id: Option<i64>,
    pub product_id: Option<Option<i64>>,
    pub variant_id: Option<Option<i64>>,
    pub packaging_id: Option<Option<i64>>,
    pub price_fcfa: Option<i64>,
    pub valid_from: Option<String>,
    pub valid_to: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePackagingValueInput {
    pub returnable_id: i64,
    pub packaging_type: String,
    pub value_fcfa: i64,
    pub effective_from: String,
    pub effective_to: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePackagingValueInput {
    pub returnable_id: Option<i64>,
    pub packaging_type: Option<String>,
    pub value_fcfa: Option<i64>,
    pub effective_from: Option<String>,
    pub effective_to: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedQuery {
    #[serde(default = "default_page")]
    pub page: i64,
    #[serde(default = "default_page_size")]
    pub page_size: i64,
    pub search: Option<String>,
    pub include_archived: Option<bool>,
}

fn default_page() -> i64 {
    1
}
fn default_page_size() -> i64 {
    50
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedResponse<T> {
    pub items: Vec<T>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
    pub total_pages: i64,
}

pub(crate) fn deserialize_opt_bool_or_int<'de, D>(deserializer: D) -> Result<Option<bool>, D::Error>
where
    D: serde::Deserializer<'de>,
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

        fn visit_some<D2: serde::Deserializer<'de>>(
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

async fn check_duplicate(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    table: &str,
    code_field: &str,
    code: &str,
    exclude_id: Option<i64>,
) -> CoreResult<()> {
    let mut query = format!(
        "SELECT id FROM {} WHERE lower({}) = lower(?)",
        table, code_field
    );
    if exclude_id.is_some() {
        query.push_str(" AND id != ?");
    }
    let mut q = sqlx::query_scalar::<_, i64>(&query).bind(code);
    if let Some(id) = exclude_id {
        q = q.bind(id);
    }
    let exists: Option<i64> = q.fetch_optional(&mut **tx).await?;
    if exists.is_some() {
        return Err(CoreError::DuplicateOperation(format!(
            "Un(e) {} avec ce code existe déjà.",
            table
        )));
    }
    Ok(())
}

// ==================== BRANDS ====================

pub async fn list_brand(
    db: &DepotDb,
    query: PaginatedQuery,
) -> CoreResult<PaginatedResponse<BrandDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let pattern = format!("%{}%", search.trim());
    let has_search = !search.trim().is_empty();

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM brands WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, BrandDto>(
        "SELECT * FROM brands WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?) ORDER BY name ASC LIMIT ? OFFSET ?",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .bind(ps)
    .bind(offset)
    .fetch_all(&db.pool)
    .await?;

    let total_pages = ((total + ps - 1) / ps).max(1);
    Ok(PaginatedResponse {
        items: rows,
        total,
        page: p,
        page_size: ps,
        total_pages,
    })
}

pub async fn create_brand(db: &DepotDb, input: CreateBrandInput) -> CoreResult<BrandDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let clean_code = input.code.trim().to_uppercase();
    let clean_name = input.name.trim();
    if clean_code.is_empty() || clean_name.is_empty() {
        return Err(CoreError::Validation(
            "Le code et le nom sont obligatoires.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    check_duplicate(&mut tx, "brands", "code", &clean_code, None).await?;
    let id = sqlx::query(
        "INSERT INTO brands (code, name, description, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(&clean_code)
    .bind(&clean_name)
    .bind(input.description.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created = sqlx::query_as::<_, BrandDto>("SELECT * FROM brands WHERE id = ?")
        .bind(id)
        .fetch_one(&db.pool)
        .await?;
    Ok(created)
}

pub async fn update_brand(db: &DepotDb, id: i64, input: UpdateBrandInput) -> CoreResult<BrandDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;

    let mut updates = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(code) = &input.code {
        let clean = code.trim().to_uppercase();
        if clean.is_empty() {
            return Err(CoreError::Validation(
                "Le code ne peut pas être vide.".to_string(),
            ));
        }
        check_duplicate(&mut tx, "brands", "code", &clean, Some(id)).await?;
        updates.push("code = ?".to_string());
        binds.push(clean);
    }
    if let Some(name) = &input.name {
        let clean = name.trim();
        if clean.is_empty() {
            return Err(CoreError::Validation(
                "Le nom ne peut pas être vide.".to_string(),
            ));
        }
        updates.push("name = ?".to_string());
        binds.push(clean.to_string());
    }
    if let Some(Some(d)) = &input.description {
        updates.push("description = ?".to_string());
        binds.push(d.trim().to_string());
    }
    if let Some(active) = input.is_active {
        updates.push("is_active = ?".to_string());
        binds.push(if active { "1" } else { "0" }.to_string());
    }

    updates.push("updated_at = datetime('now')".to_string());

    if updates.is_empty() {
        return Err(CoreError::Validation(
            "Aucun champ à mettre à jour.".to_string(),
        ));
    }

    let sql = format!("UPDATE brands SET {} WHERE id = ?", updates.join(", "));
    let mut q = sqlx::query(&sql);
    for b in binds {
        q = q.bind(b);
    }
    q = q.bind(id);
    q.execute(&mut *tx).await?;
    tx.commit().await?;

    let updated = sqlx::query_as::<_, BrandDto>("SELECT * FROM brands WHERE id = ?")
        .bind(id)
        .fetch_one(&db.pool)
        .await?;
    Ok(updated)
}

pub async fn delete_brand(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let result = sqlx::query("DELETE FROM brands WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound("Marque introuvable.".to_string()));
    }
    tx.commit().await?;
    Ok(())
}

// ==================== BOTTLE PROFILES ====================

pub async fn list_bottle_profile(
    db: &DepotDb,
    query: PaginatedQuery,
) -> CoreResult<PaginatedResponse<BottleProfileDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let pattern = format!("%{}%", search.trim());
    let has_search = !search.trim().is_empty();

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM bottle_profiles WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, BottleProfileDto>(
        "SELECT * FROM bottle_profiles WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?) ORDER BY code ASC LIMIT ? OFFSET ?",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .bind(ps)
    .bind(offset)
    .fetch_all(&db.pool)
    .await?;

    let total_pages = ((total + ps - 1) / ps).max(1);
    Ok(PaginatedResponse {
        items: rows,
        total,
        page: p,
        page_size: ps,
        total_pages,
    })
}

pub async fn create_bottle_profile(
    db: &DepotDb,
    input: CreateBottleProfileInput,
) -> CoreResult<BottleProfileDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let clean_code = input.code.trim().to_uppercase();
    let clean_name = input.name.trim();
    if clean_code.is_empty() || clean_name.is_empty() {
        return Err(CoreError::Validation(
            "Le code et le nom sont obligatoires.".to_string(),
        ));
    }
    if input.volume_ml <= 0 {
        return Err(CoreError::Validation(
            "Le volume doit être positif.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    check_duplicate(&mut tx, "bottle_profiles", "code", &clean_code, None).await?;
    let id = sqlx::query(
        "INSERT INTO bottle_profiles (code, name, volume_ml, diameter_mm, height_mm, weight_g, material, color, is_returnable, deposit_value, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(&clean_code)
    .bind(&clean_name)
    .bind(input.volume_ml)
    .bind(input.diameter_mm)
    .bind(input.height_mm)
    .bind(input.weight_g)
    .bind(input.material.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.color.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(if input.is_returnable.unwrap_or(false) { 1_i64 } else { 0_i64 })
    .bind(input.deposit_value)
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created =
        sqlx::query_as::<_, BottleProfileDto>("SELECT * FROM bottle_profiles WHERE id = ?")
            .bind(id)
            .fetch_one(&db.pool)
            .await?;
    Ok(created)
}

pub async fn update_bottle_profile(
    db: &DepotDb,
    id: i64,
    input: UpdateBottleProfileInput,
) -> CoreResult<BottleProfileDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;

    let mut updates = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(code) = &input.code {
        let clean = code.trim().to_uppercase();
        if clean.is_empty() {
            return Err(CoreError::Validation(
                "Le code ne peut pas être vide.".to_string(),
            ));
        }
        check_duplicate(&mut tx, "bottle_profiles", "code", &clean, Some(id)).await?;
        updates.push("code = ?".to_string());
        binds.push(clean);
    }
    if let Some(name) = &input.name {
        let clean = name.trim();
        if clean.is_empty() {
            return Err(CoreError::Validation(
                "Le nom ne peut pas être vide.".to_string(),
            ));
        }
        updates.push("name = ?".to_string());
        binds.push(clean.to_string());
    }
    if let Some(vol) = input.volume_ml {
        if vol <= 0 {
            return Err(CoreError::Validation(
                "Le volume doit être positif.".to_string(),
            ));
        }
        updates.push("volume_ml = ?".to_string());
        binds.push(vol.to_string());
    }
    if let Some(ref d) = input.diameter_mm {
        updates.push("diameter_mm = ?".to_string());
        binds.push(d.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(ref h) = input.height_mm {
        updates.push("height_mm = ?".to_string());
        binds.push(h.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(ref w) = input.weight_g {
        updates.push("weight_g = ?".to_string());
        binds.push(w.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(ref m) = input.material {
        if let Some(mm) = m {
            updates.push("material = ?".to_string());
            binds.push(mm.trim().to_string());
        }
    }
    if let Some(ref c) = input.color {
        if let Some(cc) = c {
            updates.push("color = ?".to_string());
            binds.push(cc.trim().to_string());
        }
    }
    if let Some(ret) = input.is_returnable {
        updates.push("is_returnable = ?".to_string());
        binds.push(if ret { "1" } else { "0" }.to_string());
    }
    if let Some(ref d) = input.deposit_value {
        updates.push("deposit_value = ?".to_string());
        binds.push(d.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(active) = input.is_active {
        updates.push("is_active = ?".to_string());
        binds.push(if active { "1" } else { "0" }.to_string());
    }

    updates.push("updated_at = datetime('now')".to_string());

    if updates.is_empty() {
        return Err(CoreError::Validation(
            "Aucun champ à mettre à jour.".to_string(),
        ));
    }

    let sql = format!(
        "UPDATE bottle_profiles SET {} WHERE id = ?",
        updates.join(", ")
    );
    let mut q = sqlx::query(&sql);
    for b in binds {
        q = q.bind(b);
    }
    q = q.bind(id);
    q.execute(&mut *tx).await?;
    tx.commit().await?;

    let updated =
        sqlx::query_as::<_, BottleProfileDto>("SELECT * FROM bottle_profiles WHERE id = ?")
            .bind(id)
            .fetch_one(&db.pool)
            .await?;
    Ok(updated)
}

pub async fn delete_bottle_profile(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let result = sqlx::query("DELETE FROM bottle_profiles WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(
            "Profil de bouteille introuvable.".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(())
}

// ==================== CRATE TYPES ====================

pub async fn list_crate_type(
    db: &DepotDb,
    query: PaginatedQuery,
) -> CoreResult<PaginatedResponse<CrateTypeDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let pattern = format!("%{}%", search.trim());
    let has_search = !search.trim().is_empty();

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM crate_types WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, CrateTypeDto>(
        "SELECT * FROM crate_types WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?) ORDER BY code ASC LIMIT ? OFFSET ?",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .bind(ps)
    .bind(offset)
    .fetch_all(&db.pool)
    .await?;

    let total_pages = ((total + ps - 1) / ps).max(1);
    Ok(PaginatedResponse {
        items: rows,
        total,
        page: p,
        page_size: ps,
        total_pages,
    })
}

pub async fn create_crate_type(
    db: &DepotDb,
    input: CreateCrateTypeInput,
) -> CoreResult<CrateTypeDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let clean_code = input.code.trim().to_uppercase();
    let clean_name = input.name.trim();
    if clean_code.is_empty() || clean_name.is_empty() {
        return Err(CoreError::Validation(
            "Le code et le nom sont obligatoires.".to_string(),
        ));
    }
    if input.bottle_count <= 0 {
        return Err(CoreError::Validation(
            "Le nombre de bouteilles doit être positif.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    check_duplicate(&mut tx, "crate_types", "code", &clean_code, None).await?;
    let id = sqlx::query(
        "INSERT INTO crate_types (code, name, bottle_count, bottle_profile_id, dimensions_cm, weight_g, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(&clean_code)
    .bind(&clean_name)
    .bind(input.bottle_count)
    .bind(input.bottle_profile_id)
    .bind(input.dimensions_cm.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.weight_g)
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created = sqlx::query_as::<_, CrateTypeDto>("SELECT * FROM crate_types WHERE id = ?")
        .bind(id)
        .fetch_one(&db.pool)
        .await?;
    Ok(created)
}

pub async fn update_crate_type(
    db: &DepotDb,
    id: i64,
    input: UpdateCrateTypeInput,
) -> CoreResult<CrateTypeDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;

    let mut updates = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(code) = &input.code {
        let clean = code.trim().to_uppercase();
        if clean.is_empty() {
            return Err(CoreError::Validation(
                "Le code ne peut pas être vide.".to_string(),
            ));
        }
        check_duplicate(&mut tx, "crate_types", "code", &clean, Some(id)).await?;
        updates.push("code = ?".to_string());
        binds.push(clean);
    }
    if let Some(name) = &input.name {
        let clean = name.trim();
        if clean.is_empty() {
            return Err(CoreError::Validation(
                "Le nom ne peut pas être vide.".to_string(),
            ));
        }
        updates.push("name = ?".to_string());
        binds.push(clean.to_string());
    }
    if let Some(cnt) = input.bottle_count {
        if cnt <= 0 {
            return Err(CoreError::Validation(
                "Le nombre de bouteilles doit être positif.".to_string(),
            ));
        }
        updates.push("bottle_count = ?".to_string());
        binds.push(cnt.to_string());
    }
    if let Some(ref b) = input.bottle_profile_id {
        updates.push("bottle_profile_id = ?".to_string());
        binds.push(b.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(ref d) = input.dimensions_cm {
        if let Some(dd) = d {
            updates.push("dimensions_cm = ?".to_string());
            binds.push(dd.trim().to_string());
        }
    }
    if let Some(ref w) = input.weight_g {
        updates.push("weight_g = ?".to_string());
        binds.push(w.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(active) = input.is_active {
        updates.push("is_active = ?".to_string());
        binds.push(if active { "1" } else { "0" }.to_string());
    }

    updates.push("updated_at = datetime('now')".to_string());

    if updates.is_empty() {
        return Err(CoreError::Validation(
            "Aucun champ à mettre à jour.".to_string(),
        ));
    }

    let sql = format!("UPDATE crate_types SET {} WHERE id = ?", updates.join(", "));
    let mut q = sqlx::query(&sql);
    for b in binds {
        q = q.bind(b);
    }
    q = q.bind(id);
    q.execute(&mut *tx).await?;
    tx.commit().await?;

    let updated = sqlx::query_as::<_, CrateTypeDto>("SELECT * FROM crate_types WHERE id = ?")
        .bind(id)
        .fetch_one(&db.pool)
        .await?;
    Ok(updated)
}

pub async fn delete_crate_type(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let result = sqlx::query("DELETE FROM crate_types WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(
            "Type de casier introuvable.".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(())
}

// ==================== COMPATIBILITY GROUPS ====================

pub async fn list_compatibility_group(
    db: &DepotDb,
    query: PaginatedQuery,
) -> CoreResult<PaginatedResponse<CompatibilityGroupDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let pattern = format!("%{}%", search.trim());
    let has_search = !search.trim().is_empty();

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM crate_compatibility_groups WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, CompatibilityGroupDto>(
        "SELECT * FROM crate_compatibility_groups WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?) ORDER BY code ASC LIMIT ? OFFSET ?",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .bind(ps)
    .bind(offset)
    .fetch_all(&db.pool)
    .await?;

    let total_pages = ((total + ps - 1) / ps).max(1);
    Ok(PaginatedResponse {
        items: rows,
        total,
        page: p,
        page_size: ps,
        total_pages,
    })
}

pub async fn create_compatibility_group(
    db: &DepotDb,
    input: CreateCompatibilityGroupInput,
) -> CoreResult<CompatibilityGroupDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let clean_code = input.code.trim().to_uppercase();
    let clean_name = input.name.trim();
    if clean_code.is_empty() || clean_name.is_empty() {
        return Err(CoreError::Validation(
            "Le code et le nom sont obligatoires.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    check_duplicate(
        &mut tx,
        "crate_compatibility_groups",
        "code",
        &clean_code,
        None,
    )
    .await?;
    let id = sqlx::query(
        "INSERT INTO crate_compatibility_groups (code, name, description, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(&clean_code)
    .bind(&clean_name)
    .bind(input.description.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created = sqlx::query_as::<_, CompatibilityGroupDto>(
        "SELECT * FROM crate_compatibility_groups WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(created)
}

pub async fn update_compatibility_group(
    db: &DepotDb,
    id: i64,
    input: UpdateCompatibilityGroupInput,
) -> CoreResult<CompatibilityGroupDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;

    let mut updates = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(code) = &input.code {
        let clean = code.trim().to_uppercase();
        if clean.is_empty() {
            return Err(CoreError::Validation(
                "Le code ne peut pas être vide.".to_string(),
            ));
        }
        check_duplicate(
            &mut tx,
            "crate_compatibility_groups",
            "code",
            &clean,
            Some(id),
        )
        .await?;
        updates.push("code = ?".to_string());
        binds.push(clean);
    }
    if let Some(name) = &input.name {
        let clean = name.trim();
        if clean.is_empty() {
            return Err(CoreError::Validation(
                "Le nom ne peut pas être vide.".to_string(),
            ));
        }
        updates.push("name = ?".to_string());
        binds.push(clean.to_string());
    }
    if let Some(Some(d)) = &input.description {
        updates.push("description = ?".to_string());
        binds.push(d.trim().to_string());
    }
    if let Some(active) = input.is_active {
        updates.push("is_active = ?".to_string());
        binds.push(if active { "1" } else { "0" }.to_string());
    }

    updates.push("updated_at = datetime('now')".to_string());

    if updates.is_empty() {
        return Err(CoreError::Validation(
            "Aucun champ à mettre à jour.".to_string(),
        ));
    }

    let sql = format!(
        "UPDATE crate_compatibility_groups SET {} WHERE id = ?",
        updates.join(", ")
    );
    let mut q = sqlx::query(&sql);
    for b in binds {
        q = q.bind(b);
    }
    q = q.bind(id);
    q.execute(&mut *tx).await?;
    tx.commit().await?;

    let updated = sqlx::query_as::<_, CompatibilityGroupDto>(
        "SELECT * FROM crate_compatibility_groups WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(updated)
}

pub async fn delete_compatibility_group(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let result = sqlx::query("DELETE FROM crate_compatibility_groups WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(
            "Groupe de compatibilité introuvable.".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(())
}

// ==================== DISPOSABLE PACKAGING TYPES ====================

pub async fn list_disposable_packaging_type(
    db: &DepotDb,
    query: PaginatedQuery,
) -> CoreResult<PaginatedResponse<DisposablePackagingTypeDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let pattern = format!("%{}%", search.trim());
    let has_search = !search.trim().is_empty();

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM disposable_packaging_types WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, DisposablePackagingTypeDto>(
        "SELECT * FROM disposable_packaging_types WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?) ORDER BY code ASC LIMIT ? OFFSET ?",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .bind(ps)
    .bind(offset)
    .fetch_all(&db.pool)
    .await?;

    let total_pages = ((total + ps - 1) / ps).max(1);
    Ok(PaginatedResponse {
        items: rows,
        total,
        page: p,
        page_size: ps,
        total_pages,
    })
}

pub async fn create_disposable_packaging_type(
    db: &DepotDb,
    input: CreateDisposablePackagingTypeInput,
) -> CoreResult<DisposablePackagingTypeDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let clean_code = input.code.trim().to_uppercase();
    let clean_name = input.name.trim();
    if clean_code.is_empty() || clean_name.is_empty() {
        return Err(CoreError::Validation(
            "Le code et le nom sont obligatoires.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    check_duplicate(
        &mut tx,
        "disposable_packaging_types",
        "code",
        &clean_code,
        None,
    )
    .await?;
    let id = sqlx::query(
        "INSERT INTO disposable_packaging_types (code, name, material, volume_ml, weight_g, is_recyclable, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(&clean_code)
    .bind(&clean_name)
    .bind(input.material.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.volume_ml)
    .bind(input.weight_g)
    .bind(if input.is_recyclable.unwrap_or(false) { 1_i64 } else { 0_i64 })
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created = sqlx::query_as::<_, DisposablePackagingTypeDto>(
        "SELECT * FROM disposable_packaging_types WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(created)
}

pub async fn update_disposable_packaging_type(
    db: &DepotDb,
    id: i64,
    input: UpdateDisposablePackagingTypeInput,
) -> CoreResult<DisposablePackagingTypeDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;

    let mut updates = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(code) = &input.code {
        let clean = code.trim().to_uppercase();
        if clean.is_empty() {
            return Err(CoreError::Validation(
                "Le code ne peut pas être vide.".to_string(),
            ));
        }
        check_duplicate(
            &mut tx,
            "disposable_packaging_types",
            "code",
            &clean,
            Some(id),
        )
        .await?;
        updates.push("code = ?".to_string());
        binds.push(clean.to_string());
    }
    if let Some(name) = &input.name {
        let clean = name.trim();
        if clean.is_empty() {
            return Err(CoreError::Validation(
                "Le nom ne peut pas être vide.".to_string(),
            ));
        }
        updates.push("name = ?".to_string());
        binds.push(clean.to_string());
    }
    if let Some(ref m) = input.material {
        if let Some(mm) = m {
            updates.push("material = ?".to_string());
            binds.push(mm.trim().to_string());
        }
    }
    if let Some(vol) = input.volume_ml {
        if let Some(v) = vol {
            updates.push("volume_ml = ?".to_string());
            binds.push(v.to_string());
        }
    }
    if let Some(ref w) = input.weight_g {
        updates.push("weight_g = ?".to_string());
        binds.push(w.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(rec) = input.is_recyclable {
        updates.push("is_recyclable = ?".to_string());
        binds.push(if rec { "1" } else { "0" }.to_string());
    }
    if let Some(active) = input.is_active {
        updates.push("is_active = ?".to_string());
        binds.push(if active { "1" } else { "0" }.to_string());
    }

    updates.push("updated_at = datetime('now')".to_string());

    if updates.is_empty() {
        return Err(CoreError::Validation(
            "Aucun champ à mettre à jour.".to_string(),
        ));
    }

    let sql = format!(
        "UPDATE disposable_packaging_types SET {} WHERE id = ?",
        updates.join(", ")
    );
    let mut q = sqlx::query(&sql);
    for b in binds {
        q = q.bind(b);
    }
    q = q.bind(id);
    q.execute(&mut *tx).await?;
    tx.commit().await?;

    let updated = sqlx::query_as::<_, DisposablePackagingTypeDto>(
        "SELECT * FROM disposable_packaging_types WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(updated)
}

pub async fn delete_disposable_packaging_type(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let result = sqlx::query("DELETE FROM disposable_packaging_types WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(
            "Type d'emballage jetable introuvable.".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(())
}

// ==================== PACKAGING MATERIALS ====================

pub async fn list_packaging_material(
    db: &DepotDb,
    query: PaginatedQuery,
) -> CoreResult<PaginatedResponse<PackagingMaterialDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let pattern = format!("%{}%", search.trim());
    let has_search = !search.trim().is_empty();

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM packaging_materials WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, PackagingMaterialDto>(
        "SELECT * FROM packaging_materials WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?) ORDER BY code ASC LIMIT ? OFFSET ?",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .bind(ps)
    .bind(offset)
    .fetch_all(&db.pool)
    .await?;

    let total_pages = ((total + ps - 1) / ps).max(1);
    Ok(PaginatedResponse {
        items: rows,
        total,
        page: p,
        page_size: ps,
        total_pages,
    })
}

pub async fn create_packaging_material(
    db: &DepotDb,
    input: CreatePackagingMaterialInput,
) -> CoreResult<PackagingMaterialDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let clean_code = input.code.trim().to_uppercase();
    let clean_name = input.name.trim();
    if clean_code.is_empty() || clean_name.is_empty() {
        return Err(CoreError::Validation(
            "Le code et le nom sont obligatoires.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    check_duplicate(&mut tx, "packaging_materials", "code", &clean_code, None).await?;
    let id = sqlx::query(
        "INSERT INTO packaging_materials (code, name, description, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(&clean_code)
    .bind(&clean_name)
    .bind(input.description.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created =
        sqlx::query_as::<_, PackagingMaterialDto>("SELECT * FROM packaging_materials WHERE id = ?")
            .bind(id)
            .fetch_one(&db.pool)
            .await?;
    Ok(created)
}

pub async fn update_packaging_material(
    db: &DepotDb,
    id: i64,
    input: UpdatePackagingMaterialInput,
) -> CoreResult<PackagingMaterialDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;

    let mut updates = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(code) = &input.code {
        let clean = code.trim().to_uppercase();
        if clean.is_empty() {
            return Err(CoreError::Validation(
                "Le code ne peut pas être vide.".to_string(),
            ));
        }
        check_duplicate(&mut tx, "packaging_materials", "code", &clean, Some(id)).await?;
        updates.push("code = ?".to_string());
        binds.push(clean);
    }
    if let Some(name) = &input.name {
        let clean = name.trim();
        if clean.is_empty() {
            return Err(CoreError::Validation(
                "Le nom ne peut pas être vide.".to_string(),
            ));
        }
        updates.push("name = ?".to_string());
        binds.push(clean.to_string());
    }
    if let Some(Some(d)) = &input.description {
        updates.push("description = ?".to_string());
        binds.push(d.trim().to_string());
    }
    if let Some(active) = input.is_active {
        updates.push("is_active = ?".to_string());
        binds.push(if active { "1" } else { "0" }.to_string());
    }

    updates.push("updated_at = datetime('now')".to_string());

    if updates.is_empty() {
        return Err(CoreError::Validation(
            "Aucun champ à mettre à jour.".to_string(),
        ));
    }

    let sql = format!(
        "UPDATE packaging_materials SET {} WHERE id = ?",
        updates.join(", ")
    );
    let mut q = sqlx::query(&sql);
    for b in binds {
        q = q.bind(b);
    }
    q = q.bind(id);
    q.execute(&mut *tx).await?;
    tx.commit().await?;

    let updated =
        sqlx::query_as::<_, PackagingMaterialDto>("SELECT * FROM packaging_materials WHERE id = ?")
            .bind(id)
            .fetch_one(&db.pool)
            .await?;
    Ok(updated)
}

pub async fn delete_packaging_material(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let result = sqlx::query("DELETE FROM packaging_materials WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(
            "Matériau d'emballage introuvable.".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(())
}

// ==================== CONTAINER TYPES ====================

pub async fn list_container_type(
    db: &DepotDb,
    query: PaginatedQuery,
) -> CoreResult<PaginatedResponse<ContainerTypeDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let pattern = format!("%{}%", search.trim());
    let has_search = !search.trim().is_empty();

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM container_types WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, ContainerTypeDto>(
        "SELECT * FROM container_types WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?) ORDER BY code ASC LIMIT ? OFFSET ?",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .bind(ps)
    .bind(offset)
    .fetch_all(&db.pool)
    .await?;

    let total_pages = ((total + ps - 1) / ps).max(1);
    Ok(PaginatedResponse {
        items: rows,
        total,
        page: p,
        page_size: ps,
        total_pages,
    })
}

pub async fn create_container_type(
    db: &DepotDb,
    input: CreateContainerTypeInput,
) -> CoreResult<ContainerTypeDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let clean_code = input.code.trim().to_uppercase();
    let clean_name = input.name.trim();
    if clean_code.is_empty() || clean_name.is_empty() {
        return Err(CoreError::Validation(
            "Le code et le nom sont obligatoires.".to_string(),
        ));
    }
    if input.material_id <= 0 {
        return Err(CoreError::Validation(
            "L'ID du matériau est obligatoire.".to_string(),
        ));
    }
    if input.volume_ml <= 0 {
        return Err(CoreError::Validation(
            "Le volume doit être positif.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    let mat_exists: Option<i64> =
        sqlx::query_scalar("SELECT id FROM packaging_materials WHERE id = ?")
            .bind(input.material_id)
            .fetch_optional(&mut *tx)
            .await?;
    if mat_exists.is_none() {
        return Err(CoreError::Validation(
            "Matériau parent introuvable.".to_string(),
        ));
    }
    check_duplicate(&mut tx, "container_types", "code", &clean_code, None).await?;
    let id = sqlx::query(
        "INSERT INTO container_types (code, name, material_id, volume_ml, weight_g, dimensions_cm, is_returnable, deposit_value, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(&clean_code)
    .bind(&clean_name)
    .bind(input.material_id)
    .bind(input.volume_ml)
    .bind(input.weight_g)
    .bind(input.dimensions_cm.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(if input.is_returnable.unwrap_or(false) { 1_i64 } else { 0_i64 })
    .bind(input.deposit_value)
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created =
        sqlx::query_as::<_, ContainerTypeDto>("SELECT * FROM container_types WHERE id = ?")
            .bind(id)
            .fetch_one(&db.pool)
            .await?;
    Ok(created)
}

pub async fn update_container_type(
    db: &DepotDb,
    id: i64,
    input: UpdateContainerTypeInput,
) -> CoreResult<ContainerTypeDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;

    let mut updates = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(code) = &input.code {
        let clean = code.trim().to_uppercase();
        if clean.is_empty() {
            return Err(CoreError::Validation(
                "Le code ne peut pas être vide.".to_string(),
            ));
        }
        check_duplicate(&mut tx, "container_types", "code", &clean, Some(id)).await?;
        updates.push("code = ?".to_string());
        binds.push(clean);
    }
    if let Some(name) = &input.name {
        let clean = name.trim();
        if clean.is_empty() {
            return Err(CoreError::Validation(
                "Le nom ne peut pas être vide.".to_string(),
            ));
        }
        updates.push("name = ?".to_string());
        binds.push(clean.to_string());
    }
    if let Some(mid) = input.material_id {
        let mat_exists: Option<i64> =
            sqlx::query_scalar("SELECT id FROM packaging_materials WHERE id = ?")
                .bind(mid)
                .fetch_optional(&mut *tx)
                .await?;
        if mat_exists.is_none() {
            return Err(CoreError::Validation(
                "Matériau parent introuvable.".to_string(),
            ));
        }
        updates.push("material_id = ?".to_string());
        binds.push(mid.to_string());
    }
    if let Some(vol) = input.volume_ml {
        if vol <= 0 {
            return Err(CoreError::Validation(
                "Le volume doit être positif.".to_string(),
            ));
        }
        updates.push("volume_ml = ?".to_string());
        binds.push(vol.to_string());
    }
    if let Some(ref w) = input.weight_g {
        updates.push("weight_g = ?".to_string());
        binds.push(w.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(ref d) = input.dimensions_cm {
        if let Some(dd) = d {
            updates.push("dimensions_cm = ?".to_string());
            binds.push(dd.trim().to_string());
        }
    }
    if let Some(ret) = input.is_returnable {
        updates.push("is_returnable = ?".to_string());
        binds.push(if ret { "1" } else { "0" }.to_string());
    }
    if let Some(ref d) = input.deposit_value {
        updates.push("deposit_value = ?".to_string());
        binds.push(d.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(active) = input.is_active {
        updates.push("is_active = ?".to_string());
        binds.push(if active { "1" } else { "0" }.to_string());
    }

    updates.push("updated_at = datetime('now')".to_string());

    if updates.is_empty() {
        return Err(CoreError::Validation(
            "Aucun champ à mettre à jour.".to_string(),
        ));
    }

    let sql = format!(
        "UPDATE container_types SET {} WHERE id = ?",
        updates.join(", ")
    );
    let mut q = sqlx::query(&sql);
    for b in binds {
        q = q.bind(b);
    }
    q = q.bind(id);
    q.execute(&mut *tx).await?;
    tx.commit().await?;

    let updated =
        sqlx::query_as::<_, ContainerTypeDto>("SELECT * FROM container_types WHERE id = ?")
            .bind(id)
            .fetch_one(&db.pool)
            .await?;
    Ok(updated)
}

pub async fn delete_container_type(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let result = sqlx::query("DELETE FROM container_types WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(
            "Type de contenant introuvable.".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(())
}

// ==================== UNITS OF MEASURE ====================

pub async fn list_unit_of_measure(
    db: &DepotDb,
    query: PaginatedQuery,
) -> CoreResult<PaginatedResponse<UnitOfMeasureDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let pattern = format!("%{}%", search.trim());
    let has_search = !search.trim().is_empty();

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM units_of_measure WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, UnitOfMeasureDto>(
        "SELECT * FROM units_of_measure WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ?) ORDER BY code ASC LIMIT ? OFFSET ?",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .bind(ps)
    .bind(offset)
    .fetch_all(&db.pool)
    .await?;

    let total_pages = ((total + ps - 1) / ps).max(1);
    Ok(PaginatedResponse {
        items: rows,
        total,
        page: p,
        page_size: ps,
        total_pages,
    })
}

pub async fn create_unit_of_measure(
    db: &DepotDb,
    input: CreateUnitOfMeasureInput,
) -> CoreResult<UnitOfMeasureDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let clean_code = input.code.trim().to_uppercase();
    let clean_name = input.name.trim();
    let clean_symbol = input.symbol.trim();
    if clean_code.is_empty() || clean_name.is_empty() || clean_symbol.is_empty() {
        return Err(CoreError::Validation(
            "Le code, le nom et le symbole sont obligatoires.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    check_duplicate(&mut tx, "units_of_measure", "code", &clean_code, None).await?;
    let id = sqlx::query(
        "INSERT INTO units_of_measure (code, name, symbol, base_unit_id, conversion_factor, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(&clean_code)
    .bind(&clean_name)
    .bind(&clean_symbol)
    .bind(input.base_unit_id)
    .bind(input.conversion_factor)
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created =
        sqlx::query_as::<_, UnitOfMeasureDto>("SELECT * FROM units_of_measure WHERE id = ?")
            .bind(id)
            .fetch_one(&db.pool)
            .await?;
    Ok(created)
}

pub async fn update_unit_of_measure(
    db: &DepotDb,
    id: i64,
    input: UpdateUnitOfMeasureInput,
) -> CoreResult<UnitOfMeasureDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;

    let mut updates = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(code) = &input.code {
        let clean = code.trim().to_uppercase();
        if clean.is_empty() {
            return Err(CoreError::Validation(
                "Le code ne peut pas être vide.".to_string(),
            ));
        }
        check_duplicate(&mut tx, "units_of_measure", "code", &clean, Some(id)).await?;
        updates.push("code = ?".to_string());
        binds.push(clean);
    }
    if let Some(name) = &input.name {
        let clean = name.trim();
        if clean.is_empty() {
            return Err(CoreError::Validation(
                "Le nom ne peut pas être vide.".to_string(),
            ));
        }
        updates.push("name = ?".to_string());
        binds.push(clean.to_string());
    }
    if let Some(sym) = &input.symbol {
        let clean = sym.trim();
        if clean.is_empty() {
            return Err(CoreError::Validation(
                "Le symbole ne peut pas être vide.".to_string(),
            ));
        }
        updates.push("symbol = ?".to_string());
        binds.push(clean.to_string());
    }
    if let Some(ref b) = input.base_unit_id {
        updates.push("base_unit_id = ?".to_string());
        binds.push(b.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(ref c) = input.conversion_factor {
        updates.push("conversion_factor = ?".to_string());
        binds.push(c.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(active) = input.is_active {
        updates.push("is_active = ?".to_string());
        binds.push(if active { "1" } else { "0" }.to_string());
    }

    updates.push("updated_at = datetime('now')".to_string());

    if updates.is_empty() {
        return Err(CoreError::Validation(
            "Aucun champ à mettre à jour.".to_string(),
        ));
    }

    let sql = format!(
        "UPDATE units_of_measure SET {} WHERE id = ?",
        updates.join(", ")
    );
    let mut q = sqlx::query(&sql);
    for b in binds {
        q = q.bind(b);
    }
    q = q.bind(id);
    q.execute(&mut *tx).await?;
    tx.commit().await?;

    let updated =
        sqlx::query_as::<_, UnitOfMeasureDto>("SELECT * FROM units_of_measure WHERE id = ?")
            .bind(id)
            .fetch_one(&db.pool)
            .await?;
    Ok(updated)
}

pub async fn delete_unit_of_measure(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let result = sqlx::query("DELETE FROM units_of_measure WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(
            "Unité de mesure introuvable.".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(())
}

// ==================== PRODUCT VARIANTS ====================

pub async fn list_product_variants(
    db: &DepotDb,
    query: PaginatedQuery,
    product_id: Option<i64>,
) -> CoreResult<PaginatedResponse<ProductVariantDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let pattern = format!("%{}%", search.trim());
    let has_search = !search.trim().is_empty();
    let prod_filter = product_id.unwrap_or(0);

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM product_variants 
         WHERE (? = 1 OR is_active = 1)
           AND (? = 0 OR product_id = ?)
           AND (? = 0 OR name LIKE ? OR COALESCE(reference, '') LIKE ? OR COALESCE(barcode, '') LIKE ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(prod_filter)
    .bind(prod_filter)
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, ProductVariantDto>(
        "SELECT * FROM product_variants 
         WHERE (? = 1 OR is_active = 1)
           AND (? = 0 OR product_id = ?)
           AND (? = 0 OR name LIKE ? OR COALESCE(reference, '') LIKE ? OR COALESCE(barcode, '') LIKE ?)
         ORDER BY name ASC
         LIMIT ? OFFSET ?",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(prod_filter)
    .bind(prod_filter)
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .bind(&pattern)
    .bind(ps)
    .bind(offset)
    .fetch_all(&db.pool)
    .await?;

    let total_pages = ((total + ps - 1) / ps).max(1);
    Ok(PaginatedResponse {
        items: rows,
        total,
        page: p,
        page_size: ps,
        total_pages,
    })
}

pub async fn create_product_variant(
    db: &DepotDb,
    input: CreateProductVariantInput,
) -> CoreResult<ProductVariantDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let clean_name = input.name.trim();
    if clean_name.is_empty() {
        return Err(CoreError::Validation("Le nom est obligatoire.".to_string()));
    }
    if input.product_id <= 0 {
        return Err(CoreError::Validation(
            "L'ID du produit est obligatoire.".to_string(),
        ));
    }
    let (_guard, mut tx) = db.begin_write().await?;
    let prod_exists: Option<i64> = sqlx::query_scalar("SELECT id FROM products WHERE id = ?")
        .bind(input.product_id)
        .fetch_optional(&mut *tx)
        .await?;
    if prod_exists.is_none() {
        return Err(CoreError::Validation(
            "Produit parent introuvable.".to_string(),
        ));
    }
    if let Some(ref code) = input.reference {
        let dup: Option<i64> =
            sqlx::query_scalar("SELECT id FROM product_variants WHERE reference = ?")
                .bind(code.trim())
                .fetch_optional(&mut *tx)
                .await?;
        if dup.is_some() {
            return Err(CoreError::DuplicateOperation(
                "Cette référence de variante existe déjà.".to_string(),
            ));
        }
    }
    let id = sqlx::query(
        "INSERT INTO product_variants (product_id, name, reference, barcode, volume_ml, alcohol_degree, bottle_profile_id, crate_type_id, compatibility_group_id, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(input.product_id)
    .bind(&clean_name)
    .bind(input.reference.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.barcode.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.volume_ml)
    .bind(input.alcohol_degree)
    .bind(input.bottle_profile_id)
    .bind(input.crate_type_id)
    .bind(input.compatibility_group_id)
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created =
        sqlx::query_as::<_, ProductVariantDto>("SELECT * FROM product_variants WHERE id = ?")
            .bind(id)
            .fetch_one(&db.pool)
            .await?;
    Ok(created)
}

pub async fn update_product_variant(
    db: &DepotDb,
    id: i64,
    input: UpdateProductVariantInput,
) -> CoreResult<ProductVariantDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;

    let mut updates = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(name) = &input.name {
        let clean = name.trim();
        if clean.is_empty() {
            return Err(CoreError::Validation(
                "Le nom ne peut pas être vide.".to_string(),
            ));
        }
        updates.push("name = ?".to_string());
        binds.push(clean.to_string());
    }
    if let Some(ref r) = input.reference {
        if let Some(rr) = r {
            updates.push("reference = ?".to_string());
            binds.push(rr.trim().to_string());
        }
    }
    if let Some(ref b) = input.barcode {
        if let Some(bb) = b {
            updates.push("barcode = ?".to_string());
            binds.push(bb.trim().to_string());
        }
    }
    if let Some(vol) = input.volume_ml {
        if let Some(v) = vol {
            updates.push("volume_ml = ?".to_string());
            binds.push(v.to_string());
        }
    }
    if let Some(alc) = input.alcohol_degree {
        if let Some(a) = alc {
            updates.push("alcohol_degree = ?".to_string());
            binds.push(a.to_string());
        }
    }
    if let Some(ref b) = input.bottle_profile_id {
        updates.push("bottle_profile_id = ?".to_string());
        binds.push(b.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(ref c) = input.crate_type_id {
        updates.push("crate_type_id = ?".to_string());
        binds.push(c.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(ref c) = input.compatibility_group_id {
        updates.push("compatibility_group_id = ?".to_string());
        binds.push(c.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(active) = input.is_active {
        updates.push("is_active = ?".to_string());
        binds.push(if active { "1" } else { "0" }.to_string());
    }

    updates.push("updated_at = datetime('now')".to_string());

    if updates.is_empty() {
        return Err(CoreError::Validation(
            "Aucun champ à mettre à jour.".to_string(),
        ));
    }

    let sql = format!(
        "UPDATE product_variants SET {} WHERE id = ?",
        updates.join(", ")
    );
    let mut q = sqlx::query(&sql);
    for b in binds {
        q = q.bind(b);
    }
    q = q.bind(id);
    q.execute(&mut *tx).await?;
    tx.commit().await?;

    let updated =
        sqlx::query_as::<_, ProductVariantDto>("SELECT * FROM product_variants WHERE id = ?")
            .bind(id)
            .fetch_one(&db.pool)
            .await?;
    Ok(updated)
}

pub async fn delete_product_variant(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let result = sqlx::query("DELETE FROM product_variants WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound("Variante introuvable.".to_string()));
    }
    tx.commit().await?;
    Ok(())
}

// ==================== SUPPLIER PRICES ====================

pub async fn list_supplier_prices(
    db: &DepotDb,
    query: PaginatedQuery,
    supplier_id: Option<i64>,
    product_id: Option<i64>,
) -> CoreResult<PaginatedResponse<SupplierProductPriceDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let _search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let sup_filter = supplier_id.unwrap_or(0);
    let prod_filter = product_id.unwrap_or(0);

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM supplier_product_prices 
         WHERE (? = 1 OR is_active = 1)
           AND (? = 0 OR supplier_id = ?)
           AND (? = 0 OR product_id = ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(sup_filter)
    .bind(sup_filter)
    .bind(prod_filter)
    .bind(prod_filter)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, SupplierProductPriceDto>(
        "SELECT * FROM supplier_product_prices 
         WHERE (? = 1 OR is_active = 1)
           AND (? = 0 OR supplier_id = ?)
           AND (? = 0 OR product_id = ?)
         ORDER BY valid_from DESC
         LIMIT ? OFFSET ?",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(sup_filter)
    .bind(sup_filter)
    .bind(prod_filter)
    .bind(prod_filter)
    .bind(ps)
    .bind(offset)
    .fetch_all(&db.pool)
    .await?;

    let total_pages = ((total + ps - 1) / ps).max(1);
    Ok(PaginatedResponse {
        items: rows,
        total,
        page: p,
        page_size: ps,
        total_pages,
    })
}

pub async fn create_supplier_price(
    db: &DepotDb,
    input: CreateSupplierProductPriceInput,
) -> CoreResult<SupplierProductPriceDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    if input.supplier_id <= 0 {
        return Err(CoreError::Validation(
            "L'ID du fournisseur est obligatoire.".to_string(),
        ));
    }
    if input.price_fcfa < 0 {
        return Err(CoreError::Validation(
            "Le prix ne peut pas être négatif.".to_string(),
        ));
    }
    let currency = input.currency.unwrap_or_else(|| "XOF".to_string());
    let (_guard, mut tx) = db.begin_write().await?;
    let id = sqlx::query(
        "INSERT INTO supplier_product_prices (supplier_id, product_id, variant_id, price_fcfa, currency, valid_from, valid_to, min_order_qty, lead_time_days, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(input.supplier_id)
    .bind(input.product_id)
    .bind(input.variant_id)
    .bind(input.price_fcfa)
    .bind(&currency)
    .bind(&input.valid_from)
    .bind(input.valid_to.as_deref())
    .bind(input.min_order_qty)
    .bind(input.lead_time_days)
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created = sqlx::query_as::<_, SupplierProductPriceDto>(
        "SELECT * FROM supplier_product_prices WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(created)
}

pub async fn update_supplier_price(
    db: &DepotDb,
    id: i64,
    input: UpdateSupplierProductPriceInput,
) -> CoreResult<SupplierProductPriceDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;

    let mut updates = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(sid) = input.supplier_id {
        updates.push("supplier_id = ?".to_string());
        binds.push(sid.to_string());
    }
    if let Some(ref p) = input.product_id {
        updates.push("product_id = ?".to_string());
        binds.push(p.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(ref v) = input.variant_id {
        updates.push("variant_id = ?".to_string());
        binds.push(v.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(price) = input.price_fcfa {
        if price < 0 {
            return Err(CoreError::Validation(
                "Le prix ne peut pas être négatif.".to_string(),
            ));
        }
        updates.push("price_fcfa = ?".to_string());
        binds.push(price.to_string());
    }
    if let Some(c) = &input.currency {
        updates.push("currency = ?".to_string());
        binds.push(c.clone());
    }
    if let Some(v) = &input.valid_from {
        updates.push("valid_from = ?".to_string());
        binds.push(v.clone());
    }
    if let Some(v) = &input.valid_to {
        if let Some(vv) = v {
            updates.push("valid_to = ?".to_string());
            binds.push(vv.clone());
        }
    }
    if let Some(ref q) = input.min_order_qty {
        updates.push("min_order_qty = ?".to_string());
        binds.push(q.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(ref l) = input.lead_time_days {
        updates.push("lead_time_days = ?".to_string());
        binds.push(l.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(active) = input.is_active {
        updates.push("is_active = ?".to_string());
        binds.push(if active { "1" } else { "0" }.to_string());
    }

    updates.push("updated_at = datetime('now')".to_string());

    if updates.is_empty() {
        return Err(CoreError::Validation(
            "Aucun champ à mettre à jour.".to_string(),
        ));
    }

    let sql = format!(
        "UPDATE supplier_product_prices SET {} WHERE id = ?",
        updates.join(", ")
    );
    let mut q = sqlx::query(&sql);
    for b in binds {
        q = q.bind(b);
    }
    q = q.bind(id);
    q.execute(&mut *tx).await?;
    tx.commit().await?;

    let updated = sqlx::query_as::<_, SupplierProductPriceDto>(
        "SELECT * FROM supplier_product_prices WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(updated)
}

pub async fn delete_supplier_price(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let result = sqlx::query("DELETE FROM supplier_product_prices WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(
            "Prix fournisseur introuvable.".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(())
}

// ==================== CUSTOMER PRICE LISTS ====================

pub async fn list_customer_price_lists(
    db: &DepotDb,
    query: PaginatedQuery,
) -> CoreResult<PaginatedResponse<CustomerPriceListDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let pattern = format!("%{}%", search.trim());
    let has_search = !search.trim().is_empty();

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM customer_price_lists 
         WHERE (? = 1 OR is_active = 1)
           AND (? = 0 OR name LIKE ? OR COALESCE(description, '') LIKE ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, CustomerPriceListDto>(
        "SELECT * FROM customer_price_lists 
         WHERE (? = 1 OR is_active = 1)
           AND (? = 0 OR name LIKE ? OR COALESCE(description, '') LIKE ?)
         ORDER BY is_default DESC, name ASC
         LIMIT ? OFFSET ?",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .bind(ps)
    .bind(offset)
    .fetch_all(&db.pool)
    .await?;

    let total_pages = ((total + ps - 1) / ps).max(1);
    Ok(PaginatedResponse {
        items: rows,
        total,
        page: p,
        page_size: ps,
        total_pages,
    })
}

pub async fn create_customer_price_list(
    db: &DepotDb,
    input: CreateCustomerPriceListInput,
) -> CoreResult<CustomerPriceListDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let clean_name = input.name.trim();
    if clean_name.is_empty() {
        return Err(CoreError::Validation("Le nom est obligatoire.".to_string()));
    }
    let currency = input.currency.unwrap_or_else(|| "XOF".to_string());
    let (_guard, mut tx) = db.begin_write().await?;
    if input.is_default.unwrap_or(false) {
        sqlx::query("UPDATE customer_price_lists SET is_default = 0 WHERE is_default = 1")
            .execute(&mut *tx)
            .await?;
    }
    let id = sqlx::query(
        "INSERT INTO customer_price_lists (name, description, currency, is_default, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(&clean_name)
    .bind(input.description.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(&currency)
    .bind(if input.is_default.unwrap_or(false) { 1_i64 } else { 0_i64 })
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created = sqlx::query_as::<_, CustomerPriceListDto>(
        "SELECT * FROM customer_price_lists WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(created)
}

pub async fn update_customer_price_list(
    db: &DepotDb,
    id: i64,
    input: UpdateCustomerPriceListInput,
) -> CoreResult<CustomerPriceListDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;

    let mut updates = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(name) = &input.name {
        let clean = name.trim();
        if clean.is_empty() {
            return Err(CoreError::Validation(
                "Le nom ne peut pas être vide.".to_string(),
            ));
        }
        updates.push("name = ?".to_string());
        binds.push(clean.to_string());
    }
    if let Some(ref d) = input.description {
        if let Some(dd) = d {
            updates.push("description = ?".to_string());
            binds.push(dd.trim().to_string());
        }
    }
    if let Some(c) = &input.currency {
        updates.push("currency = ?".to_string());
        binds.push(c.clone());
    }
    if let Some(def) = input.is_default {
        if def {
            sqlx::query(
                "UPDATE customer_price_lists SET is_default = 0 WHERE is_default = 1 AND id != ?",
            )
            .bind(id)
            .execute(&mut *tx)
            .await?;
        }
        updates.push("is_default = ?".to_string());
        binds.push(if def { "1" } else { "0" }.to_string());
    }
    if let Some(active) = input.is_active {
        updates.push("is_active = ?".to_string());
        binds.push(if active { "1" } else { "0" }.to_string());
    }

    updates.push("updated_at = datetime('now')".to_string());

    if updates.is_empty() {
        return Err(CoreError::Validation(
            "Aucun champ à mettre à jour.".to_string(),
        ));
    }

    let sql = format!(
        "UPDATE customer_price_lists SET {} WHERE id = ?",
        updates.join(", ")
    );
    let mut q = sqlx::query(&sql);
    for b in binds {
        q = q.bind(b);
    }
    q = q.bind(id);
    q.execute(&mut *tx).await?;
    tx.commit().await?;

    let updated = sqlx::query_as::<_, CustomerPriceListDto>(
        "SELECT * FROM customer_price_lists WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(updated)
}

pub async fn delete_customer_price_list(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let result = sqlx::query("DELETE FROM customer_price_lists WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(
            "Liste de prix introuvable.".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(())
}

// ==================== CUSTOMER PRICE LIST ITEMS ====================

pub async fn list_customer_price_list_items(
    db: &DepotDb,
    query: PaginatedQuery,
    price_list_id: Option<i64>,
) -> CoreResult<PaginatedResponse<CustomerPriceListItemDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let _search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let list_filter = price_list_id.unwrap_or(0);

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM customer_price_list_items 
         WHERE (? = 1 OR is_active = 1)
           AND (? = 0 OR price_list_id = ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(list_filter)
    .bind(list_filter)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, CustomerPriceListItemDto>(
        "SELECT * FROM customer_price_list_items 
         WHERE (? = 1 OR is_active = 1)
           AND (? = 0 OR price_list_id = ?)
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(list_filter)
    .bind(list_filter)
    .bind(ps)
    .bind(offset)
    .fetch_all(&db.pool)
    .await?;

    let total_pages = ((total + ps - 1) / ps).max(1);
    Ok(PaginatedResponse {
        items: rows,
        total,
        page: p,
        page_size: ps,
        total_pages,
    })
}

pub async fn create_customer_price_list_item(
    db: &DepotDb,
    input: CreateCustomerPriceListItemInput,
) -> CoreResult<CustomerPriceListItemDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    if input.price_list_id <= 0 {
        return Err(CoreError::Validation(
            "L'ID de la liste de prix est obligatoire.".to_string(),
        ));
    }
    if input.price_fcfa < 0 {
        return Err(CoreError::Validation(
            "Le prix ne peut pas être négatif.".to_string(),
        ));
    }
    let (_guard, mut tx) = db.begin_write().await?;
    let list_exists: Option<i64> =
        sqlx::query_scalar("SELECT id FROM customer_price_lists WHERE id = ?")
            .bind(input.price_list_id)
            .fetch_optional(&mut *tx)
            .await?;
    if list_exists.is_none() {
        return Err(CoreError::Validation(
            "Liste de prix parent introuvable.".to_string(),
        ));
    }
    let id = sqlx::query(
        "INSERT INTO customer_price_list_items (price_list_id, product_id, variant_id, packaging_id, price_fcfa, valid_from, valid_to, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(input.price_list_id)
    .bind(input.product_id)
    .bind(input.variant_id)
    .bind(input.packaging_id)
    .bind(input.price_fcfa)
    .bind(&input.valid_from)
    .bind(input.valid_to.as_deref())
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created = sqlx::query_as::<_, CustomerPriceListItemDto>(
        "SELECT * FROM customer_price_list_items WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(created)
}

pub async fn update_customer_price_list_item(
    db: &DepotDb,
    id: i64,
    input: UpdateCustomerPriceListItemInput,
) -> CoreResult<CustomerPriceListItemDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;

    let mut updates = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(p) = input.price_list_id {
        updates.push("price_list_id = ?".to_string());
        binds.push(p.to_string());
    }
    if let Some(ref p) = input.product_id {
        updates.push("product_id = ?".to_string());
        binds.push(p.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(ref v) = input.variant_id {
        updates.push("variant_id = ?".to_string());
        binds.push(v.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(ref p) = input.packaging_id {
        updates.push("packaging_id = ?".to_string());
        binds.push(p.map(|v| v.to_string()).unwrap_or_default());
    }
    if let Some(price) = input.price_fcfa {
        if price < 0 {
            return Err(CoreError::Validation(
                "Le prix ne peut pas être négatif.".to_string(),
            ));
        }
        updates.push("price_fcfa = ?".to_string());
        binds.push(price.to_string());
    }
    if let Some(v) = &input.valid_from {
        updates.push("valid_from = ?".to_string());
        binds.push(v.clone());
    }
    if let Some(v) = &input.valid_to {
        if let Some(vv) = v {
            updates.push("valid_to = ?".to_string());
            binds.push(vv.clone());
        }
    }
    if let Some(active) = input.is_active {
        updates.push("is_active = ?".to_string());
        binds.push(if active { "1" } else { "0" }.to_string());
    }

    updates.push("updated_at = datetime('now')".to_string());

    if updates.is_empty() {
        return Err(CoreError::Validation(
            "Aucun champ à mettre à jour.".to_string(),
        ));
    }

    let sql = format!(
        "UPDATE customer_price_list_items SET {} WHERE id = ?",
        updates.join(", ")
    );
    let mut q = sqlx::query(&sql);
    for b in binds {
        q = q.bind(b);
    }
    q = q.bind(id);
    q.execute(&mut *tx).await?;
    tx.commit().await?;

    let updated = sqlx::query_as::<_, CustomerPriceListItemDto>(
        "SELECT * FROM customer_price_list_items WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;
    Ok(updated)
}

pub async fn delete_customer_price_list_item(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let result = sqlx::query("DELETE FROM customer_price_list_items WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(
            "Élément de liste de prix introuvable.".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(())
}

// ==================== PACKAGING VALUES ====================

pub async fn list_packaging_values(
    db: &DepotDb,
    query: PaginatedQuery,
    returnable_id: Option<i64>,
) -> CoreResult<PaginatedResponse<PackagingValueDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let _search = query.search.unwrap_or_default();
    let include_archived = query.include_archived.unwrap_or(false);
    let ret_filter = returnable_id.unwrap_or(0);

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM packaging_values 
         WHERE (? = 1 OR is_active = 1)
           AND (? = 0 OR returnable_id = ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(ret_filter)
    .bind(ret_filter)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, PackagingValueDto>(
        "SELECT * FROM packaging_values 
         WHERE (? = 1 OR is_active = 1)
           AND (? = 0 OR returnable_id = ?)
         ORDER BY effective_from DESC
         LIMIT ? OFFSET ?",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(ret_filter)
    .bind(ret_filter)
    .bind(ps)
    .bind(offset)
    .fetch_all(&db.pool)
    .await?;

    let total_pages = ((total + ps - 1) / ps).max(1);
    Ok(PaginatedResponse {
        items: rows,
        total,
        page: p,
        page_size: ps,
        total_pages,
    })
}

pub async fn create_packaging_value(
    db: &DepotDb,
    input: CreatePackagingValueInput,
) -> CoreResult<PackagingValueDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    if input.returnable_id <= 0 {
        return Err(CoreError::Validation(
            "L'ID du consigné est obligatoire.".to_string(),
        ));
    }
    if input.value_fcfa < 0 {
        return Err(CoreError::Validation(
            "La valeur ne peut pas être négative.".to_string(),
        ));
    }
    let clean_type = input.packaging_type.trim();
    if clean_type.is_empty() {
        return Err(CoreError::Validation(
            "Le type d'emballage est obligatoire.".to_string(),
        ));
    }
    let (_guard, mut tx) = db.begin_write().await?;
    let id = sqlx::query(
        "INSERT INTO packaging_values (returnable_id, packaging_type, value_fcfa, effective_from, effective_to, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(input.returnable_id)
    .bind(&clean_type)
    .bind(input.value_fcfa)
    .bind(&input.effective_from)
    .bind(input.effective_to.as_deref())
    .bind(if input.is_active.unwrap_or(true) { 1_i64 } else { 0_i64 })
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();
    tx.commit().await?;

    let created =
        sqlx::query_as::<_, PackagingValueDto>("SELECT * FROM packaging_values WHERE id = ?")
            .bind(id)
            .fetch_one(&db.pool)
            .await?;
    Ok(created)
}

pub async fn update_packaging_value(
    db: &DepotDb,
    id: i64,
    input: UpdatePackagingValueInput,
) -> CoreResult<PackagingValueDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;

    let mut updates = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(r) = input.returnable_id {
        updates.push("returnable_id = ?".to_string());
        binds.push(r.to_string());
    }
    if let Some(ref t) = input.packaging_type {
        let clean = t.trim();
        if clean.is_empty() {
            return Err(CoreError::Validation(
                "Le type d'emballage ne peut pas être vide.".to_string(),
            ));
        }
        updates.push("packaging_type = ?".to_string());
        binds.push(clean.to_string());
    }
    if let Some(val) = input.value_fcfa {
        if val < 0 {
            return Err(CoreError::Validation(
                "La valeur ne peut pas être négative.".to_string(),
            ));
        }
        updates.push("value_fcfa = ?".to_string());
        binds.push(val.to_string());
    }
    if let Some(v) = &input.effective_from {
        updates.push("effective_from = ?".to_string());
        binds.push(v.clone());
    }
    if let Some(v) = &input.effective_to {
        if let Some(vv) = v {
            updates.push("effective_to = ?".to_string());
            binds.push(vv.clone());
        }
    }
    if let Some(active) = input.is_active {
        updates.push("is_active = ?".to_string());
        binds.push(if active { "1" } else { "0" }.to_string());
    }

    updates.push("updated_at = datetime('now')".to_string());

    if updates.is_empty() {
        return Err(CoreError::Validation(
            "Aucun champ à mettre à jour.".to_string(),
        ));
    }

    let sql = format!(
        "UPDATE packaging_values SET {} WHERE id = ?",
        updates.join(", ")
    );
    let mut q = sqlx::query(&sql);
    for b in binds {
        q = q.bind(b);
    }
    q = q.bind(id);
    q.execute(&mut *tx).await?;
    tx.commit().await?;

    let updated =
        sqlx::query_as::<_, PackagingValueDto>("SELECT * FROM packaging_values WHERE id = ?")
            .bind(id)
            .fetch_one(&db.pool)
            .await?;
    Ok(updated)
}

pub async fn delete_packaging_value(db: &DepotDb, id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;
    let (_guard, mut tx) = db.begin_write().await?;
    let result = sqlx::query("DELETE FROM packaging_values WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(CoreError::NotFound(
            "Valeur d'emballage introuvable.".to_string(),
        ));
    }
    tx.commit().await?;
    Ok(())
}

// ==================== PRICE HISTORY ====================

pub async fn list_price_history(
    db: &DepotDb,
    query: PaginatedQuery,
    entity_type: Option<String>,
    entity_id: Option<i64>,
) -> CoreResult<PaginatedResponse<PriceHistoryDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    let p = query.page.max(1);
    let ps = query.page_size.clamp(1, 200);
    let offset = (p - 1) * ps;
    let search = query.search.unwrap_or_default();
    let pattern = format!("%{}%", search.trim());
    let has_search = !search.trim().is_empty();
    let type_filter = entity_type.unwrap_or_default();
    let id_filter = entity_id.unwrap_or(0);

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM price_history 
         WHERE (? = '' OR entity_type = ?)
           AND (? = 0 OR entity_id = ?)
           AND (? = 0 OR field_name LIKE ? OR CAST(old_value AS TEXT) LIKE ? OR CAST(new_value AS TEXT) LIKE ?)",
    )
    .bind(type_filter.clone())
    .bind(type_filter.clone())
    .bind(id_filter)
    .bind(id_filter)
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, PriceHistoryDto>(
        "SELECT * FROM price_history 
         WHERE (? = '' OR entity_type = ?)
           AND (? = 0 OR entity_id = ?)
           AND (? = 0 OR field_name LIKE ? OR CAST(old_value AS TEXT) LIKE ? OR CAST(new_value AS TEXT) LIKE ?)
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?",
    )
    .bind(type_filter.clone())
    .bind(type_filter.clone())
    .bind(id_filter)
    .bind(id_filter)
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .bind(&pattern)
    .bind(ps)
    .bind(offset)
    .fetch_all(&db.pool)
    .await?;

    let total_pages = ((total + ps - 1) / ps).max(1);
    Ok(PaginatedResponse {
        items: rows,
        total,
        page: p,
        page_size: ps,
        total_pages,
    })
}
