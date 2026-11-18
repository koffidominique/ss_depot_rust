import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Plus, Trash2 } from 'lucide-react';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { MoneyInput } from '../../../components/common/MoneyInput.tsx';
import { QuantityInput } from '../../../components/common/QuantityInput.tsx';
import type { Product, Supplier } from '../../../types/erp.ts';
import { formatQty } from '../../../utils/format.ts';

interface PoLineInput {
  product_id: number;
  packaging_id: number;
  quantity: string;
  unit_price: number;
}

interface PurchaseOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers?: Supplier[];
  products: Product[];
  error: string | null;
  isPending: boolean;
  onSubmit: (values: { supplierId: number; lines: PoLineInput[] }) => void;
}

function PurchaseOrderFormBody({
  suppliers,
  products,
  isPending,
  onSubmit,
}: {
  suppliers?: Supplier[];
  products: Product[];
  isPending: boolean;
  onSubmit: PurchaseOrderModalProps['onSubmit'];
}) {
  const [supplierId, setSupplierId] = useState<number>(suppliers?.[0]?.id ?? 0);
  const [poLines, setPoLines] = useState<PoLineInput[]>([]);

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
                      {pk.name} (×{formatQty(pk.coefficient_milli)})
                    </option>
                  ))}
                </select>
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
          disabled={poLines.length === 0 || isPending}
          onClick={() => onSubmit({ supplierId, lines: poLines })}
          className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          Valider la commande
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
}: PurchaseOrderModalProps) {
  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nouveau bon de commande fournisseur"
      tipsTopicId="purchases"
      tipsLabel="Aide commande"
      maxWidthClass="max-w-2xl"
      scrollable
      error={error}
    >
      {open && (
        <PurchaseOrderFormBody
          key={String(suppliers?.[0]?.id ?? 0)}
          suppliers={suppliers}
          products={products}
          isPending={isPending}
          onSubmit={onSubmit}
        />
      )}
    </ModalDialog>
  );
}
