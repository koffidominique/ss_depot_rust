// ============================================================================
// Primitives vectorielles PDF 1.4 & assemblage des objets et table xref
// ============================================================================

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};

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
    draw_rect_fill(cmds, MARGIN, *y - 20.0, CONTENT_W, 20.0, (0.0, 0.0, 0.0));
    for x in [MARGIN + 75.0, MARGIN + 350.0, MARGIN + 435.0] {
        draw_line(cmds, x, *y - 20.0, x, *y, (0.62, 0.62, 0.62), 0.6);
    }
    let white = (1.0, 1.0, 1.0);
    draw_text_right(cmds, MARGIN + 68.0, *y - 13.5, "Qté", 8.5, true, white);
    draw_text(cmds, MARGIN + 82.0, *y - 13.5, "Désignation", 8.5, true, white);
    draw_text_right(cmds, MARGIN + 428.0, *y - 13.5, "Prix unitaire", 8.0, true, white);
    draw_text_right(cmds, RIGHT - 6.0, *y - 13.5, "Total", 8.5, true, white);
    draw_line(cmds, MARGIN, *y - 20.0, RIGHT, *y - 20.0, (0.0, 0.0, 0.0), 0.8);
    *y -= 24.0;
}

#[derive(Debug, Clone)]
pub(crate) struct PdfJpegImage {
    pub width: u16,
    pub height: u16,
    pub components: u8,
    pub data: Vec<u8>,
}

pub(crate) fn decode_logo_jpeg(data_url: &str) -> Option<PdfJpegImage> {
    if data_url.len() > 500_000 {
        return None;
    }
    let encoded = data_url.strip_prefix("data:image/jpeg;base64,").unwrap_or(data_url);
    let data = BASE64.decode(encoded).ok()?;
    if data.len() < 16
        || data.get(0..2) != Some(&[0xff, 0xd8][..])
        || data.get(data.len() - 2..) != Some(&[0xff, 0xd9][..])
    {
        return None;
    }
    let mut pos = 2usize;
    while pos + 4 <= data.len() {
        if data[pos] != 0xff {
            pos += 1;
            continue;
        }
        while pos < data.len() && data[pos] == 0xff {
            pos += 1;
        }
        let marker = *data.get(pos)?;
        pos += 1;
        if marker == 0xd9 || marker == 0xda {
            break;
        }
        if marker == 0x01 || (0xd0..=0xd7).contains(&marker) {
            continue;
        }
        let len_bytes = data.get(pos..pos + 2)?;
        let segment_len = u16::from_be_bytes([len_bytes[0], len_bytes[1]]) as usize;
        if segment_len < 2 || pos + segment_len > data.len() {
            return None;
        }
        let is_sof = matches!(
            marker,
            0xc0 | 0xc1
                | 0xc2
                | 0xc3
                | 0xc5
                | 0xc6
                | 0xc7
                | 0xc9
                | 0xca
                | 0xcb
                | 0xcd
                | 0xce
                | 0xcf
        );
        if is_sof {
            if segment_len < 8 || !matches!(data[pos + 7], 1 | 3) {
                return None;
            }
            let components = data[pos + 7];
            if segment_len < 8 + components as usize * 3 {
                return None;
            }
            let height = u16::from_be_bytes([data[pos + 3], data[pos + 4]]);
            let width = u16::from_be_bytes([data[pos + 5], data[pos + 6]]);
            if width == 0 || height == 0 || width > 2048 || height > 2048 {
                return None;
            }
            return Some(PdfJpegImage {
                width,
                height,
                components,
                data,
            });
        }
        pos += segment_len;
    }
    None
}

pub(crate) fn draw_logo_image(cmds: &mut Vec<String>, x: f64, y: f64, width: f64, height: f64) {
    cmds.push(format!("q {width:.2} 0 0 {height:.2} {x:.2} {y:.2} cm /Logo Do Q"));
}

