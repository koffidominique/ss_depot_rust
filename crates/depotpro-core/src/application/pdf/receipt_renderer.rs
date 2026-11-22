// Rendu A4 dédié à l'accusé de commande client, d'après le PDF de référence.
use crate::application::reports::AppSettingsDto;

use super::encoding_and_layout::{format_date_french, wrap_text};
use super::primitives::{
    assemble_pdf_bytes, decode_logo_jpeg, draw_line, draw_logo_image, draw_rect_fill,
    draw_rect_fill_stroke, draw_text, draw_text_right, start_page, CONTENT_W, MARGIN, PAGE_H, RIGHT,
};
use super::{DocumentPdfInput, DocumentPdfLine};

const ORANGE: (f64, f64, f64) = (0.78, 0.30, 0.035);
const GREEN: (f64, f64, f64) = (0.0, 0.48, 0.34);
const NAVY: (f64, f64, f64) = (0.12, 0.16, 0.23);
const GRAY: (f64, f64, f64) = (0.38, 0.42, 0.49);
const LIGHT: (f64, f64, f64) = (0.96, 0.97, 0.98);
const BORDER: (f64, f64, f64) = (0.78, 0.81, 0.85);

fn amount(value: i64) -> String {
    let digits = value.abs().to_string();
    let mut grouped = String::with_capacity(digits.len() + digits.len() / 3);
    for (i, ch) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i) % 3 == 0 {
            grouped.push(' ');
        }
        grouped.push(ch);
    }
    if value < 0 {
        format!("- {grouped}")
    } else {
        grouped
    }
}

