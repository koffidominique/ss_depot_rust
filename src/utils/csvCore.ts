/* ============================================================================
 * Utilitaires CSV génériques (échappement, construction et téléchargement)
 * ============================================================================ */

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[;"\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsv(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
): string {
  const lines = [
    headers.map(escapeCsvCell).join(';'),
    ...rows.map((row) => row.map(escapeCsvCell).join(';')),
  ];
  return lines.join('\n');
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
): string {
  const csv = buildCsv(headers, rows);
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return csv;
}

export const todayTag = () => new Date().toISOString().slice(0, 10);
