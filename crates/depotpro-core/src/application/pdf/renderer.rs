// ============================================================================
// Orchestration du rendu PDF multipage (en-tête, lignes, récapitulatif)
// ============================================================================

use crate::application::reports::AppSettingsDto;

use super::encoding_and_layout::{format_fcfa_ascii, wrap_text};
use super::header_section::draw_header_and_party;
use super::primitives::{
    assemble_pdf_bytes, draw_line, draw_table_header, draw_text, draw_text_right, start_page,
    MARGIN, PAGE_H, RIGHT,
};
use super::summary_section::draw_summary_section;
use super::{DocumentPdfInput, DocumentPdfLine};

pub fn render_document_pdf(company: &AppSettingsDto, doc: &DocumentPdfInput) -> Vec<u8> {
    let mut pages: Vec<Vec<String>> = Vec::new();
    let mut y: f64 = PAGE_H - MARGIN;

    let company_name = if company.company_name.trim().is_empty() {
        "DEPOTPRO"
    } else {
        company.company_name.trim()
    };

    start_page(&mut pages, &mut y);
    {
        let cmds = pages.last_mut().unwrap();
        draw_header_and_party(cmds, &mut y, company, company_name, doc);
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
        let row_h =
            (8.0 + label_lines.len() as f64 * 10.5 + sub_lines.len() as f64 * 9.5).max(20.0);

        if y - row_h < 72.0 {
            start_page(&mut pages, &mut y);
            let cmds = pages.last_mut().unwrap();
            draw_text(
                cmds,
                MARGIN,
                y - 10.0,
                &format!(
                    "{company_name} · {} ({}) — Suite",
                    doc.doc_type, doc.reference
                ),
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
        draw_text_right(
            cmds,
            MARGIN + 345.0,
            y - 11.0,
            qty_txt,
            8.5,
            false,
            (0.094, 0.133, 0.188),
        );
        let unit_str = line
            .unit_price
            .map(format_fcfa_ascii)
            .unwrap_or_else(|| "—".to_string());
        draw_text_right(
            cmds,
            MARGIN + 425.0,
            y - 11.0,
            &unit_str,
            8.5,
            false,
            (0.094, 0.133, 0.188),
        );
        let tot_str = line
            .total
            .map(format_fcfa_ascii)
            .unwrap_or_else(|| "—".to_string());
        draw_text_right(
            cmds,
            RIGHT - 6.0,
            y - 11.0,
            &tot_str,
            8.5,
            true,
            (0.094, 0.133, 0.188),
        );

        y -= row_h;
        draw_line(cmds, MARGIN, y, RIGHT, y, (0.91, 0.933, 0.957), 0.6);
    }


    if !doc.packaging_rows.is_empty() {
        if y - 30.0 < 64.0 {
            start_page(&mut pages, &mut y);
            let cmds = pages.last_mut().unwrap();
            draw_text(
                cmds,
                MARGIN,
                y - 10.0,
                &format!("{} · {} — Emballages (suite)", company_name, doc.reference),
                9.0,
                true,
                (0.063, 0.106, 0.2),
            );
            y -= 24.0;
        }
        {
            let cmds = pages.last_mut().unwrap();
            draw_text(
                cmds,
                MARGIN,
                y - 8.0,
                "Emballages et casiers affectés",
                9.0,
                true,
                (0.063, 0.106, 0.2),
            );
            y -= 18.0;
        }

        for packaging in &doc.packaging_rows {
            let deposit_status = if packaging.is_consigned {
                "Consigné"
            } else {
                "Non consigné"
            };
            let mut details = format!(
                "{} · capacité {} · quantité {} · {} · consigne {} · retournés {}",
                packaging.label,
                packaging.capacity,
                packaging.quantity,
                deposit_status,
                format_fcfa_ascii(packaging.deposit_total),
                packaging.returned_quantity
            );
            if let Some(provider) = packaging.provided_by.as_deref() {
                if !provider.trim().is_empty() {
                    details.push_str(&format!(" · fourni par {}", provider.trim()));
                }
            }
            let text_lines = wrap_text(&details, 460.0, 7.5, false);
            let row_h = (8.0 + text_lines.len() as f64 * 9.0).max(18.0);
            if y - row_h < 64.0 {
                start_page(&mut pages, &mut y);
                let cmds = pages.last_mut().unwrap();
                draw_text(
                    cmds,
                    MARGIN,
                    y - 10.0,
                    &format!("{} · {} — Emballages (suite)", company_name, doc.reference),
                    9.0,
                    true,
                    (0.063, 0.106, 0.2),
                );
                y -= 24.0;
            }
            let cmds = pages.last_mut().unwrap();
            let mut text_y = y - 10.0;
            for line in &text_lines {
                draw_text(
                    cmds,
                    MARGIN + 6.0,
                    text_y,
                    line,
                    7.5,
                    false,
                    (0.094, 0.133, 0.188),
                );
                text_y -= 9.0;
            }
            y -= row_h;
            draw_line(cmds, MARGIN, y, RIGHT, y, (0.91, 0.933, 0.957), 0.6);
        }
        y -= 8.0;
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
            &format!(
                "{company_name} · {} ({}) — Récapitulatif",
                doc.doc_type, doc.reference
            ),
            9.0,
            true,
            (0.063, 0.106, 0.2),
        );
        y -= 24.0;
    }

    {
        let cmds = pages.last_mut().unwrap();
        draw_summary_section(cmds, y, doc, &note_lines, right_h);
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

    assemble_pdf_bytes(&pages)
}