fn draw_brand_header(
    cmds: &mut Vec<String>,
    company: &AppSettingsDto,
    doc: &DocumentPdfInput,
    logo: Option<&super::primitives::PdfJpegImage>,
    first_page: bool,
) {
    let x = MARGIN;
    if first_page {
        if let Some(image) = logo {
            let side = 86.0;
            let scale = side / f64::from(image.width.max(image.height));
            let w = f64::from(image.width) * scale;
            let h = f64::from(image.height) * scale;
            draw_rect_fill_stroke(cmds, x, 719.0, side, side, (1.0, 1.0, 1.0), BORDER, 0.8);
            draw_logo_image(cmds, x + (side - w) / 2.0, 719.0 + (side - h) / 2.0, w, h);
        } else {
            draw_rect_fill_stroke(cmds, x, 719.0, 86.0, 86.0, LIGHT, (0.60, 0.65, 0.72), 0.8);
            draw_text(cmds, x + 15.0, 766.0, "EMPLACEMENT", 8.0, true, GRAY);
            draw_text(cmds, x + 23.0, 754.0, "LOGO", 10.0, true, GRAY);
            draw_text(cmds, x + 13.0, 741.0, "(Cachet / Visuel)", 6.0, false, GRAY);
        }
        let brand_x = x + 98.0;
        let name = if company.company_name.trim().is_empty() {
            "NOM DU SOUS-DÉPÔT DE BOISSONS"
        } else {
            company.company_name.trim()
        };
        let title_lines = wrap_text(name, 235.0, 14.0, true);
        let mut title_y = 794.0;
        for line in title_lines.iter().take(2) {
            draw_text(cmds, brand_x, title_y, line, 14.0, true, ORANGE);
            title_y -= 15.0;
        }
        draw_line(cmds, brand_x, title_y + 3.0, 376.0, title_y + 3.0, ORANGE, 0.8);
        let mut info_y = title_y - 9.0;
        let mut infos = Vec::new();
        if let Some(address) = company.address.as_deref().filter(|value| !value.trim().is_empty()) {
            infos.push(format!("Adresse : {}", address.trim()));
        }
        let city = [company.city.as_deref(), company.country.as_deref()]
            .into_iter()
            .flatten()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>()
            .join(" / ");
        if !city.is_empty() {
            infos.push(format!("Commune / Quartier : {city}"));
        }
        if let Some(phone) = company.phone.as_deref().filter(|value| !value.trim().is_empty()) {
            infos.push(format!("Tél / WhatsApp : {}", phone.trim()));
        }
        if let Some(legal) = company.company_legal_name.as_deref().filter(|value| !value.trim().is_empty()) {
            infos.push(format!("Raison sociale : {}", legal.trim()));
        }
        if let Some(email) = company.email.as_deref().filter(|value| !value.trim().is_empty()) {
            infos.push(format!("E-mail : {}", email.trim()));
        }
        for info in infos.iter().take(5) {
            let wrapped = wrap_text(info, 235.0, 7.0, false);
            if let Some(line) = wrapped.first() {
                draw_text(cmds, brand_x, info_y, line, 7.0, false, NAVY);
            }
            info_y -= 10.0;
        }

        let bx = 408.0;
        draw_rect_fill_stroke(cmds, bx, 710.0, 147.0, 94.0, (0.95, 1.0, 0.98), GREEN, 1.4);
        draw_text(cmds, bx + 12.0, 790.0, "REÇU DE COMMANDE", 10.0, true, GREEN);
        draw_text(cmds, bx + 12.0, 780.0, "CONFIRMATION DE COMMANDE CLIENT", 6.2, true, GREEN);
        draw_text(cmds, bx + 11.0, 767.0, &format!("N° reçu : {}", doc.reference), 7.1, true, NAVY);
        draw_text(cmds, bx + 11.0, 757.0, &format!("Réf. commande : {}", doc.order_reference.as_deref().unwrap_or("—")), 6.7, true, NAVY);
        draw_text(cmds, bx + 11.0, 747.0, &format!("Date : {}", format_date_french(&doc.date)), 7.1, true, NAVY);
        draw_text(cmds, bx + 11.0, 737.0, &format!("Heure : {}", time_part(&doc.date)), 7.1, true, NAVY);
        draw_text(cmds, bx + 11.0, 727.0, &format!("Émis par : {}", doc.cashier_name.as_deref().unwrap_or("—")), 6.8, true, NAVY);
        draw_text(cmds, bx + 11.0, 717.0, &format!("Statut : {}", doc.status_label.as_deref().unwrap_or("—")), 6.8, true, NAVY);
        draw_line(cmds, MARGIN, 704.0, RIGHT, 704.0, ORANGE, 1.4);
    } else {
        draw_text(cmds, MARGIN, PAGE_H - 32.0, &format!("{} · REÇU {} · SUITE", company.company_name, doc.reference), 9.0, true, NAVY);
        draw_line(cmds, MARGIN, PAGE_H - 39.0, RIGHT, PAGE_H - 39.0, ORANGE, 1.0);
    }
}

fn time_part(date: &str) -> String {
    let time = date
        .split_once('T')
        .or_else(|| date.split_once(' '))
        .map(|(_, time)| time)
        .unwrap_or("");
    let time = time.trim_end_matches('Z');
    let time = time.split(|ch| ch == '+' || ch == '-').next().unwrap_or(time);
    if time.len() >= 5 { time[..5].to_string() } else { "—".to_string() }
}

