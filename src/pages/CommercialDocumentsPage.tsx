import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Download, FileClock, Printer, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { useUiStore } from '../stores/uiStore.ts';
import type { CommercialApprovalEvent, CommercialDocument, CommercialDocumentDetail, CommercialDocumentType } from '../types/erp.ts';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import { DocumentPrintModal, type PrintableDocumentData } from '../components/documents/DocumentPrintModal.tsx';
import { formatFcfa, formatQty, packagingContentsLabel } from '../utils/format.ts';

const PAGE_SIZE = 20;
const DOC_TYPES: Array<{ value: 'all' | CommercialDocumentType; label: string }> = [
  { value: 'all', label: 'Tous les documents' },
  { value: 'customer_order', label: 'Commandes clients' },
  { value: 'sales_receipt', label: 'Reçus de vente' },
  { value: 'purchase_order', label: 'Bons de commande fournisseurs' },
  { value: 'supplier_reception', label: 'Bons de réception fournisseurs' },
  { value: 'payment_receipt', label: 'Paiements' },
  { value: 'credit_note', label: 'Retours & avoirs' },
  { value: 'cancellation', label: 'Annulations' },
];

function typeLabel(type: CommercialDocumentType) {
  return DOC_TYPES.find((item) => item.value === type)?.label.replace(/s$/, '') ?? type;
}

function orderUnitLabel(unit: string) {
  const labels: Record<string, string> = {
    unit: 'unité', bottle: 'bouteille', can: 'canette', half_crate: 'demi-casier',
    crate: 'casier', pack: 'pack', carton: 'carton', pallet: 'palette',
  };
  return labels[unit] ?? unit;
}

function statusLabel(status: string | null) {
  const labels: Record<string, string> = {
    draft: 'Brouillon', pending_owner_approval: 'À approuver', approved: 'Approuvé',
    rejected: 'Rejeté', changes_requested: 'À modifier', confirmed: 'Confirmée',
    preparing: 'En préparation', delivered: 'Livrée', invoiced: 'Facturée', paid: 'Payée',
    cancelled: 'Annulée', validated: 'Validé', partially_returned: 'Retour partiel',
    returned: 'Retourné', partial: 'Partielle', received: 'Réceptionné',
  };
  if (!status) return '—';
  return labels[status] ?? status;
}

function canSubmit(doc: CommercialDocument) {
  if (!['customer_order', 'purchase_order'].includes(doc.documentType)) return false;
  if (doc.approvalStatus === 'pending_owner_approval' || doc.approvalStatus === 'approved') return false;
  if (doc.documentType === 'customer_order') return doc.status === 'draft';
  return !['cancelled', 'received'].includes(doc.status);
}

function ApprovalHistory({ events }: { events: CommercialApprovalEvent[] }) {
  if (!events.length) return <p className="py-3 text-xs text-slate-500">Aucun événement d’approbation.</p>;
  return <ol className="space-y-2 py-3">
    {events.map((event) => <li key={event.id} className="flex gap-2 text-xs">
      <FileClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
      <span><strong>{statusLabel(event.action)}</strong> · {new Date(event.createdAt).toLocaleString('fr-FR')}
        {event.reason ? <span className="block text-slate-500">Motif : {event.reason}</span> : null}
      </span>
    </li>)}
  </ol>;
}

