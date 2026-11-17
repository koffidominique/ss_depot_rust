use serde::Deserialize;

use crate::application::reports::{get_settings, AppSettingsDto};
use crate::error::{CoreError, CoreResult};
use crate::infrastructure::db::DepotDb;

const VALID_DOC_TYPES: &[&str] = &[
    "FACTURE",
    "REÇU DE VENTE",
    "AVOIR CLIENT",
    "BON DE COMMANDE",
    "BON DE RÉCEPTION",
    "REÇU RETOUR EMBALLAGES",
    "RAPPORT DE CAISSE",
    "ÉTAT DES CRÉANCES CLIENTS",
    "RAPPORT DE STOCK & VALORISATION",
    "BILAN COMMERCIAL & FINANCES",
    "ÉTAT DES DETTES FOURNISSEURS",
    "ÉTAT DES CONSIGNATIONS",
];

// Largeurs AFM standard Helvetica (en millièmes d'em) pour ASCII 32..126
const HELVETICA_WIDTHS: [u16; 95] = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
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
    pub notes: Option<String>,
}

fn to_winansi_bytes(input: &str) -> Vec<u8> {
    let normalized = input
        .replace('→', "->")
        .replace('←', "<-")
        .replace('≥', ">=")
        .replace('≤', "<=");
    let mut out = Vec::with_capacity(normalized.len());
    for ch in normalized.chars() {
        let code = ch as u32;
        match ch {
            '\u{00A0}' | '\u{202F}' | '\u{2009}' => out.push(0x20),
            '€' => out.push(0x80),
            '…' => out.push(0x85),
            '‘' => out.push(0x91),
            '’' => out.push(0x92),
            '“' => out.push(0x93),
            '”' => out.push(0x94),
            '•' => out.push(0x95),
            '–' => out.push(0x96),
            '—' => out.push(0x97),
            'Œ' => out.push(0x8C),
            'œ' => out.push(0x9C),
            _ if (0x20..=0x7E).contains(&code) => out.push(code as u8),
            _ if (0xA0..=0xFF).contains(&code) => out.push(code as u8),
            _ => out.push(b'?'),
        }
    }
    out
}

fn pdf_string_literal(input: &str) -> String {
    let bytes = to_winansi_bytes(input);
    let mut res = String::with_capacity(bytes.len() + 4);
    res.push('(');
    for b in bytes {
        match b {
            b'(' | b')' | b'\\' => {
                res.push('\\');
                res.push(b as char);
            }
            0x00..=0x1F | 0x7F..=0xFF => {
                res.push_str(&format!("\\{:03o}", b));
            }
            _ => res.push(b as char),
        }
    }
    res.push(')');
    res
}

fn measure_text_width(text: &str, font_size: f64, bold: bool) -> f64 {
    let bytes = to_winansi_bytes(text);
    let mut units: u64 = 0;
    for b in bytes {
        if (32..=126).contains(&b) {
            units += HELVETICA_WIDTHS[(b - 32) as usize] as u64;
        } else if b == 0x20 || b == 0xA0 || b == 0xB7 {
            units += 278;
        } else if b == 0x97 {
            units += 1000;
        } else {
            units += 556;
        }
    }
    let scale = if bold { 1.05 } else { 1.0 };
    (units as f64 * font_size * scale) / 1000.0
}

fn wrap_text(text: &str, max_width: f64, font_size: f64, bold: bool) -> Vec<String> {
    let clean = text.trim();
    if clean.is_empty() {
        return Vec::new();
    }
    let mut lines = Vec::new();
    for para in clean.lines() {
        let words: Vec<&str> = para.split_whitespace().collect();
        if words.is_empty() {
            lines.push(String::new());
            continue;
        }
        let mut current = String::new();
        for word in words {
            let candidate = if current.is_empty() {
                word.to_string()
            } else {
                format!("{current} {word}")
            };
            if measure_text_width(&candidate, font_size, bold) <= max_width {
                current = candidate;
            } else {
                if !current.is_empty() {
                    lines.push(current);
                }
                if measure_text_width(word, font_size, bold) <= max_width {
                    current = word.to_string();
                } else {
                    let mut chunk = String::new();
                    for ch in word.chars() {
                        let mut test = chunk.clone();
                        test.push(ch);
                        if measure_text_width(&test, font_size, bold) > max_width && !chunk.is_empty() {
                            lines.push(chunk);
                            chunk = ch.to_string();
                        } else {
                            chunk.push(ch);
                        }
                    }
                    current = chunk;
                }
            }
        }
        if !current.is_empty() {
            lines.push(current);
        }
    }
    lines
}

