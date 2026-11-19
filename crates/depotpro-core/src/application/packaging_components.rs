#[derive(Debug, Deserialize)]
pub struct CreateCrateTypeInput {
    pub code: String,
    pub name: String,
    pub producer: String,
    pub capacity: i64,
    pub bottle_capacity_ml: i64,
    pub bottle_profile_id: i64,
    pub compatibility_group_id: Option<i64>,
    pub dimensions: Option<String>,
    pub weight_g: Option<i64>,
    pub material: String,
    pub deposit_value: i64,
    pub description: Option<String>,
    pub is_active: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCrateTypeInput {
    pub name: Option<String>,
    pub capacity: Option<i64>,
    pub bottle_capacity_ml: Option<i64>,
    pub compatibility_group_id: Option<i64>,
    pub dimensions: Option<String>,
    pub weight_g: Option<i64>,
    pub material: Option<String>,
    pub deposit_value: Option<i64>,
    pub description: Option<String>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CreateBottleProfileInput {
    pub code: String,
    pub name: String,
    pub producer: String,
    pub material: String,
    pub capacity_ml: i64,
    pub diameter_mm: Option<i64>,
    pub height_mm: Option<i64>,
    pub weight_g: Option<i64>,
    pub base_type: Option<String>,
    pub neck_type: Option<String>,
    pub compatibility_group_id: Option<i64>,
    pub deposit_value: i64,
    pub description: Option<String>,
    pub is_active: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBottleProfileInput {
    pub name: Option<String>,
    pub material: Option<String>,
    pub capacity_ml: Option<i64>,
    pub diameter_mm: Option<i64>,
    pub height_mm: Option<i64>,
    pub weight_g: Option<i64>,
    pub base_type: Option<String>,
    pub neck_type: Option<String>,
    pub deposit_value: Option<i64>,
    pub description: Option<String>,
    pub is_active: Option<bool>,
}

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT")]
pub enum ComponentType {
    #[serde(rename = "crate_support")]
    CrateSupport,
    #[serde(rename = "bottle")]
    Bottle,
    #[serde(rename = "cap")]
    Cap,
    #[serde(rename = "label")]
    Label,
    #[serde(rename = "crate_assembled")]
    CrateAssembled,
    #[serde(rename = "other")]
    Other,
}

impl std::fmt::Display for ComponentType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ComponentType::CrateSupport => f.write_str("crate_support"),
            ComponentType::Bottle => f.write_str("bottle"),
            ComponentType::Cap => f.write_str("cap"),
            ComponentType::Label => f.write_str("label"),
            ComponentType::CrateAssembled => f.write_str("crate_assembled"),
            ComponentType::Other => f.write_str("other"),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT")]
pub enum MovementType {
    #[serde(rename = "inbound")]
    Inbound,
    #[serde(rename = "outbound")]
    Outbound,
    #[serde(rename = "adjustment")]
    Adjustment,
    #[serde(rename = "return")]
    Return,
    #[serde(rename = "loss")]
    Loss,
    #[serde(rename = "damage")]
    Damage,
    #[serde(rename = "assembly")]
    Assembly,
    #[serde(rename = "disassembly")]
    Disassembly,
}

impl std::fmt::Display for MovementType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MovementType::Inbound => f.write_str("inbound"),
            MovementType::Outbound => f.write_str("outbound"),
            MovementType::Adjustment => f.write_str("adjustment"),
            MovementType::Return => f.write_str("return"),
            MovementType::Loss => f.write_str("loss"),
            MovementType::Damage => f.write_str("damage"),
            MovementType::Assembly => f.write_str("assembly"),
            MovementType::Disassembly => f.write_str("disassembly"),
        }
    }
}

