use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::CoreResult;
use crate::infrastructure::db::DepotDb;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT")]
pub enum RuleType {
    #[serde(rename = "same_crate")]
    SameCrate,
    #[serde(rename = "same_brand")]
    SameBrand,
    #[serde(rename = "same_family")]
    SameFamily,
    #[serde(rename = "excluded")]
    Excluded,
    #[serde(rename = "required")]
    Required,
}

impl std::fmt::Display for RuleType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RuleType::SameCrate => f.write_str("same_crate"),
            RuleType::SameBrand => f.write_str("same_brand"),
            RuleType::SameFamily => f.write_str("same_family"),
            RuleType::Excluded => f.write_str("excluded"),
            RuleType::Required => f.write_str("required"),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT")]
pub enum ValidationLevel {
    #[serde(rename = "strict")]
    Strict,
    #[serde(rename = "warning")]
    Warning,
    #[serde(rename = "disabled")]
    Disabled,
}

impl std::fmt::Display for ValidationLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ValidationLevel::Strict => f.write_str("strict"),
            ValidationLevel::Warning => f.write_str("warning"),
            ValidationLevel::Disabled => f.write_str("disabled"),
        }
    }
}

#[derive(Debug, Serialize, FromRow)]
pub struct CompatibilityRuleDto {
    pub id: i64,
    pub rule_type: String,
    pub product_id: Option<i64>,
    pub variant_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub required_quantity: i64,
    pub validation_level: String,
    pub error_message: Option<String>,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ValidationIssue {
    pub rule_type: String,
    pub severity: String,
    pub message: String,
    pub affected_lines: Vec<i64>,
}

#[derive(Debug, Serialize)]
pub struct ValidationResultDto {
    pub is_valid: bool,
    pub can_proceed: bool,
    pub issues: Vec<ValidationIssue>,
    pub warnings: Vec<ValidationIssue>,
    pub errors: Vec<ValidationIssue>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PosValidationConfigDto {
    pub id: i64,
    pub terminal_id: String,
    pub compatibility_validation_level: String,
    pub partial_return_enabled: bool,
    pub auto_assemble_crates: bool,
    pub require_condition_for_returns: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SaleLineItem {
    pub product_id: i64,
    pub variant_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub quantity: i64,
    pub support_quantity: i64,
    pub unit_price: i64,
    pub line_index: i64,
}

#[derive(Debug, Deserialize)]
pub struct ValidateSaleInput {
    pub terminal_id: String,
    pub line_items: Vec<SaleLineItem>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCompatibilityRuleInput {
    pub rule_type: String,
    pub product_id: Option<i64>,
    pub variant_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub required_quantity: i64,
    pub validation_level: String,
    pub error_message: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePosConfigInput {
    pub terminal_id: String,
    pub compatibility_validation_level: String,
    pub partial_return_enabled: bool,
    pub auto_assemble_crates: bool,
    pub require_condition_for_returns: bool,
}

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

pub async fn validate_sale_compatibility(
    db: &DepotDb,
    input: ValidateSaleInput,
) -> CoreResult<ValidationResultDto> {
    require_current_actor_permission(Permission::SalesRead)?;

    let config = get_pos_validation_config(db, &input.terminal_id).await?;
    let rules = get_compatibility_rules(db).await?;

    let issues = Vec::new();
    let mut warnings = Vec::new();
    let mut errors = Vec::new();

    for rule in rules {
        if !rule.is_active {
            continue;
        }

        match rule.rule_type.as_str() {
            "same_crate" => {
                let crate_groups = group_by_crate_type(&input.line_items);
                for (_crate_type, items) in crate_groups {
                    let total_bottles: i64 = items.iter().map(|item| item.quantity).sum();
                    let total_supports: i64 = items.iter().map(|item| item.support_quantity).sum();
                    let bottles_valid = total_bottles % rule.required_quantity == 0;
                    let supports_valid = total_supports % rule.required_quantity == 0;
                    let severity = match config.compatibility_validation_level.as_str() {
                        "strict" => {
                            if !bottles_valid || !supports_valid {
                                "error"
                            } else {
                                "info"
                            }
                        }
                        "warning" => {
                            if !bottles_valid && !supports_valid {
                                "error"
                            } else if !bottles_valid || !supports_valid {
                                "warning"
                            } else {
                                "info"
                            }
                        }
                        _ => "info",
                    };
                    if severity == "error" || severity == "warning" {
                        let affected_lines: Vec<i64> =
                            items.iter().map(|item| item.line_index).collect();
                        let message = if !bottles_valid && !supports_valid {
                            format!("Le nombre de bouteilles ({}) et de supports ({}) ne correspondent pas à la capacité du casier ({})", total_bottles, total_supports, rule.required_quantity)
                        } else if !bottles_valid {
                            format!("Le nombre de bouteilles ({}) ne correspond pas à la capacité du casier ({})", total_bottles, rule.required_quantity)
                        } else {
                            format!("Le nombre de supports ({}) ne correspond pas à la capacité du casier ({})", total_supports, rule.required_quantity)
                        };
                        let issue = ValidationIssue {
                            rule_type: rule.rule_type.clone(),
                            severity: severity.to_string(),
                            message,
                            affected_lines,
                        };
                        if severity == "error" {
                            errors.push(issue);
                        } else {
                            warnings.push(issue);
                        }
                    }
                }
            }
            "same_brand" => {
                let brand_groups = group_by_brand(&input.line_items, db).await?;
                for (brand, items) in brand_groups {
                    if items.len() > 1 && has_multiple_brands(&items, db).await? {
                        let severity = match config.compatibility_validation_level.as_str() {
                            "strict" => "error",
                            "warning" => "warning",
                            _ => "info",
                        };
                        let affected_lines: Vec<i64> =
                            items.iter().map(|item| item.line_index).collect();
                        let issue = ValidationIssue {
                            rule_type: rule.rule_type.clone(),
                            severity: severity.to_string(),
                            message: rule.error_message.clone().unwrap_or_else(|| {
                                format!("Mélange de marques dans le même casier: {}", brand)
                            }),
                            affected_lines,
                        };
                        if severity == "error" {
                            errors.push(issue);
                        } else {
                            warnings.push(issue);
                        }
                    }
                }
            }
            "same_family" => {
                let family_groups = group_by_family(&input.line_items, db).await?;
                for (family, items) in family_groups {
                    if items.len() > 1 && has_multiple_families(&items, db).await? {
                        let severity = match config.compatibility_validation_level.as_str() {
                            "strict" => "error",
                            "warning" => "warning",
                            _ => "info",
                        };
                        let affected_lines: Vec<i64> =
                            items.iter().map(|item| item.line_index).collect();
                        let issue = ValidationIssue {
                            rule_type: rule.rule_type.clone(),
                            severity: severity.to_string(),
                            message: rule.error_message.clone().unwrap_or_else(|| {
                                format!(
                                    "Mélange de familles de produits dans le même casier: {}",
                                    family
                                )
                            }),
                            affected_lines,
                        };
                        if severity == "error" {
                            errors.push(issue);
                        } else {
                            warnings.push(issue);
                        }
                    }
                }
            }
            _ => {}
        }
    }

    let can_proceed = errors.is_empty() || config.compatibility_validation_level != "strict";

    Ok(ValidationResultDto {
        is_valid: errors.is_empty(),
        can_proceed,
        issues: issues
            .into_iter()
            .chain(warnings.clone())
            .chain(errors.clone())
            .collect(),
        warnings,
        errors,
    })
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

fn group_by_crate_type(
    line_items: &[SaleLineItem],
) -> std::collections::HashMap<i64, Vec<SaleLineItem>> {
    let mut groups: std::collections::HashMap<i64, Vec<SaleLineItem>> =
        std::collections::HashMap::new();
    for item in line_items {
        if let Some(crate_type_id) = item.crate_type_id {
            groups.entry(crate_type_id).or_default().push(item.clone());
        }
    }
    groups
}

async fn group_by_brand(
    line_items: &[SaleLineItem],
    db: &DepotDb,
) -> CoreResult<std::collections::HashMap<String, Vec<SaleLineItem>>> {
    let mut groups: std::collections::HashMap<String, Vec<SaleLineItem>> =
        std::collections::HashMap::new();
    for item in line_items {
        let brand = sqlx::query_scalar::<_, String>(
            "SELECT b.name FROM brands b
             JOIN products p ON p.brand_id = b.id
             WHERE p.id = ?",
        )
        .bind(item.product_id)
        .fetch_optional(&db.pool)
        .await?
        .unwrap_or_else(|| "unknown".to_string());
        groups.entry(brand).or_default().push(item.clone());
    }
    Ok(groups)
}

async fn group_by_family(
    line_items: &[SaleLineItem],
    db: &DepotDb,
) -> CoreResult<std::collections::HashMap<String, Vec<SaleLineItem>>> {
    let mut groups: std::collections::HashMap<String, Vec<SaleLineItem>> =
        std::collections::HashMap::new();
    for item in line_items {
        let family = sqlx::query_scalar::<_, String>(
            "SELECT pf.name FROM product_families pf
             JOIN products p ON p.family_id = pf.id
             WHERE p.id = ?",
        )
        .bind(item.product_id)
        .fetch_optional(&db.pool)
        .await?
        .unwrap_or_else(|| "unknown".to_string());
        groups.entry(family).or_default().push(item.clone());
    }
    Ok(groups)
}

async fn has_multiple_brands(items: &[SaleLineItem], db: &DepotDb) -> CoreResult<bool> {
    let mut brands = std::collections::HashSet::new();
    for item in items {
        let brand = sqlx::query_scalar::<_, String>(
            "SELECT b.code FROM brands b
             JOIN products p ON p.brand_id = b.id
             WHERE p.id = ?",
        )
        .bind(item.product_id)
        .fetch_optional(&db.pool)
        .await?
        .unwrap_or_else(|| "unknown".to_string());
        brands.insert(brand);
    }
    Ok(brands.len() > 1)
}

async fn has_multiple_families(items: &[SaleLineItem], db: &DepotDb) -> CoreResult<bool> {
    let mut families = std::collections::HashSet::new();
    for item in items {
        let family = sqlx::query_scalar::<_, String>(
            "SELECT pf.code FROM product_families pf
             JOIN products p ON p.family_id = pf.id
             WHERE p.id = ?",
        )
        .bind(item.product_id)
        .fetch_optional(&db.pool)
        .await?
        .unwrap_or_else(|| "unknown".to_string());
        families.insert(family);
    }
    Ok(families.len() > 1)
}
