// ============================================================================
// Référentiel des brasseries / producteurs de boissons
// ============================================================================

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct BreweryDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub country_code: String,
    pub address: Option<String>,
    pub website: Option<String>,
    pub notes: Option<String>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBreweryInput {
    pub code: String,
    pub name: String,
    pub country_code: Option<String>,
    pub address: Option<String>,
    pub website: Option<String>,
    pub notes: Option<String>,
}

pub async fn list_breweries(db: &DepotDb) -> CoreResult<Vec<BreweryDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;
    sqlx::query_as::<_, BreweryDto>(
        "SELECT id, code, name, country_code, address, website, notes, is_active, created_at, updated_at
         FROM breweries WHERE is_active = 1 ORDER BY name COLLATE NOCASE",
    )
    .fetch_all(&db.pool)
    .await
    .map_err(Into::into)
}

pub async fn create_brewery(db: &DepotDb, input: CreateBreweryInput) -> CoreResult<BreweryDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;

    let code = input.code.trim().to_uppercase();
    let name = input.name.trim();
    let country_code = input
        .country_code
        .as_deref()
        .unwrap_or("CI")
        .trim()
        .to_uppercase();

    if code.is_empty() || name.is_empty() {
        return Err(CoreError::Validation(
            "Le code et le nom de la brasserie sont obligatoires.".to_string(),
        ));
    }
    if country_code.len() != 2 || !country_code.chars().all(|c| c.is_ascii_alphabetic()) {
        return Err(CoreError::Validation(
            "Le pays doit être un code ISO alpha-2 (ex. CI).".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    let duplicate: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM breweries WHERE lower(code) = lower(?) OR lower(name) = lower(?)",
    )
    .bind(&code)
    .bind(name)
    .fetch_optional(&mut *tx)
    .await?;
    if duplicate.is_some() {
        return Err(CoreError::DuplicateOperation(
            "Cette brasserie existe déjà.".to_string(),
        ));
    }

    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO breweries (code, name, country_code, address, website, notes)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(&code)
    .bind(name)
    .bind(&country_code)
    .bind(input.address.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.website.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.notes.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    sqlx::query_as::<_, BreweryDto>(
        "SELECT id, code, name, country_code, address, website, notes, is_active, created_at, updated_at
         FROM breweries WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await
    .map_err(Into::into)
}
