// ============================================================================
// Génération de documents PDF multipages sans dépendance externe
// ============================================================================

use serde::{Deserialize, Serialize};

use crate::application::auth::{require_current_actor_permission, Permission};
use crate::application::reports::get_settings;
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

mod encoding_and_layout;
mod header_section;
mod primitives;
mod renderer;
mod receipt_renderer;
mod summary_section;
mod supplier_doc_renderer;

pub use renderer::render_document_pdf;

pub(crate) const VALID_DOC_TYPES: &[&str] = &[
    "FACTURE",
    "REÇU DE VENTE",
    "REÇU DE COMMANDE",
    "REÇU DE PAIEMENT",
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

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPdfLine {
    pub label: String,
    pub sublabel: Option<String>,
    pub quantity: String,
    #[serde(default)]
    pub discount: Option<i64>,
    pub unit_price: Option<i64>,
    pub total: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPdfSummaryRow {
    pub label: String,
    pub value: String,
    #[serde(default)]
    pub bold: bool,
    pub tone: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPdfPayment {
    pub label: String,
    pub amount: i64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPdfPackagingLine {
    pub label: String,
    #[serde(default)]
    pub kind: String,
    pub expected_quantity: i64,
    pub issued_quantity: Option<i64>,
    pub returned_quantity: Option<i64>,
    #[serde(default)]
    pub unit_deposit_xof: Option<i64>,
    pub status_label: String,
    pub detail: Option<String>,
    pub amount: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPdfInput {
    pub doc_type: String,
    pub reference: String,
    #[serde(default)]
    pub order_reference: Option<String>,
    pub date: String,
    pub status_label: Option<String>,
    pub party_title: Option<String>,
    pub party_name: Option<String>,
    pub party_details: Option<String>,
    pub party_phone: Option<String>,
    pub secondary_party_title: Option<String>,
    pub secondary_party_name: Option<String>,
    pub secondary_party_details: Option<String>,
    pub delivery_date: Option<String>,
    #[serde(default)]
    pub cashier_name: Option<String>,
    #[serde(default)]
    pub planned_payment_method: Option<String>,
    pub company_logo_jpeg: Option<String>,
    #[serde(default)]
    pub lines: Vec<DocumentPdfLine>,
    #[serde(default)]
    pub packaging_lines: Vec<DocumentPdfPackagingLine>,
    #[serde(default)]
    pub summary_rows: Vec<DocumentPdfSummaryRow>,
    pub payments: Option<Vec<DocumentPdfPayment>>,
    pub notes: Option<String>,
}

pub async fn generate_document_pdf(
    db: &DepotDb,
    input: DocumentPdfInput,
) -> CoreResult<(String, Vec<u8>)> {
    let needed_perm = match input.doc_type.as_str() {
        "BON DE COMMANDE" | "BON DE RÉCEPTION" | "ÉTAT DES DETTES FOURNISSEURS" => Permission::PurchasesRead,
        "RAPPORT DE CAISSE" => Permission::CashRead,
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

    if input.doc_type == "BON DE COMMANDE CLIENT – ACCUSÉ DE RÉCEPTION" {
        let snapshot_json: Option<String> = sqlx::query_scalar(
            "SELECT snapshot_json FROM customer_order_receipt_snapshots WHERE receipt_number = ?",
        )
        .bind(clean_ref)
        .fetch_optional(&db.pool)
        .await?;
        let snapshot_json = snapshot_json.ok_or_else(|| {
            CoreError::NotFound("Reçu de commande émis introuvable; aucun PDF ne peut être fabriqué depuis des données navigateur.".into())
        })?;
        let snapshot: serde_json::Value = serde_json::from_str(&snapshot_json)
            .map_err(|e| CoreError::Internal(format!("Snapshot du reçu invalide : {e}")))?;
        let company: AppSettingsDto = serde_json::from_value(
            snapshot.get("company").cloned().ok_or_else(|| {
                CoreError::Internal("Paramètres société absents du snapshot du reçu.".into())
            })?,
        )
        .map_err(|e| CoreError::Internal(format!("Paramètres société du snapshot invalides : {e}")))?;
        let mut frozen_doc: DocumentPdfInput = serde_json::from_value(
            snapshot.get("pdfDocument").cloned().ok_or_else(|| {
                CoreError::Internal("Données PDF absentes du snapshot du reçu.".into())
            })?,
        )
        .map_err(|e| CoreError::Internal(format!("Données PDF du snapshot invalides : {e}")))?;
        // Le navigateur ne fournit que le logo rasterisé; commande, client, montants et
        // ventilation viennent exclusivement du snapshot émis en base.
        frozen_doc.company_logo_jpeg = input.company_logo_jpeg;
        let bytes = render_document_pdf(&company, &frozen_doc);
        return Ok((format!("DEPOTPRO_{safe_ref}.pdf"), bytes));
    }

    let company = get_settings(db).await?;
    let bytes = render_document_pdf(&company, &input);
    Ok((format!("DEPOTPRO_{safe_ref}.pdf"), bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::reports::AppSettingsDto;

    #[test]
    fn compact_customer_order_receipt_is_one_page_and_matches_reference_sections() {
        let company = AppSettingsDto {
            company_name: "DEPOT SOLIBRA ABIDJAN".to_string(),
            company_legal_name: None,
            address: Some("Zone 4".to_string()),
            phone: Some("+225 0102030405".to_string()),
            email: None,
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
        let doc = DocumentPdfInput {
            doc_type: "BON DE COMMANDE CLIENT – ACCUSÉ DE RÉCEPTION".to_string(),
            reference: "REC-CMD-2026-0001".to_string(),
            order_reference: Some("CMD-2026-0001".to_string()),
            date: "2026-11-22T10:30:00Z".to_string(),
            status_label: Some("CONFIRMÉE".to_string()),
            party_title: Some("INFORMATIONS DU CLIENT".to_string()),
            party_name: Some("Maquis Le Palmier".to_string()),
            party_details: Some("Code : CLI-001 · Tél. : +225 0700000000".to_string()),
            party_phone: Some("+225 0700000000".to_string()),
            secondary_party_title: Some("MODE DE RETRAIT / LIVRAISON".to_string()),
            secondary_party_name: Some("Maquis Le Palmier".to_string()),
            secondary_party_details: Some("Enlèvement sur place (au sous-dépôt)".to_string()),
            delivery_date: None,
            cashier_name: Some("Aminata".to_string()),
            planned_payment_method: Some("cash".to_string()),
            company_logo_jpeg: None,
            lines: vec![DocumentPdfLine {
                label: "Bock · 33 cl".to_string(),
                sublabel: Some("12 bouteilles · casier de 24".to_string()),
                quantity: "12 bouteilles".to_string(),
                discount: None,
                unit_price: Some(500),
                total: Some(6_000),
            }],
            packaging_lines: vec![DocumentPdfPackagingLine {
                label: "Casier 24 trous (33 cl)".to_string(),
                kind: "crate".to_string(),
                expected_quantity: 1,
                issued_quantity: None,
                returned_quantity: Some(0),
                unit_deposit_xof: Some(1_000),
                status_label: "Consigné".to_string(),
                detail: Some("À remettre".to_string()),
                amount: Some(1_000),
            }],
            summary_rows: vec![DocumentPdfSummaryRow {
                label: "NET À PAYER (FCFA)".to_string(),
                value: "7 000 FCFA".to_string(),
                bold: true,
                tone: Some("success".to_string()),
            }],
            payments: Some(vec![]),
            notes: Some("IMPORTANT : Ce document est un accusé de réception; il ne remplace pas une facture ni un reçu de paiement.".to_string()),
        };
        let pdf = render_document_pdf(&company, &doc);
        let text = String::from_utf8_lossy(&pdf);
        assert!(text.starts_with("%PDF-1.4\n"));
        assert!(text.contains("/Count 1"), "un petit reçu ne doit pas avoir de page vide");
        assert!(text.contains("DE COMMANDE"));
        assert!(text.contains("CMD-2026-0001"));
        assert!(text.contains("INFORMATIONS DU CLIENT"));
        assert!(text.contains("Statut"));
        assert!(text.contains("CONFIRM"));
        assert!(text.contains("IMPORTANT"));
        assert!(!text.contains("Activité : Distribution"));
        assert!(text.contains("SUIVI DES CASIERS"));
        assert!(text.contains("Signature du client"));
        assert!(text.contains("Merci pour votre confiance !"));
    }

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
                    discount: None,
                    unit_price: Some(15_000),
                    total: Some(30_000),
                })
                .collect();
            let pdf = render_document_pdf(
                &company,
                &DocumentPdfInput {
                    doc_type: (*doc_type).to_string(),
                    reference: "DOC-2026-0001".to_string(),
                    order_reference: None,
                    date: "2026-11-17T10:30:00Z".to_string(),
                    status_label: Some("Validé".to_string()),
                    party_title: Some("Client".to_string()),
                    party_name: Some("Maquis Le Palmier".to_string()),
                    party_details: Some("CLI-0001 · +225 07000000".to_string()),
                    party_phone: Some("+225 07000000".to_string()),
                    secondary_party_title: Some("LIVRER À".to_string()),
                    secondary_party_name: Some("Maquis Le Palmier".to_string()),
                    secondary_party_details: Some("Abidjan".to_string()),
                    delivery_date: None,
                    cashier_name: None,
                    planned_payment_method: None,
                    company_logo_jpeg: None,
                    lines,
                    packaging_lines: Vec::new(),
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
                    notes: Some("Contrôle conforme sans écart.".to_string()),
                },
            );
            let text = String::from_utf8_lossy(&pdf);
            assert!(text.starts_with("%PDF-1.4\n"));
            assert!(text.ends_with("%%EOF\n"));
            assert!(text.contains("/Count 2"));
            assert!(text.contains("DEPOT SOLIBRA ABIDJAN"));
            assert!(text.contains("DOC-2026-0001"));
            if *doc_type == "BON DE COMMANDE CLIENT – ACCUSÉ DE RÉCEPTION" {
                assert!(text.contains("INFORMATIONS DU CLIENT"));
                assert!(text.contains("MONTANT TOTAL"));
                assert!(text.contains("Signature du client"));
            }
        }
    }
}
