import type { DepositComponent } from '../../../types/erp.ts';
import {
  MAX_SAFE_BIG,
  type SharedDepositAccumulator,
  bigIntToSafeNumber,
  computeExactBaseQtyMilli,
  computeExactLineGrossFcfa,
  computeLineDepositFcfa,
  consolidateSharedDeposits,
  parseQtyInputToMilliBigInt,
  toNonNegativeIntFcfaBigInt,
} from './saleMathHelpers.ts';

/* ============================================================================
 * Exports publics & Contrats de calcul du panier POS
 * ============================================================================ */

export {
  computeExactBaseQtyMilli,
  computeExactLineGrossFcfa,
  parseQtyInputToMilliBigInt,
  toNonNegativeIntFcfaBigInt,
};

export interface SaleCalculationItem {
  key: string;
  productName: string;
  packagingName: string;
  coefficientMilli: number;
  allowFraction: boolean;
  quantity: string;
  unitPrice: number;
  discountAmount: number;
  depositPerPack: number;
  depositMode: 'none' | 'deposit' | null;
  depositComponents?: DepositComponent[];
}

export interface SalePaymentInput {
  method_code: string;
  amount: number;
}

export interface SaleLineCalculationResult {
  valid: boolean;
  qtyMilli: number | null;
  baseQtyMilli: number | null;
  lineGross: number | null;
  lineNet: number | null;
  lineDeposit: number | null;
  error: string | null;
}

export interface SaleCalculationResult {
  isValid: boolean;
  hasItems: boolean;
  errors: string[];
  lineResults: Record<string, SaleLineCalculationResult>;
  subtotalMerch: number | null;
  netMerch: number | null;
  totalDeposit: number | null;
  grandTotal: number | null;
  paidTotal: number | null;
  remainingAmount: number | null;
  overpaidAmount: number | null;
}

function emptyInvalidResult(
  hasItems: boolean,
  errors: string[],
  lineResults: Record<string, SaleLineCalculationResult>,
  paidTotal: number | null
): SaleCalculationResult {
  return {
    isValid: false,
    hasItems,
    errors,
    lineResults,
    subtotalMerch: null,
    netMerch: null,
    totalDeposit: null,
    grandTotal: null,
    paidTotal,
    remainingAmount: null,
    overpaidAmount: null,
  };
}

/* ============================================================================
 * Calcul global exact du panier (lignes, panachage, remises & règlements)
 * ============================================================================ */

/**
 * Calcule de manière exacte (BigInt) les lignes, remises, consignes et règlements du panier POS.
 * En cas d'erreur de quantité, de fraction interdite, de fraction de FCFA ou de débordement,
 * isValid vaut false et les totaux agrégés sont mis à null afin de ne jamais afficher un montant approximatif.
 */