fn draw_party_boxes(cmds: &mut Vec<String>, doc: &DocumentPdfInput) {
    let top = 698.0;
    let h = 76.0;
    let left_x = MARGIN;
    let left_w = 264.0;
    let right_x = left_x + left_w + 10.0;
    let right_w = CONTENT_W - left_w - 10.0;
    draw_rect_fill_stroke(cmds, left_x, top - h, left_w, h, (1.0, 1.0, 1.0), BORDER, 0.7);
    draw_rect_fill_stroke(cmds, right_x, top - h, right_w, h, (1.0, 1.0, 1.0), BORDER, 0.7);
    draw_text(cmds, left_x + 9.0, top - 14.0, "INFORMATIONS DU CLIENT", 8.0, true, ORANGE);
    draw_line(cmds, left_x + 8.0, top - 19.0, left_x + left_w - 8.0, top - 19.0, BORDER, 0.5);
    draw_text(cmds, left_x + 9.0, top - 32.0, doc.party_name.as_deref().unwrap_or("—"), 8.0, true, NAVY);
    let party = doc.party_details.as_deref().unwrap_or("");
    let party_lines = wrap_text(party, left_w - 18.0, 6.8, false);
    for (i, line) in party_lines.iter().take(3).enumerate() {
        draw_text(cmds, left_x + 9.0, top - 43.0 - i as f64 * 9.0, line, 6.8, false, GRAY);
    }

    draw_text(cmds, right_x + 9.0, top - 14.0, "MODE DE RETRAIT / LIVRAISON", 8.0, true, ORANGE);
    draw_line(cmds, right_x + 8.0, top - 19.0, right_x + right_w - 8.0, top - 19.0, BORDER, 0.5);
    let is_delivery = doc.delivery_date.is_some()
        || doc.secondary_party_details.as_deref().map(|text| {
            !text.to_lowercase().contains("enlèvement")
                && !text.to_lowercase().contains("a retirer")
                && !text.to_lowercase().contains("à retirer")
        }).unwrap_or(false);
    draw_checkbox(cmds, right_x + 9.0, top - 32.0, !is_delivery, "Enlèvement sur place (au sous-dépôt)");
    draw_checkbox(cmds, right_x + 9.0, top - 45.0, is_delivery, "Livraison à domicile / sur site");
    let destination = doc.secondary_party_details.as_deref().unwrap_or("—");
    let dest = wrap_text(&format!("Lieu : {destination}"), right_w - 18.0, 6.5, false);
    if let Some(line) = dest.first() {
        draw_text(cmds, right_x + 9.0, top - 58.0, line, 6.5, false, NAVY);
    }
    if let Some(date) = doc.delivery_date.as_deref() {
        draw_text(cmds, right_x + 9.0, top - 68.0, &format!("Date prévue : {}", format_date_french(date)), 6.3, false, NAVY);
    }
}

fn draw_checkbox(cmds: &mut Vec<String>, x: f64, y: f64, checked: bool, label: &str) {
    draw_rect_fill_stroke(cmds, x, y - 2.0, 8.0, 8.0, (1.0, 1.0, 1.0), NAVY, 0.6);
    if checked {
        draw_line(cmds, x + 1.5, y + 1.0, x + 3.5, y - 1.0, GREEN, 1.2);
        draw_line(cmds, x + 3.5, y - 1.0, x + 7.0, y + 4.5, GREEN, 1.2);
    }
    draw_text(cmds, x + 12.0, y + 3.0, label, 6.4, false, NAVY);
}

fn draw_products_header(cmds: &mut Vec<String>, top: f64) {
    let y = top - 29.0;
    draw_rect_fill(cmds, MARGIN, y, CONTENT_W, 29.0, NAVY);
    let cols = [
        MARGIN,
        MARGIN + 25.0,
        MARGIN + 200.0,
        MARGIN + 295.0,
        MARGIN + 335.0,
        MARGIN + 410.0,
        RIGHT,
    ];
    for x in cols.iter().skip(1).take(5) {
        draw_line(cmds, *x, y, *x, top, (0.65, 0.68, 0.73), 0.5);
    }
    draw_text(cmds, MARGIN + 7.0, top - 18.0, "N°", 7.0, true, (1.0, 1.0, 1.0));
    draw_text(cmds, MARGIN + 29.0, top - 12.0, "DÉSIGNATION / FORMAT", 6.1, true, (1.0, 1.0, 1.0));
    draw_text(cmds, MARGIN + 205.0, top - 12.0, "CONDITIONNEMENT", 5.9, true, (1.0, 1.0, 1.0));
    draw_text(cmds, MARGIN + 220.0, top - 22.0, "(CASIER / PACK)", 5.4, false, (1.0, 1.0, 1.0));
    draw_text(cmds, MARGIN + 300.0, top - 18.0, "QTÉ", 6.5, true, (1.0, 1.0, 1.0));
    draw_text(cmds, MARGIN + 340.0, top - 12.0, "PRIX UNITAIRE", 5.7, true, (1.0, 1.0, 1.0));
    draw_text(cmds, MARGIN + 358.0, top - 22.0, "(FCFA)", 5.7, true, (1.0, 1.0, 1.0));
    draw_text(cmds, MARGIN + 415.0, top - 12.0, "MONTANT TOTAL", 5.3, true, (1.0, 1.0, 1.0));
    draw_text(cmds, MARGIN + 435.0, top - 22.0, "(FCFA)", 5.6, true, (1.0, 1.0, 1.0));
}

