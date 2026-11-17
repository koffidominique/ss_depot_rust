/**
 * DEPOTPRO PREMIUM V3 — Domaine exact (Money FCFA & Quantity milli-unités)
 * Aucun flottant (float) n'est autorisé pour les calculs financiers ou de stock.
 */

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'PIN_LOCKED'
  | 'PIN_NOT_CONFIGURED'
  | 'VALIDATION_ERROR'
  | 'PRODUCT_NOT_FOUND'
  | 'PACKAGING_NOT_FOUND'
  | 'CLIENT_NOT_FOUND'
  | 'SUPPLIER_NOT_FOUND'
  | 'SALE_NOT_FOUND'
  | 'PURCHASE_NOT_FOUND'
  | 'INSUFFICIENT_STOCK'
  | 'INVALID_PACKAGING'
  | 'DEPOSIT_PROFILE_MISSING'
  | 'CREDIT_FORBIDDEN'
  | 'CREDIT_LIMIT_EXCEEDED'
  | 'INVALID_PAYMENT'
  | 'SESSION_NOT_OPEN'
  | 'SESSION_ALREADY_OPEN'
  | 'DUPLICATE_OPERATION'
  | 'INVALID_QUANTITY'
  | 'INVALID_MONEY'
  | 'HISTORICAL_IMMUTABLE'
  | 'BACKUP_ERROR';

export class BusinessError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;

  constructor(code: ErrorCode, message: string, status = 400) {
    super(message);
    this.name = 'BusinessError';
    this.code = code;
    this.status = status;
  }
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);

/**
 * Valide un montant entier FCFA (XOF) sans fraction ni arrondi silencieux.
 */
export function fcfa(value: unknown, field = 'Montant'): number {
  if (typeof value === 'boolean' || value === null || value === undefined || value === '') {
    throw new BusinessError('INVALID_MONEY', `${field} doit être un entier FCFA valide.`);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new BusinessError('INVALID_MONEY', `${field} doit être un nombre entier de FCFA sans décimales.`);
    }
    if (!Number.isSafeInteger(value)) {
      throw new BusinessError('INVALID_MONEY', `${field} dépasse la capacité numérique autorisée.`);
    }
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/\s+/g, '');
    if (!/^-?\d+$/.test(trimmed)) {
      throw new BusinessError('INVALID_MONEY', `${field} doit être un nombre entier de FCFA sans décimales.`);
    }
    const num = Number(trimmed);
    if (!Number.isSafeInteger(num)) {
      throw new BusinessError('INVALID_MONEY', `${field} dépasse la capacité numérique autorisée.`);
    }
    return num;
  }
  throw new BusinessError('INVALID_MONEY', `${field} invalide.`);
}

export function nonNegativeFcfa(value: unknown, field = 'Montant'): number {
  const n = fcfa(value, field);
  if (n < 0) {
    throw new BusinessError('INVALID_MONEY', `${field} ne peut pas être négatif.`);
  }
  return n;
}

export function positiveFcfa(value: unknown, field = 'Montant'): number {
  const n = fcfa(value, field);
  if (n <= 0) {
    throw new BusinessError('INVALID_MONEY', `${field} doit être strictement positif.`);
  }
  return n;
}

export function checkedAddMoney(a: number, b: number, field = 'Somme'): number {
  const sum = BigInt(fcfa(a, field)) + BigInt(fcfa(b, field));
  if (sum > MAX_SAFE || sum < MIN_SAFE) {
    throw new BusinessError('INVALID_MONEY', `${field} dépasse la limite numérique.`);
  }
  return Number(sum);
}

export function checkedSubMoney(a: number, b: number, field = 'Différence'): number {
  const diff = BigInt(fcfa(a, field)) - BigInt(fcfa(b, field));
  if (diff > MAX_SAFE || diff < MIN_SAFE) {
    throw new BusinessError('INVALID_MONEY', `${field} dépasse la limite numérique.`);
  }
  return Number(diff);
}

export function checkedSubNonNegativeMoney(a: number, b: number, field = 'Solde'): number {
  const diff = checkedSubMoney(a, b, field);
  if (diff < 0) {
    throw new BusinessError('INVALID_MONEY', `${field} ne peut pas être négatif.`);
  }
  return diff;
}

export function checkedMulMoney(a: number, b: number, field = 'Produit'): number {
  const prod = BigInt(fcfa(a, field)) * BigInt(fcfa(b, field));
  if (prod > MAX_SAFE || prod < MIN_SAFE) {
    throw new BusinessError('INVALID_MONEY', `${field} dépasse la limite numérique.`);
  }
  return Number(prod);
}

