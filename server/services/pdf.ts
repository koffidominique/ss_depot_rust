import { getDb } from '../db.ts';
import { BusinessError } from '../domain.ts';

export interface DocumentPdfLine {
  label: string;
  sublabel?: string | null;
  quantity: string;
  unitPrice?: number | null;
  total?: number | null;
}

export interface DocumentPdfSummaryRow {
  label: string;
  value: string;
  bold?: boolean;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

export interface DocumentPdfPayment {
  label: string;
  amount: number;
}

export interface DocumentPdfInput {
  docType: string;
  reference: string;
  date: string;
  statusLabel?: string | null;
  partyTitle?: string | null;
  partyName?: string | null;
  partyDetails?: string | null;
  lines: DocumentPdfLine[];
  summaryRows: DocumentPdfSummaryRow[];
  payments?: DocumentPdfPayment[] | null;
  notes?: string | null;
}

export interface CompanyInfo {
  company_name: string;
  company_legal_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  country: string | null;
}

const VALID_DOC_TYPES = new Set([
  'FACTURE',
  'REÇU DE VENTE',
  'AVOIR CLIENT',
  'BON DE COMMANDE',
  'BON DE RÉCEPTION',
  'REÇU RETOUR EMBALLAGES',
  'RAPPORT DE CAISSE',
  'ÉTAT DES CRÉANCES CLIENTS',
  'RAPPORT DE STOCK & VALORISATION',
  'BILAN COMMERCIAL & FINANCES',
  'ÉTAT DES DETTES FOURNISSEURS',
  'ÉTAT DES CONSIGNATIONS',
]);

// Largeurs AFM standard Helvetica (en millièmes d'em) pour ASCII 32..126
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const WINANSI_MAP: Record<string, number> = {
  '\u00A0': 0x20,
  '\u202F': 0x20,
  '\u2009': 0x20,
  '€': 0x80,
  '…': 0x85,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  'Œ': 0x8C,
  'œ': 0x9C,
};

function toWinAnsiBytes(input: string): number[] {
  const normalized = input
    .replaceAll('→', '->')
    .replaceAll('←', '<-')
    .replaceAll('≥', '>=')
    .replaceAll('≤', '<=');
  const out: number[] = [];
  for (const ch of normalized) {
    const code = ch.codePointAt(0) ?? 32;
    if (code >= 0x20 && code <= 0x7e) {
      out.push(code);
    } else if (WINANSI_MAP[ch] !== undefined) {
      out.push(WINANSI_MAP[ch]);
    } else if (code >= 0xa0 && code <= 0xff) {
      out.push(code);
    } else {
      out.push(0x3f); // '?'
    }
  }
  return out;
}

function pdfStringLiteral(input: string): string {
  const bytes = toWinAnsiBytes(input);
  let res = '(';
  for (const b of bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) {
      res += `\\${String.fromCharCode(b)}`;
    } else if (b < 0x20 || b >= 0x7f) {
      res += `\\${b.toString(8).padStart(3, '0')}`;
    } else {
      res += String.fromCharCode(b);
    }
  }
  res += ')';
  return res;
}

function measureTextWidth(text: string, fontSize: number, bold = false): number {
  const bytes = toWinAnsiBytes(text);
  let units = 0;
  for (const b of bytes) {
    if (b >= 32 && b <= 126) {
      units += HELVETICA_WIDTHS[b - 32];
    } else if (b === 0x20 || b === 0xa0) {
      units += 278;
    } else if (b === 0xb7) {
      units += 278;
    } else if (b === 0x97) {
      units += 1000;
    } else {
      units += 556;
    }
  }
  const scale = bold ? 1.05 : 1.0;
  return (units * fontSize * scale) / 1000;
}

function wrapText(text: string, maxWidth: number, fontSize: number, bold = false): string[] {
  const clean = text.trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\r?\n/);
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measureTextWidth(candidate, fontSize, bold) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        if (measureTextWidth(word, fontSize, bold) <= maxWidth) {
          current = word;
        } else {
          // Découpe d'un mot très long (référence/code)
          let chunk = '';
          for (const ch of word) {
            if (measureTextWidth(chunk + ch, fontSize, bold) > maxWidth && chunk) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          current = chunk;
        }
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function formatFcfaAscii(amount: number): string {
  const n = Math.trunc(amount);
  const abs = Math.abs(n);
  const digits = String(abs);
  let grouped = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) grouped += ' ';
    grouped += digits[i];
  }
  return `${n < 0 ? '-' : ''}${grouped} FCFA`;
}

