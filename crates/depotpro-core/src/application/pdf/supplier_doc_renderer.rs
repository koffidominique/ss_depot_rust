// Rendu A4 dédié aux documents fournisseurs : BON DE COMMANDE FOURNISSEUR et BON DE RÉCEPTION.
use crate::application::reports::AppSettingsDto;

use super::encoding_and_layout::{format_date_french, wrap_text};
use super::primitives::{
    assemble_pdf_bytes, decode_logo_jpeg, draw_line, draw_logo_image, draw_rect_fill,
    draw_rect_fill_stroke, draw_text, draw_text_right, start_page, CONTENT_W, MARGIN, PAGE_H, RIGHT,
};
use super::{DocumentPdfInput, DocumentPdfLine};

const ORANGE: (f64, f64, f64) = (0.78, 0.30, 0.035);
const NAVY: (f64, f64, f64) = (0.12, 0.16, 0.23);
const GRAY: (f64, f64, f64) = (0.38, 0.42, 0.49);
const LIGHT: (f64, f64, f64) = (0.96, 0.97, 0.98);
const BORDER: (f64, f64, f64) = (0.78, 0.81, 0.85);
const BLUE_ACCENT: (f64, f64, f64) = (0.11, 0.31, 0.56);

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

fn time_part(date: &str) -> String {
    let time = date
        .split_once('T')
        .or_else(|| date.split_once(' '))
        .map(|(_, time)| time)
        .unwrap_or("");
    let time = time.trim_end_matches('Z');
    let time = time.split(|ch| ch == '+' || ch == '-').next().unwrap_or(time);
    if time.len() >= 5 {
        time[..5].to_string()
    } else {
        "—".to_string()
    }
}

fn draw_header(
    cmds: &mut Vec<String>,
    company: &AppSettingsDto,
    doc: &DocumentPdfInput,
    logo: Option<&super::primitives::PdfJpegImage>,
    first_page: bool,
) {
    let x = MARGIN;
    let is_receipt = doc.doc_type == "BON DE RÉCEPTION";
    let title = if is_receipt {
        "BON DE RÉCEPTION FOURNISSEUR"
    } else {
        "BON DE COMMANDE FOURNISSEUR"
    };

    if first_page {
        if let Some(image) = logo {
            let side = 76.0;
            let scale = side / f64::from(image.width.max(image.height));
            let w = f64::from(image.width) * scale;
            let h = f64::from(image.height) * scale;
            draw_rect_fill_stroke(cmds, x, 728.0, side, side, (1.0, 1.0, 1.0), BORDER, 0.8);
            draw_logo_image(cmds, x + (side - w) / 2.0, 728.0 + (side - h) / 2.0, w, h);
        } else {
            draw_rect_fill_stroke(cmds, x, 728.0, 76.0, 76.0, LIGHT, BORDER, 0.8);
            draw_text(cmds, x + 22.0, 763.0, "LOGO", 9.0, true, GRAY);
        }

        let brand_x = x + 88.0;
        let name = if company.company_name.trim().is_empty() {
            "DEPOTPRO"
        } else {
            company.company_name.trim()
        };
        let title_lines = wrap_text(name, 230.0, 13.5, true);
        let mut title_y = 794.0;
        for line in title_lines.iter().take(2) {
            draw_text(cmds, brand_x, title_y, line, 13.5, true, ORANGE);
            title_y -= 15.0;
        }
        draw_line(cmds, brand_x, title_y + 3.0, 376.0, title_y + 3.0, ORANGE, 0.8);

        let mut info_y = title_y - 9.0;
        let mut infos = Vec::new();
        if let Some(address) = company.address.as_deref().filter(|v| !v.trim().is_empty()) {
            infos.push(format!("Adresse : {}", address.trim()));
        }
        let city = [company.city.as_deref(), company.country.as_deref()]
            .into_iter()
            .flatten()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .collect::<Vec<_>>()
            .join(" / ");
        if !city.is_empty() {
            infos.push(format!("Ville : {city}"));
        }
        if let Some(phone) = company.phone.as_deref().filter(|v| !v.trim().is_empty()) {
            infos.push(format!("Tél : {}", phone.trim()));
        }
        if let Some(email) = company.email.as_deref().filter(|v| !v.trim().is_empty()) {
            infos.push(format!("E-mail : {}", email.trim()));
        }
        for info in infos.iter().take(4) {
            let wrapped = wrap_text(info, 230.0, 7.0, false);
            if let Some(line) = wrapped.first() {
                draw_text(cmds, brand_x, info_y, line, 7.0, false, NAVY);
            }
            info_y -= 10.0;
        }

        let bx = 398.0;
        draw_rect_fill_stroke(cmds, bx, 714.0, 157.0, 90.0, (0.95, 0.97, 1.0), BLUE_ACCENT, 1.3);
        draw_text(cmds, bx + 10.0, 790.0, title, 7.8, true, BLUE_ACCENT);
        draw_text(cmds, bx + 10.0, 775.0, &format!("N° : {}", doc.reference), 7.2, true, NAVY);
        draw_text(cmds, bx + 10.0, 763.0, &format!("Date : {}", format_date_french(&doc.date)), 7.0, true, NAVY);
        draw_text(cmds, bx + 10.0, 752.0, &format!("Heure : {}", time_part(&doc.date)), 7.0, true, NAVY);
        draw_text(cmds, bx + 10.0, 741.0, &format!("Statut : {}", doc.status_label.as_deref().unwrap_or("—")), 6.8, true, NAVY);
        if let Some(expected) = doc.delivery_date.as_deref() {
            draw_text(cmds, bx + 10.0, 730.0, &format!("Livraison souh. : {}", format_date_french(expected)), 6.5, false, NAVY);
        }
        draw_line(cmds, MARGIN, 706.0, RIGHT, 706.0, ORANGE, 1.3);
    } else {
        draw_text(
            cmds,
            MARGIN,
            PAGE_H - 32.0,
            &format!("{} · {} {} · SUITE", company.company_name, title, doc.reference),
            9.0,
            true,
            NAVY,
        );
        draw_line(cmds, MARGIN, PAGE_H - 39.0, RIGHT, PAGE_H - 39.0, ORANGE, 1.0);
    }
}

