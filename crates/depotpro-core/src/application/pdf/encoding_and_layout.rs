// ============================================================================
// Encodage WinAnsi, métriques Helvetica, découpage texte et formatage
// ============================================================================

// Largeurs AFM standard Helvetica (en millièmes d'em) pour ASCII 32..126
const HELVETICA_WIDTHS: [u16; 95] = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
    556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
    611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
    667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
    222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

pub(crate) fn to_winansi_bytes(input: &str) -> Vec<u8> {
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

pub(crate) fn pdf_string_literal(input: &str) -> String {
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

pub(crate) fn measure_text_width(text: &str, font_size: f64, bold: bool) -> f64 {
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

pub(crate) fn wrap_text(text: &str, max_width: f64, font_size: f64, bold: bool) -> Vec<String> {
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
                        if measure_text_width(&test, font_size, bold) > max_width
                            && !chunk.is_empty()
                        {
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

pub(crate) fn format_fcfa_ascii(amount: i64) -> String {
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

pub(crate) fn format_date_french(iso: &str) -> String {
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
