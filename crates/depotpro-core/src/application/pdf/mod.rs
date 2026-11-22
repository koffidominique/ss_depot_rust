// ============================================================================
// Génération de documents PDF multipages sans dépendance externe
// ============================================================================

use serde::Deserialize;

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::reports::get_settings;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

mod encoding_and_layout;
mod header_section;
mod primitives;
mod renderer;
mod summary_section;

pub use renderer::render_document_pdf;

pub(crate) const VALID_DOC_TYPES: &[&str] = &[
    "FACTURE",
    "REÇU DE VENTE",
    "REÇU DE COMMANDE",
    "AVOIR CLIENT",
    "BON DE COMMANDE",
    "BON DE COMMANDE CLIENT – ACCUSÉ DE RÉCEPTION",
    "BON DE RÉCEPTION",
    "REÇU RETOUR EMBALLAGES",
    "RAPPORT DE CAISSE",
    "ÉTAT DES CRÉANCES CLIENTS",
    "RAPPORT DE STOCK & VALORISATION",
    "BILAN COMMERCIAL & FINANCES",
    "ÉTAT DES DETTES FOURNISSEURS",
    "ÉTAT DES CONSIGNATIONS",
];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPdfLine {
    pub label: String,
    pub sublabel: Option<String>,
    pub quantity: String,
    pub unit_price: Option<i64>,
    pub total: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPdfSummaryRow {
    pub label: String,
    pub value: String,
    #[serde(default)]
    pub bold: bool,
    pub tone: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPdfPayment {
    pub label: String,
    pub amount: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPdfPackagingRow {
    pub label: String,
    pub capacity: i64,
    pub quantity: i64,
    pub is_consigned: bool,
    pub deposit_unit: i64,
    pub deposit_total: i64,
    pub provided_by: Option<String>,
    pub returned_quantity: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPdfInput {
    pub doc_type: String,
    pub reference: String,
    pub date: String,
    pub status_label: Option<String>,
    pub party_title: Option<String>,
    pub party_name: Option<String>,
    pub party_details: Option<String>,
    #[serde(default)]
    pub lines: Vec<DocumentPdfLine>,
    #[serde(default)]
    pub summary_rows: Vec<DocumentPdfSummaryRow>,
    pub payments: Option<Vec<DocumentPdfPayment>>,
    #[serde(default)]
    pub packaging_rows: Vec<DocumentPdfPackagingRow>,
    pub notes: Option<String>,
}

pub async fn generate_document_pdf(
    db: &DepotDb,
    input: DocumentPdfInput,
) -> CoreResult<(String, Vec<u8>)> {
    let needed_perm = match input.doc_type.as_str() {
        "BON_COMMANDE" | "BON_RECEPTION" => Permission::PurchasesRead,
        "CLOTURE_CAISSE" => Permission::CashRead,
        _ => Permission::SalesRead,
    };
    require_current_actor_permission(needed_perm)?;
    if !VALID_DOC_TYPES.contains(&input.doc_type.as_str()) {
        return Err(CoreError::Validation(
            "Type de document PDF non reconnu.".to_string(),
        ));
    }
    let clean_ref = input.reference.trim();
    if clean_ref.is_empty() {
        return Err(CoreError::Validation(
            "Référence document requise pour la génération PDF.".to_string(),
        ));
    }
    let company = get_settings(db).await?;
    let bytes = render_document_pdf(&company, &input);
    let safe_ref: String = clean_ref
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    Ok((format!("DEPOTPRO_{safe_ref}.pdf"), bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::reports::AppSettingsDto;

    #[test]
    fn generates_valid_multipage_pdf_for_all_doc_types() {
        let company = AppSettingsDto {
            company_name: "DEPOT SOLIBRA ABIDJAN".to_string(),
            company_legal_name: Some("SARL Côte d'Ivoire".to_string()),
            address: Some("Zone 4, Rue des Brasseries".to_string()),
            phone: Some("+225 0102030405".to_string()),
            email: Some("contact@depotsolibra.ci".to_string()),
            city: Some("Abidjan".to_string()),
            country: Some("Côte d'Ivoire".to_string()),
            currency: "FCFA".to_string(),
            allow_negative_stock: 0,
            invoice_prefix: "FAC".to_string(),
            sale_prefix: "VTE".to_string(),
            purchase_prefix: "ACH".to_string(),
            order_prefix: "CMD".to_string(),
            receipt_prefix: "REC".to_string(),
            credit_note_prefix: "AVO".to_string(),
            theme: "light".to_string(),
            logo_path: None,
            setup_completed: 1,
        };

        for doc_type in VALID_DOC_TYPES {
            let lines: Vec<DocumentPdfLine> = (1..=30)
                .map(|i| DocumentPdfLine {
                    label: format!("Flag Spéciale 65cl lot #{i}"),
                    sublabel: Some("casier (×24 bouteille)".to_string()),
                    quantity: "2".to_string(),
                    unit_price: Some(15_000),
                    total: Some(30_000),
                })
                .collect();
            let pdf = render_document_pdf(
                &company,
                &DocumentPdfInput {
                    doc_type: (*doc_type).to_string(),
                    reference: "DOC-2026-0001".to_string(),
                    date: "2026-11-17T10:30:00Z".to_string(),
                    status_label: Some("Validé".to_string()),
                    party_title: Some("Client".to_string()),
                    party_name: Some("Maquis Le Palmier".to_string()),
                    party_details: Some("CLI-0001 · +225 07000000".to_string()),
                    lines,
                    summary_rows: vec![DocumentPdfSummaryRow {
                        label: "Total TTC".to_string(),
                        value: "1 350 000 FCFA".to_string(),
                        bold: true,
                        tone: Some("success".to_string()),
                    }],
                    payments: Some(vec![DocumentPdfPayment {
                        label: "Espèces".to_string(),
                        amount: 1_350_000,
                    }]),
                    packaging_rows: vec![DocumentPdfPackagingRow {
                        label: "Casier 33 cl".to_string(),
                        capacity: 24,
                        quantity: 2,
                        is_consigned: true,
                        deposit_unit: 1_000,
                        deposit_total: 2_000,
                        provided_by: Some("SOUS-DÉPÔT".to_string()),
                        returned_quantity: 1,
                    }],
                    notes: Some("Contrôle conforme sans écart.".to_string()),
                },
            );
            let text = String::from_utf8_lossy(&pdf);
            assert!(text.starts_with("%PDF-1.4\n"));
            assert!(text.ends_with("%%EOF\n"));
            assert!(text.contains("/Count 2"));
            assert!(text.contains("DEPOT SOLIBRA ABIDJAN"));
            assert!(text.contains("DOC-2026-0001"));
        }
    }
}