fn draw_product_row(cmds: &mut Vec<String>, row_top: f64, index: usize, line: Option<&DocumentPdfLine>) {
    let row_h = 20.0;
    let bottom = row_top - row_h;
    draw_rect_fill(cmds, MARGIN, bottom, CONTENT_W, row_h, if index % 2 == 0 { LIGHT } else { (1.0, 1.0, 1.0) });
    let cols = [
        MARGIN,
        MARGIN + 25.0,
        MARGIN + 200.0,
        MARGIN + 295.0,
        MARGIN + 335.0,
        MARGIN + 410.0,
        RIGHT,
    ];
    for x in cols.iter().skip(1).take(6) {
        draw_line(cmds, *x, bottom, *x, row_top, BORDER, 0.45);
    }
    draw_line(cmds, MARGIN, bottom, RIGHT, bottom, BORDER, 0.45);
    draw_text(cmds, MARGIN + 8.0, row_top - 13.5, &format!("{}", index + 1), 7.0, false, NAVY);
    if let Some(line) = line {
        let label = wrap_text(&line.label, 165.0, 6.4, false);
        if let Some(text) = label.first() {
            draw_text(cmds, MARGIN + 29.0, row_top - 8.0, text, 6.4, true, NAVY);
        }
        let detail = line.sublabel.as_deref().unwrap_or("");
        let details = wrap_text(detail, 91.0, 5.4, false);
        if let Some(text) = details.first() {
            draw_text(cmds, MARGIN + 204.0, row_top - 12.5, text, 5.4, false, GRAY);
        }
        draw_text_right(cmds, MARGIN + 332.0, row_top - 13.5, &line.quantity, 6.0, false, NAVY);
        draw_text_right(cmds, MARGIN + 407.0, row_top - 13.5, &line.unit_price.map(amount).unwrap_or_else(|| "—".to_string()), 5.8, false, NAVY);
        draw_text_right(cmds, RIGHT - 4.0, row_top - 13.5, &line.total.map(amount).unwrap_or_else(|| "—".to_string()), 5.8, true, NAVY);
    }
}