export function calculateSaleCart(
  items: readonly SaleCalculationItem[],
  globalDiscountInput: number,
  payments: readonly SalePaymentInput[] = []
): SaleCalculationResult {
  const lineResults: Record<string, SaleLineCalculationResult> = {};
  const errors: string[] = [];

  let subtotalMerchBig = 0n;
  let totalDepositBig = 0n;
  let allLinesValid = true;
  const sharedDeposits = new Map<number, SharedDepositAccumulator>();

  /* --- 1. Validation & calcul ligne par ligne --- */
  for (const item of items) {
    const label = `${item.productName} (${item.packagingName})`;
    const failLine = (msg: string): void => {
      allLinesValid = false;
      errors.push(msg);
      lineResults[item.key] = {
        valid: false,
        qtyMilli: null,
        baseQtyMilli: null,
        lineGross: null,
        lineNet: null,
        lineDeposit: null,
        error: msg,
      };
    };

    const parsedQty = parseQtyInputToMilliBigInt(item.quantity, `Quantité (${label})`);
    if (!parsedQty.ok) {
      failLine(parsedQty.error);
      continue;
    }
    const qtyMilli = parsedQty.milli;

    if (!item.allowFraction && qtyMilli % 1000n !== 0n) {
      failLine(`Quantité entière requise pour "${label}".`);
      continue;
    }

    const baseCheck = computeExactBaseQtyMilli(qtyMilli, item.coefficientMilli, label);
    if (!baseCheck.ok) {
      failLine(baseCheck.error);
      continue;
    }

    const parsedPrice = toNonNegativeIntFcfaBigInt(item.unitPrice, `Prix unitaire (${label})`);
    if (!parsedPrice.ok) {
      failLine(parsedPrice.error);
      continue;
    }

    const grossCheck = computeExactLineGrossFcfa(qtyMilli, parsedPrice.fcfa, label);
    if (!grossCheck.ok) {
      failLine(grossCheck.error);
      continue;
    }

    const parsedDisc = toNonNegativeIntFcfaBigInt(item.discountAmount ?? 0, `Remise (${label})`);
    if (!parsedDisc.ok) {
      failLine(parsedDisc.error);
      continue;
    }
    if (parsedDisc.fcfa > grossCheck.amount) {
      failLine(`Remise supérieure au montant de ligne pour "${label}".`);
      continue;
    }

    const depCheck = computeLineDepositFcfa({
      label,
      qtyMilli,
      baseMilli: baseCheck.baseMilli,
      depositMode: item.depositMode,
      depositPerPack: item.depositPerPack,
      depositComponents: item.depositComponents,
      sharedDeposits,
    });
    if (!depCheck.ok) {
      failLine(depCheck.error);
      continue;
    }

    const lineNetBig = grossCheck.amount - parsedDisc.fcfa;
    const qtyNum = bigIntToSafeNumber(qtyMilli, `Quantité (${label})`);
    const baseNum = bigIntToSafeNumber(baseCheck.baseMilli, `Quantité de base (${label})`);
    const grossNum = bigIntToSafeNumber(grossCheck.amount, `Montant brut (${label})`);
    const netNum = bigIntToSafeNumber(lineNetBig, `Montant net (${label})`);
    const depNum = bigIntToSafeNumber(depCheck.amount, `Consigne (${label})`);
    if (!qtyNum.ok || !baseNum.ok || !grossNum.ok || !netNum.ok || !depNum.ok) {
      failLine(`Débordement numérique sur "${label}".`);
      continue;
    }

    subtotalMerchBig += lineNetBig;
    totalDepositBig += depCheck.amount;
    lineResults[item.key] = {
      valid: true,
      qtyMilli: qtyNum.num,
      baseQtyMilli: baseNum.num,
      lineGross: grossNum.num,
      lineNet: netNum.num,
      lineDeposit: depNum.num,
      error: null,
    };
  }

  /* --- 2. Consolidation des casiers partagés (panachage demi-casiers) --- */
  const pooledDeposits = consolidateSharedDeposits(sharedDeposits, errors);
  if (!pooledDeposits.ok) {
    allLinesValid = false;
  } else {
    totalDepositBig += pooledDeposits.amount;
    if (totalDepositBig > MAX_SAFE_BIG) {
      allLinesValid = false;
      errors.push('Total des consignes hors limites.');
    }
  }

  /* --- 3. Validation des paiements & remise globale --- */
  let paidTotalBig = 0n;
  let paymentsValid = true;
  for (const p of payments) {
    const parsedPay = toNonNegativeIntFcfaBigInt(p.amount, `Paiement (${p.method_code})`);
    if (!parsedPay.ok) {
      paymentsValid = false;
      errors.push(parsedPay.error);
      break;
    }
    paidTotalBig += parsedPay.fcfa;
    if (paidTotalBig > MAX_SAFE_BIG) {
      paymentsValid = false;
      errors.push('Total encaissé hors limites.');
      break;
    }
  }
  const paidTotal = paymentsValid ? Number(paidTotalBig) : null;

  const parsedGlobalDisc = toNonNegativeIntFcfaBigInt(globalDiscountInput, 'Remise globale');
  if (!parsedGlobalDisc.ok) {
    errors.push(parsedGlobalDisc.error);
  }

  const hasItems = items.length > 0;
  if (!hasItems || !allLinesValid || !parsedGlobalDisc.ok || !paymentsValid) {
    return emptyInvalidResult(hasItems, errors, lineResults, paidTotal);
  }

  if (parsedGlobalDisc.fcfa > subtotalMerchBig) {
    errors.push('La remise globale dépasse le sous-total marchandises.');
    return emptyInvalidResult(hasItems, errors, lineResults, paidTotal);
  }

  /* --- 4. Totaux finaux & reste dû / trop-perçu --- */
  const netMerchBig = subtotalMerchBig - parsedGlobalDisc.fcfa;
  const grandTotalBig = netMerchBig + totalDepositBig;

  const subRes = bigIntToSafeNumber(subtotalMerchBig, 'Sous-total marchandises');
  const netRes = bigIntToSafeNumber(netMerchBig, 'Total marchandises');
  const depRes = bigIntToSafeNumber(totalDepositBig, 'Total consignes');
  const grandRes = bigIntToSafeNumber(grandTotalBig, 'Total général');

  if (!subRes.ok || !netRes.ok || !depRes.ok || !grandRes.ok) {
    errors.push('Le total calculé dépasse la capacité numérique autorisée.');
    return emptyInvalidResult(hasItems, errors, lineResults, paidTotal);
  }

  if (grandTotalBig <= 0n) {
    errors.push('Le total de la vente doit être strictement positif.');
    return {
      ...emptyInvalidResult(hasItems, errors, lineResults, paidTotal),
      subtotalMerch: subRes.num,
      netMerch: netRes.num,
      totalDeposit: depRes.num,
    };
  }

  const remainingBig = grandTotalBig > paidTotalBig ? grandTotalBig - paidTotalBig : 0n;
  const overpaidBig = paidTotalBig > grandTotalBig ? paidTotalBig - grandTotalBig : 0n;

  return {
    isValid: true,
    hasItems: true,
    errors: [],
    lineResults,
    subtotalMerch: subRes.num,
    netMerch: netRes.num,
    totalDeposit: depRes.num,
    grandTotal: grandRes.num,
    paidTotal,
    remainingAmount: Number(remainingBig),
    overpaidAmount: Number(overpaidBig),
  };
}
