/* ============================================================================
 * Helpers purs de composition mixte & brouillon hors-ligne (localStorage)
 * ============================================================================ */

import type {
  ComposePreviewResult,
  OrderRequestedUnit,
  PackagingAsset,
  PreviewAllocation,
  PreviewLine,
  Product,
} from "../../../types/erp.ts";

export interface DraftOrderLine {
  key: string;
  product_id: number | null;
  variant_id: number | null;
  requested_unit: OrderRequestedUnit;
  requested_quantity: number;
  unit_price_xof: number;
}

export interface OrderDraftState {
  customer_id: number | null;
  payment_method: "cash" | "mobile_money" | "credit" | "mixed";
  discount_xof: number;
  delivery_address: string;
  notes: string;
  lines: DraftOrderLine[];
  custom_allocations: PreviewAllocation[] | null;
}

const DRAFT_STORAGE_KEY = "depotpro.order_draft.v1";

export function loadOrderDraft(): OrderDraftState | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrderDraftState;
    if (!parsed || !Array.isArray(parsed.lines)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveOrderDraft(draft: OrderDraftState): void {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // ignore storage quota errors
  }
}

export function clearOrderDraft(): void {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export interface VariantOption {
  variant_id: number;
  product_id: number;
  label: string;
  compatibility_class: string;
  native_crate_capacity: number | null;
  default_unit_price_xof: number;
  crate_coeff: number;
}

export function extractVariantOptions(products: Product[] | undefined): VariantOption[] {
  if (!products) return [];
  const opts: VariantOption[] = [];
  for (const p of products) {
    if (!p.is_active) continue;
    const firstPkg = p.packagings[0];
    const cratePkg = p.packagings.find((pk) => pk.name === "casier" || pk.name === "carton");
    const crateCoeff = cratePkg ? Math.max(1, Math.round(cratePkg.coefficient_milli / 1000)) : 24;
    const unitSales = p.sales_units?.find(
      (u) => (u.unit_type === "bottle" || u.unit_type === "can") && u.retail_price != null,
    );
    const unitPrice =
      unitSales?.retail_price ??
      (firstPkg?.retail_price
        ? Math.round(firstPkg.retail_price / Math.max(1, Math.round(firstPkg.coefficient_milli / 1000)))
        : p.retail_price ?? 0);

    if (p.variants && p.variants.length > 0) {
      for (const v of p.variants) {
        if (!v.is_active) continue;
        opts.push({
          variant_id: v.id,
          product_id: p.id,
          label: `${p.name} — ${v.volume_ml ? `${Math.round(v.volume_ml / 10)}cl` : v.name}`,
          compatibility_class: v.compatibility_class ?? "other",
          native_crate_capacity: v.native_crate_capacity ?? crateCoeff,
          default_unit_price_xof: unitPrice,
          crate_coeff: v.native_crate_capacity ?? crateCoeff,
        });
      }
    }
  }
  return opts;
}

export function resolveLocalFactor(unit: OrderRequestedUnit, opt: VariantOption): number {
  if (unit === "unit" || unit === "bottle" || unit === "can") return 1;
  if (unit === "half_crate") return Math.max(1, Math.floor((opt.native_crate_capacity ?? opt.crate_coeff) / 2));
  if (unit === "crate" || unit === "carton") return opt.native_crate_capacity ?? opt.crate_coeff;
  if (unit === "pack") return 6;
  if (unit === "pallet") return (opt.native_crate_capacity ?? opt.crate_coeff) * 20;
  return 1;
}

export function computeLocalComposition(
  draftLines: DraftOrderLine[],
  options: VariantOption[],
  assets: PackagingAsset[],
  discountXof: number,
): ComposePreviewResult {
  const optMap = new Map(options.map((o) => [o.variant_id, o]));
  const lines: PreviewLine[] = [];
  const grouped = new Map<string, number>();
  const nativeCaps = new Map<string, number>();

  for (const dl of draftLines) {
    if (!dl.variant_id || dl.requested_quantity <= 0) continue;
    const opt = optMap.get(dl.variant_id);
    if (!opt) continue;
    const factor = resolveLocalFactor(dl.requested_unit, opt);
    const baseQty = dl.requested_quantity * factor;
    const unitPrice = Math.max(0, Math.round(dl.unit_price_xof));
    lines.push({
      variant_id: opt.variant_id,
      product_id: opt.product_id,
      product_name: opt.label,
      variant_name: opt.label,
      compatibility_class: opt.compatibility_class,
      requested_unit: dl.requested_unit,
      requested_quantity: dl.requested_quantity,
      units_per_requested_unit: factor,
      base_quantity: baseQty,
      unit_price_xof: unitPrice,
      discount_xof: 0,
      line_total_xof: baseQty * unitPrice,
    });
    grouped.set(opt.compatibility_class, (grouped.get(opt.compatibility_class) ?? 0) + baseQty);
    if (opt.native_crate_capacity && !nativeCaps.has(opt.compatibility_class)) {
      nativeCaps.set(opt.compatibility_class, opt.native_crate_capacity);
    }
  }

  const allocations: PreviewAllocation[] = [];
  const warnings: string[] = [];

  for (const [compat, totalBottles] of grouped.entries()) {
    const classAssets = assets
      .filter((a) => a.compatibility_class === compat && a.is_active === 1 && a.capacity > 0)
      .sort((a, b) => b.capacity - a.capacity);
    if (classAssets.length === 0) {
      if (compat !== "other" && !compat.startsWith("pet_") && !compat.startsWith("glass_disp_")) {
        warnings.push(`Aucun casier physique disponible pour ${compat}`);
      }
      continue;
    }
    const prefCap = nativeCaps.get(compat);
    const pref = prefCap ? classAssets.find((a) => a.capacity === prefCap) : undefined;
    const chosen =
      pref && (totalBottles <= pref.capacity || totalBottles % pref.capacity === 0)
        ? pref
        : classAssets[0];

    const full = Math.floor(totalBottles / chosen.capacity);
    const rem = totalBottles % chosen.capacity;
    let qty = full;
    if (rem > 0) {
      if (rem >= 6) {
        qty += 1;
        warnings.push(`Casier partiel : ${rem} bouteilles sur ${chosen.capacity} dans la classe ${compat}`);
      } else {
        warnings.push(`${rem} bouteilles vendues à l'unité (pas de casier dédié)`);
      }
    }
    if (qty > 0) {
      const isConsigned = chosen.returnable === 1;
      const unitDep = isConsigned ? chosen.deposit_value : 0;
      allocations.push({
        packaging_asset_id: chosen.id,
        packaging_name: chosen.name,
        compatibility_class: compat,
        capacity: chosen.capacity,
        quantity: qty,
        is_consigned: isConsigned,
        deposit_amount_xof: unitDep,
        total_deposit_xof: unitDep * qty,
      });
    }
  }

  const subtotal = lines.reduce((acc, l) => acc + l.line_total_xof, 0);
  const depositTotal = allocations
    .filter((a) => a.is_consigned)
    .reduce((acc, a) => acc + a.quantity * a.deposit_amount_xof, 0);
  const totalXof = Math.max(0, subtotal - Math.max(0, discountXof));
  return {
    lines,
    allocations,
    warnings,
    totals: {
      subtotal_xof: subtotal,
      deposit_total_xof: depositTotal,
      discount_xof: discountXof,
      tax_xof: 0,
      total_xof: totalXof,
      deposit_due_xof: depositTotal,
      total_to_collect_xof: totalXof + depositTotal,
    },
  };
}