#[derive(Debug, Serialize, FromRow)]
pub struct CrateComponentDto {
    pub id: i64,
    pub crate_type_id: i64,
    pub component_type: String,
    pub component_profile_id: Option<i64>,
    pub quantity_per_crate: i64,
    pub deposit_value: i64,
    pub is_required: bool,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PackagingComponentStockDto {
    pub id: i64,
    pub component_type: String,
    pub component_profile_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub stock_quantity: i64,
    pub reserved_quantity: i64,
    pub deposit_value: i64,
    pub last_counted_at: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CustomerPackagingComponentBalanceDto {
    pub id: i64,
    pub client_id: i64,
    pub client_name: String,
    pub component_type: String,
    pub component_profile_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub balance_pieces: i64,
    pub deposit_held_amount: i64,
    pub last_transaction_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PackagingComponentMovementDto {
    pub id: i64,
    pub component_type: String,
    pub component_profile_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub movement_type: String,
    pub quantity: i64,
    pub stock_before: i64,
    pub stock_after: i64,
    pub reason: String,
    pub reference_document: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CrateAssemblyRecordDto {
    pub id: i64,
    pub crate_type_id: i64,
    pub crate_name: String,
    pub assembled_quantity: i64,
    pub support_quantity_used: i64,
    pub bottle_quantity_used: i64,
    pub reason: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CrateDisassemblyRecordDto {
    pub id: i64,
    pub crate_type_id: i64,
    pub crate_name: String,
    pub disassembled_quantity: i64,
    pub support_quantity_recovered: i64,
    pub bottle_quantity_recovered: i64,
    pub reason: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackagingComponentsOverviewDto {
    pub component_stock: Vec<PackagingComponentStockDto>,
    pub customer_balances: Vec<CustomerPackagingComponentBalanceDto>,
    pub recent_movements: Vec<PackagingComponentMovementDto>,
    pub crate_components: Vec<CrateComponentDto>,
    pub assembly_records: Vec<CrateAssemblyRecordDto>,
    pub disassembly_records: Vec<CrateDisassemblyRecordDto>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCrateComponentInput {
    pub crate_type_id: i64,
    pub component_type: String,
    pub component_profile_id: Option<i64>,
    pub quantity_per_crate: i64,
    pub deposit_value: i64,
    pub is_required: bool,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateComponentStockInput {
    pub component_type: String,
    pub component_profile_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub movement_type: String,
    pub quantity: i64,
    pub reason: String,
    pub reference_document: Option<String>,
    pub request_key: String,
}

#[derive(Debug, Deserialize)]
pub struct AssembleCratesInput {
    pub crate_type_id: i64,
    pub quantity: i64,
    pub reason: Option<String>,
    pub request_key: String,
}

#[derive(Debug, Deserialize)]
pub struct DisassembleCratesInput {
    pub crate_type_id: i64,
    pub quantity: i64,
    pub reason: Option<String>,
    pub request_key: String,
}

pub async fn get_components_overview(db: &DepotDb) -> CoreResult<PackagingComponentsOverviewDto> {
    require_current_actor_permission(Permission::ConsignmentsRead)?;

    let component_stock = sqlx::query_as::<_, PackagingComponentStockDto>(
        "SELECT pcs.id, pcs.component_type, pcs.component_profile_id, pcs.crate_type_id,
                pcs.stock_quantity, pcs.reserved_quantity, pcs.deposit_value, pcs.last_counted_at
         FROM packaging_component_stock pcs
         ORDER BY pcs.component_type, pcs.crate_type_id, pcs.component_profile_id",
    )
    .fetch_all(&db.pool)
    .await?;

    let customer_balances = sqlx::query_as::<_, CustomerPackagingComponentBalanceDto>(
        "SELECT cpcb.rowid AS id, cpcb.client_id, c.name AS client_name,
                cpcb.component_type, cpcb.component_profile_id, cpcb.crate_type_id,
                cpcb.balance_pieces, cpcb.deposit_held_amount, cpcb.last_transaction_at
         FROM customer_packaging_component_balances cpcb
         JOIN clients c ON c.id = cpcb.client_id
         WHERE cpcb.balance_pieces != 0 OR cpcb.deposit_held_amount != 0
         ORDER BY c.name, cpcb.component_type",
    )
    .fetch_all(&db.pool)
    .await?;

    let recent_movements = sqlx::query_as::<_, PackagingComponentMovementDto>(
        "SELECT pcm.id, pcm.component_type, pcm.component_profile_id, pcm.crate_type_id,
                pcm.movement_type, pcm.quantity, pcm.stock_before, pcm.stock_after,
                pcm.reason, pcm.reference_document, pcm.created_at
         FROM packaging_component_movements pcm
         ORDER BY pcm.id DESC LIMIT 50",
    )
    .fetch_all(&db.pool)
    .await?;

    let crate_components = sqlx::query_as::<_, CrateComponentDto>(
        "SELECT cc.id, cc.crate_type_id, cc.component_type, cc.component_profile_id,
                cc.quantity_per_crate, cc.deposit_value, cc.is_required, cc.description
         FROM crate_components cc
         ORDER BY cc.crate_type_id, cc.component_type",
    )
    .fetch_all(&db.pool)
    .await?;

    let assembly_records = sqlx::query_as::<_, CrateAssemblyRecordDto>(
        "SELECT car.id, car.crate_type_id, ct.name AS crate_name, car.assembled_quantity,
                car.support_quantity_used, car.bottle_quantity_used, car.reason, car.created_at
         FROM crate_assembly_records car
         JOIN crate_types ct ON ct.id = car.crate_type_id
         ORDER BY car.id DESC LIMIT 50",
    )
    .fetch_all(&db.pool)
    .await?;

    let disassembly_records = sqlx::query_as::<_, CrateDisassemblyRecordDto>(
        "SELECT cdr.id, cdr.crate_type_id, ct.name AS crate_name, cdr.disassembled_quantity,
                cdr.support_quantity_recovered, cdr.bottle_quantity_recovered, cdr.reason, cdr.created_at
         FROM crate_disassembly_records cdr
         JOIN crate_types ct ON ct.id = cdr.crate_type_id
         ORDER BY cdr.id DESC LIMIT 50",
    )
    .fetch_all(&db.pool)
    .await?;

    Ok(PackagingComponentsOverviewDto {
        component_stock,
        customer_balances,
        recent_movements,
        crate_components,
        assembly_records,
        disassembly_records,
    })
}

pub async fn create_crate_component(
    db: &DepotDb,
    input: CreateCrateComponentInput,
) -> CoreResult<CrateComponentDto> {
    require_current_actor_permission(Permission::ConsignmentsWrite)?;

    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO crate_components (crate_type_id, component_type, component_profile_id,
                                        quantity_per_crate, deposit_value, is_required, description)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING id",
    )
    .bind(input.crate_type_id)
    .bind(input.component_type)
    .bind(input.component_profile_id)
    .bind(input.quantity_per_crate)
    .bind(input.deposit_value)
    .bind(input.is_required)
    .bind(input.description)
    .fetch_one(&db.pool)
    .await?;

    let component = sqlx::query_as::<_, CrateComponentDto>(
        "SELECT id, crate_type_id, component_type, component_profile_id, quantity_per_crate,
                deposit_value, is_required, description
         FROM crate_components WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;

    Ok(component)
}

pub async fn update_component_stock(
    db: &DepotDb,
    input: UpdateComponentStockInput,
) -> CoreResult<PackagingComponentStockDto> {
    require_current_actor_permission(Permission::ConsignmentsWrite)?;

    let mut tx = db.pool.begin().await?;

    let current_stock = sqlx::query_scalar::<_, i64>(
        "SELECT stock_quantity FROM packaging_component_stock
         WHERE component_type = ? AND component_profile_id IS NOT DISTINCT FROM ? AND crate_type_id IS NOT DISTINCT FROM ?",
    )
    .bind(&input.component_type)
    .bind(input.component_profile_id)
    .bind(input.crate_type_id)
    .fetch_optional(&mut *tx)
    .await?
    .unwrap_or(0);

    let new_stock = current_stock + input.quantity;

    if new_stock < 0 {
        return Err(CoreError::Validation(format!(
            "Stock insuffisant pour le composant {} : stock actuel = {}, quantité demandée = {}",
            input.component_type, current_stock, input.quantity
        )));
    }

    let stock_before = current_stock;
    let stock_after = new_stock;

    sqlx::query(
        "INSERT INTO packaging_component_stock (component_type, component_profile_id, crate_type_id, stock_quantity, deposit_value)
         VALUES (?, ?, ?, ?, 0)
         ON CONFLICT(component_type, component_profile_id, crate_type_id) DO UPDATE SET stock_quantity = excluded.stock_quantity, updated_at = datetime('now')",
    )
    .bind(&input.component_type)
    .bind(input.component_profile_id)
    .bind(input.crate_type_id)
    .bind(new_stock)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO packaging_component_movements (component_type, component_profile_id, crate_type_id,
                                                    movement_type, quantity, stock_before, stock_after, reason, reference_document)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&input.component_type)
    .bind(input.component_profile_id)
    .bind(input.crate_type_id)
    .bind(&input.movement_type)
    .bind(input.quantity)
    .bind(stock_before)
    .bind(stock_after)
    .bind(&input.reason)
    .bind(input.reference_document)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let stock = sqlx::query_as::<_, PackagingComponentStockDto>(
        "SELECT id, component_type, component_profile_id, crate_type_id, stock_quantity, reserved_quantity, deposit_value, last_counted_at
         FROM packaging_component_stock
         WHERE component_type = ? AND component_profile_id IS NOT DISTINCT FROM ? AND crate_type_id IS NOT DISTINCT FROM ?",
    )
    .bind(&input.component_type)
    .bind(input.component_profile_id)
    .bind(input.crate_type_id)
    .fetch_one(&db.pool)
    .await?;

    Ok(stock)
}

pub async fn assemble_crates(
    db: &DepotDb,
    input: AssembleCratesInput,
) -> CoreResult<CrateAssemblyRecordDto> {
    require_current_actor_permission(Permission::ConsignmentsWrite)?;

    let mut tx = db.pool.begin().await?;

    let crate_components = sqlx::query_as::<_, CrateComponentDto>(
        "SELECT id, crate_type_id, component_type, component_profile_id,
                quantity_per_crate, deposit_value, is_required, description
         FROM crate_components WHERE crate_type_id = ?",
    )
    .bind(input.crate_type_id)
    .fetch_all(&mut *tx)
    .await?;

    if crate_components.is_empty() {
        return Err(CoreError::Validation(format!(
            "Aucun composant défini pour le type de casier ID {}",
            input.crate_type_id
        )));
    }

    let mut support_quantity_used = 0i64;
    let mut bottle_quantity_used = 0i64;

    for component in &crate_components {
        let required_quantity = component.quantity_per_crate * input.quantity;

        let current_stock = sqlx::query_scalar::<_, i64>(
            "SELECT stock_quantity FROM packaging_component_stock
             WHERE component_type = ? AND component_profile_id IS NOT DISTINCT FROM ? AND crate_type_id IS NOT DISTINCT FROM ?",
        )
        .bind(&component.component_type)
        .bind(component.component_profile_id)
        .bind(component.crate_type_id)
        .fetch_optional(&mut *tx)
        .await?
        .unwrap_or(0);

        if current_stock < required_quantity {
            return Err(CoreError::Validation(format!(
                "Stock insuffisant pour le composant {} du casier : stock actuel = {}, quantité requise = {}",
                component.component_type, current_stock, required_quantity
            )));
        }

        sqlx::query(
            "UPDATE packaging_component_stock
             SET stock_quantity = stock_quantity - ?, updated_at = datetime('now')
             WHERE component_type = ? AND component_profile_id IS NOT DISTINCT FROM ? AND crate_type_id IS NOT DISTINCT FROM ?",
        )
        .bind(required_quantity)
        .bind(&component.component_type)
        .bind(component.component_profile_id)
        .bind(component.crate_type_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "INSERT INTO packaging_component_movements (component_type, component_profile_id, crate_type_id,
                                                        movement_type, quantity, stock_before, stock_after, reason)
             VALUES (?, ?, ?, 'assembly', ?, ?, stock_quantity + ?, 'Assemblage de casiers')",
        )
        .bind(&component.component_type)
        .bind(component.component_profile_id)
        .bind(component.crate_type_id)
        .bind(-required_quantity)
        .bind(current_stock)
        .bind(-required_quantity)
        .execute(&mut *tx)
        .await?;

        if component.component_type == "crate_support" {
            support_quantity_used += required_quantity;
        } else if component.component_type == "bottle" {
            bottle_quantity_used += required_quantity;
        }
    }

    sqlx::query(
        "INSERT INTO packaging_component_stock (component_type, crate_type_id, stock_quantity, deposit_value)
         VALUES ('crate_assembled', ?, ?, 0)
         ON CONFLICT(component_type, component_profile_id, crate_type_id) DO UPDATE SET stock_quantity = stock_quantity + ?, updated_at = datetime('now')",
    )
    .bind(input.crate_type_id)
    .bind(input.quantity)
    .bind(input.quantity)
    .execute(&mut *tx)
    .await?;

    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO crate_assembly_records (crate_type_id, assembled_quantity, support_quantity_used, bottle_quantity_used, reason)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id",
    )
    .bind(input.crate_type_id)
    .bind(input.quantity)
    .bind(support_quantity_used)
    .bind(bottle_quantity_used)
    .bind(input.reason)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    let record = sqlx::query_as::<_, CrateAssemblyRecordDto>(
        "SELECT car.id, car.crate_type_id, ct.name AS crate_name, car.assembled_quantity,
                car.support_quantity_used, car.bottle_quantity_used, car.reason, car.created_at
         FROM crate_assembly_records car
         JOIN crate_types ct ON ct.id = car.crate_type_id
         WHERE car.id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;

    Ok(record)
}

pub async fn disassemble_crates(
    db: &DepotDb,
    input: DisassembleCratesInput,
) -> CoreResult<CrateDisassemblyRecordDto> {
    require_current_actor_permission(Permission::ConsignmentsWrite)?;

    let mut tx = db.pool.begin().await?;

    let crate_components = sqlx::query_as::<_, CrateComponentDto>(
        "SELECT id, crate_type_id, component_type, component_profile_id,
                quantity_per_crate, deposit_value, is_required, description
         FROM crate_components WHERE crate_type_id = ?",
    )
    .bind(input.crate_type_id)
    .fetch_all(&mut *tx)
    .await?;

    if crate_components.is_empty() {
        return Err(CoreError::Validation(format!(
            "Aucun composant défini pour le type de casier ID {}",
            input.crate_type_id
        )));
    }

    let current_crate_stock = sqlx::query_scalar::<_, i64>(
        "SELECT stock_quantity FROM packaging_component_stock
         WHERE component_type = 'crate_assembled' AND crate_type_id = ?",
    )
    .bind(input.crate_type_id)
    .fetch_optional(&mut *tx)
    .await?
    .unwrap_or(0);

    if current_crate_stock < input.quantity {
        return Err(CoreError::Validation(format!(
            "Stock insuffisant pour les casiers assemblés : stock actuel = {}, quantité demandée = {}",
            current_crate_stock, input.quantity
        )));
    }

    let mut support_quantity_recovered = 0i64;
    let mut bottle_quantity_recovered = 0i64;

    sqlx::query(
        "UPDATE packaging_component_stock
         SET stock_quantity = stock_quantity - ?, updated_at = datetime('now')
         WHERE component_type = 'crate_assembled' AND crate_type_id = ?",
    )
    .bind(input.quantity)
    .bind(input.crate_type_id)
    .execute(&mut *tx)
    .await?;

    for component in &crate_components {
        let recovered_quantity = component.quantity_per_crate * input.quantity;

        sqlx::query(
            "INSERT INTO packaging_component_stock (component_type, component_profile_id, crate_type_id, stock_quantity, deposit_value)
             VALUES (?, ?, ?, ?, 0)
             ON CONFLICT(component_type, component_profile_id, crate_type_id) DO UPDATE SET stock_quantity = stock_quantity + ?, updated_at = datetime('now')",
        )
        .bind(&component.component_type)
        .bind(component.component_profile_id)
        .bind(component.crate_type_id)
        .bind(recovered_quantity)
        .bind(recovered_quantity)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "INSERT INTO packaging_component_movements (component_type, component_profile_id, crate_type_id,
                                                        movement_type, quantity, stock_before, stock_after, reason)
             VALUES (?, ?, ?, 'disassembly', ?, ?, stock_quantity - ?, 'Désassemblage de casiers')",
        )
        .bind(&component.component_type)
        .bind(component.component_profile_id)
        .bind(component.crate_type_id)
        .bind(recovered_quantity)
        .bind(sqlx::query_scalar::<_, i64>(
            "SELECT stock_quantity FROM packaging_component_stock
             WHERE component_type = ? AND component_profile_id IS NOT DISTINCT FROM ? AND crate_type_id IS NOT DISTINCT FROM ?",
        )
        .bind(&component.component_type)
        .bind(component.component_profile_id)
        .bind(component.crate_type_id)
        .fetch_one(&mut *tx)
        .await?)
        .bind(recovered_quantity)
        .execute(&mut *tx)
        .await?;

        if component.component_type == "crate_support" {
            support_quantity_recovered += recovered_quantity;
        } else if component.component_type == "bottle" {
            bottle_quantity_recovered += recovered_quantity;
        }
    }

    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO crate_disassembly_records (crate_type_id, disassembled_quantity, support_quantity_recovered, bottle_quantity_recovered, reason)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id",
    )
    .bind(input.crate_type_id)
    .bind(input.quantity)
    .bind(support_quantity_recovered)
    .bind(bottle_quantity_recovered)
    .bind(input.reason)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    let record = sqlx::query_as::<_, CrateDisassemblyRecordDto>(
        "SELECT cdr.id, cdr.crate_type_id, ct.name AS crate_name, cdr.disassembled_quantity,
                cdr.support_quantity_recovered, cdr.bottle_quantity_recovered, cdr.reason, cdr.created_at
         FROM crate_disassembly_records cdr
         JOIN crate_types ct ON ct.id = cdr.crate_type_id
         WHERE cdr.id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;

    Ok(record)
}
#[derive(Debug, Serialize, FromRow)]
pub struct ProductVariantDto {
    pub id: i64,
    pub product_id: i64,
    pub name: String,
    pub volume_ml: Option<i64>,
    pub container_type: String,
    pub bottle_profile_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub compatibility_group_id: Option<i64>,
    pub disposable_packaging_id: Option<i64>,
    pub barcode: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct BottleProfileDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub producer: String,
    pub material: String,
    pub capacity_ml: i64,
    pub diameter_mm: Option<i64>,
    pub height_mm: Option<i64>,
    pub weight_g: Option<i64>,
    pub base_type: Option<String>,
    pub neck_type: Option<String>,
    pub compatibility_group_id: Option<i64>,
    pub deposit_value: i64,
    pub description: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CrateTypeDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub producer: String,
    pub capacity: i64,
    pub bottle_capacity_ml: i64,
    pub bottle_profile_id: i64,
    pub compatibility_group_id: Option<i64>,
    pub dimensions: Option<String>,
    pub weight_g: Option<i64>,
    pub material: String,
    pub deposit_value: i64,
    pub description: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ContainerTypeDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub is_returnable: bool,
    pub description: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct DisposablePackagingTypeDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub packaging_type: String,
    pub units_per_pack: i64,
    pub unit_volume_ml: i64,
    pub material: String,
    pub is_returnable: bool,
    pub description: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: Option<String>,
}

pub async fn create_bottle_profile(
    db: &DepotDb,
    input: CreateBottleProfileInput,
) -> CoreResult<BottleProfileDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;

    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO bottle_profiles (code, name, producer, material, capacity_ml, diameter_mm, height_mm, weight_g, base_type, neck_type, compatibility_group_id, deposit_value, description, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id",
    )
    .bind(input.code)
    .bind(input.name)
    .bind(input.producer)
    .bind(input.material)
    .bind(input.capacity_ml)
    .bind(input.diameter_mm)
    .bind(input.height_mm)
    .bind(input.weight_g)
    .bind(input.base_type)
    .bind(input.neck_type)
    .bind(input.compatibility_group_id)
    .bind(input.deposit_value)
    .bind(input.description)
    .bind(if input.is_active { 1 } else { 0 })
    .fetch_one(&db.pool)
    .await?;

    let profile = sqlx::query_as::<_, BottleProfileDto>(
        "SELECT id, code, name, producer, material, capacity_ml, diameter_mm, height_mm, weight_g, base_type, neck_type, compatibility_group_id, deposit_value, description, is_active, created_at, updated_at
         FROM bottle_profiles WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;

    Ok(profile)
}

pub async fn get_bottle_profile(db: &DepotDb, profile_id: i64) -> CoreResult<BottleProfileDto> {
    require_current_actor_permission(Permission::CatalogRead)?;

    let profile = sqlx::query_as::<_, BottleProfileDto>(
        "SELECT id, code, name, producer, material, capacity_ml, diameter_mm, height_mm, weight_g, base_type, neck_type, compatibility_group_id, deposit_value, description, is_active, created_at, updated_at
         FROM bottle_profiles WHERE id = ?",
    )
    .bind(profile_id)
    .fetch_one(&db.pool)
    .await?;

    Ok(profile)
}

pub async fn get_bottle_profiles_by_material(
    db: &DepotDb,
    material: String,
) -> CoreResult<Vec<BottleProfileDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;

    let profiles = sqlx::query_as::<_, BottleProfileDto>(
        "SELECT id, code, name, producer, material, capacity_ml, diameter_mm, height_mm, weight_g, base_type, neck_type, compatibility_group_id, deposit_value, description, is_active, created_at, updated_at
         FROM bottle_profiles WHERE material = ?",
    )
    .bind(material)
    .fetch_all(&db.pool)
    .await?;

    Ok(profiles)
}

pub async fn update_bottle_profile(
    db: &DepotDb,
    profile_id: i64,
    input: UpdateBottleProfileInput,
) -> CoreResult<BottleProfileDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;

    let mut sql = "UPDATE bottle_profiles SET updated_at = datetime('now')".to_string();
    let mut params: Vec<(&str, String)> = Vec::new();

    if let Some(name) = input.name {
        sql.push_str(", name = ?");
        params.push(("name", name));
    }
    if let Some(material) = input.material {
        sql.push_str(", material = ?");
        params.push(("material", material));
    }
    if let Some(capacity_ml) = input.capacity_ml {
        sql.push_str(", capacity_ml = ?");
        params.push(("capacity_ml", capacity_ml.to_string()));
    }
    if let Some(diameter_mm) = input.diameter_mm {
        sql.push_str(", diameter_mm = ?");
        params.push(("diameter_mm", diameter_mm.to_string()));
    }
    if let Some(height_mm) = input.height_mm {
        sql.push_str(", height_mm = ?");
        params.push(("height_mm", height_mm.to_string()));
    }
    if let Some(weight_g) = input.weight_g {
        sql.push_str(", weight_g = ?");
        params.push(("weight_g", weight_g.to_string()));
    }
    if let Some(base_type) = input.base_type {
        sql.push_str(", base_type = ?");
        params.push(("base_type", base_type));
    }
    if let Some(neck_type) = input.neck_type {
        sql.push_str(", neck_type = ?");
        params.push(("neck_type", neck_type));
    }
    if let Some(deposit_value) = input.deposit_value {
        sql.push_str(", deposit_value = ?");
        params.push(("deposit_value", deposit_value.to_string()));
    }
    if let Some(description) = input.description {
        sql.push_str(", description = ?");
        params.push(("description", description));
    }
    if let Some(is_active) = input.is_active {
        sql.push_str(", is_active = ?");
        params.push((
            "is_active",
            if is_active {
                "1".to_string()
            } else {
                "0".to_string()
            },
        ));
    }

    sql.push_str(" WHERE id = ?");
    params.push(("profile_id", profile_id.to_string()));

    let mut update = sqlx::query(&sql);
    for (_, value) in &params {
        update = update.bind(value.as_str());
    }
    update.bind(profile_id).execute(&db.pool).await?;

    let profile = sqlx::query_as::<_, BottleProfileDto>(
        "SELECT id, code, name, producer, material, capacity_ml, diameter_mm, height_mm, weight_g, base_type, neck_type, compatibility_group_id, deposit_value, description, is_active, created_at, updated_at
         FROM bottle_profiles WHERE id = ?",
    )
    .bind(profile_id)
    .fetch_one(&db.pool)
    .await?;

    Ok(profile)
}

pub async fn delete_bottle_profile(db: &DepotDb, profile_id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;

    sqlx::query("DELETE FROM bottle_profiles WHERE id = ?")
        .bind(profile_id)
        .execute(&db.pool)
        .await?;

    Ok(())
}

pub async fn create_crate_type(
    db: &DepotDb,
    input: CreateCrateTypeInput,
) -> CoreResult<CrateTypeDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;

    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO crate_types (code, name, producer, capacity, bottle_capacity_ml, bottle_profile_id, compatibility_group_id, dimensions, weight_g, material, deposit_value, description, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id",
    )
    .bind(input.code)
    .bind(input.name)
    .bind(input.producer)
    .bind(input.capacity)
    .bind(input.bottle_capacity_ml)
    .bind(input.bottle_profile_id)
    .bind(input.compatibility_group_id)
    .bind(input.dimensions)
    .bind(input.weight_g)
    .bind(input.material)
    .bind(input.deposit_value)
    .bind(if input.is_active { 1 } else { 0 })
    .fetch_one(&db.pool)
    .await?;

    let crate_type = sqlx::query_as::<_, CrateTypeDto>(
        "SELECT id, code, name, producer, capacity, bottle_capacity_ml, bottle_profile_id, compatibility_group_id, dimensions, weight_g, material, deposit_value, description, is_active, created_at, updated_at
         FROM crate_types WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;

    Ok(crate_type)
}

pub async fn get_crate_type(db: &DepotDb, crate_type_id: i64) -> CoreResult<CrateTypeDto> {
    require_current_actor_permission(Permission::CatalogRead)?;

    let crate_type = sqlx::query_as::<_, CrateTypeDto>(
        "SELECT id, code, name, producer, capacity, bottle_capacity_ml, bottle_profile_id, compatibility_group_id, dimensions, weight_g, material, deposit_value, description, is_active, created_at, updated_at
         FROM crate_types WHERE id = ?",
    )
    .bind(crate_type_id)
    .fetch_one(&db.pool)
    .await?;

    Ok(crate_type)
}

pub async fn get_crate_types(db: &DepotDb, active_only: bool) -> CoreResult<Vec<CrateTypeDto>> {
    require_current_actor_permission(Permission::CatalogRead)?;

    let crate_types = if active_only {
        sqlx::query_as::<_, CrateTypeDto>(
            "SELECT id, code, name, producer, capacity, bottle_capacity_ml, bottle_profile_id, compatibility_group_id, dimensions, weight_g, material, deposit_value, description, is_active, created_at, updated_at
             FROM crate_types WHERE is_active = 1",
        )
        .fetch_all(&db.pool)
        .await?
    } else {
        sqlx::query_as::<_, CrateTypeDto>(
            "SELECT id, code, name, producer, capacity, bottle_capacity_ml, bottle_profile_id, compatibility_group_id, dimensions, weight_g, material, deposit_value, description, is_active, created_at, updated_at
             FROM crate_types",
        )
        .fetch_all(&db.pool)
        .await?
    };

    Ok(crate_types)
}

pub async fn update_crate_type(
    db: &DepotDb,
    crate_type_id: i64,
    input: UpdateCrateTypeInput,
) -> CoreResult<CrateTypeDto> {
    require_current_actor_permission(Permission::CatalogWrite)?;

    let mut sql = "UPDATE crate_types SET updated_at = datetime('now')".to_string();
    let mut params: Vec<(&str, String)> = Vec::new();

    if let Some(name) = input.name {
        sql.push_str(", name = ?");
        params.push(("name", name));
    }
    if let Some(capacity) = input.capacity {
        sql.push_str(", capacity = ?");
        params.push(("capacity", capacity.to_string()));
    }
    if let Some(bottle_capacity_ml) = input.bottle_capacity_ml {
        sql.push_str(", bottle_capacity_ml = ?");
        params.push(("bottle_capacity_ml", bottle_capacity_ml.to_string()));
    }
    if let Some(compatibility_group_id) = input.compatibility_group_id {
        sql.push_str(", compatibility_group_id = ?");
        params.push(("compatibility_group_id", compatibility_group_id.to_string()));
    }
    if let Some(dimensions) = input.dimensions {
        sql.push_str(", dimensions = ?");
        params.push(("dimensions", dimensions));
    }
    if let Some(weight_g) = input.weight_g {
        sql.push_str(", weight_g = ?");
        params.push(("weight_g", weight_g.to_string()));
    }
    if let Some(material) = input.material {
        sql.push_str(", material = ?");
        params.push(("material", material));
    }
    if let Some(deposit_value) = input.deposit_value {
        sql.push_str(", deposit_value = ?");
        params.push(("deposit_value", deposit_value.to_string()));
    }
    if let Some(description) = input.description {
        sql.push_str(", description = ?");
        params.push(("description", description));
    }
    if let Some(is_active) = input.is_active {
        sql.push_str(", is_active = ?");
        params.push((
            "is_active",
            if is_active {
                "1".to_string()
            } else {
                "0".to_string()
            },
        ));
    }

    sql.push_str(" WHERE id = ?");
    params.push(("crate_type_id", crate_type_id.to_string()));

    let mut update = sqlx::query(&sql);
    for (_, value) in &params {
        update = update.bind(value.as_str());
    }
    update.bind(crate_type_id).execute(&db.pool).await?;

    let crate_type = sqlx::query_as::<_, CrateTypeDto>(
        "SELECT id, code, name, producer, capacity, bottle_capacity_ml, bottle_profile_id, compatibility_group_id, dimensions, weight_g, material, deposit_value, description, is_active, created_at, updated_at
         FROM crate_types WHERE id = ?",
    )
    .bind(crate_type_id)
    .fetch_one(&db.pool)
    .await?;

    Ok(crate_type)
}

pub async fn delete_crate_type(db: &DepotDb, crate_type_id: i64) -> CoreResult<()> {
    require_current_actor_permission(Permission::CatalogWrite)?;

    sqlx::query("DELETE FROM crate_types WHERE id = ?")
        .bind(crate_type_id)
        .execute(&db.pool)
        .await?;

    Ok(())
}
