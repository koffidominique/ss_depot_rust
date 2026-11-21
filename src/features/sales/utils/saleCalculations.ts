import type { DepositComponent } from '../../../types/erp.ts';

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

const MAX_SAFE_BIG = BigInt(Number.MAX_SAFE_INTEGER);

function bigIntToSafeNumber(value: bigint, label: string): { ok: true; num: number } | { ok: false; error: string } {
  if (value < 0n || value > MAX_SAFE_BIG) {
    return { ok: false, error: `${label} dépasse la capacité numérique autorisée.` };
  }
  return { ok: true, num: Number(value) };
}

/**
 * Parse une quantité saisie (ex: "2", "1.5", "1,250") en milli-unités exactes via BigInt.
 * Refuse les valeurs nulles, négatives, incomplètes ("1.", ".5") ou > 3 décimales.
 */
export function parseQtyInputToMilliBigInt(
  raw: string,
  label = 'Quantité'
): { ok: true; milli: bigint } | { ok: false; error: string } {
  const clean = String(raw ?? '').trim().replace(',', '.');
  if (!clean) {
    return { ok: false, error: `${label} : saisie requise.` };
  }
  if (!/^\d+(\.\d{1,3})?$/.test(clean)) {
    if (/^\d+\.$/.test(clean)) {
      return { ok: false, error: `${label} : saisie décimale incomplète.` };
    }
    if (/^\d+\.\d{4,}$/.test(clean)) {
      return { ok: false, error: `${label} : maximum 3 décimales autorisées sans arrondi.` };
    }
    return { ok: false, error: `${label} invalide.` };
  }
  const [intPart, fracPart = ''] = clean.split('.');
  const milli = BigInt(intPart) * 1000n + BigInt(fracPart.padEnd(3, '0'));
  if (milli <= 0n) {
    return { ok: false, error: `${label} doit être strictement positive.` };
  }
  if (milli > MAX_SAFE_BIG) {
    return { ok: false, error: `${label} dépasse la limite autorisée.` };
  }
  return { ok: true, milli };
}

/**
 * Valide un entier FCFA >= 0 dans l'intervalle sûr IEEE-754 et le retourne en BigInt.
 */
export function toNonNegativeIntFcfaBigInt(
  value: unknown,
  label = 'Montant'
): { ok: true; fcfa: bigint } | { ok: false; error: string } {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      return { ok: false, error: `${label} doit être un entier FCFA positif ou nul.` };
    }
    if (!Number.isSafeInteger(value)) {
      return { ok: false, error: `${label} dépasse la capacité numérique autorisée.` };
    }
    return { ok: true, fcfa: BigInt(value) };
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/\s+/g, '');
    if (!/^\d+$/.test(trimmed)) {
      return { ok: false, error: `${label} doit être un entier FCFA positif ou nul.` };
    }
    const big = BigInt(trimmed);
    if (big > MAX_SAFE_BIG) {
      return { ok: false, error: `${label} dépasse la capacité numérique autorisée.` };
    }
    return { ok: true, fcfa: big };
  }
  return { ok: false, error: `${label} invalide.` };
}

/**
 * Calcule le montant brut exact d'une ligne = (qtyMilli * unitPriceFcfa) / 1000.
 * Exige un entier FCFA exact (zéro arrondi silencieux).
 */
export function computeExactLineGrossFcfa(
  qtyMilli: bigint,
  unitPriceFcfa: bigint,
  label = 'Ligne'
): { ok: true; amount: bigint } | { ok: false; error: string } {
  const prod = qtyMilli * unitPriceFcfa;
  if (prod % 1000n !== 0n) {
    return {
      ok: false,
      error: `${label} : le produit quantité × prix unitaire ne correspond pas à un nombre entier de FCFA.`,
    };
  }
  const res = prod / 1000n;
  if (res > MAX_SAFE_BIG) {
    return { ok: false, error: `${label} : montant hors limites.` };
  }
  return { ok: true, amount: res };
}

