// ============================================================================
// Moteur de validation de compatibilité des paniers POS
// ============================================================================

use std::collections::{HashMap, HashSet};

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::error::CoreResult;
use crate::infrastructure::db::DepotDb;

use super::rules_and_config::{get_compatibility_rules, get_pos_validation_config};
use super::{SaleLineItem, ValidateSaleInput, ValidationIssue, ValidationResultDto};

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

fn group_by_crate_type(line_items: &[SaleLineItem]) -> HashMap<i64, Vec<SaleLineItem>> {
    let mut groups: HashMap<i64, Vec<SaleLineItem>> = HashMap::new();
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
) -> CoreResult<HashMap<String, Vec<SaleLineItem>>> {
    let mut groups: HashMap<String, Vec<SaleLineItem>> = HashMap::new();
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
) -> CoreResult<HashMap<String, Vec<SaleLineItem>>> {
    let mut groups: HashMap<String, Vec<SaleLineItem>> = HashMap::new();
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
    let mut brands = HashSet::new();
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
    let mut families = HashSet::new();
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
