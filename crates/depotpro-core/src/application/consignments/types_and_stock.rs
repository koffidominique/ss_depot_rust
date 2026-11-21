// ============================================================================
// Création des types d'emballages consignés et ajustements de stock
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::sales::audit_log_tx;
use crate::domain::money::Money;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

use super::{
    AdjustReturnableStockInput, CreateReturnableTypeInput, ReturnableMovementDto, ReturnableTypeDto,
};

pub async fn create_returnable_type(
    db: &DepotDb,
    input: CreateReturnableTypeInput,
) -> CoreResult<ReturnableTypeDto> {
    require_current_actor_permission(Permission::ConsignmentsWrite)?;
    let code = input.code.trim().to_uppercase();
    let name = input.name.trim().to_string();
    let producer = input.producer.trim().to_string();
    if code.is_empty() || name.is_empty() || producer.is_empty() {
        return Err(CoreError::Validation(
            "Code, nom et producteur sont obligatoires.".to_string(),
        ));
    }
    if !matches!(input.kind.as_str(), "bottle" | "crate") {
        return Err(CoreError::Validation(
            "Type emballage invalide.".to_string(),
        ));
    }
    let deposit_value = Money::from_non_negative(input.deposit_value, "Valeur de consigne")?;
    let initial_stock = input.initial_stock.unwrap_or(0);
    if initial_stock < 0 {
        return Err(CoreError::Validation(
            "Le stock initial doit être positif ou nul.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    if sqlx::query_scalar::<_, i64>("SELECT id FROM returnable_packaging_types WHERE code = ?")
        .bind(&code)
        .fetch_optional(&mut *tx)
        .await?
        .is_some()
    {
        return Err(CoreError::DuplicateOperation(
            "Code emballage déjà utilisé.".to_string(),
        ));
    }

    let clean_desc = input
        .description
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToString::to_string);
    let id = sqlx::query(
        "INSERT INTO returnable_packaging_types (code, name, producer, kind, description, deposit_value)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&code)
    .bind(&name)
    .bind(&producer)
    .bind(&input.kind)
    .bind(clean_desc.as_deref())
    .bind(deposit_value.value())
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    sqlx::query("INSERT INTO returnable_stock_balances (packaging_id, quantity) VALUES (?, ?)")
        .bind(id)
        .bind(initial_stock)
        .execute(&mut *tx)
        .await?;

    if initial_stock > 0 {
        sqlx::query(
            "INSERT INTO returnable_stock_movements (request_key, packaging_id, movement_type, quantity, stock_before, stock_after, reason, reference_document)
             VALUES (?, ?, 'initial', ?, 0, ?, 'Stock initial emballage', ?)",
        )
        .bind(format!("init-ret-{id}"))
        .bind(id)
        .bind(initial_stock)
        .bind(initial_stock)
        .bind(&code)
        .execute(&mut *tx)
        .await?;
    }

    audit_log_tx(
        &mut tx,
        "CREATE_RETURNABLE_TYPE",
        "returnable_packaging_types",
        Some(id.to_string()),
        &format!("{code} — {name}"),
    )
    .await?;
    tx.commit().await?;

    Ok(ReturnableTypeDto {
        id,
        code,
        name,
        producer,
        kind: input.kind,
        description: clean_desc,
        deposit_value: deposit_value.value(),
        stock_quantity: initial_stock,
    })
}

pub async fn adjust_returnable_stock(
    db: &DepotDb,
    input: AdjustReturnableStockInput,
) -> CoreResult<ReturnableMovementDto> {
    require_current_actor_permission(Permission::ConsignmentsWrite)?;
    let request_key = input.request_key.trim().to_string();
    if request_key.is_empty() {
        return Err(CoreError::Validation(
            "Clé d'idempotence requise.".to_string(),
        ));
    }
    if input.quantity <= 0 {
        return Err(CoreError::Validation(
            "La quantité doit être un entier strictement positif.".to_string(),
        ));
    }
    let reason = input.reason.trim().to_string();
    if reason.is_empty() {
        return Err(CoreError::Validation(
            "Le motif est obligatoire.".to_string(),
        ));
    }
    if !matches!(
        input.movement_type.as_str(),
        "entry" | "exit" | "breakage" | "loss" | "correction_in" | "correction_out"
    ) {
        return Err(CoreError::Validation(
            "Type de mouvement invalide.".to_string(),
        ));
    }

    let (_guard, mut tx) = db.begin_write().await?;
    if let Some(existing_id) = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM returnable_stock_movements WHERE request_key = ?",
    )
    .bind(&request_key)
    .fetch_optional(&mut *tx)
    .await?
    {
        tx.rollback().await?;
        let mv = sqlx::query_as::<_, ReturnableMovementDto>(
            "SELECT rsm.id, rsm.packaging_id, rpt.name AS packaging_name, rpt.code AS packaging_code,
                    rsm.movement_type, rsm.quantity, rsm.stock_before, rsm.stock_after, rsm.reason,
                    rsm.reference_document, rsm.date AS created_at
             FROM returnable_stock_movements rsm
             JOIN returnable_packaging_types rpt ON rpt.id = rsm.packaging_id
             WHERE rsm.id = ?",
        )
        .bind(existing_id)
        .fetch_one(&db.pool)
        .await?;
        return Ok(mv);
    }

    if sqlx::query_scalar::<_, i64>("SELECT id FROM returnable_packaging_types WHERE id = ?")
        .bind(input.packaging_id)
        .fetch_optional(&mut *tx)
        .await?
        .is_none()
    {
        return Err(CoreError::Validation(
            "Type d'emballage consigné introuvable.".to_string(),
        ));
    }

    let bal: Option<(i64,)> =
        sqlx::query_as("SELECT quantity FROM returnable_stock_balances WHERE packaging_id = ?")
            .bind(input.packaging_id)
            .fetch_optional(&mut *tx)
            .await?;
    let before = bal.map(|b| b.0).unwrap_or(0);
    let is_out = matches!(
        input.movement_type.as_str(),
        "exit" | "breakage" | "loss" | "correction_out"
    );
    let after = if is_out {
        before.checked_sub(input.quantity)
    } else {
        before.checked_add(input.quantity)
    }
    .ok_or_else(|| CoreError::Validation("Débordement sur le stock de vides.".to_string()))?;
    if after < 0 {
        return Err(CoreError::InsufficientStock(
            "Stock de vides insuffisant pour ce mouvement.".to_string(),
        ));
    }

    if bal.is_some() {
        sqlx::query("UPDATE returnable_stock_balances SET quantity = ? WHERE packaging_id = ?")
            .bind(after)
            .bind(input.packaging_id)
            .execute(&mut *tx)
            .await?;
    } else {
        sqlx::query("INSERT INTO returnable_stock_balances (packaging_id, quantity) VALUES (?, ?)")
            .bind(input.packaging_id)
            .bind(after)
            .execute(&mut *tx)
            .await?;
    }

    let mov_id = sqlx::query(
        "INSERT INTO returnable_stock_movements (request_key, packaging_id, movement_type, quantity, stock_before, stock_after, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&request_key)
    .bind(input.packaging_id)
    .bind(&input.movement_type)
    .bind(input.quantity)
    .bind(before)
    .bind(after)
    .bind(&reason)
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    audit_log_tx(
        &mut tx,
        "RETURNABLE_STOCK_MOVEMENT",
        "returnable_packaging_types",
        Some(input.packaging_id.to_string()),
        &format!("{} {} ({reason})", input.movement_type, input.quantity),
    )
    .await?;
    tx.commit().await?;

    let mv = sqlx::query_as::<_, ReturnableMovementDto>(
        "SELECT rsm.id, rsm.packaging_id, rpt.name AS packaging_name, rpt.code AS packaging_code,
                rsm.movement_type, rsm.quantity, rsm.stock_before, rsm.stock_after, rsm.reason,
                rsm.reference_document, rsm.date AS created_at
         FROM returnable_stock_movements rsm
         JOIN returnable_packaging_types rpt ON rpt.id = rsm.packaging_id
         WHERE rsm.id = ?",
    )
    .bind(mov_id)
    .fetch_one(&db.pool)
    .await?;
    Ok(mv)
}