fn format_fcfa_ascii(amount: i64) -> String {
    let abs = amount.unsigned_abs().to_string();
    let mut grouped = String::with_capacity(abs.len() + 4);
    for (i, ch) in abs.chars().enumerate() {
        if i > 0 && (abs.len() - i).is_multiple_of(3) {
            grouped.push(' ');
        }
        grouped.push(ch);
    }
    if amount < 0 {
        format!("-{grouped} FCFA")
    } else {
        format!("{grouped} FCFA")
    }
}

fn format_date_french(iso: &str) -> String {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(iso) {
        return dt.format("%d/%m/%Y %H:%M").to_string();
    }
    if let Ok(naive_dt) = chrono::NaiveDateTime::parse_from_str(iso, "%Y-%m-%d %H:%M:%S") {
        return naive_dt.format("%d/%m/%Y %H:%M").to_string();
    }
    if let Ok(naive_d) = chrono::NaiveDate::parse_from_str(iso, "%Y-%m-%d") {
        return naive_d.format("%d/%m/%Y").to_string();
    }
    iso.to_string()
}

pub fn render_document_pdf(company: &AppSettingsDto, doc: &DocumentPdfInput) -> Vec<u8> {
    const PAGE_W: f64 = 595.0;
    const PAGE_H: f64 = 842.0;
    const MARGIN: f64 = 40.0;
    const RIGHT: f64 = PAGE_W - MARGIN;
    const CONTENT_W: f64 = RIGHT - MARGIN;

    let mut pages: Vec<Vec<String>> = Vec::new();
    let mut y: f64 = PAGE_H - MARGIN;

    let start_page = |pages: &mut Vec<Vec<String>>, y: &mut f64| {
        pages.push(Vec::new());
        *y = PAGE_H - MARGIN;
    };

    let draw_text = |cmds: &mut Vec<String>,
                     x: f64,
                     ty: f64,
                     text: &str,
                     size: f64,
                     bold: bool,
                     rgb: (f64, f64, f64)| {
        if text.is_empty() {
            return;
        }
        let font = if bold { "F2" } else { "F1" };
        cmds.push(format!(
            "BT /{font} {size:.1} Tf {:.3} {:.3} {:.3} rg 1 0 0 1 {x:.2} {ty:.2} Tm {} Tj ET",
            rgb.0,
            rgb.1,
            rgb.2,
            pdf_string_literal(text)
        ));
    };

    let draw_text_right = |cmds: &mut Vec<String>,
                           right_x: f64,
                           ty: f64,
                           text: &str,
                           size: f64,
                           bold: bool,
                           rgb: (f64, f64, f64)| {
        let w = measure_text_width(text, size, bold);
        draw_text(cmds, right_x - w, ty, text, size, bold, rgb);
    };

    let draw_rect_fill =
        |cmds: &mut Vec<String>, x: f64, ry: f64, w: f64, h: f64, rgb: (f64, f64, f64)| {
            cmds.push(format!(
                "q {:.3} {:.3} {:.3} rg {x:.2} {ry:.2} {w:.2} {h:.2} re f Q",
                rgb.0, rgb.1, rgb.2
            ));
        };

    let draw_rect_fill_stroke = |cmds: &mut Vec<String>,
                                 x: f64,
                                 ry: f64,
                                 w: f64,
                                 h: f64,
                                 fill: (f64, f64, f64),
                                 stroke: (f64, f64, f64),
                                 lw: f64| {
        cmds.push(format!(
            "q {lw:.2} w {:.3} {:.3} {:.3} rg {:.3} {:.3} {:.3} RG {x:.2} {ry:.2} {w:.2} {h:.2} re B Q",
            fill.0, fill.1, fill.2, stroke.0, stroke.1, stroke.2
        ));
    };

    let draw_line = |cmds: &mut Vec<String>,
                     x1: f64,
                     y1: f64,
                     x2: f64,
                     y2: f64,
                     stroke: (f64, f64, f64),
                     lw: f64| {
        cmds.push(format!(
            "q {lw:.2} w {:.3} {:.3} {:.3} RG {x1:.2} {y1:.2} m {x2:.2} {y2:.2} l S Q",
            stroke.0, stroke.1, stroke.2
        ));
    };

    let draw_table_header = |cmds: &mut Vec<String>, y: &mut f64| {
        draw_rect_fill(cmds, MARGIN, *y - 20.0, CONTENT_W, 20.0, (0.945, 0.961, 0.976));
        draw_line(
            cmds,
            MARGIN,
            *y - 20.0,
            RIGHT,
            *y - 20.0,
            (0.796, 0.835, 0.882),
            0.9,
        );
        let muted = (0.4, 0.439, 0.522);
        draw_text(cmds, MARGIN + 6.0, *y - 13.5, "Désignation", 8.5, true, muted);
        draw_text_right(cmds, MARGIN + 345.0, *y - 13.5, "Quantité", 8.5, true, muted);
        draw_text_right(cmds, MARGIN + 425.0, *y - 13.5, "P.U.", 8.5, true, muted);
        draw_text_right(cmds, RIGHT - 6.0, *y - 13.5, "Montant", 8.5, true, muted);
        *y -= 24.0;
    };

    let company_name = if company.company_name.trim().is_empty() {
        "DEPOTPRO"
    } else {
        company.company_name.trim()
    };

    start_page(&mut pages, &mut y);
    {
        let cmds = pages.last_mut().unwrap();
        let header_top = y;

        // Vector logo
        let lx = MARGIN;
        let ly = header_top - 36.0;
        draw_rect_fill(cmds, lx, ly, 34.0, 34.0, (0.063, 0.106, 0.2));
        cmds.push("q 2.2 w 1 J 0.376 0.647 0.980 RG".to_string());
        cmds.push(format!(
            "{:.2} {:.2} m {:.2} {:.2} l S",
            lx + 8.5,
            ly + 22.5,
            lx + 25.5,
            ly + 22.5
        ));
        cmds.push(format!(
            "{:.2} {:.2} m {:.2} {:.2} l S",
            lx + 8.5,
            ly + 17.0,
            lx + 25.5,
            ly + 17.0
        ));
        cmds.push(format!(
            "{:.2} {:.2} m {:.2} {:.2} l S Q",
            lx + 8.5,
            ly + 11.5,
            lx + 18.0,
            ly + 11.5
        ));
        draw_rect_fill(cmds, lx + 21.5, ly + 9.0, 5.0, 5.0, (0.145, 0.388, 0.922));

        let comp_x = MARGIN + 44.0;
        let mut comp_y = header_top - 11.0;
        draw_text(cmds, comp_x, comp_y, company_name, 14.0, true, (0.063, 0.106, 0.2));
        comp_y -= 12.0;

        let muted = (0.4, 0.439, 0.522);
        if let Some(ref legal) = company.company_legal_name {
            if !legal.trim().is_empty() {
                draw_text(cmds, comp_x, comp_y, legal.trim(), 8.0, false, muted);
                comp_y -= 10.5;
            }
        }
        if let Some(ref addr) = company.address {
            if !addr.trim().is_empty() {
                draw_text(cmds, comp_x, comp_y, addr.trim(), 8.0, false, muted);
                comp_y -= 10.5;
            }
        }
        let city_country: Vec<&str> = [company.city.as_deref(), company.country.as_deref()]
            .into_iter()
            .flatten()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .collect();
        let mut contact_parts = Vec::new();
        if !city_country.is_empty() {
            contact_parts.push(city_country.join(", "));
        }
        if let Some(ref phone) = company.phone {
            if !phone.trim().is_empty() {
                contact_parts.push(format!("Tél : {}", phone.trim()));
            }
        }
        if !contact_parts.is_empty() {
            draw_text(cmds, comp_x, comp_y, &contact_parts.join(" · "), 8.0, false, muted);
            comp_y -= 10.5;
        }
        if let Some(ref email) = company.email {
            if !email.trim().is_empty() {
                draw_text(cmds, comp_x, comp_y, email.trim(), 8.0, false, muted);
                comp_y -= 10.5;
            }
        }

        let mut right_y = header_top - 10.0;
        draw_text_right(cmds, RIGHT, right_y, &doc.doc_type, 9.5, true, (0.145, 0.388, 0.922));
        right_y -= 15.0;
        draw_text_right(cmds, RIGHT, right_y, &doc.reference, 12.5, true, (0.063, 0.106, 0.2));
        right_y -= 12.0;
        draw_text_right(cmds, RIGHT, right_y, &format_date_french(&doc.date), 8.5, false, muted);
        right_y -= 11.0;
        if let Some(ref status) = doc.status_label {
            if !status.trim().is_empty() {
                draw_text_right(
                    cmds,
                    RIGHT,
                    right_y,
                    &format!("Statut : {}", status.trim()),
                    8.5,
                    true,
                    (0.094, 0.133, 0.188),
                );
                right_y -= 11.0;
            }
        }

        y = comp_y.min(right_y).min(header_top - 44.0) - 6.0;
        draw_line(cmds, MARGIN, y, RIGHT, y, (0.063, 0.106, 0.2), 1.6);
        y -= 14.0;

        if let Some(ref party_name) = doc.party_name {
            if !party_name.trim().is_empty() {
                let ptitle = format!(
                    "{} : ",
                    doc.party_title
                        .as_deref()
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                        .unwrap_or("Tiers")
                );
                let details_lines = doc
                    .party_details
                    .as_deref()
                    .map(|d| wrap_text(d, CONTENT_W - 20.0, 8.0, false))
                    .unwrap_or_default();
                let box_h = 22.0 + details_lines.len() as f64 * 10.0;
                draw_rect_fill_stroke(
                    cmds,
                    MARGIN,
                    y - box_h,
                    CONTENT_W,
                    box_h,
                    (0.973, 0.98, 0.988),
                    (0.886, 0.91, 0.941),
                    0.75,
                );
                let title_w = measure_text_width(&ptitle, 8.5, true);
                draw_text(cmds, MARGIN + 10.0, y - 14.0, &ptitle, 8.5, true, muted);
                draw_text(
                    cmds,
                    MARGIN + 10.0 + title_w,
                    y - 14.0,
                    party_name.trim(),
                    9.0,
                    true,
                    (0.094, 0.133, 0.188),
                );
                let mut dy = y - 25.0;
                for dl in details_lines {
                    draw_text(cmds, MARGIN + 10.0, dy, &dl, 8.0, false, muted);
                    dy -= 10.0;
                }
                y -= box_h + 12.0;
            }
        }

        draw_table_header(cmds, &mut y);
    }

    let fallback_lines = vec![DocumentPdfLine {
        label: "Aucune ligne".to_string(),
        sublabel: None,
        quantity: "—".to_string(),
        unit_price: None,
        total: None,
    }];
    let rows = if doc.lines.is_empty() {
        &fallback_lines
    } else {
        &doc.lines
    };

    for line in rows {
        let label_lines = wrap_text(&line.label, 250.0, 8.5, true);
        let sub_lines = line
            .sublabel
            .as_deref()
            .map(|s| wrap_text(s, 250.0, 7.5, false))
            .unwrap_or_default();
        let row_h = (8.0 + label_lines.len() as f64 * 10.5 + sub_lines.len() as f64 * 9.5).max(20.0);

        if y - row_h < 72.0 {
            start_page(&mut pages, &mut y);
            let cmds = pages.last_mut().unwrap();
            draw_text(
                cmds,
                MARGIN,
                y - 10.0,
                &format!("{company_name} · {} ({}) — Suite", doc.doc_type, doc.reference),
                9.0,
                true,
                (0.063, 0.106, 0.2),
            );
            y -= 20.0;
            draw_line(cmds, MARGIN, y, RIGHT, y, (0.886, 0.91, 0.941), 0.8);
            y -= 10.0;
            draw_table_header(cmds, &mut y);
        }

        let cmds = pages.last_mut().unwrap();
        let mut ly = y - 11.0;
        for ll in &label_lines {
            draw_text(cmds, MARGIN + 6.0, ly, ll, 8.5, true, (0.094, 0.133, 0.188));
            ly -= 10.5;
        }
        for sl in &sub_lines {
            draw_text(cmds, MARGIN + 6.0, ly, sl, 7.5, false, (0.4, 0.439, 0.522));
            ly -= 9.5;
        }

        let qty_txt = if line.quantity.is_empty() {
            "—"
        } else {
            line.quantity.as_str()
        };
        draw_text_right(cmds, MARGIN + 345.0, y - 11.0, qty_txt, 8.5, false, (0.094, 0.133, 0.188));
        let unit_str = line
            .unit_price
            .map(format_fcfa_ascii)
            .unwrap_or_else(|| "—".to_string());
        draw_text_right(cmds, MARGIN + 425.0, y - 11.0, &unit_str, 8.5, false, (0.094, 0.133, 0.188));
        let tot_str = line
            .total
            .map(format_fcfa_ascii)
            .unwrap_or_else(|| "—".to_string());
        draw_text_right(cmds, RIGHT - 6.0, y - 11.0, &tot_str, 8.5, true, (0.094, 0.133, 0.188));

        y -= row_h;
        draw_line(cmds, MARGIN, y, RIGHT, y, (0.91, 0.933, 0.957), 0.6);
    }

    y -= 14.0;

    let note_lines = doc
        .notes
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|n| wrap_text(&format!("Observation : {n}"), 230.0, 8.0, false))
        .unwrap_or_default();
    let pay_count = doc.payments.as_ref().map(|p| p.len()).unwrap_or(0);
    let left_h = (if pay_count > 0 {
        24.0 + pay_count as f64 * 12.0 + 8.0
    } else {
        0.0
    }) + (if !note_lines.is_empty() {
        14.0 + note_lines.len() as f64 * 10.0 + 8.0
    } else {
        0.0
    });
    let right_h = (16.0 + doc.summary_rows.len() as f64 * 15.0).max(32.0);
    let section_h = left_h.max(right_h);

    if y - section_h < 64.0 {
        start_page(&mut pages, &mut y);
        let cmds = pages.last_mut().unwrap();
        draw_text(
            cmds,
            MARGIN,
            y - 10.0,
            &format!("{company_name} · {} ({}) — Récapitulatif", doc.doc_type, doc.reference),
            9.0,
            true,
            (0.063, 0.106, 0.2),
        );
        y -= 24.0;
    }

    let cmds = pages.last_mut().unwrap();
    let mut left_y = y;
    if let Some(ref payments) = doc.payments {
        if !payments.is_empty() {
            let p_box_h = 22.0 + payments.len() as f64 * 12.0;
            draw_rect_fill_stroke(
                cmds,
                MARGIN,
                left_y - p_box_h,
                248.0,
                p_box_h,
                (1.0, 1.0, 1.0),
                (0.886, 0.91, 0.941),
                0.75,
            );
            draw_text(
                cmds,
                MARGIN + 10.0,
                left_y - 13.0,
                "Ventilation des règlements",
                8.5,
                true,
                (0.063, 0.106, 0.2),
            );
            let mut py = left_y - 26.0;
            for p in payments {
                draw_text(cmds, MARGIN + 10.0, py, &p.label, 8.0, false, (0.4, 0.439, 0.522));
                draw_text_right(
                    cmds,
                    MARGIN + 238.0,
                    py,
                    &format_fcfa_ascii(p.amount),
                    8.0,
                    true,
                    (0.094, 0.133, 0.188),
                );
                py -= 12.0;
            }
            left_y -= p_box_h + 8.0;
        }
    }

    if !note_lines.is_empty() {
        let n_box_h = 12.0 + note_lines.len() as f64 * 10.0;
        draw_rect_fill_stroke(
            cmds,
            MARGIN,
            left_y - n_box_h,
            248.0,
            n_box_h,
            (1.0, 1.0, 1.0),
            (0.886, 0.91, 0.941),
            0.75,
        );
        let mut ny = left_y - 13.0;
        for nl in &note_lines {
            draw_text(cmds, MARGIN + 10.0, ny, nl, 8.0, false, (0.4, 0.439, 0.522));
            ny -= 10.0;
        }
    }

    if !doc.summary_rows.is_empty() {
        let sum_x = MARGIN + 266.0;
        let sum_w = CONTENT_W - 266.0;
        draw_rect_fill_stroke(
            cmds,
            sum_x,
            y - right_h,
            sum_w,
            right_h,
            (0.973, 0.98, 0.988),
            (0.796, 0.835, 0.882),
            0.85,
        );
        let mut sy = y - 15.0;
        for (i, sr) in doc.summary_rows.iter().enumerate() {
            if sr.bold && i > 0 {
                draw_line(
                    cmds,
                    sum_x + 8.0,
                    sy + 10.0,
                    sum_x + sum_w - 8.0,
                    sy + 10.0,
                    (0.796, 0.835, 0.882),
                    0.75,
                );
            }
            let tone = match sr.tone.as_deref() {
                Some("success") => (0.086, 0.639, 0.416),
                Some("warning") => (0.851, 0.565, 0.102),
                Some("danger") => (0.863, 0.271, 0.271),
                _ => (0.094, 0.133, 0.188),
            };
            let f_size = if sr.bold { 9.5 } else { 8.5 };
            draw_text(cmds, sum_x + 10.0, sy, &sr.label, f_size, sr.bold, tone);
            draw_text_right(cmds, sum_x + sum_w - 10.0, sy, &sr.value, f_size, sr.bold, tone);
            sy -= 15.0;
        }
    }

    let total_pages = pages.len();
    for (idx, cmds) in pages.iter_mut().enumerate() {
        draw_line(cmds, MARGIN, 44.0, RIGHT, 44.0, (0.886, 0.91, 0.941), 0.75);
        draw_text(
            cmds,
            MARGIN,
            31.0,
            &format!("{company_name} · Document généré localement sans recalcul rétroactif"),
            7.5,
            false,
            (0.4, 0.439, 0.522),
        );
        draw_text_right(
            cmds,
            RIGHT,
            31.0,
            &format!("Réf. {} · Page {}/{}", doc.reference, idx + 1, total_pages),
            7.5,
            false,
            (0.4, 0.439, 0.522),
        );
    }

    let mut objects: Vec<String> = Vec::with_capacity(4 + pages.len() * 2);
    objects.push("<< /Type /Catalog /Pages 2 0 R >>".to_string());
    objects.push(String::new());
    objects.push(
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
            .to_string(),
    );
    objects.push(
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
            .to_string(),
    );

    let mut page_obj_ids = Vec::with_capacity(pages.len());
    for page_cmds in &pages {
        let stream_data = page_cmds.join("\n");
        let content_obj_id = objects.len() + 1;
        objects.push(format!(
            "<< /Length {} >>\nstream\n{stream_data}\nendstream",
            stream_data.len()
        ));
        let page_obj_id = objects.len() + 1;
        page_obj_ids.push(page_obj_id);
        objects.push(format!(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_W:.0} {PAGE_H:.0}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {content_obj_id} 0 R >>"
        ));
    }

    let kids: Vec<String> = page_obj_ids.iter().map(|id| format!("{id} 0 R")).collect();
    objects[1] = format!(
        "<< /Type /Pages /Kids [{}] /Count {} >>",
        kids.join(" "),
        page_obj_ids.len()
    );

    let mut out = Vec::with_capacity(8192);
    out.extend_from_slice(b"%PDF-1.4\n");
    let mut offsets = Vec::with_capacity(objects.len() + 1);
    offsets.push(0usize);

    for (idx, obj) in objects.iter().enumerate() {
        offsets.push(out.len());
        out.extend_from_slice(format!("{} 0 obj\n{obj}\nendobj\n", idx + 1).as_bytes());
    }

    let xref_offset = out.len();
    out.extend_from_slice(
        format!("xref\n0 {}\n0000000000 65535 f \n", objects.len() + 1).as_bytes(),
    );
    for off in offsets.iter().skip(1) {
        out.extend_from_slice(format!("{off:010} 00000 n \n").as_bytes());
    }
    out.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n",
            objects.len() + 1
        )
        .as_bytes(),
    );

    out
}

pub async fn generate_document_pdf(
    db: &DepotDb,
    input: DocumentPdfInput,
) -> CoreResult<(String, Vec<u8>)> {
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
                    summary_rows: vec![
                        DocumentPdfSummaryRow {
                            label: "Total TTC".to_string(),
                            value: "1 350 000 FCFA".to_string(),
                            bold: true,
                            tone: Some("success".to_string()),
                        },
                    ],
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
        }
    }
}