fn draw_supplier_box(cmds: &mut Vec<String>, doc: &DocumentPdfInput) {
    let top = 698.0;
    let h = 64.0;
    draw_rect_fill_stroke(cmds, MARGIN, top - h, CONTENT_W, h, (1.0, 1.0, 1.0), BORDER, 0.7);
    draw_text(cmds, MARGIN + 10.0, top - 14.0, "INFORMATIONS FOURNISSEUR", 8.0, true, ORANGE);
    draw_line(cmds, MARGIN + 8.0, top - 19.0, RIGHT - 8.0, top - 19.0, BORDER, 0.5);
    draw_text(cmds, MARGIN + 10.0, top - 32.0, doc.party_name.as_deref().unwrap_or("—"), 8.5, true, NAVY);
    let details = doc.party_details.as_deref().unwrap_or("");
    let wrapped = wrap_text(details, CONTENT_W - 20.0, 7.0, false);
    for (i, line) in wrapped.iter().take(2).enumerate() {
        draw_text(cmds, MARGIN + 10.0, top - 44.0 - i as f64 * 10.0, line, 7.0, false, GRAY);
    }
}

fn draw_products_header(cmds: &mut Vec<String>, top: f64) {
    let y = top - 24.0;
    draw_rect_fill(cmds, MARGIN, y, CONTENT_W, 24.0, NAVY);
    let cols = [MARGIN, MARGIN + 24.0, MARGIN + 195.0, MARGIN + 335.0, MARGIN + 390.0, MARGIN + 455.0, RIGHT];
    for x in cols.iter().skip(1).take(5) {
        draw_line(cmds, *x, y, *x, top, (0.65, 0.68, 0.73), 0.5);
    }
    draw_text(cmds, MARGIN + 7.0, top - 15.0, "N°", 7.0, true, (1.0, 1.0, 1.0));
    draw_text(cmds, MARGIN + 29.0, top - 15.0, "DÉSIGNATION / PRODUIT", 6.5, true, (1.0, 1.0, 1.0));
    draw_text(cmds, MARGIN + 200.0, top - 15.0, "CONDITIONNEMENT & DÉTAILS", 6.5, true, (1.0, 1.0, 1.0));
    draw_text(cmds, MARGIN + 345.0, top - 15.0, "QTÉ", 6.5, true, (1.0, 1.0, 1.0));
    draw_text(cmds, MARGIN + 398.0, top - 15.0, "P.U. (FCFA)", 6.2, true, (1.0, 1.0, 1.0));
    draw_text(cmds, MARGIN + 462.0, top - 15.0, "TOTAL (FCFA)", 6.2, true, (1.0, 1.0, 1.0));
}

