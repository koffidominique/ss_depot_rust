import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Plus, Trash2 } from 'lucide-react';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { MoneyInput } from '../../../components/common/MoneyInput.tsx';
import { QuantityInput } from '../../../components/common/QuantityInput.tsx';
import type { Product, PurchaseOrder, Supplier } from '../../../types/erp.ts';
import { packagingContentsLabel } from '../../../utils/format.ts';

interface PoLineInput {
  product_id: number;
  packaging_id: number;
  quantity: string;
  unit_price: number;
}

interface PackagingPreview {
  items: Array<{ name: string; code: string; kind: 'bottle' | 'crate'; pieces: number }>;
  error?: string;
}

function calculatePackagingPreview(line: PoLineInput, product: Product | undefined): PackagingPreview {
  const packaging = product?.packagings.find((item) => item.id === line.packaging_id);
  if (!product || !packaging) return { items: [], error: 'Sélectionnez un conditionnement valide.' };
  const quantity = Number(line.quantity);
  const quantityMilli = quantity * 1000;
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantityMilli)) {
    return { items: [], error: 'La quantité doit être positive et limitée à trois décimales.' };
  }
  if (packaging.deposit_mode == null) return { items: [], error: 'Profil d’emballage non configuré.' };
  if (packaging.deposit_mode === 'none') return { items: [] };
  if (packaging.components.length === 0) return { items: [], error: 'Conditionnement consigné sans composant configuré.' };
  const items: PackagingPreview['items'] = [];
  for (const component of packaging.components) {
    const numerator = quantityMilli * component.pieces_per_pack;
    if (!Number.isSafeInteger(numerator) || numerator % 1000 !== 0) {
      return { items: [], error: `Quantité physique fractionnaire pour ${component.code}.` };
    }
    items.push({ name: component.name, code: component.code, kind: component.kind, pieces: numerator / 1000 });
  }
  return { items };
}

interface PurchaseOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  correctionTarget?: PurchaseOrder | null;
  suppliers?: Supplier[];
  products: Product[];
  error: string | null;
  isPending: boolean;
  onSubmit: (values: { supplierId: number; lines: PoLineInput[]; purchaseOrderId?: number }) => void;
}