fn draw_packaging_and_finance(cmds: &mut Vec<String>, top: f64, doc: &DocumentPdfInput) -> f64 {
    let left_x = MARGIN;
    let left_w = 260.0;
    let right_x = MARGIN + 270.0;
    let right_w = CONTENT_W - 270.0;
    draw_text(cmds, left_x, top, "SUIVI DES CASIERS & EMBALLAGES (CONSIGNES)", 7.2, true, ORANGE);
    draw_text(cmds, right_x, top, "DÉCOMPTE FINANCIER (EN FCFA)", 7.2, true, ORANGE);
    draw_line(cmds, left_x, top - 4.0, left_x + left_w, top - 4.0, BORDER, 0.6);
    draw_line(cmds, right_x, top - 4.0, right_x + right_w, top - 4.0, BORDER, 0.6);

    let table_top = top - 9.0;
    draw_rect_fill(cmds, left_x, table_top - 16.0, left_w, 16.0, (1.0, 0.95, 0.78));
    draw_text(cmds, left_x + 4.0, table_top - 11.0, "Type d'emballage", 5.8, true, ORANGE);
    draw_text(cmds, left_x + 121.0, table_top - 11.0, "Prévu", 5.6, true, ORANGE);
    draw_text(cmds, left_x + 150.0, table_top - 11.0, "Remis", 5.6, true, ORANGE);
    draw_text(cmds, left_x + 180.0, table_top - 11.0, "Rendus", 5.4, true, ORANGE);
    draw_text(cmds, left_x + 218.0, table_top - 11.0, "Solde", 5.6, true, ORANGE);
    let mut y = table_top - 16.0;
    if doc.packaging_lines.is_empty() {
        draw_line(cmds, left_x, y - 18.0, left_x + left_w, y - 18.0, BORDER, 0.5);
        draw_text(cmds, left_x + 5.0, y - 12.0, "Aucun emballage consigné attribué", 6.0, false, GRAY);
        y -= 18.0;
    } else {
        for (idx, item) in doc.packaging_lines.iter().enumerate() {
            let row_height = 32.0;
            let row_y = y - row_height;
            if idx % 2 == 1 {
                draw_rect_fill(cmds, left_x, row_y, left_w, row_height, LIGHT);
            }
            draw_line(cmds, left_x, row_y, left_x + left_w, row_y, BORDER, 0.45);
            let label = wrap_text(&item.label, 112.0, 5.6, false);
            if let Some(text) = label.first() {
                draw_text(cmds, left_x + 4.0, y - 7.0, text, 5.6, false, NAVY);
            }
            draw_text_right(cmds, left_x + 147.0, y - 7.0, &item.expected_quantity.to_string(), 5.8, false, NAVY);
            draw_text_right(
                cmds,
                left_x + 177.0,
                y - 7.0,
                &item.issued_quantity.map(|value| value.to_string()).unwrap_or_else(|| "—".to_string()),
                5.8,
                false,
                NAVY,
            );
            let returned = if item.issued_quantity.is_some() {
                item.returned_quantity.map(|value| value.to_string()).unwrap_or_else(|| "—".to_string())
            } else {
                "—".to_string()
            };
            draw_text_right(cmds, left_x + 211.0, y - 7.0, &returned, 5.8, false, NAVY);
            let balance = item.issued_quantity
                .map(|issued| (issued - item.returned_quantity.unwrap_or(0)).max(0).to_string())
                .unwrap_or_else(|| "—".to_string());
            draw_text_right(cmds, left_x + left_w - 4.0, y - 7.0, &balance, 5.8, false, NAVY);

            let consignment = match item.unit_deposit_xof {
                Some(unit) => {
                    let total = item.amount.unwrap_or_else(|| unit.saturating_mul(item.expected_quantity));
                    format!("{} · {} FCFA / u. · total {} FCFA", item.status_label, amount(unit), amount(total))
                }
                None => item.status_label.clone(),
            };
            let detail = item.detail.as_deref().unwrap_or("");
            let second_line = wrap_text(&format!("{consignment} · {detail}"), 250.0, 4.8, false);
            if let Some(text) = second_line.first() {
                draw_text(cmds, left_x + 4.0, y - 16.0, text, 4.8, false, GRAY);
            }
            if let Some(text) = second_line.get(1) {
                draw_text(cmds, left_x + 4.0, y - 23.0, text, 4.8, false, GRAY);
            }
            y -= row_height;
        }
    }
    draw_text(cmds, left_x + 2.0, y - 9.0, "* Tout emballage consigné non restitué reste dû au tarif en vigueur.", 5.2, false, GRAY);

    let summary_top = top - 9.0;
    let summary_h = (doc.summary_rows.len().max(1) as f64 * 14.0) + 8.0;
    draw_rect_fill_stroke(cmds, right_x, summary_top - summary_h, right_w, summary_h, (1.0, 1.0, 1.0), BORDER, 0.5);
    let mut sy = summary_top - 12.0;
    for (index, row) in doc.summary_rows.iter().enumerate() {
        let tone = match row.tone.as_deref() {
            Some("success") => GREEN,
            Some("warning") => ORANGE,
            Some("danger") => (0.82, 0.08, 0.08),
            _ => NAVY,
        };
        if row.bold {
            draw_rect_fill(cmds, right_x + 0.5, sy - 4.0, right_w - 1.0, 14.0, if row.tone.as_deref() == Some("success") { GREEN } else if row.tone.as_deref() == Some("danger") { (1.0, 0.94, 0.94) } else { LIGHT });
        }
        let label = wrap_text(&row.label, right_w - 92.0, 6.0, row.bold);
        if let Some(text) = label.first() {
            draw_text(cmds, right_x + 4.0, sy, text, 6.0, row.bold, tone);
        }
        draw_text_right(cmds, right_x + right_w - 5.0, sy, &row.value, 6.0, row.bold, tone);
        sy -= 14.0;
        if index + 1 < doc.summary_rows.len() {
            draw_line(cmds, right_x + 3.0, sy + 4.0, right_x + right_w - 3.0, sy + 4.0, (0.88, 0.90, 0.93), 0.35);
        }
    }
    top - (summary_h.max((top - y) + 16.0))
}