function formatDateFrench(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return iso.length <= 10 ? `${dd}/${mm}/${yyyy}` : `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

export function renderDocumentPdfBuffer(company: CompanyInfo, doc: DocumentPdfInput): Buffer {
  const PAGE_W = 595;
  const PAGE_H = 842;
  const MARGIN = 40;
  const RIGHT = PAGE_W - MARGIN;
  const CONTENT_W = RIGHT - MARGIN;

  const pages: string[][] = [];
  let cmds: string[] = [];
  let y = PAGE_H - MARGIN;

  const startPage = () => {
    cmds = [];
    pages.push(cmds);
    y = PAGE_H - MARGIN;
  };

  const setFillRgb = (r: number, g: number, b: number) => `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`;
  const setStrokeRgb = (r: number, g: number, b: number) => `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`;

  const drawText = (x: number, ty: number, text: string, size: number, bold = false, rgb: [number, number, number] = [0.094, 0.133, 0.188]) => {
    if (!text) return;
    cmds.push(`BT /${bold ? 'F2' : 'F1'} ${size.toFixed(1)} Tf ${setFillRgb(rgb[0], rgb[1], rgb[2])} 1 0 0 1 ${x.toFixed(2)} ${ty.toFixed(2)} Tm ${pdfStringLiteral(text)} Tj ET`);
  };

  const drawTextRight = (rightX: number, ty: number, text: string, size: number, bold = false, rgb: [number, number, number] = [0.094, 0.133, 0.188]) => {
    const w = measureTextWidth(text, size, bold);
    drawText(rightX - w, ty, text, size, bold, rgb);
  };

  const drawRectFill = (x: number, ry: number, w: number, h: number, rgb: [number, number, number]) => {
    cmds.push(`q ${setFillRgb(rgb[0], rgb[1], rgb[2])} ${x.toFixed(2)} ${ry.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f Q`);
  };

  const drawRectFillStroke = (
    x: number,
    ry: number,
    w: number,
    h: number,
    fillRgb: [number, number, number],
    strokeRgb: [number, number, number],
    lineWidth = 0.75
  ) => {
    cmds.push(
      `q ${lineWidth.toFixed(2)} w ${setFillRgb(fillRgb[0], fillRgb[1], fillRgb[2])} ${setStrokeRgb(strokeRgb[0], strokeRgb[1], strokeRgb[2])} ${x.toFixed(2)} ${ry.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re B Q`
    );
  };

  const drawLine = (x1: number, y1: number, x2: number, y2: number, strokeRgb: [number, number, number], width = 0.75) => {
    cmds.push(`q ${width.toFixed(2)} w ${setStrokeRgb(strokeRgb[0], strokeRgb[1], strokeRgb[2])} ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q`);
  };

  const drawLogo = (lx: number, bottomY: number) => {
    // Carré navy #101B33 (34x34)
    drawRectFill(lx, bottomY, 34, 34, [0.063, 0.106, 0.2]);
    // Barres #60A5FA
    cmds.push('q 2.2 w 1 J 0.376 0.647 0.980 RG');
    cmds.push(`${(lx + 8.5).toFixed(2)} ${(bottomY + 22.5).toFixed(2)} m ${(lx + 25.5).toFixed(2)} ${(bottomY + 22.5).toFixed(2)} l S`);
    cmds.push(`${(lx + 8.5).toFixed(2)} ${(bottomY + 17.0).toFixed(2)} m ${(lx + 25.5).toFixed(2)} ${(bottomY + 17.0).toFixed(2)} l S`);
    cmds.push(`${(lx + 8.5).toFixed(2)} ${(bottomY + 11.5).toFixed(2)} m ${(lx + 18.0).toFixed(2)} ${(bottomY + 11.5).toFixed(2)} l S Q`);
    // Pastille bleue #2563EB (approx cercle par carré arrondi/octogone)
    drawRectFill(lx + 21.5, bottomY + 9.0, 5.0, 5.0, [0.145, 0.388, 0.922]);
  };

  const drawTableHeader = () => {
    drawRectFill(MARGIN, y - 20, CONTENT_W, 20, [0.945, 0.961, 0.976]);
    drawLine(MARGIN, y - 20, RIGHT, y - 20, [0.796, 0.835, 0.882], 0.9);
    const muted: [number, number, number] = [0.4, 0.439, 0.522];
    drawText(MARGIN + 6, y - 13.5, 'Désignation', 8.5, true, muted);
    drawTextRight(MARGIN + 345, y - 13.5, 'Quantité', 8.5, true, muted);
    drawTextRight(MARGIN + 425, y - 13.5, 'P.U.', 8.5, true, muted);
    drawTextRight(RIGHT - 6, y - 13.5, 'Montant', 8.5, true, muted);
    y -= 24;
  };

  const drawContinuationHeader = () => {
    drawText(MARGIN, y - 10, `${company.company_name || 'DEPOTPRO'} · ${doc.docType} (${doc.reference}) — Suite`, 9, true, [0.063, 0.106, 0.2]);
    y -= 20;
    drawLine(MARGIN, y, RIGHT, y, [0.886, 0.91, 0.941], 0.8);
    y -= 10;
    drawTableHeader();
  };

  // --- PAGE 1 : En-tête complet ---
  startPage();
  const headerTop = y;
  drawLogo(MARGIN, headerTop - 36);

  const compX = MARGIN + 44;
  let compY = headerTop - 11;
  drawText(compX, compY, company.company_name || 'DEPOTPRO', 14, true, [0.063, 0.106, 0.2]);
  compY -= 12;
  if (company.company_legal_name) {
    drawText(compX, compY, company.company_legal_name, 8, false, [0.4, 0.439, 0.522]);
    compY -= 10.5;
  }
  if (company.address) {
    drawText(compX, compY, company.address, 8, false, [0.4, 0.439, 0.522]);
    compY -= 10.5;
  }
  const cityLineParts = [company.city, company.country].filter(Boolean).join(', ');
  const contactLine = [cityLineParts, company.phone ? `Tél : ${company.phone}` : ''].filter(Boolean).join(' · ');
  if (contactLine) {
    drawText(compX, compY, contactLine, 8, false, [0.4, 0.439, 0.522]);
    compY -= 10.5;
  }
  if (company.email) {
    drawText(compX, compY, company.email, 8, false, [0.4, 0.439, 0.522]);
    compY -= 10.5;
  }

  let rightY = headerTop - 10;
  drawTextRight(RIGHT, rightY, doc.docType, 9.5, true, [0.145, 0.388, 0.922]);
  rightY -= 15;
  drawTextRight(RIGHT, rightY, doc.reference, 12.5, true, [0.063, 0.106, 0.2]);
  rightY -= 12;
  drawTextRight(RIGHT, rightY, formatDateFrench(doc.date), 8.5, false, [0.4, 0.439, 0.522]);
  rightY -= 11;
  if (doc.statusLabel) {
    drawTextRight(RIGHT, rightY, `Statut : ${doc.statusLabel}`, 8.5, true, [0.094, 0.133, 0.188]);
    rightY -= 11;
  }

  y = Math.min(compY, rightY, headerTop - 44) - 6;
  drawLine(MARGIN, y, RIGHT, y, [0.063, 0.106, 0.2], 1.6);
  y -= 14;

  // --- Bloc Tiers ---
  if (doc.partyName) {
    const partyTitle = `${doc.partyTitle || 'Tiers'} : `;
    const detailsLines = doc.partyDetails ? wrapText(doc.partyDetails, CONTENT_W - 20, 8) : [];
    const boxH = 22 + detailsLines.length * 10;
    drawRectFillStroke(MARGIN, y - boxH, CONTENT_W, boxH, [0.973, 0.98, 0.988], [0.886, 0.91, 0.941], 0.75);
    const titleW = measureTextWidth(partyTitle, 8.5, true);
    drawText(MARGIN + 10, y - 14, partyTitle, 8.5, true, [0.4, 0.439, 0.522]);
    drawText(MARGIN + 10 + titleW, y - 14, doc.partyName, 9, true, [0.094, 0.133, 0.188]);
    let dy = y - 25;
    for (const dl of detailsLines) {
      drawText(MARGIN + 10, dy, dl, 8, false, [0.4, 0.439, 0.522]);
      dy -= 10;
    }
    y -= boxH + 12;
  }

  // --- Tableau des lignes ---
  drawTableHeader();
  const rows = doc.lines.length > 0 ? doc.lines : [{ label: 'Aucune ligne', quantity: '—', unitPrice: null, total: null }];
  for (const line of rows) {
    const labelLines = wrapText(line.label, 250, 8.5, true);
    const subLines = line.sublabel ? wrapText(line.sublabel, 250, 7.5, false) : [];
    const rowH = Math.max(20, 8 + labelLines.length * 10.5 + subLines.length * 9.5);

    if (y - rowH < 72) {
      startPage();
      drawContinuationHeader();
    }

    let ly = y - 11;
    for (const ll of labelLines) {
      drawText(MARGIN + 6, ly, ll, 8.5, true, [0.094, 0.133, 0.188]);
      ly -= 10.5;
    }
    for (const sl of subLines) {
      drawText(MARGIN + 6, ly, sl, 7.5, false, [0.4, 0.439, 0.522]);
      ly -= 9.5;
    }

    drawTextRight(MARGIN + 345, y - 11, line.quantity || '—', 8.5, false, [0.094, 0.133, 0.188]);
    drawTextRight(
      MARGIN + 425,
      y - 11,
      line.unitPrice !== undefined && line.unitPrice !== null ? formatFcfaAscii(line.unitPrice) : '—',
      8.5,
      false,
      [0.094, 0.133, 0.188]
    );
    drawTextRight(
      RIGHT - 6,
      y - 11,
      line.total !== undefined && line.total !== null ? formatFcfaAscii(line.total) : '—',
      8.5,
      true,
      [0.094, 0.133, 0.188]
    );

    y -= rowH;
    drawLine(MARGIN, y, RIGHT, y, [0.91, 0.933, 0.957], 0.6);
  }

  y -= 14;

  // --- Zone Paiements + Notes + Synthèse ---
  const noteLines = doc.notes ? wrapText(`Observation : ${doc.notes}`, 230, 8) : [];
  const payCount = doc.payments?.length ?? 0;
  const leftBoxH = (payCount > 0 ? 24 + payCount * 12 + 8 : 0) + (noteLines.length > 0 ? 14 + noteLines.length * 10 + 8 : 0);
  const rightBoxH = Math.max(32, 16 + doc.summaryRows.length * 15);
  const sectionH = Math.max(leftBoxH, rightBoxH);

  if (y - sectionH < 64) {
    startPage();
    drawText(MARGIN, y - 10, `${company.company_name || 'DEPOTPRO'} · ${doc.docType} (${doc.reference}) — Récapitulatif`, 9, true, [0.063, 0.106, 0.2]);
    y -= 24;
  }

  let leftY = y;
  if (doc.payments && doc.payments.length > 0) {
    const pBoxH = 22 + doc.payments.length * 12;
    drawRectFillStroke(MARGIN, leftY - pBoxH, 248, pBoxH, [1, 1, 1], [0.886, 0.91, 0.941], 0.75);
    drawText(MARGIN + 10, leftY - 13, 'Ventilation des règlements', 8.5, true, [0.063, 0.106, 0.2]);
    let py = leftY - 26;
    for (const p of doc.payments) {
      drawText(MARGIN + 10, py, p.label, 8, false, [0.4, 0.439, 0.522]);
      drawTextRight(MARGIN + 238, py, formatFcfaAscii(p.amount), 8, true, [0.094, 0.133, 0.188]);
      py -= 12;
    }
    leftY -= pBoxH + 8;
  }

  if (noteLines.length > 0) {
    const nBoxH = 12 + noteLines.length * 10;
    drawRectFillStroke(MARGIN, leftY - nBoxH, 248, nBoxH, [1, 1, 1], [0.886, 0.91, 0.941], 0.75);
    let ny = leftY - 13;
    for (const nl of noteLines) {
      drawText(MARGIN + 10, ny, nl, 8, false, [0.4, 0.439, 0.522]);
      ny -= 10;
    }
  }

  if (doc.summaryRows.length > 0) {
    const sumX = MARGIN + 266;
    const sumW = CONTENT_W - 266;
    drawRectFillStroke(sumX, y - rightBoxH, sumW, rightBoxH, [0.973, 0.98, 0.988], [0.796, 0.835, 0.882], 0.85);
    let sy = y - 15;
    for (let i = 0; i < doc.summaryRows.length; i++) {
      const sr = doc.summaryRows[i];
      if (sr.bold && i > 0) {
        drawLine(sumX + 8, sy + 10, sumX + sumW - 8, sy + 10, [0.796, 0.835, 0.882], 0.75);
      }
      const toneColor: [number, number, number] =
        sr.tone === 'success'
          ? [0.086, 0.639, 0.416]
          : sr.tone === 'warning'
            ? [0.851, 0.565, 0.102]
            : sr.tone === 'danger'
              ? [0.863, 0.271, 0.271]
              : [0.094, 0.133, 0.188];
      const fSize = sr.bold ? 9.5 : 8.5;
      drawText(sumX + 10, sy, sr.label, fSize, Boolean(sr.bold), toneColor);
      drawTextRight(sumX + sumW - 10, sy, sr.value, fSize, Boolean(sr.bold), toneColor);
      sy -= 15;
    }
  }

  // --- Pieds de page sur toutes les pages ---
  const totalPages = pages.length;
  for (let i = 0; i < totalPages; i++) {
    cmds = pages[i];
    drawLine(MARGIN, 44, RIGHT, 44, [0.886, 0.91, 0.941], 0.75);
    drawText(
      MARGIN,
      31,
      `${company.company_name || 'DEPOTPRO'} · Document généré localement sans recalcul rétroactif`,
      7.5,
      false,
      [0.4, 0.439, 0.522]
    );
    drawTextRight(
      RIGHT,
      31,
      `Réf. ${doc.reference} · Page ${i + 1}/${totalPages}`,
      7.5,
      false,
      [0.4, 0.439, 0.522]
    );
  }

  // --- Assemblage fichier PDF 1.4 ---
  const objects: string[] = [];
  // 1: Catalog
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  // 2: Pages (rempli après)
  objects.push('');
  // 3: Font F1 Helvetica WinAnsi
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  // 4: Font F2 Helvetica-Bold WinAnsi
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  const pageObjIds: number[] = [];
  for (const pageCmds of pages) {
    const streamData = pageCmds.join('\n');
    const contentObjId = objects.length + 1;
    objects.push(`<< /Length ${Buffer.byteLength(streamData, 'ascii')} >>\nstream\n${streamData}\nendstream`);
    const pageObjId = objects.length + 1;
    pageObjIds.push(pageObjId);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjId} 0 R >>`
    );
  }
  objects[1] = `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjIds.length} >>`;

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n', 'ascii')];
  let offset = chunks[0].length;
  const offsets: number[] = [0];

  for (let i = 0; i < objects.length; i++) {
    offsets.push(offset);
    const objStr = `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    const buf = Buffer.from(objStr, 'ascii');
    chunks.push(buf);
    offset += buf.length;
  }

  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref + trailer, 'ascii'));

  return Buffer.concat(chunks);
}

export function generateDocumentPdf(input: DocumentPdfInput): { filename: string; buffer: Buffer } {
  if (!input || !VALID_DOC_TYPES.has(input.docType)) {
    throw new BusinessError('VALIDATION_ERROR', 'Type de document PDF non reconnu.');
  }
  const ref = (input.reference || '').trim();
  if (!ref) {
    throw new BusinessError('VALIDATION_ERROR', 'Référence document requise pour la génération PDF.');
  }
  const db = getDb();
  const settings = db
    .prepare(
      'SELECT company_name, company_legal_name, address, phone, email, city, country FROM app_settings WHERE id = 1'
    )
    .get() as CompanyInfo | undefined;

  const company: CompanyInfo = settings || {
    company_name: 'DEPOTPRO',
    company_legal_name: null,
    address: null,
    phone: null,
    email: null,
    city: null,
    country: null,
  };

  const buffer = renderDocumentPdfBuffer(company, input);
  const safeRef = ref.replace(/[^a-zA-Z0-9_-]+/g, '_');
  return {
    filename: `DEPOTPRO_${safeRef}.pdf`,
    buffer,
  };
}