function PurchaseOrderFormBody({
  suppliers,
  products,
  isPending,
  onSubmit,
  correctionTarget,
}: {
  suppliers?: Supplier[];
  products: Product[];
  isPending: boolean;
  onSubmit: PurchaseOrderModalProps['onSubmit'];
  correctionTarget?: PurchaseOrder | null;
}) {
  const [supplierId, setSupplierId] = useState<number>(correctionTarget?.supplier_id ?? suppliers?.[0]?.id ?? 0);
  const [poLines, setPoLines] = useState<PoLineInput[]>(() => correctionTarget?.lines.map((line) => ({
    product_id: line.product_id,
    packaging_id: line.packaging_id,
    quantity: (line.ordered_quantity_milli / 1000).toFixed(3).replace(/\.?0+$/, ''),
    unit_price: line.unit_price,
  })) ?? []);

  const packagingPreviews = poLines.map((line) => calculatePackagingPreview(
    line,
    products.find((product) => product.id === line.product_id),
  ));
  const hasPackagingErrors = packagingPreviews.some((preview) => Boolean(preview.error));

  const addLine = () => {
    const firstProd = products[0];
    if (!firstProd) return;
    const firstPkg = firstProd.packagings[0];
    setPoLines((prev) => [
      ...prev,
      {
        product_id: firstProd.id,
        packaging_id: firstPkg?.id || 0,
        quantity: '1',
        unit_price: firstPkg?.purchase_price ?? firstProd.purchase_price ?? 0,
      },
    ]);
  };

  return (
    <>
      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-xs font-medium">Fournisseur *</label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            {suppliers?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">Lignes de commande</span>
          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB]"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter un article
          </button>
        </div>

        {poLines.map((line, idx) => {
          const prod = products.find((p) => p.id === line.product_id);
          const selectedPackaging = prod?.packagings.find((pk) => pk.id === line.packaging_id);
          const packagingPreview = packagingPreviews[idx];
          return (
            <div
              key={idx}
              className="grid grid-cols-12 items-end gap-2 rounded-lg border border-slate-200 dark:border-slate-800 p-3"
            >
              <div className="col-span-4">
                <label className="block text-[11px] text-[#667085]">Produit</label>
                <select
                  value={line.product_id}
                  onChange={(e) => {
                    const pid = Number(e.target.value);
                    const p = products.find((x) => x.id === pid);
                    const pk = p?.packagings[0];
                    setPoLines((prev) =>
                      prev.map((item, i) =>
                        i === idx
                          ? {
                              ...item,
                              product_id: pid,
                              packaging_id: pk?.id || 0,
                              unit_price: pk?.purchase_price ?? p?.purchase_price ?? 0,
                            }
                          : item
                      )
                    );
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2 text-xs"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-3">
                <label className="block text-[11px] text-[#667085]">Conditionnement</label>
                <select
                  value={line.packaging_id}
                  onChange={(e) => {
                    const pkId = Number(e.target.value);
                    const pk = prod?.packagings.find((x) => x.id === pkId);
                    setPoLines((prev) =>
                      prev.map((item, i) =>
                        i === idx
                          ? {
                              ...item,
                              packaging_id: pkId,
                              unit_price: pk?.purchase_price ?? item.unit_price,
                            }
                          : item
                      )
                    );
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2 text-xs"
                >
                  {(prod?.packagings || []).map((pk) => (
                    <option key={pk.id} value={pk.id}>
                      {packagingContentsLabel(pk.name, prod?.base_unit ?? pk.base_unit, pk.coefficient_milli)}
                    </option>
                  ))}
                </select>
                {prod && selectedPackaging && (
                  <p className="mt-1 rounded bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
                    {packagingContentsLabel(selectedPackaging.name, prod.base_unit, selectedPackaging.coefficient_milli)}
                  </p>
                )}
              </div>
              <div className="col-span-2">
                <QuantityInput
                  label="Qté"
                  value={line.quantity}
                  onChange={(q) =>
                    setPoLines((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, quantity: q } : item))
                    )
                  }
                />
              </div>
              <div className="col-span-2">
                <MoneyInput
                  label="PU achat"
                  value={line.unit_price}
                  onChange={(v) =>
                    setPoLines((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, unit_price: v } : item))
                    )
                  }
                />
              </div>
              <div className="col-span-1 flex justify-end pb-2">
                <button
                  type="button"
                  onClick={() => setPoLines((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-slate-400 hover:text-[#DC4545]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className={`col-span-12 rounded-md px-3 py-2 text-[11px] ${packagingPreview.error ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300' : 'bg-slate-50 text-slate-600 dark:bg-slate-900/70 dark:text-slate-300'}`}>
                {packagingPreview.error ? (
                  <span role="alert">{packagingPreview.error}</span>
                ) : packagingPreview.items.length > 0 ? (
                  <span>À préparer : {packagingPreview.items.map((item) => `${item.pieces} ${item.kind === 'bottle' ? 'bouteilles vides' : 'casiers/plastiques vides'} (${item.code})`).join(' · ')} · Total : {packagingPreview.items.reduce((sum, item) => sum + item.pieces, 0)} emballage(s)</span>
                ) : (
                  <span>Conditionnement non consigné : aucun emballage fournisseur requis.</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Dialog.Close asChild>
          <button
            type="button"
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium"
          >
            Annuler
          </button>
        </Dialog.Close>
        <button
          type="button"
          disabled={poLines.length === 0 || isPending || hasPackagingErrors}
          onClick={() => onSubmit({ supplierId, lines: poLines, purchaseOrderId: correctionTarget?.id })}
          className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          {correctionTarget ? 'Corriger et resoumettre à l’Owner' : 'Valider la commande'}
        </button>
      </div>
    </>
  );
}

export function PurchaseOrderModal({
  open,
  onOpenChange,
  suppliers,
  products,
  error,
  isPending,
  onSubmit,
  correctionTarget,
}: PurchaseOrderModalProps) {
  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      title={correctionTarget ? `Corriger ${correctionTarget.reference}` : 'Nouveau bon de commande fournisseur'}
      tipsTopicId="purchases"
      tipsLabel="Aide commande"
      maxWidthClass="max-w-2xl"
      scrollable
      error={error}
    >
      {open && (
        <PurchaseOrderFormBody
          key={`${correctionTarget?.id ?? 'new'}-${suppliers?.[0]?.id ?? 0}`}
          suppliers={suppliers}
          products={products}
          isPending={isPending}
          onSubmit={onSubmit}
          correctionTarget={correctionTarget}
        />
      )}
    </ModalDialog>
  );
}
