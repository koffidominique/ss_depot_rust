// ============================================================================
// Primitives vectorielles PDF 1.4 & assemblage des objets et table xref
// ============================================================================

use super::encoding_and_layout::{measure_text_width, pdf_string_literal};

pub(crate) const PAGE_W: f64 = 595.0;
pub(crate) const PAGE_H: f64 = 842.0;
pub(crate) const MARGIN: f64 = 40.0;
pub(crate) const RIGHT: f64 = PAGE_W - MARGIN;
pub(crate) const CONTENT_W: f64 = RIGHT - MARGIN;

pub(crate) fn start_page(pages: &mut Vec<Vec<String>>, y: &mut f64) {
    pages.push(Vec::new());
    *y = PAGE_H - MARGIN;
}

pub(crate) fn draw_text(
    cmds: &mut Vec<String>,
    x: f64,
    ty: f64,
    text: &str,
    size: f64,
    bold: bool,
    rgb: (f64, f64, f64),
) {
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
}

pub(crate) fn draw_text_right(
    cmds: &mut Vec<String>,
    right_x: f64,
    ty: f64,
    text: &str,
    size: f64,
    bold: bool,
    rgb: (f64, f64, f64),
) {
    let w = measure_text_width(text, size, bold);
    draw_text(cmds, right_x - w, ty, text, size, bold, rgb);
}

pub(crate) fn draw_rect_fill(
    cmds: &mut Vec<String>,
    x: f64,
    ry: f64,
    w: f64,
    h: f64,
    rgb: (f64, f64, f64),
) {
    cmds.push(format!(
        "q {:.3} {:.3} {:.3} rg {x:.2} {ry:.2} {w:.2} {h:.2} re f Q",
        rgb.0, rgb.1, rgb.2
    ));
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn draw_rect_fill_stroke(
    cmds: &mut Vec<String>,
    x: f64,
    ry: f64,
    w: f64,
    h: f64,
    fill: (f64, f64, f64),
    stroke: (f64, f64, f64),
    lw: f64,
) {
    cmds.push(format!(
        "q {lw:.2} w {:.3} {:.3} {:.3} rg {:.3} {:.3} {:.3} RG {x:.2} {ry:.2} {w:.2} {h:.2} re B Q",
        fill.0, fill.1, fill.2, stroke.0, stroke.1, stroke.2
    ));
}

pub(crate) fn draw_line(
    cmds: &mut Vec<String>,
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
    stroke: (f64, f64, f64),
    lw: f64,
) {
    cmds.push(format!(
        "q {lw:.2} w {:.3} {:.3} {:.3} RG {x1:.2} {y1:.2} m {x2:.2} {y2:.2} l S Q",
        stroke.0, stroke.1, stroke.2
    ));
}

pub(crate) fn draw_table_header(cmds: &mut Vec<String>, y: &mut f64) {
    draw_rect_fill(
        cmds,
        MARGIN,
        *y - 20.0,
        CONTENT_W,
        20.0,
        (0.945, 0.961, 0.976),
    );
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
    draw_text(
        cmds,
        MARGIN + 6.0,
        *y - 13.5,
        "Désignation",
        8.5,
        true,
        muted,
    );
    draw_text_right(
        cmds,
        MARGIN + 345.0,
        *y - 13.5,
        "Quantité",
        8.5,
        true,
        muted,
    );
    draw_text_right(cmds, MARGIN + 425.0, *y - 13.5, "P.U.", 8.5, true, muted);
    draw_text_right(cmds, RIGHT - 6.0, *y - 13.5, "Montant", 8.5, true, muted);
    *y -= 24.0;
}

pub(crate) fn assemble_pdf_bytes(pages: &[Vec<String>]) -> Vec<u8> {
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
    for page_cmds in pages {
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
