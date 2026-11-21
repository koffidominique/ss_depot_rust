// ============================================================================
// En-tête société, référence document et bloc tiers PDF
// ============================================================================

use crate::application::reports::AppSettingsDto;

use super::encoding_and_layout::{format_date_french, measure_text_width, wrap_text};
use super::primitives::{
    draw_line, draw_rect_fill, draw_rect_fill_stroke, draw_table_header, draw_text,
    draw_text_right, CONTENT_W, MARGIN, RIGHT,
};
use super::DocumentPdfInput;

pub(crate) fn draw_header_and_party(
    cmds: &mut Vec<String>,
    y: &mut f64,
    company: &AppSettingsDto,
    company_name: &str,
    doc: &DocumentPdfInput,
) {
    let header_top = *y;

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
    draw_text(
        cmds,
        comp_x,
        comp_y,
        company_name,
        14.0,
        true,
        (0.063, 0.106, 0.2),
    );
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
        draw_text(
            cmds,
            comp_x,
            comp_y,
            &contact_parts.join(" · "),
            8.0,
            false,
            muted,
        );
        comp_y -= 10.5;
    }
    if let Some(ref email) = company.email {
        if !email.trim().is_empty() {
            draw_text(cmds, comp_x, comp_y, email.trim(), 8.0, false, muted);
            comp_y -= 10.5;
        }
    }

    let mut right_y = header_top - 10.0;
    draw_text_right(
        cmds,
        RIGHT,
        right_y,
        &doc.doc_type,
        9.5,
        true,
        (0.145, 0.388, 0.922),
    );
    right_y -= 15.0;
    draw_text_right(
        cmds,
        RIGHT,
        right_y,
        &doc.reference,
        12.5,
        true,
        (0.063, 0.106, 0.2),
    );
    right_y -= 12.0;
    draw_text_right(
        cmds,
        RIGHT,
        right_y,
        &format_date_french(&doc.date),
        8.5,
        false,
        muted,
    );
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

    *y = comp_y.min(right_y).min(header_top - 44.0) - 6.0;
    draw_line(cmds, MARGIN, *y, RIGHT, *y, (0.063, 0.106, 0.2), 1.6);
    *y -= 14.0;

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
                *y - box_h,
                CONTENT_W,
                box_h,
                (0.973, 0.98, 0.988),
                (0.886, 0.91, 0.941),
                0.75,
            );
            let title_w = measure_text_width(&ptitle, 8.5, true);
            draw_text(cmds, MARGIN + 10.0, *y - 14.0, &ptitle, 8.5, true, muted);
            draw_text(
                cmds,
                MARGIN + 10.0 + title_w,
                *y - 14.0,
                party_name.trim(),
                9.0,
                true,
                (0.094, 0.133, 0.188),
            );
            let mut dy = *y - 25.0;
            for dl in details_lines {
                draw_text(cmds, MARGIN + 10.0, dy, &dl, 8.0, false, muted);
                dy -= 10.0;
            }
            *y -= box_h + 12.0;
        }
    }

    draw_table_header(cmds, y);
}
