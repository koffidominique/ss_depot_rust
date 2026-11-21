import {
  getSalesUnitTierPrice,
  getTierPrice,
} from '../hooks/usePosData.ts';
import type { CartItem } from '../../../stores/uiStore.ts';
import type {
  PriceTier,
  Product,
  ProductPackaging,
  ProductSalesUnit,
} from '../../../types/erp.ts';

export function buildCartItemFromPackaging(
  prod: Product,
  pkg: ProductPackaging,
  tier: PriceTier
): { ok: true; item: CartItem } | { ok: false; error: string } {
  if (prod.allow_unit_sale === 0 && (pkg.name === 'bouteille' || pkg.name === 'canette')) {
    return {
      ok: false,
      error: `La vente unitaire est désactivée pour "${prod.name}".`,
    };
  }
  const compDeposit =
    pkg.deposit_mode === 'deposit'
      ? pkg.components.reduce((acc, c) => acc + c.pieces_per_pack * c.deposit_value, 0)
      : 0;
  const explicitDeposit = (pkg.bottle_deposit_amount ?? 0) + (pkg.package_deposit_amount ?? 0);
  const depositPerPack = compDeposit > 0 ? compDeposit : explicitDeposit;
  const depositMode = pkg.deposit_mode === 'deposit' || depositPerPack > 0 ? 'deposit' : 'none';
  return {
    ok: true,
    item: {
      key: `${prod.id}-${pkg.id}`,
      productId: prod.id,
      productName: prod.name,
      reference: prod.reference,
      baseUnit: prod.base_unit,
      stockMilli: prod.stock_milli,
      packagingId: pkg.id,
      packagingName: pkg.name,
      salesUnitId: null,
      salesUnitLabel: pkg.display_label || pkg.name,
      coefficientMilli: pkg.coefficient_milli,
      allowFraction: pkg.allow_fraction === 1,
      quantity: '1',
      supportQuantity: '1',
      unitPrice: getTierPrice(pkg, tier),
      discountAmount: 0,
      depositPerPack,
      depositMode,
      depositComponents: pkg.components,
    },
  };
}

export function buildCartItemFromSalesUnit(
  prod: Product,
  unit: ProductSalesUnit,
  tier: PriceTier
): { ok: true; item: CartItem } | { ok: false; error: string } {
  const fallbackPkg =
    prod.packagings.find((pk) => pk.id === unit.packaging_id && pk.is_active) ??
    prod.packagings.find((pk) => pk.is_active);
  if (!fallbackPkg) {
    return {
      ok: false,
      error: `Aucun conditionnement actif trouvé pour "${prod.name}".`,
    };
  }
  const depositPerPack = unit.bottle_deposit_amount + unit.crate_deposit_amount;
  return {
    ok: true,
    item: {
      key: `${prod.id}-su-${unit.id}`,
      productId: prod.id,
      productName: prod.name,
      reference: prod.reference,
      baseUnit: prod.base_unit,
      stockMilli: prod.stock_milli,
      packagingId: fallbackPkg.id,
      packagingName: fallbackPkg.name,
      salesUnitId: unit.id,
      salesUnitLabel: unit.label,
      coefficientMilli: unit.conversion_factor * 1000,
      allowFraction: unit.allow_fraction === 1,
      quantity: '1',
      supportQuantity: '1',
      unitPrice: getSalesUnitTierPrice(unit, tier),
      discountAmount: 0,
      depositPerPack,
      depositMode: depositPerPack > 0 ? 'deposit' : 'none',
      depositComponents: [],
    },
  };
}

export function matchBarcodeProduct(
  products: Product[],
  code: string
):
  | { type: 'unit'; prod: Product; unit: ProductSalesUnit }
  | { type: 'pkg'; prod: Product; pkg: ProductPackaging }
  | null {
  const lower = code.trim().toLowerCase();
  if (!lower) return null;
  for (const prod of products) {
    const su = prod.sales_units?.find(
      (u) => u.is_active === 1 && u.barcode && u.barcode.trim().toLowerCase() === lower
    );
    if (su) return { type: 'unit', prod, unit: su };
    const pk = prod.packagings.find(
      (p) => p.is_active && p.barcode && p.barcode.trim().toLowerCase() === lower
    );
    if (pk) return { type: 'pkg', prod, pkg: pk };
  }
  const prod = products.find(
    (p) =>
      (p.barcode && p.barcode.trim().toLowerCase() === lower) ||
      p.reference.toLowerCase() === lower
  );
  const defaultPkg =
    prod?.packagings.find((pk) => pk.is_active && pk.is_default_sale === 1) ??
    prod?.packagings.find((pk) => pk.is_active);
  return prod && defaultPkg ? { type: 'pkg', prod, pkg: defaultPkg } : null;
}
