import * as Dialog from '@radix-ui/react-dialog';
import { Ban, Printer, RotateCcw, X } from 'lucide-react';
import { StatusBadge } from '../../../components/common/StatusBadge.tsx';
import { InlineAlert } from '../../../components/common/InlineAlert.tsx';
import type { PrintableDocumentData } from '../../../components/documents/DocumentPrintModal.tsx';
import type { SaleDetail } from '../../../types/erp.ts';
import { formatDateTime, formatFcfa, formatQty, packagingContentsLabel } from '../../../utils/format.ts';
import { buildSalePrintableDoc } from './ValidatedSaleBanner.tsx';

interface SaleDetailModalProps {
  sale: SaleDetail | null;
  actionError: string | null;
  onClose: () => void;
  onPrint: (doc: PrintableDocumentData) => void;
  onOpenReturn: (sale: SaleDetail) => void;
  onOpenCancel: (sale: SaleDetail) => void;
}

export function SaleDetailModal({
  sale,
  actionError,
  onClose,
  onPrint,
  onOpenReturn,
  onOpenCancel,
}: SaleDetailModalProps) {
  return (
    <Dialog.Root open={Boolean(sale)} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
          {sale && (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <Dialog.Title className="font-display text-lg font-bold">
                      {sale.reference}
                    </Dialog.Title>
                    <StatusBadge status={sale.status} />
                  </div>
                  <p className="mt-1 text-xs text-[#667085] dark:text-slate-400">
                    {formatDateTime(sale.created_at)} · Client : {sale.client_name}
                  </p>
                </div>
                <div className="flex items-center gap-2 no-print">
                  <button
                    type="button"
                    onClick={() => onPrint(buildSalePrintableDoc(sale))}
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

              {actionError && <InlineAlert message={actionError} />}

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
                  {sale.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2">
                        <div className="font-medium">{l.product_name}</div>
                        <div className="text-[11px] text-[#667085]">
                          Conditionnement : {l.sales_unit_label || l.packaging_name} · {packagingContentsLabel(l.sales_unit_label || l.packaging_name, l.base_unit, l.coefficient_milli)} · total {formatQty(l.base_quantity_milli)} {l.base_unit}
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
                  <span className="font-mono-num">{formatFcfa(sale.total_merchandise)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Retour emballages</span>
                  <span className="font-mono-num">{formatFcfa(sale.total_deposit)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm pt-1 border-t border-slate-200 dark:border-slate-800">
                  <span>Total TTC</span>
                  <span className="font-mono-num">{formatFcfa(sale.total_amount)}</span>
                </div>
                <div className="flex justify-between text-[#16A36A]">
                  <span>Encaissé</span>
                  <span className="font-mono-num">{formatFcfa(sale.paid_amount)}</span>
                </div>
                {sale.remaining_amount > 0 && (
                  <div className="flex justify-between text-[#D9901A] font-semibold">
                    <span>Reste à payer</span>
                    <span className="font-mono-num">{formatFcfa(sale.remaining_amount)}</span>
                  </div>
                )}
              </div>

              {sale.deposits.length > 0 && (
                <div className="rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 p-3 text-xs space-y-1.5">
                  <div className="font-semibold text-[#1D4ED8] dark:text-blue-400">
                    Emballages consignés &amp; bouteilles vides à restituer
                  </div>
                  {sale.deposits.map((d) => (
                    <div key={d.id} className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">
                          {d.packaging_name} ({d.packaging_code}) · {d.returned_pieces}/{d.pieces}{' '}
                          retourné(s)
                        </div>
                        {d.expected_products && (
                          <div className="text-[11px] text-[#667085] dark:text-slate-400">
                            Produits attendus : {d.expected_products}
                          </div>
                        )}
                      </div>
                      <span className="font-mono-num font-semibold shrink-0">
                        {formatFcfa(d.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {sale.returns.length > 0 && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs space-y-2">
                  <div className="font-semibold text-[#D9901A]">Avoirs / Retours émis</div>
                  {sale.returns.map((ret) => (
                    <div key={ret.id} className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-mono-num font-semibold">{ret.credit_note_ref}</span> ·{' '}
                        <span className="font-mono-num">{formatFcfa(ret.total_amount)}</span> (
                        {ret.reason})
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onPrint({
                            docType: 'AVOIR CLIENT',
                            reference: ret.credit_note_ref,
                            date: ret.created_at,
                            partyTitle: 'Client (sur vente ' + sale.reference + ')',
                            partyName: sale.client_name,
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
                              {
                                label: 'Montant Avoir',
                                value: formatFcfa(ret.total_amount),
                                bold: true,
                              },
                              {
                                label: 'Réduction créance',
                                value: formatFcfa(ret.credit_reduction),
                              },
                              {
                                label: 'Remboursement',
                                value: formatFcfa(ret.refund_amount),
                                tone: 'warning',
                              },
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

              {sale.status !== 'cancelled' && (
                <div className="flex justify-end gap-3 pt-2 no-print">
                  <button
                    type="button"
                    onClick={() => onOpenReturn(sale)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-medium"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retour & Avoir
                  </button>
                  {sale.returns.length === 0 && (
                    <button
                      type="button"
                      onClick={() => onOpenCancel(sale)}
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
  );
}
