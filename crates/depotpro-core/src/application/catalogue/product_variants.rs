// ============================================================================
// CRUD des variantes de produits (product_variants)
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{
    CreateProductVariantInput, PaginatedQuery, PaginatedResponse, ProductVariantDto,
    UpdateProductVariantInput,
};

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
        "SELECT id, product_id, name, reference, barcode, volume_ml, container_type, alcohol_degree, bottle_profile_id, crate_type_id, compatibility_group_id, is_active, created_at, updated_at FROM product_variants 
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
    if input.volume_ml.is_some_and(|v| v <= 0) {
        return Err(CoreError::Validation(
            "Le volume de la variante doit être positif.".to_string(),
        ));
    }
    if let Some(ref kind) = input.container_type {
        if ![
            "glass_returnable",
            "glass_disposable",
            "pet",
            "can",
            "plastic_bottle",
            "other",
        ]
        .contains(&kind.as_str())
        {
            return Err(CoreError::Validation(
                "Type de contenant invalide.".to_string(),
            ));
        }
    }
    if input
        .alcohol_degree
        .is_some_and(|v| !v.is_finite() || !(0.0..=100.0).contains(&v))
    {
        return Err(CoreError::Validation(
            "Le degré d'alcool doit être compris entre 0 et 100 %.".to_string(),
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
        "INSERT INTO product_variants (product_id, name, reference, barcode, volume_ml, container_type, alcohol_degree, bottle_profile_id, crate_type_id, compatibility_group_id, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    )
    .bind(input.product_id)
    .bind(&clean_name)
    .bind(input.reference.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.barcode.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(input.volume_ml)
    .bind(input.container_type.as_deref())
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
        sqlx::query_as::<_, ProductVariantDto>("SELECT id, product_id, name, reference, barcode, volume_ml, container_type, alcohol_degree, bottle_profile_id, crate_type_id, compatibility_group_id, is_active, created_at, updated_at FROM product_variants WHERE id = ?")
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
        match r {
            Some(value) => {
                let clean = value.trim();
                if clean.is_empty() {
                    return Err(CoreError::Validation(
                        "La référence ne peut pas être vide.".to_string(),
                    ));
                }
                updates.push("reference = ?".to_string());
                binds.push(clean.to_string());
            }
            None => updates.push("reference = NULL".to_string()),
        }
    }
    if let Some(ref barcode) = input.barcode {
        match barcode {
            Some(value) => {
                let clean = value.trim();
                if clean.is_empty() {
                    updates.push("barcode = NULL".to_string());
                } else {
                    updates.push("barcode = ?".to_string());
                    binds.push(clean.to_string());
                }
            }
            None => updates.push("barcode = NULL".to_string()),
        }
    }
    if let Some(volume) = input.volume_ml {
        match volume {
            Some(value) => {
                if value <= 0 {
                    return Err(CoreError::Validation(
                        "Le volume doit être positif.".to_string(),
                    ));
                }
                updates.push("volume_ml = ?".to_string());
                binds.push(value.to_string());
            }
            None => updates.push("volume_ml = NULL".to_string()),
        }
    }
    if let Some(ref container_type) = input.container_type {
        match container_type {
            Some(value) => {
                if ![
                    "glass_returnable",
                    "glass_disposable",
                    "pet",
                    "can",
                    "plastic_bottle",
                    "other",
                ]
                .contains(&value.as_str())
                {
                    return Err(CoreError::Validation(
                        "Type de contenant invalide.".to_string(),
                    ));
                }
                updates.push("container_type = ?".to_string());
                binds.push(value.clone());
            }
            None => updates.push("container_type = NULL".to_string()),
        }
    }
    if let Some(alcohol) = input.alcohol_degree {
        match alcohol {
            Some(value) => {
                if !value.is_finite() || !(0.0..=100.0).contains(&value) {
                    return Err(CoreError::Validation(
                        "Le degré d'alcool doit être compris entre 0 et 100 %.".to_string(),
                    ));
                }
                updates.push("alcohol_degree = ?".to_string());
                binds.push(value.to_string());
            }
            None => updates.push("alcohol_degree = NULL".to_string()),
        }
    }
    if let Some(ref profile) = input.bottle_profile_id {
        match profile {
            Some(value) => {
                let exists: Option<i64> =
                    sqlx::query_scalar("SELECT id FROM bottle_profiles WHERE id = ?")
                        .bind(value)
                        .fetch_optional(&mut *tx)
                        .await?;
                if exists.is_none() {
                    return Err(CoreError::Validation(
                        "Profil de bouteille introuvable.".to_string(),
                    ));
                }
                updates.push("bottle_profile_id = ?".to_string());
                binds.push(value.to_string());
            }
            None => updates.push("bottle_profile_id = NULL".to_string()),
        }
    }
    if let Some(ref crate_type) = input.crate_type_id {
        match crate_type {
            Some(value) => {
                let exists: Option<i64> =
                    sqlx::query_scalar("SELECT id FROM crate_types WHERE id = ?")
                        .bind(value)
                        .fetch_optional(&mut *tx)
                        .await?;
                if exists.is_none() {
                    return Err(CoreError::Validation(
                        "Type de casier introuvable.".to_string(),
                    ));
                }
                updates.push("crate_type_id = ?".to_string());
                binds.push(value.to_string());
            }
            None => updates.push("crate_type_id = NULL".to_string()),
        }
    }
    if let Some(ref group) = input.compatibility_group_id {
        match group {
            Some(value) => {
                let exists: Option<i64> =
                    sqlx::query_scalar("SELECT id FROM crate_compatibility_groups WHERE id = ?")
                        .bind(value)
                        .fetch_optional(&mut *tx)
                        .await?;
                if exists.is_none() {
                    return Err(CoreError::Validation(
                        "Groupe de compatibilité introuvable.".to_string(),
                    ));
                }
                updates.push("compatibility_group_id = ?".to_string());
                binds.push(value.to_string());
            }
            None => updates.push("compatibility_group_id = NULL".to_string()),
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
        sqlx::query_as::<_, ProductVariantDto>("SELECT id, product_id, name, reference, barcode, volume_ml, container_type, alcohol_degree, bottle_profile_id, crate_type_id, compatibility_group_id, is_active, created_at, updated_at FROM product_variants WHERE id = ?")
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
