// ============================================================================
// CRUD des types d'emballages jetables (disposable_packaging_types)
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::helpers::check_duplicate;
use super::{
    CreateDisposablePackagingTypeInput, DisposablePackagingTypeDto, PaginatedQuery,
    PaginatedResponse, UpdateDisposablePackagingTypeInput,
};

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
