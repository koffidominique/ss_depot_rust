import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, PackageCheck, Printer, Trash2, X } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { DataTable } from '../components/tables/DataTable.tsx';
import { StatusBadge } from '../components/common/StatusBadge.tsx';
import { MoneyInput } from '../components/common/MoneyInput.tsx';
import { QuantityInput } from '../components/common/QuantityInput.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import {
  DocumentPrintModal,
  type PrintableDocumentData,
} from '../components/documents/DocumentPrintModal.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { PurchaseOrder } from '../types/erp.ts';
import { formatDateTime, formatFcfa, formatQty, newRequestKey } from '../utils/format.ts';

export function PurchasesPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [printDoc, setPrintDoc] = useState<PrintableDocumentData | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrder | null>(null);
  const [receiveQty, setReceiveQty] = useState<Record<number, string>>({});
  const [receiveReason, setReceiveReason] = useState<Record<number, string>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState<number>(0);
  const [poLines, setPoLines] = useState<
    Array<{ product_id: number; packaging_id: number; quantity: string; unit_price: number }>
  >([]);

  const { data: orders, isLoading, error, refetch } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => apiClient.listPurchases(),
  });
  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => apiClient.listSuppliers(),
  });
  const { data: productsRes } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => apiClient.listProducts({ page: 1, pageSize: 100 }),
  });

  const products = productsRes?.items || [];

  const createPoMutation = useMutation({
    mutationFn: () =>
      apiClient.createPurchaseOrder({
        request_key: newRequestKey('po'),
        supplier_id: supplierId,
        lines: poLines,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      setCreateOpen(false);
      setPoLines([]);
      setErrorMsg(null);
    },
    onError: (err) => setErrorMsg(err instanceof Error ? err.message : 'Erreur commande.'),
  });

  const receiveMutation = useMutation({
    mutationFn: () => {
      if (!receiveTarget) throw new Error('Commande non sélectionnée');
      const lines = Object.entries(receiveQty)
        .filter(([, q]) => Number(q) > 0)
        .map(([lineId, q]) => ({
          purchase_order_line_id: Number(lineId),
          received_quantity: q,
          discrepancy_reason: receiveReason[Number(lineId)] || undefined,
        }));
      return apiClient.receivePurchaseOrder(receiveTarget.id, {
        request_key: newRequestKey('rec'),
        lines,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['products-all'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['supplier-debts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setReceiveTarget(null);
      setReceiveQty({});
      setReceiveReason({});
      setErrorMsg(null);
    },
    onError: (err) => setErrorMsg(err instanceof Error ? err.message : 'Erreur réception.'),
  });

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

  const columns: ColumnDef<PurchaseOrder>[] = [
    {
      accessorKey: 'reference',
      header: 'Commande',
      cell: ({ row }) => (
        <div>
          <div className="font-mono-num text-xs font-semibold">{row.original.reference}</div>
          <div className="font-mono-num text-[11px] text-[#667085]">
            {formatDateTime(row.original.created_at)}
          </div>
        </div>
      ),
    },
    { accessorKey: 'supplier_name', header: 'Fournisseur' },
    {
      accessorKey: 'total_amount',
      header: 'Montant commandé',
      cell: ({ row }) => <span className="font-mono-num">{formatFcfa(row.original.total_amount)}</span>,
    },
    {
      accessorKey: 'received_amount',
      header: 'Montant réceptionné',
      cell: ({ row }) => (
        <span className="font-mono-num font-semibold text-[#16A36A]">
          {formatFcfa(row.original.received_amount)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setPrintDoc({
                docType: row.original.receipts.length > 0 ? 'BON DE RÉCEPTION' : 'BON DE COMMANDE',
                reference: row.original.receipts[0]?.reference || row.original.reference,
                date: row.original.receipts[0]?.created_at || row.original.created_at,
                statusLabel: row.original.status,
                partyTitle: 'Fournisseur',
                partyName: row.original.supplier_name,
                partyDetails: `Code ${row.original.supplier_code} · Commande ${row.original.reference}`,
                lines: row.original.lines.map((l) => ({
                  label: l.product_name,
                  sublabel: `${l.packaging_name} (×${l.coefficient_milli / 1000} ${l.base_unit}) · Reçu : ${formatQty(l.received_quantity_milli)} / ${formatQty(l.ordered_quantity_milli)}`,
                  quantity: formatQty(l.ordered_quantity_milli),
                  unitPrice: l.unit_price,
                  total: l.line_total,
                })),
                summaryRows: [
                  { label: 'Total commandé', value: formatFcfa(row.original.total_amount) },
                  {
                    label: 'Total réceptionné',
                    value: formatFcfa(row.original.received_amount),
                    tone: 'success',
                    bold: true,
                  },
                ],
                notes: row.original.notes,
              })
            }
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Printer className="h-3.5 w-3.5" />
            Bon
          </button>
          {row.original.status !== 'received' && row.original.status !== 'cancelled' && (
            <button
              type="button"
              onClick={() => {
                setReceiveTarget(row.original);
                const initQty: Record<number, string> = {};
                row.original.lines.forEach((l) => {
                  const rem = (l.ordered_quantity_milli - l.received_quantity_milli) / 1000;
                  if (rem > 0) initQty[l.id] = String(rem);
                });
                setReceiveQty(initQty);
                setErrorMsg(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <PackageCheck className="h-3.5 w-3.5" />
              Réceptionner
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-[#667085] dark:text-slate-400">
          Le bon de commande ne modifie pas le stock : seule une réception validée augmente les quantités et génère la dette fournisseur.
        </p>
        <button
          type="button"
          onClick={() => {
            setSupplierId(suppliers?.[0]?.id ?? 0);
            setPoLines([]);
            setErrorMsg(null);
            setCreateOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          Nouveau bon de commande
        </button>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : error || !orders ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Erreur chargement achats.'}
          onRetry={() => refetch()}
        />
      ) : (
        <DataTable
          data={orders}
          columns={columns as ColumnDef<PurchaseOrder, unknown>[]}
          emptyMessage="Aucun bon de commande créé."
        />
      )}

      {/* Modal Création Bon de Commande */}
      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <Dialog.Title className="font-display text-base font-semibold">
                Nouveau bon de commande fournisseur
              </Dialog.Title>
              <div className="flex items-center gap-2">
                <FormTipsButton topicId="purchases" label="Aide commande" />
                <Dialog.Close className="rounded-lg p-1 text-slate-400">
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>
            </div>

            {errorMsg && (
              <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-[#DC4545]">{errorMsg}</div>
            )}

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
                            {pk.name} (×{pk.coefficient_milli / 1000})
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
                <button type="button" className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium">
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={poLines.length === 0 || createPoMutation.isPending}
                onClick={() => createPoMutation.mutate()}
                className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                Valider la commande
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Modal Réception partielle / totale */}
      <Dialog.Root open={Boolean(receiveTarget)} onOpenChange={(o) => !o && setReceiveTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <Dialog.Title className="font-display text-base font-semibold">
                Réceptionner · {receiveTarget?.reference}
              </Dialog.Title>
              <FormTipsButton topicId="purchases" label="Aide réception" />
            </div>
            {errorMsg && (
              <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-[#DC4545]">{errorMsg}</div>
            )}
            <div className="mt-4 space-y-3">
              {receiveTarget?.lines.map((l) => {
                const rem = (l.ordered_quantity_milli - l.received_quantity_milli) / 1000;
                if (rem <= 0) return null;
                return (
                  <div
                    key={l.id}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2 text-xs"
                  >
                    <div className="flex justify-between">
                      <span className="font-semibold">{l.product_name}</span>
                      <span className="font-mono-num text-[#667085]">
                        Restant : {rem} {l.packaging_name} (×{l.coefficient_milli / 1000} {l.base_unit})
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <QuantityInput
                        label="Quantité reçue"
                        value={receiveQty[l.id] || ''}
                        onChange={(v) => setReceiveQty((p) => ({ ...p, [l.id]: v }))}
                        unit={l.packaging_name}
                      />
                      <div>
                        <label className="block text-xs font-medium">Motif d'écart (optionnel)</label>
                        <input
                          type="text"
                          value={receiveReason[l.id] || ''}
                          onChange={(e) => setReceiveReason((p) => ({ ...p, [l.id]: e.target.value }))}
                          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button type="button" className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium">
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={receiveMutation.isPending}
                onClick={() => receiveMutation.mutate()}
                className="rounded-lg bg-[#16A36A] px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Valider la réception en stock
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <DocumentPrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />
    </div>
  );
}