fn draw_product_row(cmds: &mut Vec<String>, row_top: f64, index: usize, line: &DocumentPdfLine) {
    let row_h = 26.0;
    let bottom = row_top - row_h;
    draw_rect_fill(cmds, MARGIN, bottom, CONTENT_W, row_h, if index % 2 == 0 { LIGHT } else { (1.0, 1.0, 1.0) });
    let cols = [MARGIN, MARGIN + 24.0, MARGIN + 195.0, MARGIN + 335.0, MARGIN + 390.0, MARGIN + 455.0, RIGHT];
    for x in cols.iter().skip(1).take(5) {
        draw_line(cmds, *x, bottom, *x, row_top, BORDER, 0.45);
    }
    draw_line(cmds, MARGIN, bottom, RIGHT, bottom, BORDER, 0.45);
    draw_text(cmds, MARGIN + 8.0, row_top - 15.0, &format!("{}", index + 1), 7.0, false, NAVY);
    let label = wrap_text(&line.label, 162.0, 6.8, true);
    if let Some(t) = label.first() {
        draw_text(cmds, MARGIN + 29.0, row_top - 11.0, t, 6.8, true, NAVY);
    }
    if let Some(t) = label.get(1) {
        draw_text(cmds, MARGIN + 29.0, row_top - 20.0, t, 6.0, false, GRAY);
    }
    let sub = line.sublabel.as_deref().unwrap_or("—");
    let subs = wrap_text(sub, 132.0, 5.6, false);
    if let Some(t) = subs.first() {
        draw_text(cmds, MARGIN + 200.0, row_top - 11.0, t, 5.6, false, GRAY);
    }
    if let Some(t) = subs.get(1) {
        draw_text(cmds, MARGIN + 200.0, row_top - 19.0, t, 5.4, false, GRAY);
    }
    draw_text_right(cmds, MARGIN + 385.0, row_top - 15.0, &line.quantity, 6.5, false, NAVY);
    draw_text_right(cmds, MARGIN + 450.0, row_top - 15.0, &line.unit_price.map(amount).unwrap_or_else(|| "—".to_string()), 6.5, false, NAVY);
    draw_text_right(cmds, RIGHT - 4.0, row_top - 15.0, &line.total.map(amount).unwrap_or_else(|| "—".to_string()), 6.5, true, NAVY);
}