export function computeExactBaseQtyMilli(
  qtyMilli: bigint,
  coeffMilli: number,
  label = 'Ligne'
): { ok: true; baseMilli: bigint } | { ok: false; error: string } {
  if (!Number.isSafeInteger(coeffMilli) || coeffMilli <= 0) {
    return { ok: false, error: `${label} : coefficient de conditionnement invalide.` };
  }
  const prod = qtyMilli * BigInt(coeffMilli);
  if (prod % 1000n !== 0n) {
    return {
      ok: false,
      error: `${label} : conversion en unité de base non exacte au millième.`,
    };
  }
  const res = prod / 1000n;
  if (res <= 0n || res > MAX_SAFE_BIG) {
    return { ok: false, error: `${label} : quantité de base hors limites.` };
  }
  return { ok: true, baseMilli: res };
}

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
  const sharedDeposits = new Map<
    number,
    { name: string; depositValue: number; milliPieces: bigint }
  >();

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

    let lineDepositBig = 0n;
    if (item.depositMode === null) {
      failLine(`Le profil de consigne de "${label}" n'est pas configuré.`);
      continue;
    }
    if (item.depositMode === 'deposit') {
      if (baseCheck.baseMilli % 1000n !== 0n) {
        failLine(
          `Les ventes consignées doivent correspondre à un nombre entier d'unités de base pour "${label}".`
        );
        continue;
      }

      if (item.depositComponents && item.depositComponents.length > 0) {
        let componentError: string | null = null;
        for (const comp of item.depositComponents) {
          const parsedDepVal = toNonNegativeIntFcfaBigInt(
            comp.deposit_value,
            `Consigne (${comp.name})`
          );
          if (!parsedDepVal.ok) {
            componentError = parsedDepVal.error;
            break;
          }
          const lineMilliPieces = qtyMilli * BigInt(comp.pieces_per_pack);
          if (comp.kind === 'bottle' && lineMilliPieces % 1000n === 0n) {
            const pieces = lineMilliPieces / 1000n;
            lineDepositBig += pieces * parsedDepVal.fcfa;
            if (lineDepositBig > MAX_SAFE_BIG) {
              componentError = `Montant de consigne hors limites pour "${label}".`;
              break;
            }
          } else {
            const prev = sharedDeposits.get(comp.returnable_id);
            sharedDeposits.set(comp.returnable_id, {
              name: comp.name,
              depositValue: Number(parsedDepVal.fcfa),
              milliPieces: (prev?.milliPieces ?? 0n) + lineMilliPieces,
            });
          }
        }
        if (componentError) {
          failLine(componentError);
          continue;
        }
      } else {
        if (qtyMilli % 1000n !== 0n) {
          failLine(`Les emballages consignés exigent des quantités entières pour "${label}".`);
          continue;
        }
        const parsedDepPerPack = toNonNegativeIntFcfaBigInt(
          item.depositPerPack,
          `Consigne unitaire (${label})`
        );
        if (!parsedDepPerPack.ok) {
          failLine(parsedDepPerPack.error);
          continue;
        }
        const packs = qtyMilli / 1000n;
        lineDepositBig = packs * parsedDepPerPack.fcfa;
        if (lineDepositBig > MAX_SAFE_BIG) {
          failLine(`Montant de consigne hors limites pour "${label}".`);
          continue;
        }
      }
    }

    const lineNetBig = grossCheck.amount - parsedDisc.fcfa;
    const qtyNum = bigIntToSafeNumber(qtyMilli, `Quantité (${label})`);
    const baseNum = bigIntToSafeNumber(baseCheck.baseMilli, `Quantité de base (${label})`);
    const grossNum = bigIntToSafeNumber(grossCheck.amount, `Montant brut (${label})`);
    const netNum = bigIntToSafeNumber(lineNetBig, `Montant net (${label})`);
    const depNum = bigIntToSafeNumber(lineDepositBig, `Consigne (${label})`);
    if (!qtyNum.ok || !baseNum.ok || !grossNum.ok || !netNum.ok || !depNum.ok) {
      failLine(`Débordement numérique sur "${label}".`);
      continue;
    }

    subtotalMerchBig += lineNetBig;
    totalDepositBig += lineDepositBig;
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

  for (const acc of sharedDeposits.values()) {
    if (acc.milliPieces % 1000n !== 0n) {
      allLinesValid = false;
      const intPart = acc.milliPieces / 1000n;
      const fracPart = acc.milliPieces % 1000n;
      const formatted =
        fracPart === 0n
          ? intPart.toString()
          : `${intPart.toString()}.${fracPart.toString().padStart(3, '0').replace(/0+$/, '')}`;
      errors.push(
        `Panachage incomplet pour « ${acc.name} » : la somme des demi-casiers doit former un nombre entier de casiers (total actuel : ${formatted}).`
      );
      continue;
    }
    const pieces = acc.milliPieces / 1000n;
    totalDepositBig += pieces * BigInt(acc.depositValue);
    if (totalDepositBig > MAX_SAFE_BIG) {
      allLinesValid = false;
      errors.push(`Montant de consigne hors limites pour « ${acc.name} ».`);
    }
  }

  // Validation paiements (indépendant du panier)
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

  // Remise globale
  const parsedGlobalDisc = toNonNegativeIntFcfaBigInt(globalDiscountInput, 'Remise globale');
  if (!parsedGlobalDisc.ok) {
    errors.push(parsedGlobalDisc.error);
  }

  const hasItems = items.length > 0;
  if (!hasItems || !allLinesValid || !parsedGlobalDisc.ok || !paymentsValid) {
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

  if (parsedGlobalDisc.fcfa > subtotalMerchBig) {
    errors.push('La remise globale dépasse le sous-total marchandises.');
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

  const netMerchBig = subtotalMerchBig - parsedGlobalDisc.fcfa;
  const grandTotalBig = netMerchBig + totalDepositBig;

  const subRes = bigIntToSafeNumber(subtotalMerchBig, 'Sous-total marchandises');
  const netRes = bigIntToSafeNumber(netMerchBig, 'Total marchandises');
  const depRes = bigIntToSafeNumber(totalDepositBig, 'Total consignes');
  const grandRes = bigIntToSafeNumber(grandTotalBig, 'Total général');

  if (!subRes.ok || !netRes.ok || !depRes.ok || !grandRes.ok) {
    errors.push('Le total calculé dépasse la capacité numérique autorisée.');
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

  if (grandTotalBig <= 0n) {
    errors.push('Le total de la vente doit être strictement positif.');
    return {
      isValid: false,
      hasItems,
      errors,
      lineResults,
      subtotalMerch: subRes.num,
      netMerch: netRes.num,
      totalDeposit: depRes.num,
      grandTotal: null,
      paidTotal,
      remainingAmount: null,
      overpaidAmount: null,
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