fn normalize_method(value: &str) -> String {
    value.to_ascii_lowercase().replace(' ', "_").replace('-', "_")
}

fn draw_notes_block(cmds: &mut Vec<String>, top: f64, lines: &[String], continuation: bool) -> f64 {
    let height = 24.0 + lines.len() as f64 * 8.0;
    draw_rect_fill_stroke(cmds, MARGIN, top - height, CONTENT_W, height, (1.0, 1.0, 1.0), BORDER, 0.55);
    draw_text(
        cmds,
        MARGIN + 7.0,
        top - 10.0,
        if continuation { "OBSERVATIONS ET CONDITIONS (SUITE)" } else { "OBSERVATIONS ET CONDITIONS" },
        6.8,
        true,
        ORANGE,
    );
    draw_line(cmds, MARGIN + 6.0, top - 15.0, RIGHT - 6.0, top - 15.0, BORDER, 0.4);
    for (index, line) in lines.iter().enumerate() {
        draw_text(cmds, MARGIN + 7.0, top - 23.0 - index as f64 * 8.0, line, 5.9, false, NAVY);
    }
    top - height
}

fn draw_receipt_closing(
    pages: &mut Vec<Vec<String>>,
    company: &AppSettingsDto,
    logo: Option<&super::primitives::PdfJpegImage>,
    mut top: f64,
    doc: &DocumentPdfInput,
) {
    let note_lines = doc
        .notes
        .as_deref()
        .unwrap_or("")
        .lines()
        .flat_map(|line| wrap_text(line, CONTENT_W - 16.0, 5.9, false))
        .collect::<Vec<_>>();
    let mut index = 0usize;
    let closing_height = 130.0;
    let note_height = if note_lines.is_empty() { 0.0 } else { 24.0 + note_lines.len() as f64 * 8.0 };
    if top - note_height - closing_height < MARGIN {
        let mut page_y = 0.0;
        start_page(pages, &mut page_y);
        draw_brand_header(pages.last_mut().unwrap(), company, doc, logo, false);
        top = PAGE_H - 58.0;
    }

    while index < note_lines.len() {
        let available_lines = ((top - MARGIN - closing_height - 24.0) / 8.0).floor().max(1.0) as usize;
        let end = (index + available_lines).min(note_lines.len());
        top = draw_notes_block(
            pages.last_mut().unwrap(),
            top,
            &note_lines[index..end],
            index > 0,
        );
        index = end;
        if index < note_lines.len() {
            let mut page_y = 0.0;
            start_page(pages, &mut page_y);
            draw_brand_header(pages.last_mut().unwrap(), company, doc, logo, false);
            top = PAGE_H - 58.0;
        }
    }

    if top - closing_height < MARGIN {
        let mut page_y = 0.0;
        start_page(pages, &mut page_y);
        draw_brand_header(pages.last_mut().unwrap(), company, doc, logo, false);
        top = PAGE_H - 58.0;
    }
    draw_payment_and_signatures(pages.last_mut().unwrap(), top - 5.0, doc);
}

