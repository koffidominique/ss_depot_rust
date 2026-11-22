// ============================================================================
// En-tête société, référence document et bloc tiers PDF
// ============================================================================

use crate::application::reports::AppSettingsDto;

use super::encoding_and_layout::{format_date_french, wrap_text};
use super::primitives::{
    draw_line, draw_logo_image, draw_rect_fill, draw_rect_fill_stroke, draw_table_header,
    draw_text, draw_text_right, PdfJpegImage, CONTENT_W, MARGIN, RIGHT,
};
use super::DocumentPdfInput;

pub(crate) fn draw_header_and_party(
    cmds: &mut Vec<String>,
    y: &mut f64,
    company: &AppSettingsDto,
    company_name: &str,
    doc: &DocumentPdfInput,
    logo: Option<&PdfJpegImage>,
) {
    let header_top = *y;

    let lx = MARGIN;
    let ly = header_top - 36.0;
    if let Some(image) = logo {
        let scale = 34.0 / f64::from(image.width.max(image.height));
        let image_width = f64::from(image.width) * scale;
        let image_height = f64::from(image.height) * scale;
        draw_logo_image(
            cmds,
            lx + (34.0 - image_width) / 2.0,
            ly + (34.0 - image_height) / 2.0,
            image_width,
            image_height,
        );
    } else {
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
    }

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
        let party_details = [
            doc.party_details.as_deref(),
            doc.party_phone.as_deref().filter(|phone| {
                !doc.party_details
                    .as_deref()
                    .unwrap_or("")
                    .contains(*phone)
            }),
        ]
        .into_iter()
        .flatten()
        .filter(|value| !value.trim().is_empty())
        .collect::<Vec<_>>()
        .join(" · ");
        if doc.secondary_party_title.is_some() {
            let gap = 10.0;
            let col_w = (CONTENT_W - gap) / 2.0;
            let secondary_name = doc
                .secondary_party_name
                .as_deref()
                .filter(|name| !name.trim().is_empty())
                .unwrap_or(company_name);
            let secondary_details = doc
                .secondary_party_details
                .as_deref()
                .filter(|details| !details.trim().is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| {
                    [
                        company.address.as_deref(),
                        company.city.as_deref(),
                        company.phone.as_deref(),
                    ]
                    .into_iter()
                    .flatten()
                    .filter(|value| !value.trim().is_empty())
                    .collect::<Vec<_>>()
                    .join(" · ")
                });
            let delivery = doc
                .delivery_date
                .as_deref()
                .map(|date| format!("Livraison prévue : {}", format_date_french(date)));
            let left_lines = wrap_text(&party_details, col_w - 20.0, 7.5, false);
            let right_text = [Some(secondary_details.as_str()), delivery.as_deref()]
                .into_iter()
                .flatten()
                .collect::<Vec<_>>()
                .join(" · ");
            let right_lines = wrap_text(&right_text, col_w - 20.0, 7.5, false);
            let box_h = 39.0 + left_lines.len().max(right_lines.len()) as f64 * 9.0;
            for (x, title, name, lines) in [
                (
                    MARGIN,
                    doc.party_title.as_deref().unwrap_or("Tiers"),
                    party_name.as_str(),
                    left_lines,
                ),
                (
                    MARGIN + col_w + gap,
                    doc.secondary_party_title
                        .as_deref()
                        .unwrap_or("Destinataire"),
                    secondary_name,
                    right_lines,
                ),
            ] {
                draw_rect_fill_stroke(
                    cmds,
                    x,
                    *y - box_h,
                    col_w,
                    box_h,
                    (1.0, 1.0, 1.0),
                    (0.0, 0.0, 0.0),
                    0.75,
                );
                draw_rect_fill(cmds, x, *y - 17.0, col_w, 17.0, (0.0, 0.0, 0.0));
                draw_text(cmds, x + 8.0, *y - 12.0, title, 8.0, true, (1.0, 1.0, 1.0));
                draw_text(
                    cmds,
                    x + 8.0,
                    *y - 29.0,
                    name,
                    8.5,
                    true,
                    (0.094, 0.133, 0.188),
                );
                let mut dy = *y - 39.0;
                for line in lines {
                    draw_text(cmds, x + 8.0, dy, &line, 7.5, false, muted);
                    dy -= 9.0;
                }
            }
            *y -= box_h + 12.0;
        } else if !party_name.trim().is_empty() {
            let details_lines = wrap_text(&party_details, CONTENT_W - 20.0, 8.0, false);
            let box_h = 38.0 + details_lines.len() as f64 * 10.0;
            draw_rect_fill_stroke(cmds, MARGIN, *y - box_h, CONTENT_W, box_h, (0.973, 0.98, 0.988), (0.886, 0.91, 0.941), 0.75);
            draw_text(cmds, MARGIN + 10.0, *y - 14.0, doc.party_title.as_deref().unwrap_or("Tiers"), 8.5, true, muted);
            draw_text(cmds, MARGIN + 10.0, *y - 27.0, party_name.trim(), 9.0, true, (0.094, 0.133, 0.188));
            let mut dy = *y - 38.0;
            for line in details_lines {
                draw_text(cmds, MARGIN + 10.0, dy, &line, 8.0, false, muted);
                dy -= 10.0;
            }
            *y -= box_h + 12.0;
        }
    }

    draw_table_header(cmds, y);
}
