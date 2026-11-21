import type { DepositComponent } from '../../../types/erp.ts';

/* ============================================================================
 * Utilitaires mathématiques BigInt exacts (FCFA entiers & milli-unités)
 * ============================================================================ */

export const MAX_SAFE_BIG = BigInt(Number.MAX_SAFE_INTEGER);

export function bigIntToSafeNumber(
  value: bigint,
  label: string
): { ok: true; num: number } | { ok: false; error: string } {
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

/* ============================================================================
 * Calcul des consignations (bouteilles individuelles & casiers mutualisés)
 * ============================================================================ */

export interface SharedDepositAccumulator {
  name: string;
  depositValue: number;
  milliPieces: bigint;
}

export function computeLineDepositFcfa(params: {
  label: string;
  qtyMilli: bigint;
  baseMilli: bigint;
  depositMode: 'none' | 'deposit' | null;
  depositPerPack: number;
  depositComponents?: DepositComponent[];
  sharedDeposits: Map<number, SharedDepositAccumulator>;
}): { ok: true; amount: bigint } | { ok: false; error: string } {
  const {
    label,
    qtyMilli,
    baseMilli,
    depositMode,
    depositPerPack,
    depositComponents,
    sharedDeposits,
  } = params;

  if (depositMode === null) {
    return { ok: false, error: `Le profil de consigne de "${label}" n'est pas configuré.` };
  }
  if (depositMode !== 'deposit') {
    return { ok: true, amount: 0n };
  }
  if (baseMilli % 1000n !== 0n) {
    return {
      ok: false,
      error: `Les ventes consignées doivent correspondre à un nombre entier d'unités de base pour "${label}".`,
    };
  }

  let lineDepositBig = 0n;
  if (depositComponents && depositComponents.length > 0) {
    for (const comp of depositComponents) {
      const parsedDepVal = toNonNegativeIntFcfaBigInt(
        comp.deposit_value,
        `Consigne (${comp.name})`
      );
      if (!parsedDepVal.ok) {
        return { ok: false, error: parsedDepVal.error };
      }
      const lineMilliPieces = qtyMilli * BigInt(comp.pieces_per_pack);
      if (comp.kind === 'bottle' && lineMilliPieces % 1000n === 0n) {
        const pieces = lineMilliPieces / 1000n;
        lineDepositBig += pieces * parsedDepVal.fcfa;
        if (lineDepositBig > MAX_SAFE_BIG) {
          return { ok: false, error: `Montant de consigne hors limites pour "${label}".` };
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
    return { ok: true, amount: lineDepositBig };
  }

  const parsedDepPerPack = toNonNegativeIntFcfaBigInt(
    depositPerPack,
    `Consigne unitaire (${label})`
  );
  if (!parsedDepPerPack.ok) {
    return { ok: false, error: parsedDepPerPack.error };
  }
  const depComputed = computeExactLineGrossFcfa(
    qtyMilli,
    parsedDepPerPack.fcfa,
    `Consigne (${label})`
  );
  if (!depComputed.ok) {
    return { ok: false, error: depComputed.error };
  }
  return { ok: true, amount: depComputed.amount };
}

export function consolidateSharedDeposits(
  sharedDeposits: Map<number, SharedDepositAccumulator>,
  errors: string[]
): { ok: boolean; amount: bigint } {
  let pooled = 0n;
  let valid = true;

  for (const acc of sharedDeposits.values()) {
    if (acc.milliPieces % 1000n !== 0n) {
      valid = false;
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
    pooled += pieces * BigInt(acc.depositValue);
    if (pooled > MAX_SAFE_BIG) {
      valid = false;
      errors.push(`Montant de consigne hors limites pour « ${acc.name} ».`);
    }
  }

  return { ok: valid, amount: pooled };
}
