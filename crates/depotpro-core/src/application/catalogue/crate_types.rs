// ============================================================================
// CRUD des types de casiers (crate_types)
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::helpers::check_duplicate;
use super::{
    CreateCrateTypeInput, CrateTypeDto, PaginatedQuery, PaginatedResponse, UpdateCrateTypeInput,
};

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
