// ============================================================================
// Sections règlements, notes et récapitulatif des totaux PDF
// ============================================================================

use super::encoding_and_layout::format_fcfa_ascii;
use super::primitives::{
    draw_line, draw_rect_fill_stroke, draw_text, draw_text_right, CONTENT_W, MARGIN,
};
use super::DocumentPdfInput;

pub(crate) fn draw_summary_section(
    cmds: &mut Vec<String>,
    y: f64,
    doc: &DocumentPdfInput,
    note_lines: &[String],
    right_h: f64,
) {
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
                draw_text(
                    cmds,
                    MARGIN + 10.0,
                    py,
                    &p.label,
                    8.0,
                    false,
                    (0.4, 0.439, 0.522),
                );
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
        for nl in note_lines {
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
            draw_text_right(
                cmds,
                sum_x + sum_w - 10.0,
                sy,
                &sr.value,
                f_size,
                sr.bold,
                tone,
            );
            sy -= 15.0;
        }
    }
}
