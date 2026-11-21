// ============================================================================
// CRUD des profils de bouteilles (bottle_profiles)
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::helpers::check_duplicate;
use super::{
    BottleProfileDto, CreateBottleProfileInput, PaginatedQuery, PaginatedResponse,
    UpdateBottleProfileInput,
};

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
