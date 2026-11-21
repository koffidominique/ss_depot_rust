// ============================================================================
// Données de référence nécessaires au formulaire de création d'une boisson
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::CoreResult;
use crate::infrastructure::db::DepotDb;

use super::{BrandOptionDto, BreweryOptionDto, ProductFormMetadataDto};

pub async fn get_product_form_metadata(db: &DepotDb) -> CoreResult<ProductFormMetadataDto> {
    require_current_actor_permission(Permission::CatalogRead)?;

    let breweries = sqlx::query_as::<_, BreweryOptionDto>(
        "SELECT id, code, name, country_code
         FROM breweries
         WHERE is_active = 1
         ORDER BY name COLLATE NOCASE",
    )
    .fetch_all(&db.pool)
    .await?;

    let brands = sqlx::query_as::<_, BrandOptionDto>(
        "SELECT id, code, name, brewery_id
         FROM brands
         WHERE is_active = 1 AND brewery_id IS NOT NULL
         ORDER BY name COLLATE NOCASE",
    )
    .fetch_all(&db.pool)
    .await?;

    Ok(ProductFormMetadataDto { breweries, brands })
}
