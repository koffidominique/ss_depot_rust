import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatFcfa(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—';
  const rounded = Math.trunc(amount);
  const formatted = new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 0,
  }).format(rounded);
  return `${formatted} FCFA`;
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.trunc(n));
}

export function formatQty(milli: number, unit?: string): string {
  const neg = milli < 0;
  const abs = Math.abs(milli);
  const intPart = Math.floor(abs / 1000);
  const fracPart = abs % 1000;
  const numStr =
    fracPart === 0
      ? `${neg ? '-' : ''}${intPart}`
      : `${neg ? '-' : ''}${intPart},${String(fracPart).padStart(3, '0').replace(/0+$/, '')}`;
  return unit ? `${numStr} ${unit}` : numStr;
}

/** Rend visible le nombre de boissons réellement contenu dans un conditionnement. */
export function packagingContentsLabel(packagingName: string, baseUnit: string, coefficientMilli: number): string {
  const unit = baseUnit.trim().toLocaleLowerCase('fr');
  const packaging = packagingName.trim().toLocaleLowerCase('fr');
  const contents = unit.includes('can')
    ? 'canettes'
    : unit.includes('bouteille')
      ? packaging === 'pack' ? 'bouteilles en plastique' : 'bouteilles'
      : `${baseUnit}(s)`;
  return `1 ${packagingName} = ${formatQty(coefficientMilli)} ${contents}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, 'dd MMM yyyy · HH:mm', { locale: fr });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, 'dd/MM/yyyy', { locale: fr });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

export function newRequestKey(prefix = 'op'): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
