// ============================================================================
// Modèle RBAC : rôles, permissions granulaires et identité de session
// ============================================================================

use crate::error::{CoreError, CoreResult};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Owner,
    Admin,
    Manager,
    Cashier,
    StockManager,
    Accountant,
}

impl Role {
    pub fn as_str(self) -> &'static str {
        match self {
            Role::Owner => "owner",
            Role::Admin => "admin",
            Role::Manager => "manager",
            Role::Cashier => "cashier",
            Role::StockManager => "stock_manager",
            Role::Accountant => "accountant",
        }
    }

    pub fn label_fr(self) -> &'static str {
        match self {
            Role::Owner => "Propriétaire",
            Role::Admin => "Administrateur",
            Role::Manager => "Responsable",
            Role::Cashier => "Caissier",
            Role::StockManager => "Gestionnaire de stock",
            Role::Accountant => "Comptable",
        }
    }

    pub fn from_db_str(raw: &str) -> CoreResult<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "owner" => Ok(Role::Owner),
            "admin" => Ok(Role::Admin),
            "manager" => Ok(Role::Manager),
            "cashier" => Ok(Role::Cashier),
            "stock_manager" => Ok(Role::StockManager),
            "accountant" => Ok(Role::Accountant),
            other => Err(CoreError::Validation(format!("Rôle inconnu : {other}"))),
        }
    }

    pub fn permissions(self) -> &'static [Permission] {
        match self {
            Role::Owner => Permission::ALL,
            Role::Admin => &[
                Permission::CatalogRead,
                Permission::CatalogWrite,
                Permission::SalesRead,
                Permission::SalesWrite,
                Permission::SalesCancelReturn,
                Permission::ReceivablesRead,
                Permission::ReceivablesPay,
                Permission::PurchasesRead,
                Permission::PurchasesWrite,
                Permission::SupplierDebtsPay,
                Permission::StockRead,
                Permission::StockAdjust,
                Permission::InventoryValidate,
                Permission::ConsignmentsRead,
                Permission::ConsignmentsWrite,
                Permission::CashRead,
                Permission::CashOperate,
                Permission::ExpensesWrite,
                Permission::ReportsRead,
                Permission::SettingsRead,
                Permission::SettingsWrite,
                Permission::BackupsRead,
                Permission::BackupsCreate,
                Permission::BackupsRestore,
                Permission::SecurityManageUsers,
            ],
            Role::Manager => &[
                Permission::CatalogRead,
                Permission::CatalogWrite,
                Permission::SalesRead,
                Permission::SalesWrite,
                Permission::SalesCancelReturn,
                Permission::ReceivablesRead,
                Permission::ReceivablesPay,
                Permission::PurchasesRead,
                Permission::PurchasesWrite,
                Permission::SupplierDebtsPay,
                Permission::StockRead,
                Permission::StockAdjust,
                Permission::InventoryValidate,
                Permission::ConsignmentsRead,
                Permission::ConsignmentsWrite,
                Permission::CashRead,
                Permission::CashOperate,
                Permission::ExpensesWrite,
                Permission::ReportsRead,
                Permission::SettingsRead,
                Permission::BackupsRead,
                Permission::BackupsCreate,
            ],
            Role::Cashier => &[
                Permission::CatalogRead,
                Permission::SalesRead,
                Permission::SalesWrite,
                Permission::SalesCancelReturn,
                Permission::ReceivablesRead,
                Permission::ReceivablesPay,
                Permission::ConsignmentsRead,
                Permission::ConsignmentsWrite,
                Permission::CashRead,
                Permission::CashOperate,
                Permission::ExpensesWrite,
                Permission::SettingsRead,
            ],
            Role::StockManager => &[
                Permission::CatalogRead,
                Permission::CatalogWrite,
                Permission::PurchasesRead,
                Permission::PurchasesWrite,
                Permission::StockRead,
                Permission::StockAdjust,
                Permission::InventoryValidate,
                Permission::ConsignmentsRead,
                Permission::ConsignmentsWrite,
                Permission::SettingsRead,
            ],
            Role::Accountant => &[
                Permission::CatalogRead,
                Permission::SalesRead,
                Permission::ReceivablesRead,
                Permission::PurchasesRead,
                Permission::StockRead,
                Permission::ConsignmentsRead,
                Permission::CashRead,
                Permission::ReportsRead,
                Permission::SettingsRead,
                Permission::BackupsRead,
            ],
        }
    }

    pub fn has_permission(self, permission: Permission) -> bool {
        self.permissions().contains(&permission)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Permission {
    CatalogRead,
    CatalogWrite,
    CatalogDelete,
    SalesRead,
    SalesWrite,
    SalesCancelReturn,
    ReceivablesRead,
    ReceivablesPay,
    PurchasesRead,
    PurchasesWrite,
    SupplierDebtsPay,
    StockRead,
    StockAdjust,
    InventoryValidate,
    ConsignmentsRead,
    ConsignmentsWrite,
    CashRead,
    CashOperate,
    ExpensesWrite,
    ReportsRead,
    SettingsRead,
    SettingsWrite,
    BackupsRead,
    BackupsCreate,
    BackupsRestore,
    SecurityManageUsers,
    SecurityChangeOwnerPin,
}

impl Permission {
    pub const ALL: &'static [Permission] = &[
        Permission::CatalogRead,
        Permission::CatalogWrite,
        Permission::CatalogDelete,
        Permission::SalesRead,
        Permission::SalesWrite,
        Permission::SalesCancelReturn,
        Permission::ReceivablesRead,
        Permission::ReceivablesPay,
        Permission::PurchasesRead,
        Permission::PurchasesWrite,
        Permission::SupplierDebtsPay,
        Permission::StockRead,
        Permission::StockAdjust,
        Permission::InventoryValidate,
        Permission::ConsignmentsRead,
        Permission::ConsignmentsWrite,
        Permission::CashRead,
        Permission::CashOperate,
        Permission::ExpensesWrite,
        Permission::ReportsRead,
        Permission::SettingsRead,
        Permission::SettingsWrite,
        Permission::BackupsRead,
        Permission::BackupsCreate,
        Permission::BackupsRestore,
        Permission::SecurityManageUsers,
        Permission::SecurityChangeOwnerPin,
    ];

    pub fn code(self) -> &'static str {
        match self {
            Permission::CatalogRead => "catalog:read",
            Permission::CatalogWrite => "catalog:write",
            Permission::CatalogDelete => "catalog:delete",
            Permission::SalesRead => "sales:read",
            Permission::SalesWrite => "sales:write",
            Permission::SalesCancelReturn => "sales:cancel_return",
            Permission::ReceivablesRead => "receivables:read",
            Permission::ReceivablesPay => "receivables:pay",
            Permission::PurchasesRead => "purchases:read",
            Permission::PurchasesWrite => "purchases:write",
            Permission::SupplierDebtsPay => "supplier_debts:pay",
            Permission::StockRead => "stock:read",
            Permission::StockAdjust => "stock:adjust",
            Permission::InventoryValidate => "inventory:validate",
            Permission::ConsignmentsRead => "consignments:read",
            Permission::ConsignmentsWrite => "consignments:write",
            Permission::CashRead => "cash:read",
            Permission::CashOperate => "cash:operate",
            Permission::ExpensesWrite => "expenses:write",
            Permission::ReportsRead => "reports:read",
            Permission::SettingsRead => "settings:read",
            Permission::SettingsWrite => "settings:write",
            Permission::BackupsRead => "backups:read",
            Permission::BackupsCreate => "backups:create",
            Permission::BackupsRestore => "backups:restore",
            Permission::SecurityManageUsers => "security:manage_users",
            Permission::SecurityChangeOwnerPin => "security:change_owner_pin",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionIdentity {
    pub user_id: String,
    pub username: String,
    pub display_name: String,
    pub role: Role,
    pub role_label: String,
    pub permissions: Vec<String>,
}

impl SessionIdentity {
    pub fn from_role(
        user_id: impl Into<String>,
        username: impl Into<String>,
        display_name: impl Into<String>,
        role: Role,
    ) -> Self {
        let permissions = role
            .permissions()
            .iter()
            .map(|p| p.code().to_string())
            .collect();
        Self {
            user_id: user_id.into(),
            username: username.into(),
            display_name: display_name.into(),
            role,
            role_label: role.label_fr().to_string(),
            permissions,
        }
    }

    pub fn owner() -> Self {
        Self::from_role("owner", "owner", "Propriétaire", Role::Owner)
    }

    pub fn has_permission(&self, permission: Permission) -> bool {
        self.role.has_permission(permission)
    }
}