fn draw_payment_and_signatures(cmds: &mut Vec<String>, top: f64, doc: &DocumentPdfInput) {
    let payment_y = top - 40.0;
    draw_rect_fill_stroke(cmds, MARGIN, payment_y, CONTENT_W, 37.0, (0.98, 0.98, 0.99), BORDER, 0.6);
    draw_text(cmds, MARGIN + 8.0, top - 14.0, "Mode de règlement :", 6.8, true, NAVY);
    let method_names = [
        ("cash", "Espèces"),
        ("mobile_money", "Mobile Money"),
        ("credit", "Crédit"),
        ("mixed", "Mixte"),
        ("other", "Autre"),
    ];
    let actual_codes = doc.payments.as_deref().unwrap_or(&[]).iter()
        .map(|payment| normalize_method(&payment.label))
        .collect::<Vec<_>>();
    let planned = doc.planned_payment_method.as_deref().map(normalize_method).unwrap_or_default();
    let mobile_codes = ["mobile_money", "wave", "orange_money", "mtn_momo", "moov_money"];
    let actual_has_mobile = actual_codes.iter().any(|value| mobile_codes.iter().any(|code| value.contains(code)));
    let actual_has_cash = actual_codes.iter().any(|value| value.contains("cash") || value.contains("espèces"));
    let actual_has_credit = actual_codes.iter().any(|value| value.contains("credit") || value.contains("crédit"));
    let actual_is_mixed = [actual_has_mobile, actual_has_cash, actual_has_credit]
        .into_iter()
        .filter(|present| *present)
        .count() > 1;
    let mut x = MARGIN + 92.0;
    for (code, label) in method_names {
        let label_normalized = normalize_method(label);
        let checked = if actual_codes.is_empty() {
            match code {
                "mobile_money" => mobile_codes.contains(&planned.as_str()),
                "other" => !planned.is_empty() && !mobile_codes.contains(&planned.as_str()) && !["cash", "credit", "mixed"].contains(&planned.as_str()),
                _ => planned.as_str() == code,
            }
        } else {
            match code {
                "mobile_money" => actual_has_mobile,
                "mixed" => actual_is_mixed,
                "other" => actual_codes.iter().any(|value| value.contains("other")),
                _ => actual_codes.iter().any(|value| value.contains(code) || value.contains(label_normalized.as_str())),
            }
        };
        draw_checkbox(cmds, x, top - 13.0, checked, label);
        x += match code { "mobile_money" => 86.0, "cash" => 56.0, "credit" | "mixed" => 54.0, _ => 50.0 };
    }
    draw_text(cmds, MARGIN + 8.0, top - 31.0, "Réf. interne / observation :", 6.4, true, NAVY);
    let refs = doc.payments.as_deref().unwrap_or(&[]).iter().map(|payment| payment.label.as_str()).collect::<Vec<_>>().join(" ; ");
    draw_text(cmds, MARGIN + 173.0, top - 31.0, &wrap_text(&refs, CONTENT_W - 185.0, 5.8, false).first().cloned().unwrap_or_else(|| "—".to_string()), 5.8, false, GRAY);

    let sig_top = payment_y - 10.0;
    let sig_h = 56.0;
    let sig_w = (CONTENT_W - 10.0) / 2.0;
    draw_rect_fill_stroke(cmds, MARGIN, sig_top - sig_h, sig_w, sig_h, (1.0, 1.0, 1.0), BORDER, 0.65);
    draw_rect_fill_stroke(cmds, MARGIN + sig_w + 10.0, sig_top - sig_h, sig_w, sig_h, (1.0, 1.0, 1.0), BORDER, 0.65);
    draw_text(cmds, MARGIN + 7.0, sig_top - 12.0, "Signature & cachet du sous-dépôt :", 6.7, true, NAVY);
    draw_text(cmds, MARGIN + sig_w + 17.0, sig_top - 12.0, "Signature du client (bon pour accord & réception) :", 6.2, true, NAVY);
    let footer_y = sig_top - sig_h - 17.0;
    draw_line(cmds, MARGIN, footer_y + 8.0, RIGHT, footer_y + 8.0, BORDER, 0.45);
    draw_text(cmds, MARGIN + 50.0, footer_y - 1.0, "Merci pour votre confiance ! Veuillez vérifier vos quantités et emballages avant de quitter le dépôt.", 6.2, false, GRAY);
}

