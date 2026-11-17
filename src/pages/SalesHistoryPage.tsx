import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import type { ColumnDef } from '@tanstack/react-table';
import { Search, Eye, Printer, RotateCcw, Ban, X } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { DataTable } from '../components/tables/DataTable.tsx';
import { StatusBadge } from '../components/common/StatusBadge.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import {
  DocumentPrintModal,
  type PrintableDocumentData,
} from '../components/documents/DocumentPrintModal.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { SaleDetail, SaleSummary } from '../types/erp.ts';
import { formatDateTime, formatFcfa, formatQty, newRequestKey } from '../utils/format.ts';

export function SalesHistoryPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);

  const [selectedSale, setSelectedSale] = useState<SaleDetail | null>(null);
  const [printDoc, setPrintDoc] = useState<PrintableDocumentData | null>(null);
  const [cancelTarget, setCancelTarget] = useState<SaleDetail | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [returnTarget, setReturnTarget] = useState<SaleDetail | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [returnQtyByLine, setReturnQtyByLine] = useState<Record<number, string>>({});
  const [restockApproved, setRestockApproved] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['sales', search, status, page],
    queryFn: () => apiClient.listSales({ search, status, page, pageSize: 20 }),
  });

  const openDetail = async (id: number) => {
    setActionError(null);
    const detail = await apiClient.getSaleDetail(id);
    setSelectedSale(detail);
  };

  const cancelMutation = useMutation({
    mutationFn: () => {
      if (!cancelTarget) throw new Error('Aucune vente sélectionnée');
      return apiClient.cancelSale(cancelTarget.id, {
        reason: cancelReason,
        refund_method_code: 'cash',
        request_key: newRequestKey('cancel'),
      });
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setCancelTarget(null);
      setCancelReason('');
      setSelectedSale(updated);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Erreur annulation.'),
  });

  const returnMutation = useMutation({
    mutationFn: () => {
      if (!returnTarget) throw new Error('Aucune vente sélectionnée');
      const lines = Object.entries(returnQtyByLine)
        .filter(([, q]) => Number(q) > 0)
        .map(([lineId, q]) => ({ sale_line_id: Number(lineId), base_quantity: q }));
      return apiClient.createSaleReturn(returnTarget.id, {
        request_key: newRequestKey('ret'),
        reason: returnReason,
        restock_approved: restockApproved,
        refund_method_code: 'cash',
        lines,
      });
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setReturnTarget(null);
      setReturnReason('');
      setReturnQtyByLine({});
      setSelectedSale(updated);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Erreur retour.'),
  });

  const columns: ColumnDef<SaleSummary>[] = [
    {
      accessorKey: 'reference',
      header: 'Référence',
      cell: ({ row }) => (
        <span className="font-mono-num text-xs font-semibold">{row.original.reference}</span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Date',
      cell: ({ row }) => (
        <span className="font-mono-num text-xs text-[#667085] dark:text-slate-400">
          {formatDateTime(row.original.created_at)}
        </span>
      ),
    },
    {
      accessorKey: 'client_name',
      header: 'Client',
    },
    {
      accessorKey: 'total_amount',
      header: 'Total',
      cell: ({ row }) => (
        <span className="font-mono-num font-semibold">{formatFcfa(row.original.total_amount)}</span>
      ),
    },
    {
      accessorKey: 'paid_amount',
      header: 'Payé',
      cell: ({ row }) => (
        <span className="font-mono-num text-[#16A36A] dark:text-emerald-400">
          {formatFcfa(row.original.paid_amount)}
        </span>
      ),
    },
    {
      accessorKey: 'remaining_amount',
      header: 'Reste',
      cell: ({ row }) => (
        <span
          className={`font-mono-num ${
            row.original.remaining_amount > 0 ? 'font-semibold text-[#D9901A]' : 'text-[#667085]'
          }`}
        >
          {formatFcfa(row.original.remaining_amount)}
        </span>
      ),
    },
    {
      accessorKey: 'payment_labels',
      header: 'Mode',
      cell: ({ row }) => (
        <span className="text-xs text-[#667085] dark:text-slate-400">
          {row.original.payment_labels || (row.original.sale_type === 'credit' ? 'Crédit' : '—')}
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
        <button
          type="button"
          onClick={() => openDetail(row.original.id)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <Eye className="h-3.5 w-3.5" />
          Détails
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Référence vente ou client..."
            className="w-72 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3 py-2 text-xs font-medium"
        >
          <option value="all">Tous les statuts</option>
          <option value="validated">Validées</option>
          <option value="partially_returned">Retour partiel</option>
          <option value="returned">Retournées</option>
          <option value="cancelled">Annulées</option>
        </select>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : error || !data ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Erreur de chargement.'}
          onRetry={() => refetch()}
        />
      ) : (
        <DataTable
          data={data.items}
          columns={columns as ColumnDef<SaleSummary, unknown>[]}
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          onPageChange={setPage}
          emptyMessage="Aucune vente enregistrée."
        />
      )}

      {/* Modal Détail Facture / Reçu */}
      <Dialog.Root open={Boolean(selectedSale)} onOpenChange={(o) => !o && setSelectedSale(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            {selectedSale && (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <Dialog.Title className="font-display text-lg font-bold">
                        {selectedSale.reference}
                      </Dialog.Title>
                      <StatusBadge status={selectedSale.status} />
                    </div>
                    <p className="mt-1 text-xs text-[#667085] dark:text-slate-400">
                      {formatDateTime(selectedSale.created_at)} · Client : {selectedSale.client_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 no-print">
                    <button
                      type="button"
                      onClick={() =>
                        setPrintDoc({
                          docType: selectedSale.sale_type === 'credit' ? 'FACTURE' : 'REÇU DE VENTE',
                          reference: selectedSale.reference,
                          date: selectedSale.created_at,
                          statusLabel: selectedSale.status,
                          partyTitle: 'Client',
                          partyName: selectedSale.client_name,
                          partyDetails: [selectedSale.client_code, selectedSale.client_phone]
                            .filter(Boolean)
                            .join(' · '),
                          lines: [
                            ...selectedSale.lines.map((l) => ({
                              label: l.product_name,
                              sublabel: `${l.packaging_name} (×${l.coefficient_milli / 1000} ${l.base_unit})`,
                              quantity: formatQty(l.quantity_milli),
                              unitPrice: l.unit_price,
                              total: l.line_total,
                            })),
                            ...selectedSale.deposits.map((d) => ({
                              label: `Consigne : ${d.packaging_name}`,
                              sublabel: `Code ${d.packaging_code}`,
                              quantity: `${d.pieces} pcs`,
                              unitPrice: d.unit_value,
                              total: d.amount,
                            })),
                          ],
                          payments: selectedSale.payments.map((p) => ({
                            label: `${p.method_label} (${p.reference})`,
                            amount: p.part_amount,
                          })),
                          summaryRows: [
                            { label: 'Total Marchandises', value: formatFcfa(selectedSale.total_merchandise) },
                            { label: 'Consignes emballages', value: formatFcfa(selectedSale.total_deposit) },
                            { label: 'Total TTC', value: formatFcfa(selectedSale.total_amount), bold: true },
                            {
                              label: 'Encaissé',
                              value: formatFcfa(selectedSale.paid_amount),
                              tone: 'success',
                            },
                            ...(selectedSale.remaining_amount > 0
                              ? [
                                  {
                                    label: 'Reste à payer',
                                    value: formatFcfa(selectedSale.remaining_amount),
                                    tone: 'warning' as const,
                                    bold: true,
                                  },
                                ]
                              : []),
                          ],
                          notes: selectedSale.notes,
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Facture / Reçu
                    </button>
                    <Dialog.Close className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                      <X className="h-4 w-4" />
                    </Dialog.Close>
                  </div>
                </div>

                {actionError && (
                  <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs text-[#DC4545]">
                    {actionError}
                  </div>
                )}

                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[#667085]">
                      <th className="py-2">Article</th>
                      <th className="py-2">Qté</th>
                      <th className="py-2 text-right">PU</th>
                      <th className="py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedSale.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="py-2">
                          <div className="font-medium">{l.product_name}</div>
                          <div className="text-[11px] text-[#667085] capitalize">
                            {l.packaging_name} (×{l.coefficient_milli / 1000} {l.base_unit})
                          </div>
                        </td>
                        <td className="py-2 font-mono-num">{formatQty(l.quantity_milli)}</td>
                        <td className="py-2 text-right font-mono-num">{formatFcfa(l.unit_price)}</td>
                        <td className="py-2 text-right font-mono-num font-semibold">
                          {formatFcfa(l.line_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span>Marchandises</span>
                    <span className="font-mono-num">{formatFcfa(selectedSale.total_merchandise)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Consignes</span>
                    <span className="font-mono-num">{formatFcfa(selectedSale.total_deposit)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm pt-1 border-t border-slate-200 dark:border-slate-800">
                    <span>Total TTC</span>
                    <span className="font-mono-num">{formatFcfa(selectedSale.total_amount)}</span>
                  </div>
                  <div className="flex justify-between text-[#16A36A]">
                    <span>Encaissé</span>
                    <span className="font-mono-num">{formatFcfa(selectedSale.paid_amount)}</span>
                  </div>
                  {selectedSale.remaining_amount > 0 && (
                    <div className="flex justify-between text-[#D9901A] font-semibold">
                      <span>Reste à payer</span>
                      <span className="font-mono-num">{formatFcfa(selectedSale.remaining_amount)}</span>
                    </div>
                  )}
                </div>

                {selectedSale.returns.length > 0 && (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs space-y-2">
                    <div className="font-semibold text-[#D9901A]">Avoirs / Retours émis</div>
                    {selectedSale.returns.map((ret) => (
                      <div key={ret.id} className="flex items-center justify-between gap-2">
                        <div>
                          <span className="font-mono-num font-semibold">{ret.credit_note_ref}</span> ·{' '}
                          <span className="font-mono-num">{formatFcfa(ret.total_amount)}</span> ({ret.reason})
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setPrintDoc({
                              docType: 'AVOIR CLIENT',
                              reference: ret.credit_note_ref,
                              date: ret.created_at,
                              partyTitle: 'Client (sur vente ' + selectedSale.reference + ')',
                              partyName: selectedSale.client_name,
                              lines: [
                                {
                                  label: `Avoir sur retour marchandises (${ret.reference})`,
                                  sublabel: ret.reason,
                                  quantity: '1',
                                  unitPrice: ret.total_amount,
                                  total: ret.total_amount,
                                },
                              ],
                              summaryRows: [
                                { label: 'Montant Avoir', value: formatFcfa(ret.total_amount), bold: true },
                                { label: 'Réduction créance', value: formatFcfa(ret.credit_reduction) },
                                { label: 'Remboursement', value: formatFcfa(ret.refund_amount), tone: 'warning' },
                              ],
                              notes: ret.reason,
                            })
                          }
                          className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-medium"
                        >
                          <Printer className="h-3 w-3" />
                          Avoir
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {selectedSale.status !== 'cancelled' && (
                  <div className="flex justify-end gap-3 pt-2 no-print">
                    <button
                      type="button"
                      onClick={() => {
                        setActionError(null);
                        setReturnTarget(selectedSale);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-medium"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Retour & Avoir
                    </button>
                    {selectedSale.returns.length === 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setActionError(null);
                          setCancelTarget(selectedSale);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#DC4545] px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-700"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Annuler la vente
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Modal Annulation par contre-écriture (unique) */}
      <Dialog.Root open={Boolean(cancelTarget)} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <Dialog.Title className="font-display text-base font-semibold text-[#DC4545]">
                Annulation par contre-écriture · {cancelTarget?.reference}
              </Dialog.Title>
              <FormTipsButton topicId="sales-history" label="Règles" />
            </div>
            <p className="mt-1.5 text-xs text-[#667085] dark:text-slate-400">
              Le stock sera réintégré et les encaissements remboursés sur la session de caisse ouverte.
            </p>
            {actionError && (
              <div className="mt-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs text-[#DC4545]">
                {actionError}
              </div>
            )}
            <div className="mt-4">
              <label className="block text-xs font-medium">Motif obligatoire *</label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex : Erreur de saisie client"
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button type="button" className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium">
                  Fermer
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={!cancelReason.trim() || cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
                className="rounded-lg bg-[#DC4545] px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
              >
                Confirmer contre-écriture
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Dialog Retour Partiel */}
      <Dialog.Root open={Boolean(returnTarget)} onOpenChange={(o) => !o && setReturnTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <Dialog.Title className="font-display text-base font-semibold">
                Retour de marchandises · {returnTarget?.reference}
              </Dialog.Title>
              <FormTipsButton topicId="sales-history" label="Aide avoir" />
            </div>
            {actionError && (
              <div className="mt-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs text-[#DC4545]">
                {actionError}
              </div>
            )}
            <div className="mt-4 space-y-3">
              {returnTarget?.lines.map((l) => {
                const maxBase = (l.base_quantity_milli - l.returned_base_milli) / 1000;
                return (
                  <div key={l.id} className="flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-medium">{l.product_name}</div>
                      <div className="text-[#667085]">Max retournable : {maxBase} {l.base_unit}</div>
                    </div>
                    <input
                      type="text"
                      value={returnQtyByLine[l.id] || ''}
                      onChange={(e) =>
                        setReturnQtyByLine((prev) => ({ ...prev, [l.id]: e.target.value }))
                      }
                      placeholder="0"
                      className="w-24 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono-num text-right"
                    />
                  </div>
                );
              })}

              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={restockApproved}
                  onChange={(e) => setRestockApproved(e.target.checked)}
                />
                <span>Réintégrer les marchandises en stock (état conforme)</span>
              </label>

              <div>
                <label className="block text-xs font-medium">Motif du retour *</label>
                <input
                  type="text"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button type="button" className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium">
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={!returnReason.trim() || returnMutation.isPending}
                onClick={() => returnMutation.mutate()}
                className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
              >
                Générer l'avoir
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <DocumentPrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />
    </div>
  );
}