pub fn render_supplier_document_pdf(company: &AppSettingsDto, doc: &DocumentPdfInput) -> Vec<u8> {
    let mut pages: Vec<Vec<String>> = Vec::new();
    let mut y = PAGE_H - MARGIN;
    let logo = doc.company_logo_jpeg.as_deref().and_then(decode_logo_jpeg);

    start_page(&mut pages, &mut y);
    {
        let cmds = pages.last_mut().unwrap();
        draw_header(cmds, company, doc, logo.as_ref(), true);
        draw_supplier_box(cmds, doc);
    }

    let mut table_top = 624.0;
    {
        let cmds = pages.last_mut().unwrap();
        draw_products_header(cmds, table_top);
    }
    let mut row_top = table_top - 24.0;

    for (idx, line) in doc.lines.iter().enumerate() {
        if row_top - 26.0 < 120.0 {
            start_page(&mut pages, &mut y);
            let cmds = pages.last_mut().unwrap();
            draw_header(cmds, company, doc, logo.as_ref(), false);
            table_top = PAGE_H - 52.0;
            draw_products_header(cmds, table_top);
            row_top = table_top - 24.0;
        }
        let cmds = pages.last_mut().unwrap();
        draw_product_row(cmds, row_top, idx, line);
        row_top -= 26.0;
    }

    let mut cur_y = row_top - 14.0;
    if !doc.packaging_lines.is_empty() {
        let needed = 30.0 + (doc.packaging_lines.len() as f64 * 16.0);
        if cur_y - needed < 110.0 {
            start_page(&mut pages, &mut y);
            let cmds = pages.last_mut().unwrap();
            draw_header(cmds, company, doc, logo.as_ref(), false);
            cur_y = PAGE_H - 56.0;
        }
        let cmds = pages.last_mut().unwrap();
        draw_text(cmds, MARGIN, cur_y, "EMBALLAGES & CONDITIONNEMENTS FOURNISSEUR", 7.5, true, ORANGE);
        draw_line(cmds, MARGIN, cur_y - 4.0, RIGHT, cur_y - 4.0, BORDER, 0.6);
        cur_y -= 18.0;
        for pkg in &doc.packaging_lines {
            let line = format!("• {} : {} prévu(s) — {}", pkg.label, pkg.expected_quantity, pkg.status_label);
            draw_text(cmds, MARGIN + 4.0, cur_y, &line, 6.5, false, NAVY);
            cur_y -= 14.0;
        }
        cur_y -= 8.0;
    }

    if cur_y < 125.0 {
        start_page(&mut pages, &mut y);
        let cmds = pages.last_mut().unwrap();
        draw_header(cmds, company, doc, logo.as_ref(), false);
        cur_y = PAGE_H - 56.0;
    }

    {
        let cmds = pages.last_mut().unwrap();
        let sum_x = MARGIN + 270.0;
        let sum_w = CONTENT_W - 270.0;
        let sum_h = (doc.summary_rows.len().max(1) as f64 * 16.0) + 10.0;
        draw_rect_fill_stroke(cmds, sum_x, cur_y - sum_h, sum_w, sum_h, (1.0, 1.0, 1.0), BORDER, 0.6);
        let mut sy = cur_y - 14.0;
        for row in &doc.summary_rows {
            draw_text(cmds, sum_x + 8.0, sy, &row.label, 7.0, row.bold, NAVY);
            draw_text_right(cmds, sum_x + sum_w - 8.0, sy, &row.value, 7.0, row.bold, NAVY);
            sy -= 16.0;
        }

        let disclaimer = if doc.doc_type == "BON DE RÉCEPTION" {
            "Document de réception fournisseur. Les quantités validées mettent à jour le stock physique."
        } else {
            "Document de commande fournisseur. La réception physique des produits est constatée séparément au moyen d'un bon de réception."
        };
        let disc_lines = wrap_text(disclaimer, 255.0, 6.2, false);
        let mut dy = cur_y - 10.0;
        for line in disc_lines {
            draw_text(cmds, MARGIN, dy, &line, 6.2, false, GRAY);
            dy -= 9.0;
        }
        if let Some(notes) = doc.notes.as_deref().filter(|n| !n.trim().is_empty()) {
            draw_text(cmds, MARGIN, dy - 6.0, &format!("Observations : {}", notes.trim()), 6.2, false, NAVY);
        }

        let sig_y = 64.0;
        draw_rect_fill_stroke(cmds, MARGIN, sig_y, 240.0, 38.0, (1.0, 1.0, 1.0), BORDER, 0.5);
        draw_text(cmds, MARGIN + 8.0, sig_y + 26.0, "Signature du sous-dépôt", 6.5, true, NAVY);
        draw_rect_fill_stroke(cmds, RIGHT - 240.0, sig_y, 240.0, 38.0, (1.0, 1.0, 1.0), BORDER, 0.5);
        draw_text(cmds, RIGHT - 232.0, sig_y + 26.0, "Acceptation / Visa fournisseur", 6.5, true, NAVY);
    }

    let total_pages = pages.len();
    for (idx, cmds) in pages.iter_mut().enumerate() {
        draw_line(cmds, MARGIN, 40.0, RIGHT, 40.0, BORDER, 0.6);
        draw_text(cmds, MARGIN, 28.0, &format!("{} · Document fournisseur DEPOTPRO", company.company_name), 7.0, false, GRAY);
        draw_text_right(cmds, RIGHT, 28.0, &format!("Réf. {} · Page {}/{}", doc.reference, idx + 1, total_pages), 7.0, false, GRAY);
    }

    assemble_pdf_bytes(&pages, logo.as_ref())
}
