// ============================================================================
// Catalogue SQL des migrations embarquées (0001..0017)
// ============================================================================

pub const V3_SCHEMA_SQL: &str =
    include_str!("../../../../../migrations/sqlite/0001_initial_v3.sql");
pub const V3_MIGRATION_0002_SQL: &str =
    include_str!("../../../../../migrations/sqlite/0002_app_settings_logo_path.sql");
pub const V3_MIGRATION_0003_SQL: &str =
    include_str!("../../../../../migrations/sqlite/0003_expense_receipt_path.sql");
pub const V3_MIGRATION_0004_SQL: &str =
    include_str!("../../../../../migrations/sqlite/0004_onboarding_setup_state.sql");
pub const V3_MIGRATION_0005_SQL: &str =
    include_str!("../../../../../migrations/sqlite/0005_security_roles_users.sql");
pub const V3_MIGRATION_0006_SQL: &str =
    include_str!("../../../../../migrations/sqlite/0006_catalogue_v3.sql");
pub const V3_MIGRATION_0007_SQL: &str =
    include_str!("../../../../../migrations/sqlite/0007_inactivity_timeout.sql");
pub const V3_MIGRATION_0008_SQL: &str = include_str!(
    "../../../../../migrations/sqlite/0008_compatibility_validation_partial_returns_catalogue.sql"
);
pub const V3_MIGRATION_0010_SQL: &str =
    include_str!("../../../../../migrations/sqlite/0010_crate_compatibility.sql");
pub const V3_MIGRATION_0009_SQL: &str =
    include_str!("../../../../../migrations/sqlite/0009_support_tracking.sql");
pub const V3_MIGRATION_0011_SQL: &str =
    include_str!("../../../../../migrations/sqlite/0007_packaging_components.sql");
pub const V3_MIGRATION_0012_SQL: &str =
    include_str!("../../../../../migrations/sqlite/0012_catalogue_products.sql");
pub const V3_MIGRATION_0013_SQL: &str =
    include_str!("../../../../../migrations/sqlite/0013_pending_returns_pieces.sql");
pub const V3_MIGRATION_0014_SQL: &str =
    include_str!("../../../../../migrations/sqlite/0014_supplier_packaging_exchange.sql");
pub const V3_MIGRATION_0015_SQL: &str =
    include_str!("../../../../../migrations/sqlite/0015_packaging_obligations_conversions.sql");
pub const V3_MIGRATION_0016_SQL: &str =
    include_str!("../../../../../migrations/sqlite/0016_solibra_reference_catalogue.sql");
pub const V3_MIGRATION_0017_SQL: &str =
    include_str!("../../../../../migrations/sqlite/0017_catalogue_reference_price_history.sql");
pub const V3_MIGRATION_0018_SQL: &str =
    include_str!("../../../../../migrations/sqlite/0018_bdboisson_catalog_v4.sql");
pub const V3_MIGRATION_0019_SQL: &str =
    include_str!("../../../../../migrations/sqlite/0019_orders_and_packaging.sql");
pub const V3_MIGRATION_0020_SQL: &str =
    include_str!("../../../../../migrations/sqlite/0020_document_archive.sql");

#[derive(Debug, Clone, Copy)]
pub struct MigrationDef {
    pub version: i64,
    pub name: &'static str,
    pub sql: &'static str,
}

pub const MIGRATIONS: &[MigrationDef] = &[
    MigrationDef {
        version: 1,
        name: "0001_initial_v3",
        sql: V3_SCHEMA_SQL,
    },
    MigrationDef {
        version: 2,
        name: "0002_app_settings_logo_path",
        sql: V3_MIGRATION_0002_SQL,
    },
    MigrationDef {
        version: 3,
        name: "0003_expense_receipt_path",
        sql: V3_MIGRATION_0003_SQL,
    },
    MigrationDef {
        version: 4,
        name: "0004_onboarding_setup_state",
        sql: V3_MIGRATION_0004_SQL,
    },
    MigrationDef {
        version: 5,
        name: "0005_security_roles_users",
        sql: V3_MIGRATION_0005_SQL,
    },
    MigrationDef {
        version: 6,
        name: "0006_catalogue_v3",
        sql: V3_MIGRATION_0006_SQL,
    },
    MigrationDef {
        version: 7,
        name: "0007_inactivity_timeout",
        sql: V3_MIGRATION_0007_SQL,
    },
    MigrationDef {
        version: 8,
        name: "0008_compatibility_validation_partial_returns_catalogue",
        sql: V3_MIGRATION_0008_SQL,
    },
    MigrationDef {
        version: 9,
        name: "0009_support_tracking",
        sql: V3_MIGRATION_0009_SQL,
    },
    MigrationDef {
        version: 10,
        name: "0010_crate_compatibility",
        sql: V3_MIGRATION_0010_SQL,
    },
    MigrationDef {
        version: 11,
        name: "0011_packaging_components",
        sql: V3_MIGRATION_0011_SQL,
    },
    MigrationDef {
        version: 12,
        name: "0012_catalogue_products",
        sql: V3_MIGRATION_0012_SQL,
    },
    MigrationDef {
        version: 13,
        name: "0013_pending_returns_pieces",
        sql: V3_MIGRATION_0013_SQL,
    },
    MigrationDef {
        version: 14,
        name: "0014_supplier_packaging_exchange",
        sql: V3_MIGRATION_0014_SQL,
    },
    MigrationDef {
        version: 15,
        name: "0015_packaging_obligations_conversions",
        sql: V3_MIGRATION_0015_SQL,
    },
    MigrationDef {
        version: 16,
        name: "0016_solibra_reference_catalogue",
        sql: V3_MIGRATION_0016_SQL,
    },
    MigrationDef {
        version: 17,
        name: "0017_catalogue_reference_price_history",
        sql: V3_MIGRATION_0017_SQL,
    },
    MigrationDef {
        version: 18,
        name: "0018_bdboisson_catalog_v4",
        sql: V3_MIGRATION_0018_SQL,
    },
    MigrationDef {
        version: 19,
        name: "0019_orders_and_packaging",
        sql: V3_MIGRATION_0019_SQL,
    },
    MigrationDef {
        version: 20,
        name: "0020_document_archive",
        sql: V3_MIGRATION_0020_SQL,
    },
];

pub const MIN_SUPPORTED_SCHEMA_VERSION: i64 = 1;
pub const CURRENT_SCHEMA_VERSION: i64 = 20;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MigrationRunReport {
    pub applied_versions: Vec<i64>,
    pub latest_version: i64,
    pub skipped_legacy_columns_for: Vec<i64>,
}