export function CommercialDocumentsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const currentUser = useUiStore((store) => store.currentUser);
  const isOwner = currentUser?.role === 'owner';
  const [tab, setTab] = useState<'all' | 'approvals'>('all');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'all' | CommercialDocumentType>('all');
  const [status, setStatus] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'amount'>('newest');
  const [page, setPage] = useState(1);
  const [reviewTarget, setReviewTarget] = useState<CommercialDocument | null>(null);
  const [reasonTarget, setReasonTarget] = useState<{ doc: CommercialDocument; action: 'rejected' | 'changes_requested' } | null>(null);
  const [reason, setReason] = useState('');
  const [eventTarget, setEventTarget] = useState<CommercialDocument | null>(null);
  const [printTarget, setPrintTarget] = useState<CommercialDocument | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const documentQuery = {
    search, documentType: type, status, from, to, sort, page, pageSize: PAGE_SIZE,
    approvalsOnly: tab === 'approvals',
  };
  const documentsQuery = useQuery({
    queryKey: ['commercial-documents', documentQuery],
    queryFn: () => apiClient.listCommercialDocuments(documentQuery),
  });
  const eventsQuery = useQuery({
    queryKey: ['commercial-document-events', eventTarget?.documentType, eventTarget?.documentId],
    queryFn: () => apiClient.getCommercialDocumentEvents(
      eventTarget!.documentType as 'customer_order' | 'purchase_order', eventTarget!.documentId,
    ),
    enabled: Boolean(eventTarget && ['customer_order', 'purchase_order'].includes(eventTarget.documentType)),
  });

  const documentDetailQuery = useQuery({
    queryKey: ['commercial-document-detail', printTarget?.documentType, printTarget?.documentId],
    queryFn: () => apiClient.getCommercialDocumentDetail(printTarget!.documentType, printTarget!.documentId),
    enabled: Boolean(printTarget),
  });

  const reviewDetailsQuery = useQuery({
    queryKey: ['commercial-document-review', reviewTarget?.documentType, reviewTarget?.documentId],
    enabled: Boolean(reviewTarget),
    queryFn: async () => {
      const products = await apiClient.listProducts({ page: 1, pageSize: 200 });
      const stocks = Object.fromEntries(products.items.map((product) => [product.id, product.stock_milli]));
      if (reviewTarget?.documentType === 'customer_order') {
        const [detail, receivables] = await Promise.all([apiClient.getCustomerOrder(reviewTarget.documentId), apiClient.listReceivables()]);
        const customerBalance = receivables.filter((entry) => entry.client_id === detail.order.customer_id && ['open', 'partial'].includes(entry.status)).reduce((sum, entry) => sum + entry.remaining_amount, 0);
        return { kind: 'customer_order' as const, detail, stocks, customerBalance };
      }
      if (reviewTarget?.documentType === 'purchase_order') {
        const [purchaseOrders, supplierDebts] = await Promise.all([apiClient.listPurchases(), apiClient.listSupplierDebts()]);
        const purchase = purchaseOrders.find((entry) => entry.id === reviewTarget.documentId);
        if (!purchase) throw new Error('Bon fournisseur introuvable.');
        const supplierBalance = supplierDebts.filter((entry) => entry.supplier_id === purchase.supplier_id && ['open', 'partial'].includes(entry.status)).reduce((sum, entry) => sum + entry.remaining_amount, 0);
        return { kind: 'purchase_order' as const, purchase, stocks, supplierBalance };
      }
      throw new Error('Ce document ne nécessite pas d’approbation.');
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['commercial-documents'] });
  const submitMutation = useMutation({
    mutationFn: (doc: CommercialDocument) => apiClient.submitCommercialDocument(
      doc.documentType as 'customer_order' | 'purchase_order', doc.documentId,
    ),
    onSuccess: () => { setErrorMessage(''); refresh(); },
    onError: (error: Error) => setErrorMessage(error.message),
  });
  const reviewMutation = useMutation({
    mutationFn: ({ doc, action, note }: { doc: CommercialDocument; action: 'approved' | 'rejected' | 'changes_requested'; note?: string }) =>
      apiClient.reviewCommercialDocument(doc.documentType as 'customer_order' | 'purchase_order', doc.documentId, action, note),
    onSuccess: () => { setReasonTarget(null); setReviewTarget(null); setReason(''); setErrorMessage(''); refresh(); },
    onError: (error: Error) => setErrorMessage(error.message),
  });

  const visibleRows = documentsQuery.data?.rows ?? [];
  const total = documentsQuery.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const exportCsv = async () => {
    const first = await apiClient.listCommercialDocuments({ ...documentQuery, page: 1, pageSize: 200 });
    const allRows = [...first.rows];
    const pageCount = Math.ceil(first.total / first.pageSize);
    for (let current = 2; current <= pageCount; current += 1) {
      const next = await apiClient.listCommercialDocuments({ ...documentQuery, page: current, pageSize: first.pageSize });
      allRows.push(...next.rows);
    }
    const rows = allRows.map((doc) => [doc.documentType, doc.documentNumber, doc.counterparty, doc.status,
      doc.approvalStatus ?? '', doc.amountXof, doc.createdAt]);
    const csv = [['Type', 'Référence', 'Tiers', 'Statut', 'Approbation', 'Montant XOF', 'Date'], ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'documents-commerciaux.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const printRegister = () => {
    const popup = window.open('', '_blank', 'width=900,height=700');
    if (!popup) return;
    const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char] ?? char);
    const rows = visibleRows.map((doc) => `<tr><td>${escape(typeLabel(doc.documentType))}</td><td>${escape(doc.documentNumber)}</td><td>${escape(doc.counterparty)}</td><td>${escape(statusLabel(doc.approvalStatus ?? doc.status))}</td><td>${escape(formatFcfa(doc.amountXof))}</td><td>${escape(new Date(doc.createdAt).toLocaleString('fr-FR'))}</td></tr>`).join('');
    popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Registre documentaire</title><style>body{font:12px Arial,sans-serif;padding:24px;color:#111}h1{font-size:18px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #bbb;padding:7px;text-align:left}th{background:#eee}@media print{button{display:none}}</style></head><body><h1>Registre des documents commerciaux</h1><p>Page ${page} · ${total} document(s) filtré(s) · Imprimé le ${escape(new Date().toLocaleString('fr-FR'))}</p><table><thead><tr><th>Type</th><th>Référence</th><th>Tiers</th><th>Statut</th><th>Montant</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  };

  const reviewData = reviewDetailsQuery.data;
  const printableType: Record<CommercialDocumentType, PrintableDocumentData['docType']> = {
    customer_order: 'BON DE COMMANDE CLIENT – ACCUSÉ DE RÉCEPTION', sales_receipt: 'REÇU DE VENTE',
    purchase_order: 'BON DE COMMANDE', supplier_reception: 'BON DE RÉCEPTION',
    payment_receipt: 'REÇU DE PAIEMENT', credit_note: 'AVOIR CLIENT', cancellation: 'ANNULATION',
  };
  const detail = documentDetailQuery.data as CommercialDocumentDetail | undefined;
  const printableDocument: PrintableDocumentData | null = detail ? {
    docType: printableType[detail.documentType], reference: detail.documentNumber,
    date: detail.createdAt, statusLabel: statusLabel(detail.status),
    partyTitle: ['purchase_order', 'supplier_reception'].includes(detail.documentType) ? 'Fournisseur' : 'Client',
    partyName: detail.counterparty,
    lines: detail.lines.map((line) => ({
      label: line.label, sublabel: line.detail ?? undefined,
      quantity: `${formatQty(line.quantityMilli)} ${line.unit}`,
      unitPrice: line.unitPriceXof, total: line.amountXof,
    })),
    packagingLines: detail.packagingLines.map((line) => ({
      label: line.label,
      kind: line.kind === 'bottle' || line.kind === 'crate' ? line.kind : 'other',
      expectedQuantity: line.expectedQuantity,
      issuedQuantity: line.issuedQuantity ?? undefined,
      returnedQuantity: line.returnedQuantity ?? undefined,
      statusLabel: line.statusLabel,
      detail: line.detail ?? undefined,
      amount: line.amount ?? undefined,
    })),
    summaryRows: [{ label: 'Total', value: formatFcfa(detail.amountXof), bold: true }],
    payments: detail.payments.map((payment) => ({ label: payment.label, amount: payment.amountXof })),
    notes: detail.notes,
  } : null;

  if (documentsQuery.isLoading) return <LoadingState rows={7} />;
  if (documentsQuery.error) return <ErrorState message={documentsQuery.error instanceof Error ? documentsQuery.error.message : 'Chargement impossible.'} onRetry={() => void documentsQuery.refetch()} />;

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Commerce · Traçabilité</p>
        <h1 className="mt-1 font-display text-xl font-semibold">Registre des documents commerciaux</h1>
        <p className="mt-1 text-xs text-slate-500">Ventes clients et achats fournisseurs restent des flux distincts. Valider une vente n’émet jamais de bon fournisseur; les achats sont créés depuis le module Achats.</p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => void documentsQuery.refetch()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium"><RefreshCw className="h-3.5 w-3.5" /> Actualiser</button>
        <button type="button" onClick={() => void exportCsv().catch((error: unknown) => setErrorMessage(error instanceof Error ? error.message : 'Échec de l’export CSV.'))} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"><Download className="h-3.5 w-3.5" /> CSV</button>
        <button type="button" onClick={printRegister} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold dark:border-slate-700"><Printer className="h-3.5 w-3.5" /> Imprimer</button>
      </div>
    </header>

    {errorMessage && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{errorMessage}</div>}

    <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
      <button type="button" onClick={() => { setTab('all'); setPage(1); }} className={`border-b-2 px-3 py-2 text-xs font-semibold ${tab === 'all' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500'}`}>Tous les documents ({documentsQuery.data?.total ?? 0})</button>
      <button type="button" onClick={() => { setTab('approvals'); setPage(1); }} className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold ${tab === 'approvals' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500'}`}><ShieldCheck className="h-3.5 w-3.5" /> Approbations ({documentsQuery.data?.pendingCount ?? 0})</button>
    </div>

    <section className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#111A2E] sm:grid-cols-2 lg:grid-cols-6">
      <input aria-label="Recherche documents" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Référence, client, fournisseur…" className="rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-xs dark:border-slate-700 lg:col-span-2" />
      <select aria-label="Type de document" value={type} onChange={(e) => { setType(e.target.value as typeof type); setPage(1); }} className="rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-xs dark:border-slate-700">{DOC_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
      <select aria-label="Statut document" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-xs dark:border-slate-700">
        <option value="all">Tous les statuts</option><option value="pending_owner_approval">À approuver</option><option value="approved">Approuvés</option><option value="rejected">Rejetés</option><option value="changes_requested">À modifier</option><option value="draft">Brouillons</option><option value="cancelled">Annulés</option><option value="received">Réceptionnés</option><option value="validated">Validés</option>
      </select>
      <select aria-label="Tri documents" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-xs dark:border-slate-700"><option value="newest">Plus récents</option><option value="oldest">Plus anciens</option><option value="amount">Montant décroissant</option></select>
      <div className="flex items-center gap-1"><input aria-label="Date de début" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-transparent px-2 py-2 text-xs dark:border-slate-700" /><input aria-label="Date de fin" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-transparent px-2 py-2 text-xs dark:border-slate-700" /></div>
    </section>

    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#111A2E]">
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-900/60"><tr><th className="px-4 py-3">Document</th><th className="px-4 py-3">Tiers</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Statut</th><th className="px-4 py-3 text-right">Montant</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {visibleRows.map((doc) => {
            const pending = doc.approvalStatus === 'pending_owner_approval';
            const approvable = doc.documentType === 'customer_order' || doc.documentType === 'purchase_order';
            return <tr key={`${doc.documentType}-${doc.documentId}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/30">
              <td className="px-4 py-3"><div className="font-semibold">{doc.documentNumber}</div><div className="mt-1 text-[11px] text-slate-500">{typeLabel(doc.documentType)}</div></td>
              <td className="px-4 py-3">{doc.counterparty}</td>
              <td className="px-4 py-3 whitespace-nowrap">{new Date(doc.createdAt).toLocaleString('fr-FR')}</td>
              <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${pending ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : doc.approvalStatus === 'approved' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{statusLabel(doc.approvalStatus ?? doc.status)}</span></td>
              <td className="px-4 py-3 text-right font-mono-num font-semibold">{formatFcfa(doc.amountXof)}</td>
              <td className="px-4 py-3"><div className="flex justify-end gap-1.5">
                <button type="button" onClick={() => setPrintTarget(doc)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1.5 font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300"><Printer className="h-3 w-3" /> Document</button>
                {canSubmit(doc) && <button type="button" disabled={submitMutation.isPending} onClick={() => submitMutation.mutate(doc)} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-2 py-1.5 font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-900 dark:text-blue-300"><Send className="h-3 w-3" /> Soumettre</button>}
                {isOwner && pending && <button type="button" onClick={() => setReviewTarget(doc)} className="rounded-lg bg-amber-500 px-2 py-1.5 font-semibold text-white">Examiner</button>}
                {approvable && <button type="button" onClick={() => setEventTarget(doc)} className="rounded-lg border border-slate-200 px-2 py-1.5 font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">Historique</button>}
                {(doc.documentType === 'customer_order' && doc.approvalStatus === 'approved') && <button type="button" onClick={() => navigate('/orders')} className="rounded-lg bg-blue-600 px-2 py-1.5 font-semibold text-white">Ouvrir commande</button>}
                {(doc.documentType === 'purchase_order' && doc.approvalStatus === 'approved') && <button type="button" onClick={() => navigate('/purchases')} className="rounded-lg bg-blue-600 px-2 py-1.5 font-semibold text-white">Réception</button>}
              </div></td>
            </tr>;
          })}
          {!visibleRows.length && <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">Aucun document correspondant aux filtres.</td></tr>}
        </tbody>
      </table></div>
      <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs dark:border-slate-800"><span className="text-slate-500">{total} document(s)</span><div className="flex items-center gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((n) => n - 1)} className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40 dark:border-slate-700">Précédent</button><span>Page {page} / {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage((n) => n + 1)} className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40 dark:border-slate-700">Suivant</button></div></footer>
    </div>

    {reviewTarget && <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setReviewTarget(null); }}><section role="dialog" aria-modal="true" aria-labelledby="review-document-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-[#111A2E]"><div className="flex items-start justify-between gap-3"><div><h2 id="review-document-title" className="font-display text-base font-semibold">Examen Owner · {reviewTarget.documentNumber}</h2><p className="mt-1 text-xs text-slate-500">{typeLabel(reviewTarget.documentType)} · {reviewTarget.counterparty}</p></div><button type="button" onClick={() => setReviewTarget(null)} className="rounded-lg px-2 py-1 text-xs text-slate-500">Fermer</button></div>
      {reviewDetailsQuery.isLoading ? <div className="py-5"><LoadingState rows={4} /></div> : reviewDetailsQuery.error ? <p className="py-5 text-sm text-rose-600">{reviewDetailsQuery.error instanceof Error ? reviewDetailsQuery.error.message : 'Impossible de charger les détails.'}</p> : reviewData?.kind === 'customer_order' ? <>
        <div className="mt-4 grid gap-2 sm:grid-cols-3"><div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900"><span className="text-[11px] text-slate-500">Total à percevoir</span><strong className="mt-1 block">{formatFcfa(reviewData.detail.order.total_to_collect_xof)}</strong></div><div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900"><span className="text-[11px] text-slate-500">Acompte enregistré</span><strong className="mt-1 block">{formatFcfa(reviewData.detail.order.paid_xof)}</strong></div><div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900"><span className="text-[11px] text-slate-500">Créances client actuelles</span><strong className="mt-1 block">{formatFcfa(reviewData.customerBalance)}</strong></div></div>
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"><table className="w-full min-w-[600px] text-left text-xs"><thead className="bg-slate-50 dark:bg-slate-900"><tr><th className="px-3 py-2">Produit</th><th className="px-3 py-2">Quantité</th><th className="px-3 py-2">Prix unitaire</th><th className="px-3 py-2">Remise</th><th className="px-3 py-2">Stock actuel</th><th className="px-3 py-2 text-right">Total ligne</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{reviewData.detail.lines.map((line) => <tr key={line.id}><td className="px-3 py-2">{line.product_name} · {line.variant_name}<div className="text-[10px] text-slate-500">Conditionnement : 1 {orderUnitLabel(line.requested_unit)} = {formatQty(Math.round(line.base_quantity * 1000 / line.requested_quantity))} {line.base_unit}</div></td><td className="px-3 py-2">{formatQty(line.requested_quantity)} {line.requested_unit}<div className="text-[10px] text-slate-500">= {formatQty(line.base_quantity)} unité(s) de base</div></td><td className="px-3 py-2">{formatFcfa(line.unit_price_xof)}</td><td className="px-3 py-2">{formatFcfa(line.discount_xof)}</td><td className="px-3 py-2">{formatQty(reviewData.stocks[line.product_id] ?? 0)} {reviewData.stocks[line.product_id] === undefined ? '(indisponible)' : ''}</td><td className="px-3 py-2 text-right font-semibold">{formatFcfa(line.line_total_xof)}</td></tr>)}</tbody></table></div>
      </> : reviewData?.kind === 'purchase_order' ? <>
        <div className="mt-4 grid gap-2 sm:grid-cols-2"><div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900"><span className="text-[11px] text-slate-500">Montant du bon</span><strong className="mt-1 block">{formatFcfa(reviewData.purchase.total_amount)}</strong></div><div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900"><span className="text-[11px] text-slate-500">Dette fournisseur actuelle</span><strong className="mt-1 block">{formatFcfa(reviewData.supplierBalance)}</strong></div></div>
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"><table className="w-full min-w-[560px] text-left text-xs"><thead className="bg-slate-50 dark:bg-slate-900"><tr><th className="px-3 py-2">Produit</th><th className="px-3 py-2">Conditionnement</th><th className="px-3 py-2">Commandé</th><th className="px-3 py-2">Prix unitaire</th><th className="px-3 py-2">Stock actuel</th><th className="px-3 py-2 text-right">Total ligne</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{reviewData.purchase.lines.map((line) => <tr key={line.id}><td className="px-3 py-2">{line.product_name}</td><td className="px-3 py-2">Conditionnement : {line.packaging_name}<div className="text-[10px] text-slate-500">{packagingContentsLabel(line.packaging_name, line.base_unit, line.coefficient_milli)}</div></td><td className="px-3 py-2">{formatQty(line.ordered_quantity_milli)} {line.packaging_name}<div className="text-[10px] text-slate-500">= {formatQty(line.ordered_quantity_milli * line.coefficient_milli / 1000)} {line.base_unit}</div></td><td className="px-3 py-2">{formatFcfa(line.unit_price)}</td><td className="px-3 py-2">{formatQty(reviewData.stocks[line.product_id] ?? 0)} {reviewData.stocks[line.product_id] === undefined ? '(indisponible)' : ''}</td><td className="px-3 py-2 text-right font-semibold">{formatFcfa(line.line_total)}</td></tr>)}</tbody></table></div>
      </> : null}
      <p className="mt-3 text-[11px] text-slate-500">La validation métier revérifie les permissions, les montants et le stock côté serveur. Une commande client approuvée ne prélève le stock qu’à sa confirmation; un bon fournisseur ne modifie le stock qu’à la réception physique.</p>
      {isOwner && reviewTarget.approvalStatus === 'pending_owner_approval' && <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-800"><button type="button" onClick={() => { setReasonTarget({ doc: reviewTarget, action: 'changes_requested' }); setReason(''); }} className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800 dark:text-amber-300">Demander modification</button><button type="button" onClick={() => { setReasonTarget({ doc: reviewTarget, action: 'rejected' }); setReason(''); }} className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300">Rejeter</button><button type="button" disabled={reviewMutation.isPending || reviewDetailsQuery.isLoading || Boolean(reviewDetailsQuery.error)} onClick={() => reviewMutation.mutate({ doc: reviewTarget, action: 'approved' })} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Approuver</button></div>}
      </section></div>}
    {reasonTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="approval-reason-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-[#111A2E]"><h2 id="approval-reason-title" className="font-display text-base font-semibold">{reasonTarget.action === 'rejected' ? 'Rejeter le document' : 'Demander une modification'}</h2><p className="mt-1 text-xs text-slate-500">{reasonTarget.doc.documentNumber} · {reasonTarget.doc.counterparty}</p><textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} rows={4} placeholder="Motif obligatoire…" className="mt-4 w-full rounded-lg border border-slate-200 bg-transparent p-3 text-sm dark:border-slate-700" /><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setReasonTarget(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">Annuler</button><button type="button" disabled={!reason.trim() || reviewMutation.isPending} onClick={() => reviewMutation.mutate({ doc: reasonTarget.doc, action: reasonTarget.action, note: reason.trim() })} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Confirmer</button></div></section></div>}
    {printTarget && (documentDetailQuery.isLoading || documentDetailQuery.error) && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4"><div role="status" className="rounded-xl bg-white p-5 text-sm shadow-xl dark:bg-[#111A2E]">{documentDetailQuery.isLoading ? 'Chargement du document…' : documentDetailQuery.error instanceof Error ? documentDetailQuery.error.message : 'Impossible de charger le document.'}<button type="button" onClick={() => setPrintTarget(null)} className="ml-4 font-semibold text-blue-600">Fermer</button></div></div>}
    <DocumentPrintModal doc={printableDocument} onClose={() => setPrintTarget(null)} />
    {eventTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setEventTarget(null); }}><section role="dialog" aria-modal="true" aria-labelledby="approval-history-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl dark:bg-[#111A2E]"><div className="flex items-start justify-between"><div><h2 id="approval-history-title" className="font-display text-base font-semibold">Historique documentaire</h2><p className="mt-1 text-xs text-slate-500">{eventTarget.documentNumber} · {eventTarget.counterparty}</p></div><button type="button" onClick={() => setEventTarget(null)} className="rounded-lg px-2 py-1 text-slate-500">Fermer</button></div>{eventsQuery.isLoading ? <div className="py-4"><LoadingState rows={2} /></div> : eventsQuery.error ? <p className="py-4 text-xs text-rose-600">{eventsQuery.error instanceof Error ? eventsQuery.error.message : 'Historique indisponible.'}</p> : <ApprovalHistory events={eventsQuery.data ?? []} />}</section></div>}
  </div>;
}
