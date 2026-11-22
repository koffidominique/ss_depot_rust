// Construction du modèle PDF client à partir des DTO métier déjà lus par le backend.
use super::dtos::{OrderDetailDto, OrderLineDto};
use super::receipts::ReceiptPaymentSnapshot;
use crate::application::pdf::{
    DocumentPdfInput, DocumentPdfLine, DocumentPdfPackagingLine, DocumentPdfPayment,
    DocumentPdfSummaryRow,
};

fn format_fcfa(value: i64) -> String {
    let digits = value.abs().to_string();
    let mut grouped = String::with_capacity(digits.len() + digits.len() / 3);
    for (index, ch) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index) % 3 == 0 {
            grouped.push(' ');
        }
        grouped.push(ch);
    }
    if value < 0 {
        format!("- {grouped} FCFA")
    } else {
        format!("{grouped} FCFA")
    }
}

fn requested_unit_label(unit: &str) -> &str {
    match unit {
        "unit" => "unité",
        "bottle" => "bouteille",
        "can" => "canette",
        "half_crate" => "demi-casier",
        "crate" => "casier",
        "pack" => "pack",
        "carton" => "carton",
        "pallet" => "palette",
        "custom" => "conditionnement personnalisé",
        other => other,
    }
}

fn make_line(line: &OrderLineDto, order: &OrderDetailDto) -> DocumentPdfLine {
    let unit = requested_unit_label(&line.requested_unit);
    let linked_packaging = order
        .links
        .iter()
        .filter(|link| link.order_line_id == line.id)
        .filter_map(|link| {
            order
                .allocations
                .iter()
                .find(|allocation| allocation.id == link.order_packaging_allocation_id)
                .map(|allocation| {
                    format!(
                        "{} unité(s) de base dans {}",
                        link.units_in_packaging, allocation.packaging_name
                    )
                })
        })
        .collect::<Vec<_>>();
    let mut details = vec![format!(
        "Commandé : {} {} · équivalent : {} {}",
        line.requested_quantity, unit, line.base_quantity, line.base_unit
    )];
    details.extend(linked_packaging);
    if let Some(note) = line.notes.as_deref().filter(|note| !note.trim().is_empty()) {
        details.push(note.trim().to_string());
    }
    DocumentPdfLine {
        label: format!("{} · {}", line.product_name, line.variant_name),
        sublabel: Some(details.join(" · ")),
        quantity: format!("{} {}", line.requested_quantity, unit),
        discount: Some(line.discount_xof),
        unit_price: Some(line.unit_price_xof),
        total: Some(line.line_total_xof),
    }
}

