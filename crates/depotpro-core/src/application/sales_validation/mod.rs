// ============================================================================
// Validation POS et règles de compatibilité : types, DTOs & sous-modules
// ============================================================================

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

mod rules_and_config;
mod validator;

pub use rules_and_config::{
    create_compatibility_rule, get_compatibility_rules, get_pos_validation_config,
    update_pos_validation_config,
};
pub use validator::validate_sale_compatibility;

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
