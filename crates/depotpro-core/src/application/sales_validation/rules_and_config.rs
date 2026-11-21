// ============================================================================
// CRUD des règles de compatibilité & configuration terminal POS
// ============================================================================

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::CoreResult;
use crate::infrastructure::db::DepotDb;

use super::{
    CompatibilityRuleDto, CreateCompatibilityRuleInput, PosValidationConfigDto,
    UpdatePosConfigInput,
};

pub async fn get_compatibility_rules(db: &DepotDb) -> CoreResult<Vec<CompatibilityRuleDto>> {
    require_current_actor_permission(Permission::SalesRead)?;

    let rules = sqlx::query_as::<_, CompatibilityRuleDto>(
        "SELECT id, rule_type, product_id, variant_id, crate_type_id, required_quantity,
                validation_level, error_message, is_active
         FROM product_compatibility_rules
         WHERE is_active = 1
         ORDER BY rule_type",
    )
    .fetch_all(&db.pool)
    .await?;

    Ok(rules)
}

pub async fn get_pos_validation_config(
    db: &DepotDb,
    terminal_id: &str,
) -> CoreResult<PosValidationConfigDto> {
    require_current_actor_permission(Permission::SalesRead)?;

    let config = sqlx::query_as::<_, PosValidationConfigDto>(
        "SELECT id, terminal_id, compatibility_validation_level, partial_return_enabled,
                auto_assemble_crates, require_condition_for_returns
         FROM pos_validation_config
         WHERE terminal_id = ?",
    )
    .bind(terminal_id)
    .fetch_optional(&db.pool)
    .await?;

    if let Some(cfg) = config {
        Ok(cfg)
    } else {
        let id = sqlx::query_scalar::<_, i64>(
            "INSERT INTO pos_validation_config (terminal_id) VALUES (?) RETURNING id",
        )
        .bind(terminal_id)
        .fetch_one(&db.pool)
        .await?;

        let new_config = sqlx::query_as::<_, PosValidationConfigDto>(
            "SELECT id, terminal_id, compatibility_validation_level, partial_return_enabled,
                    auto_assemble_crates, require_condition_for_returns
             FROM pos_validation_config
             WHERE id = ?",
        )
        .bind(id)
        .fetch_one(&db.pool)
        .await?;

        Ok(new_config)
    }
}

pub async fn create_compatibility_rule(
    db: &DepotDb,
    input: CreateCompatibilityRuleInput,
) -> CoreResult<CompatibilityRuleDto> {
    require_current_actor_permission(Permission::SettingsWrite)?;

    let id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO product_compatibility_rules (rule_type, product_id, variant_id, crate_type_id,
                                                    required_quantity, validation_level, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING id",
    )
    .bind(input.rule_type)
    .bind(input.product_id)
    .bind(input.variant_id)
    .bind(input.crate_type_id)
    .bind(input.required_quantity)
    .bind(input.validation_level)
    .bind(input.error_message)
    .fetch_one(&db.pool)
    .await?;

    let rule = sqlx::query_as::<_, CompatibilityRuleDto>(
        "SELECT id, rule_type, product_id, variant_id, crate_type_id, required_quantity,
                validation_level, error_message, is_active
         FROM product_compatibility_rules WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&db.pool)
    .await?;

    Ok(rule)
}

pub async fn update_pos_validation_config(
    db: &DepotDb,
    input: UpdatePosConfigInput,
) -> CoreResult<PosValidationConfigDto> {
    require_current_actor_permission(Permission::SettingsWrite)?;

    sqlx::query(
        "INSERT INTO pos_validation_config (terminal_id, compatibility_validation_level, partial_return_enabled,
                                            auto_assemble_crates, require_condition_for_returns)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(terminal_id) DO UPDATE SET
             compatibility_validation_level = excluded.compatibility_validation_level,
             partial_return_enabled = excluded.partial_return_enabled,
             auto_assemble_crates = excluded.auto_assemble_crates,
             require_condition_for_returns = excluded.require_condition_for_returns,
             updated_at = datetime('now')",
    )
    .bind(&input.terminal_id)
    .bind(input.compatibility_validation_level)
    .bind(input.partial_return_enabled)
    .bind(input.auto_assemble_crates)
    .bind(input.require_condition_for_returns)
    .execute(&db.pool)
    .await?;

    let config = get_pos_validation_config(db, &input.terminal_id).await?;
    Ok(config)
}