pub(super) fn build_receipt_pdf_input(
    order: &OrderDetailDto,
    customer_code: &str,
    customer_name: &str,
    customer_phone: Option<&str>,
    customer_address: Option<&str>,
    customer_city: Option<&str>,
    cashier_name: &str,
    receipt_number: &str,
    issued_at: &str,
    payments: &[ReceiptPaymentSnapshot],
) -> DocumentPdfInput {
    let order_summary = &order.order;
    let mut party_details = vec![format!("Code : {customer_code}")];
    if let Some(phone) = customer_phone.filter(|value| !value.trim().is_empty()) {
        party_details.push(format!("Tél. : {}", phone.trim()));
    }
    if let Some(address) = customer_address.filter(|value| !value.trim().is_empty()) {
        party_details.push(format!("Adresse : {}", address.trim()));
    }
    if let Some(city) = customer_city.filter(|value| !value.trim().is_empty()) {
        party_details.push(format!("Quartier / Ville : {}", city.trim()));
    }

    let lines = order.lines.iter().map(|line| make_line(line, order)).collect();
    let issued = matches!(
        order_summary.status.as_str(),
        "delivered" | "invoiced" | "paid"
    );
    let packaging_lines = order
        .allocations
        .iter()
        .map(|allocation| DocumentPdfPackagingLine {
            label: format!(
                "{} · capacité {} unité(s)",
                allocation.packaging_name, allocation.capacity
            ),
            kind: "other".to_string(),
            expected_quantity: allocation.quantity,
            issued_quantity: issued.then_some(allocation.quantity),
            returned_quantity: Some(allocation.returned_quantity),
            unit_deposit_xof: (allocation.is_consigned == 1).then_some(allocation.deposit_amount_xof),
            status_label: if allocation.is_consigned == 1 {
                "Consigné — suivi distinct des boissons".to_string()
            } else {
                "Emballage non consigné".to_string()
            },
            detail: Some(format!(
                "Fournisseur : {} · Composition mixte selon les liens de commande",
                allocation.provided_by.as_deref().unwrap_or("SOUS-DÉPÔT")
            )),
            amount: (allocation.is_consigned == 1)
                .then_some(allocation.quantity * allocation.deposit_amount_xof),
        })
        .collect();

    let summary_rows = vec![
        DocumentPdfSummaryRow {
            label: "SOUS-TOTAL DES LIGNES".to_string(),
            value: format_fcfa(order_summary.subtotal_xof),
            bold: false,
            tone: None,
        },
        DocumentPdfSummaryRow {
            label: "Taxes".to_string(),
            value: format_fcfa(order_summary.tax_xof),
            bold: false,
            tone: None,
        },
        DocumentPdfSummaryRow {
            label: "REMISE COMMERCIALE".to_string(),
            value: format_fcfa(-order_summary.discount_xof),
            bold: false,
            tone: None,
        },
        DocumentPdfSummaryRow {
            label: "TOTAL MARCHANDISES".to_string(),
            value: format_fcfa(order_summary.total_xof),
            bold: false,
            tone: None,
        },
        DocumentPdfSummaryRow {
            label: "Consignes des emballages".to_string(),
            value: format_fcfa(order_summary.deposit_due_xof),
            bold: false,
            tone: Some("warning".to_string()),
        },
        DocumentPdfSummaryRow {
            label: "TOTAL NET À PERCEVOIR".to_string(),
            value: format_fcfa(order_summary.total_to_collect_xof),
            bold: true,
            tone: Some("success".to_string()),
        },
        DocumentPdfSummaryRow {
            label: "Acomptes / paiements enregistrés".to_string(),
            value: format_fcfa(-order_summary.paid_xof),
            bold: false,
            tone: None,
        },
        DocumentPdfSummaryRow {
            label: "RESTE À PAYER".to_string(),
            value: format_fcfa((order_summary.total_to_collect_xof - order_summary.paid_xof).max(0)),
            bold: true,
            tone: Some("danger".to_string()),
        },
    ];
    let pdf_payments = payments
        .iter()
        .map(|payment| DocumentPdfPayment {
            label: format!(
                "{} ({}) · Réf. interne {} · {}{}",
                payment.method_label,
                payment.method_code,
                payment.reference,
                payment.paid_at,
                payment.payment_note.as_deref().map(|note| format!(" · {note}")).unwrap_or_default()
            ),
            amount: payment.amount_xof,
        })
        .collect::<Vec<_>>();
    let payment_method = order_summary
        .payment_method
        .as_deref()
        .unwrap_or("Non renseigné");
    let payment_status = if order_summary.paid_xof <= 0 {
        "NON PAYÉ"
    } else if order_summary.paid_xof >= order_summary.total_to_collect_xof {
        "SOLDÉ"
    } else {
        "PARTIEL"
    };
    let status_label = match order_summary.status.as_str() {
        "draft" => "BROUILLON",
        "confirmed" => "CONFIRMÉE",
        "delivered" => "LIVRÉE",
        "invoiced" => "FACTURÉE",
        "paid" => "SOLDÉE",
        "cancelled" => "ANNULÉE",
        other => other,
    };
    let mixed_composition = order
        .links
        .iter()
        .filter_map(|link| {
            let line = order.lines.iter().find(|line| line.id == link.order_line_id)?;
            let allocation = order
                .allocations
                .iter()
                .find(|allocation| allocation.id == link.order_packaging_allocation_id)?;
            Some(format!(
                "{} {} : {} unité(s) dans {}",
                line.product_name, line.variant_name, link.units_in_packaging, allocation.packaging_name
            ))
        })
        .collect::<Vec<_>>();
    let mut note_lines = [
        Some(format!("Commande source : {}", order_summary.order_number)),
        Some(format!("Type : {}", order_summary.order_type.to_uppercase())),
        Some(format!("Statut de la commande : {status_label}")),
        Some(format!("Mode de règlement prévu : {payment_method}")),
        Some(format!("Statut du paiement : {payment_status}")),
        Some(format!("Émis par : {cashier_name}")),
        order_summary.delivery_address.as_deref().map(|address| format!("Livraison : {address}")),
        (!mixed_composition.is_empty()).then(|| format!("Casiers mixtes — {}", mixed_composition.join(" ; "))),
        order_summary.notes.clone(),
    ]
    .into_iter()
    .flatten()
    .filter(|note| !note.trim().is_empty())
    .collect::<Vec<_>>();
    note_lines.extend(pdf_payments.iter().map(|payment| {
        format!("Paiement enregistré : {} · {}", payment.label, format_fcfa(payment.amount))
    }));
    note_lines.extend([
        "Les consignes correspondent à des emballages récupérables, suivies séparément de la valeur des boissons et régularisées selon les emballages effectivement restitués.".to_string(),
        "La commande doit être confirmée par le sous-dépôt avant prélèvement définitif du stock. Les quantités d’emballages remises au client sont contrôlées lors de la livraison.".to_string(),
        "IMPORTANT : Ce document est un accusé de réception de commande. Il ne remplace pas une facture ni un reçu de paiement. Seuls les encaissements enregistrés par le sous-dépôt font foi.".to_string(),
    ]);
    let notes = note_lines.join("\n");

    DocumentPdfInput {
        doc_type: "BON DE COMMANDE CLIENT – ACCUSÉ DE RÉCEPTION".to_string(),
        reference: receipt_number.to_string(),
        order_reference: Some(order_summary.order_number.clone()),
        date: issued_at.to_string(),
        status_label: Some(status_label.to_string()),
        party_title: Some("INFORMATIONS DU CLIENT".to_string()),
        party_name: Some(customer_name.to_string()),
        party_details: Some(party_details.join(" · ")),
        party_phone: customer_phone.map(|phone| phone.to_string()),
        secondary_party_title: Some("MODE DE RETRAIT / LIVRAISON".to_string()),
        secondary_party_name: Some(customer_name.to_string()),
        secondary_party_details: Some(
            order_summary
                .delivery_address
                .clone()
                .unwrap_or_else(|| "Enlèvement sur place (au sous-dépôt)".to_string()),
        ),
        delivery_date: order_summary.delivery_date.clone(),
        cashier_name: Some(cashier_name.to_string()),
        planned_payment_method: order_summary.payment_method.clone(),
        company_logo_jpeg: None,
        lines,
        packaging_lines,
        summary_rows,
        payments: Some(pdf_payments),
        notes: Some(notes),
    }
}