export function checkedAddMilli(a: number, b: number, field = 'Quantité'): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) {
    throw new BusinessError('INVALID_QUANTITY', `${field} invalide.`);
  }
  const sum = BigInt(a) + BigInt(b);
  if (sum > MAX_SAFE || sum < MIN_SAFE) {
    throw new BusinessError('INVALID_QUANTITY', `${field} dépasse la limite numérique.`);
  }
  return Number(sum);
}

export function checkedSubMilli(a: number, b: number, field = 'Quantité'): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) {
    throw new BusinessError('INVALID_QUANTITY', `${field} invalide.`);
  }
  const diff = BigInt(a) - BigInt(b);
  if (diff > MAX_SAFE || diff < MIN_SAFE) {
    throw new BusinessError('INVALID_QUANTITY', `${field} dépasse la limite numérique.`);
  }
  return Number(diff);
}

/**
 * Convertit une quantité (nombre ou chaîne avec max 3 décimales) en milli-unités entières.
 * 1 unité = 1000 milli-unités. Refuse toute précision > 3 décimales sans arrondir.
 */
export function toMilli(value: unknown, field = 'Quantité'): number {
  if (typeof value === 'boolean' || value === null || value === undefined || value === '') {
    throw new BusinessError('INVALID_QUANTITY', `${field} est requise.`);
  }
  const raw = typeof value === 'number' ? (Number.isFinite(value) ? value.toString() : '') : String(value).trim().replace(',', '.');
  if (!raw || !/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new BusinessError('INVALID_QUANTITY', `${field} invalide.`);
  }
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [intPart, fracPart = ''] = unsigned.split('.');
  if (fracPart.length > 3) {
    throw new BusinessError(
      'INVALID_QUANTITY',
      `${field} ne peut pas dépasser 3 décimales (précision milli-unité).`
    );
  }
  const paddedFrac = fracPart.padEnd(3, '0');
  const totalBig = BigInt(intPart) * 1000n + BigInt(paddedFrac);
  const signedBig = negative ? -totalBig : totalBig;
  if (signedBig > MAX_SAFE || signedBig < MIN_SAFE) {
    throw new BusinessError('INVALID_QUANTITY', `${field} dépasse la limite numérique.`);
  }
  return Number(signedBig);
}

export function positiveMilli(value: unknown, field = 'Quantité'): number {
  const m = toMilli(value, field);
  if (m <= 0) {
    throw new BusinessError('INVALID_QUANTITY', `${field} doit être strictement positive.`);
  }
  return m;
}

export function nonNegativeMilli(value: unknown, field = 'Quantité'): number {
  const m = toMilli(value, field);
  if (m < 0) {
    throw new BusinessError('INVALID_QUANTITY', `${field} ne peut pas être négative.`);
  }
  return m;
}

/**
 * Multiplie une quantité (en milli-unités) par un coefficient (en milli-unités).
 * Exemple : 2 casiers (2000 milli) * 24 bouteilles/casier (24000 milli) = 48000 milli (48 bouteilles).
 * Refuse tout résultat fractionnaire au-delà de la milli-unité.
 */
export function multiplyQtyCoeffToBaseMilli(qtyMilli: number, coeffMilli: number): number {
  const prod = BigInt(qtyMilli) * BigInt(coeffMilli);
  if (prod % 1000n !== 0n) {
    throw new BusinessError(
      'INVALID_QUANTITY',
      'La conversion quantité × coefficient produit une précision inférieure au millième.'
    );
  }
  const res = prod / 1000n;
  if (res > MAX_SAFE || res <= 0n) {
    throw new BusinessError('INVALID_QUANTITY', 'Quantité de base convertie hors limites.');
  }
  return Number(res);
}

/**
 * Calcule le total d'une ligne : (quantity_milli * unit_price) / 1000.
 * Exige un montant FCFA entier exact.
 */
export function computeLineTotalFcfa(quantityMilli: number, unitPriceFcfa: number): number {
  const prod = BigInt(quantityMilli) * BigInt(nonNegativeFcfa(unitPriceFcfa, 'Prix unitaire'));
  if (prod % 1000n !== 0n) {
    throw new BusinessError(
      'INVALID_MONEY',
      'La quantité fractionnaire multipliée par le prix unitaire produit des fractions de FCFA.'
    );
  }
  const res = prod / 1000n;
  if (res > MAX_SAFE) {
    throw new BusinessError('INVALID_MONEY', 'Montant de ligne hors limites.');
  }
  return Number(res);
}

export function formatMilli(milli: number): string {
  const neg = milli < 0;
  const abs = Math.abs(milli);
  const intPart = Math.floor(abs / 1000);
  const fracPart = abs % 1000;
  if (fracPart === 0) return `${neg ? '-' : ''}${intPart}`;
  const trimmed = String(fracPart).padStart(3, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${intPart}.${trimmed}`;
}