pub(crate) fn assemble_pdf_bytes(pages: &[Vec<String>], logo: Option<&PdfJpegImage>) -> Vec<u8> {
    let mut objects: Vec<Vec<u8>> = vec![
        b"<< /Type /Catalog /Pages 2 0 R >>".to_vec(),
        Vec::new(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>".to_vec(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>".to_vec(),
    ];
    if let Some(image) = logo {
        let color_space = if image.components == 1 {
            "/DeviceGray"
        } else {
            "/DeviceRGB"
        };
        let dictionary = format!(
            "<< /Type /XObject /Subtype /Image /Width {} /Height {} /ColorSpace {} /BitsPerComponent 8 /Filter /DCTDecode /Length {} >>\nstream\n",
            image.width,
            image.height,
            color_space,
            image.data.len()
        );
        let mut image_obj = dictionary.into_bytes();
        image_obj.extend_from_slice(&image.data);
        image_obj.extend_from_slice(b"\nendstream");
        objects.push(image_obj);
    }

    let mut page_obj_ids = Vec::with_capacity(pages.len());
    for page_cmds in pages {
        let stream_data = page_cmds.join("\n");
        let content_obj_id = objects.len() + 1;
        let content_obj = format!(
            "<< /Length {} >>\nstream\n{stream_data}\nendstream",
            stream_data.len()
        ).into_bytes();
        objects.push(content_obj);
        let page_obj_id = objects.len() + 1;
        page_obj_ids.push(page_obj_id);
        let image_resource = if logo.is_some() { " /XObject << /Logo 5 0 R >>" } else { "" };
        objects.push(format!(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_W:.0} {PAGE_H:.0}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>{image_resource} >> /Contents {content_obj_id} 0 R >>"
        ).into_bytes());
    }

    let kids: Vec<String> = page_obj_ids.iter().map(|id| format!("{id} 0 R")).collect();
    objects[1] = format!(
        "<< /Type /Pages /Kids [{}] /Count {} >>",
        kids.join(" "),
        page_obj_ids.len()
    ).into_bytes();

    let mut out = Vec::with_capacity(8192);
    out.extend_from_slice(b"%PDF-1.4\n");
    let mut offsets = Vec::with_capacity(objects.len() + 1);
    offsets.push(0usize);
    for (idx, obj) in objects.iter().enumerate() {
        offsets.push(out.len());
        out.extend_from_slice(format!("{} 0 obj\n", idx + 1).as_bytes());
        out.extend_from_slice(obj);
        out.extend_from_slice(b"\nendobj\n");
    }

    let xref_offset = out.len();
    out.extend_from_slice(format!("xref\n0 {}\n0000000000 65535 f \n", objects.len() + 1).as_bytes());
    for off in offsets.iter().skip(1) {
        out.extend_from_slice(format!("{off:010} 00000 n \n").as_bytes());
    }
    out.extend_from_slice(format!(
        "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n",
        objects.len() + 1
    ).as_bytes());
    out
}

#[cfg(test)]
mod logo_tests {
    use super::{assemble_pdf_bytes, decode_logo_jpeg};

    const TEST_LOGO_JPEG: &str = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABwj/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCWADpZb//Z";

    #[test]
    fn accepts_and_embeds_a_small_jpeg_company_logo() {
        let image = decode_logo_jpeg(TEST_LOGO_JPEG).expect("valid JPEG should be accepted");
        assert_eq!((image.width, image.height), (2, 2));
        let pdf = assemble_pdf_bytes(&[vec!["q 34 0 0 34 40 700 cm /Logo Do Q".into()]], Some(&image));
        let text = String::from_utf8_lossy(&pdf);
        assert!(text.contains("/Subtype /Image"));
        assert!(text.contains("/ColorSpace /DeviceRGB"));
        assert!(text.contains("/XObject << /Logo 5 0 R >>"));
        assert!(pdf
            .windows(image.data.len())
            .any(|window| window == image.data.as_slice()));
        assert!(text.starts_with("%PDF-1.4"));
        assert!(text.ends_with("%%EOF\n"));
    }

    #[test]
    fn rejects_non_jpeg_logo_payloads() {
        assert!(decode_logo_jpeg("data:image/jpeg;base64,aGVsbG8=").is_none());
        assert!(decode_logo_jpeg(&"a".repeat(500_001)).is_none());
    }
}
