// ============================================================================
// DTOs de requêtes HTTP et paramètres de requête Axum
// ============================================================================

use serde::Deserialize;

use depotpro_core::application::{catalogue, inventory, products};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PinPayload {
    pub(crate) pin: String,
    pub(crate) username: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChangePinPayload {
    pub(crate) current_pin: String,
    pub(crate) new_pin: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ToggleUserStatusPayload {
    pub(crate) active: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EncryptedBackupPayload {
    pub(crate) passphrase: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImportBackupPayload {
    pub(crate) filename: String,
    pub(crate) bytes: Vec<u8>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SearchQuery {
    pub(crate) search: Option<String>,
    pub(crate) status: Option<String>,
    pub(crate) from: Option<String>,
    pub(crate) to: Option<String>,
    pub(crate) category_id: Option<i64>,
    pub(crate) include_archived: Option<bool>,
    pub(crate) low_stock_only: Option<bool>,
    pub(crate) page: Option<i64>,
    pub(crate) page_size: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct PackagingObligationsQuery {
    pub(crate) client_id: Option<i64>,
}

impl From<SearchQuery> for catalogue::PaginatedQuery {
    fn from(q: SearchQuery) -> Self {
        catalogue::PaginatedQuery {
            page: q.page.unwrap_or(1).max(1),
            page_size: q.page_size.unwrap_or(50).clamp(1, 200),
            search: q.search,
            include_archived: q.include_archived,
        }
    }
}

#[derive(Deserialize)]
pub(crate) struct ReportQuery {
    pub(crate) from: Option<String>,
    pub(crate) to: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct CategoryPayload {
    pub(crate) name: String,
    pub(crate) parent_id: Option<i64>,
    pub(crate) description: Option<String>,
    pub(crate) is_active: Option<bool>,
}

#[derive(Deserialize)]
pub(crate) struct ProductQueryFilter {
    pub(crate) product_id: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct CreateProductV4Payload {
    #[serde(flatten)]
    pub(crate) base: products::CreateProductInput,
    #[serde(flatten)]
    pub(crate) extras: products::ProductV4CreateExtras,
}

#[derive(Deserialize)]
pub(crate) struct UpdateProductV4Payload {
    #[serde(flatten)]
    pub(crate) base: products::UpdateProductInput,
    #[serde(flatten)]
    pub(crate) extras: products::ProductV4UpdateExtras,
}

#[derive(Deserialize)]
pub(crate) struct PackagingV4Payload {
    #[serde(flatten)]
    pub(crate) base: products::PackagingInput,
    #[serde(flatten)]
    pub(crate) extras: products::PackagingV4Extras,
}

#[derive(Deserialize)]
pub(crate) struct CsvImportPayload {
    pub(crate) csv: String,
}

#[derive(Deserialize)]
pub(crate) struct CreateInventoryPayload {
    pub(crate) notes: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct ValidateInventoryPayload {
    pub(crate) lines: Vec<inventory::ValidateInventoryLineInput>,
}

#[derive(Deserialize)]
pub(crate) struct AddPaymentMethodPayload {
    pub(crate) label: String,
}

#[derive(Deserialize)]
pub(crate) struct TogglePaymentMethodPayload {
    pub(crate) active: bool,
}