fn draw_continuation_table_header(cmds: &mut Vec<String>, top: f64) {
    draw_text(cmds, MARGIN, top, "DÉTAIL DES BOISSONS — SUITE", 8.0, true, ORANGE);
    draw_line(cmds, MARGIN, top - 4.0, RIGHT, top - 4.0, BORDER, 0.6);
    draw_products_header(cmds, top - 9.0);
}

pub fn render_order_receipt_pdf(company: &AppSettingsDto, doc: &DocumentPdfInput) -> Vec<u8> {
    let logo = doc.company_logo_jpeg.as_deref().and_then(decode_logo_jpeg);
    let mut pages: Vec<Vec<String>> = Vec::new();
    let mut y = PAGE_H - MARGIN;
    start_page(&mut pages, &mut y);
    let cmds = pages.last_mut().expect("page initiale créée");
    draw_brand_header(cmds, company, doc, logo.as_ref(), true);
    draw_party_boxes(cmds, doc);
    draw_products_header(cmds, 612.0);
    y = 583.0;

    let product_count = doc.lines.len();
    if product_count <= 10 {
        for index in 0..10 {
            draw_product_row(pages.last_mut().unwrap(), y, index, doc.lines.get(index));
            y -= 20.0;
        }
        let section_top = if doc.packaging_lines.len() > 6 {
            start_page(&mut pages, &mut y);
            draw_brand_header(pages.last_mut().unwrap(), company, doc, logo.as_ref(), false);
            PAGE_H - 58.0
        } else {
            y - 5.0
        };
        let lower_top = draw_packaging_and_finance(pages.last_mut().unwrap(), section_top, doc);
        draw_receipt_closing(&mut pages, company, logo.as_ref(), lower_top - 5.0, doc);
    } else {
        for index in 0..10 {
            draw_product_row(pages.last_mut().unwrap(), y, index, doc.lines.get(index));
            y -= 20.0;
        }
        let mut next_index = 10usize;
        while next_index < product_count {
            start_page(&mut pages, &mut y);
            draw_brand_header(pages.last_mut().unwrap(), company, doc, logo.as_ref(), false);
            draw_continuation_table_header(pages.last_mut().unwrap(), PAGE_H - 58.0);
            y = PAGE_H - 96.0;
            let end_index = (next_index + 20).min(product_count);
            for index in next_index..end_index {
                draw_product_row(pages.last_mut().unwrap(), y, index, doc.lines.get(index));
                y -= 20.0;
            }
            next_index = end_index;
            if next_index == product_count {
                let section_top = if doc.packaging_lines.len() > 6 {
                    start_page(&mut pages, &mut y);
                    draw_brand_header(pages.last_mut().unwrap(), company, doc, logo.as_ref(), false);
                    PAGE_H - 58.0
                } else {
                    y - 5.0
                };
                let lower_top = draw_packaging_and_finance(pages.last_mut().unwrap(), section_top, doc);
                draw_receipt_closing(&mut pages, company, logo.as_ref(), lower_top - 5.0, doc);
            }
        }
    }
    assemble_pdf_bytes(&pages, logo.as_ref())
}
