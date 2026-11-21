// ============================================================================
// CRUD des unités de mesure (units_of_measure)
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::helpers::check_duplicate;
use super::{
    CreateUnitOfMeasureInput, PaginatedQuery, PaginatedResponse, UnitOfMeasureDto,
    UpdateUnitOfMeasureInput,
};

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
        "SELECT COUNT(*) FROM units_of_measure WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ? OR symbol LIKE ?)",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
    .bind(if has_search { 1_i64 } else { 0_i64 })
    .bind(&pattern)
    .bind(&pattern)
    .bind(&pattern)
    .fetch_one(&db.pool)
    .await?;

    let rows = sqlx::query_as::<_, UnitOfMeasureDto>(
        "SELECT * FROM units_of_measure WHERE (? = 1 OR is_active = 1) AND (? = 0 OR name LIKE ? OR code LIKE ? OR symbol LIKE ?) ORDER BY name ASC LIMIT ? OFFSET ?",
    )
    .bind(if include_archived { 1_i64 } else { 0_i64 })
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
        "INSERT INTO units_of_measure (code, name, symbol, base_unit_id, conversion_factor_num, conversion_factor_den, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&clean_code)
    .bind(clean_name)
    .bind(clean_symbol)
    .bind(input.base_unit_id)
    .bind(input.conversion_factor_num.unwrap_or(1).max(1))
    .bind(input.conversion_factor_den.unwrap_or(1).max(1))
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
    let existing: Option<UnitOfMeasureDto> =
        sqlx::query_as("SELECT * FROM units_of_measure WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let existing = existing.ok_or_else(|| CoreError::NotFound("Unité introuvable.".into()))?;

    let code = match input.code {
        Some(c) => {
            let clean = c.trim().to_uppercase();
            if clean.is_empty() {
                return Err(CoreError::Validation("Le code est obligatoire.".into()));
            }
            check_duplicate(&mut tx, "units_of_measure", "code", &clean, Some(id)).await?;
            clean
        }
        None => existing.code,
    };
    let name = input
        .name
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or(existing.name);
    let symbol = input
        .symbol
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or(existing.symbol);
    let base_unit_id = input.base_unit_id.unwrap_or(existing.base_unit_id);
    let num = input
        .conversion_factor_num
        .unwrap_or(existing.conversion_factor_num)
        .max(1);
    let den = input
        .conversion_factor_den
        .unwrap_or(existing.conversion_factor_den)
        .max(1);
    let is_active = input
        .is_active
        .map(|b| if b { 1 } else { 0 })
        .unwrap_or(existing.is_active);

    sqlx::query(
        "UPDATE units_of_measure
         SET code = ?, name = ?, symbol = ?, base_unit_id = ?, conversion_factor_num = ?, conversion_factor_den = ?, is_active = ?
         WHERE id = ?",
    )
    .bind(&code)
    .bind(&name)
    .bind(&symbol)
    .bind(base_unit_id)
    .bind(num)
    .bind(den)
    .bind(is_active)
    .bind(id)
    .execute(&mut *tx)
    .await?;
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
        return Err(CoreError::NotFound("Unité introuvable.".to_string()));
    }
    tx.commit().await?;
    Ok(())
}
