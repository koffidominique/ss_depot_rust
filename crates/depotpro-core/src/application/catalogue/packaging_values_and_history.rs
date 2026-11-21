// ============================================================================
// Valeurs des emballages consignés (packaging_values) & historique des prix
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{
    CreatePackagingValueInput, PackagingValueDto, PaginatedQuery, PaginatedResponse,
    PriceHistoryDto, UpdatePackagingValueInput,
};

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
