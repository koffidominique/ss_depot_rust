import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import type { ColumnDef } from '@tanstack/react-table';
import { ClipboardCheck, Plus, CheckCircle2, Printer, Search, X } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { DataTable } from '../components/tables/DataTable.tsx';
import { StatusBadge } from '../components/common/StatusBadge.tsx';
import { QuantityInput } from '../components/common/QuantityInput.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import {
  DocumentPrintModal,
  type PrintableDocumentData,
} from '../components/documents/DocumentPrintModal.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import { formatDateTime, formatQty } from '../utils/format.ts';

interface InventoryLine {
  id: number;
  product_id: number;
  product_name: string;
  product_reference: string;
  base_unit: string;
  theoretical_milli: number;
  counted_milli: number | null;
  reason: string | null;
}

interface InventoryRecord {
  id: number;
  reference: string;
  status: 'draft' | 'validated' | 'cancelled';
  notes: string | null;
  created_at: string;
  validated_at: string | null;
  lines: InventoryLine[];
}

export function InventoryPage() {
  const qc = useQueryClient();
  const [createNotes, setCreateNotes] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [activeInv, setActiveInv] = useState<InventoryRecord | null>(null);
  const [printDoc, setPrintDoc] = useState<PrintableDocumentData | null>(null);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [countSearch, setCountSearch] = useState('');
  const [onlyDiscrepancies, setOnlyDiscrepancies] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['inventories'],
    queryFn: () => apiClient.listInventories(),
  });

  const inventories = (data || []) as unknown as InventoryRecord[];

  const createMutation = useMutation({
    mutationFn: () => apiClient.createInventory(createNotes),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['inventories'] });
      setCreateOpen(false);
      setCreateNotes('');
      openCountModal(created as unknown as InventoryRecord);
    },
    onError: (err) => setErrorMsg(err instanceof Error ? err.message : 'Erreur création inventaire.'),
  });

  const validateMutation = useMutation({
    mutationFn: () => {
      if (!activeInv) throw new Error('Inventaire non sélectionné');
      const lines = activeInv.lines.map((l) => ({
        product_id: l.product_id,
        counted_quantity: counts[l.product_id] ?? String(l.theoretical_milli / 1000),
        reason: reasons[l.product_id] || undefined,
      }));
      return apiClient.validateInventory(activeInv.id, lines);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventories'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setActiveInv(null);
      setErrorMsg(null);
    },
    onError: (err) => setErrorMsg(err instanceof Error ? err.message : 'Erreur validation inventaire.'),
  });

  const openCountModal = (inv: InventoryRecord) => {
    setActiveInv(inv);
    const initCounts: Record<number, string> = {};
    const initReasons: Record<number, string> = {};
    inv.lines.forEach((l) => {
      const val = l.counted_milli !== null ? l.counted_milli : l.theoretical_milli;
      initCounts[l.product_id] = String(val / 1000);
      initReasons[l.product_id] = l.reason || '';
    });
    setCounts(initCounts);
    setReasons(initReasons);
    setCountSearch('');
    setOnlyDiscrepancies(false);
    setErrorMsg(null);
  };

  const columns: ColumnDef<InventoryRecord>[] = [
    {
      accessorKey: 'reference',
      header: 'Référence',
      cell: ({ row }) => (
        <div>
          <div className="font-mono-num text-xs font-semibold">{row.original.reference}</div>
          <div className="font-mono-num text-[11px] text-[#667085]">
            {formatDateTime(row.original.created_at)}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'items',
      header: 'Articles comptés',
      cell: ({ row }) => (
        <span className="font-mono-num text-xs">{row.original.lines.length} article(s)</span>
      ),
    },
    {
      id: 'discrepancies',
      header: 'Écarts relevés',
      cell: ({ row }) => {
        const diffs = row.original.lines.filter(
          (l) => l.counted_milli !== null && l.counted_milli !== l.theoretical_milli
        ).length;
        return (
          <span className={`font-mono-num text-xs font-medium ${diffs > 0 ? 'text-[#D9901A]' : 'text-[#667085]'}`}>
            {diffs} écart(s)
          </span>
        );
      },
    },
    {
      accessorKey: 'notes',
      header: 'Notes',
      cell: ({ row }) => <span className="text-xs text-[#667085]">{row.original.notes || '—'}</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const inv = row.original;
        const diffs = inv.lines.filter(
          (l) => l.counted_milli !== null && l.counted_milli !== l.theoretical_milli
        ).length;
        return (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                setPrintDoc({
                  docType: 'RAPPORT DE STOCK & VALORISATION',
                  reference: inv.reference,
                  date: inv.validated_at || inv.created_at,
                  statusLabel: inv.status === 'validated' ? 'Inventaire validé' : 'Brouillon de comptage',
                  notes: inv.notes,
                  lines: inv.lines.map((l) => ({
                    label: `${l.product_reference} · ${l.product_name}`,
                    sublabel:
                      l.counted_milli !== null
                        ? `Compté : ${formatQty(l.counted_milli, l.base_unit)}${l.reason ? ` (${l.reason})` : ''}`
                        : 'En attente de comptage',
                    quantity: `Théo. ${formatQty(l.theoretical_milli, l.base_unit)}`,
                    unitPrice: null,
                    total: null,
                  })),
                  summaryRows: [
                    { label: 'Articles inventoriés', value: String(inv.lines.length) },
                    {
                      label: 'Écarts relevés',
                      value: String(diffs),
                      tone: diffs > 0 ? 'warning' : 'success',
                      bold: true,
                    },
                  ],
                })
              }
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Printer className="h-3.5 w-3.5" />
              Fiche
            </button>
            <button
              type="button"
              onClick={() => openCountModal(inv)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              {inv.status === 'draft' ? 'Saisir & valider' : 'Consulter'}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-[#667085] dark:text-slate-400">
          Tout écart entre quantité théorique et quantité comptée requiert un motif justificatif avant validation atomique.
        </p>
        <button
          type="button"
          onClick={() => {
            setErrorMsg(null);
            setCreateOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          Nouvel inventaire physique
        </button>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Erreur chargement inventaires.'}
          onRetry={() => refetch()}
        />
      ) : (
        <DataTable
          data={inventories}
          columns={columns as ColumnDef<InventoryRecord, unknown>[]}
          emptyMessage="Aucun inventaire créé pour le moment."
        />
      )}

      {/* Modal création */}
      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <Dialog.Title className="font-display text-base font-semibold">
                Démarrer un inventaire physique
              </Dialog.Title>
              <Dialog.Close className="rounded-lg p-1 text-slate-400">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <p className="mt-2 text-xs text-[#667085] dark:text-slate-400">
              Un instantané du stock théorique de tous les produits actifs sera préparé en brouillon.
            </p>
            <div className="mt-4">
              <label className="block text-xs font-medium">Notes d'inventaire (optionnel)</label>
              <input
                type="text"
                value={createNotes}
                onChange={(e) => setCreateNotes(e.target.value)}
                placeholder="Ex : Inventaire mensuel entrepôt principal"
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button type="button" className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium">
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate()}
                className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Créer le brouillon
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Modal saisie & validation */}
      <Dialog.Root open={Boolean(activeInv)} onOpenChange={(o) => !o && setActiveInv(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Dialog.Title className="font-display text-base font-semibold">
                  Inventaire · {activeInv?.reference}
                </Dialog.Title>
                <p className="text-xs text-[#667085]">
                  {activeInv?.status === 'draft'
                    ? 'Saisissez les quantités physiques comptées et justifiez tout écart.'
                    : `Validé le ${formatDateTime(activeInv?.validated_at)}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <FormTipsButton topicId="inventories" label="Aide écarts" />
                <Dialog.Close className="rounded-lg p-1 text-slate-400">
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>
            </div>

            {errorMsg && (
              <div className="mt-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs text-[#DC4545]">
                {errorMsg}
              </div>
            )}

            {activeInv && (() => {
              const lineStats = activeInv.lines.map((line) => {
                const theoreticalUnits = line.theoretical_milli / 1000;
                const enteredStr = counts[line.product_id] ?? String(theoreticalUnits);
                const enteredNum = Number(enteredStr.replace(',', '.'));
                const delta = Number.isFinite(enteredNum)
                  ? Math.round((enteredNum - theoreticalUnits) * 1000) / 1000
                  : 0;
                return { line, enteredStr, delta };
              });
              const totalDiscrepancies = lineStats.filter((x) => x.delta !== 0).length;
              const q = countSearch.trim().toLowerCase();
              const visibleLines = lineStats.filter(({ line, delta }) => {
                if (onlyDiscrepancies && delta === 0) return false;
                if (
                  q &&
                  !line.product_name.toLowerCase().includes(q) &&
                  !line.product_reference.toLowerCase().includes(q)
                ) {
                  return false;
                }
                return true;
              });
              const isReadonly = activeInv.status !== 'draft';

              return (
                <>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-3 py-2.5 text-xs">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#667085]" />
                      <input
                        type="text"
                        value={countSearch}
                        onChange={(e) => setCountSearch(e.target.value)}
                        placeholder="Filtrer un article (nom ou référence)..."
                        aria-label="Filtrer les articles de l'inventaire"
                        className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={onlyDiscrepancies}
                        onChange={(e) => setOnlyDiscrepancies(e.target.checked)}
                      />
                      <span>Écarts uniquement</span>
                    </label>
                    <span className="font-mono-num text-[11px] font-semibold text-[#667085] dark:text-slate-300">
                      {activeInv.lines.length} article(s) ·{' '}
                      <span className={totalDiscrepancies > 0 ? 'text-[#D9901A]' : 'text-[#16A36A]'}>
                        {totalDiscrepancies} écart(s)
                      </span>
                    </span>
                  </div>

                  <div className="mt-3 space-y-2.5">
                    {visibleLines.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 py-6 text-center text-xs text-[#667085]">
                        Aucun article ne correspond au filtre actif.
                      </div>
                    ) : (
                      visibleLines.map(({ line, enteredStr, delta }) => (
                        <div
                          key={line.id}
                          className="grid grid-cols-12 items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs"
                        >
                          <div className="col-span-4">
                            <div className="font-medium text-[#182230] dark:text-slate-100">{line.product_name}</div>
                            <div className="font-mono-num text-[11px] text-[#667085]">
                              {line.product_reference} · Théorique : {formatQty(line.theoretical_milli, line.base_unit)}
                            </div>
                          </div>
                          <div className="col-span-3">
                            <QuantityInput
                              label="Compté"
                              value={enteredStr}
                              disabled={isReadonly}
                              onChange={(v) => setCounts((p) => ({ ...p, [line.product_id]: v }))}
                              unit={line.base_unit}
                            />
                          </div>
                          <div className="col-span-2 text-right">
                            <div className="text-[11px] text-[#667085]">Écart</div>
                            <div
                              className={`font-mono-num font-semibold ${
                                delta === 0 ? 'text-[#16A36A]' : delta > 0 ? 'text-[#2563EB]' : 'text-[#DC4545]'
                              }`}
                            >
                              {delta > 0 ? '+' : ''}
                              {delta} {line.base_unit}
                            </div>
                          </div>
                          <div className="col-span-3">
                            <label className="block text-[11px] text-[#667085]">
                              Motif {delta !== 0 ? '*' : '(optionnel)'}
                            </label>
                            <input
                              type="text"
                              disabled={isReadonly}
                              value={reasons[line.product_id] || ''}
                              onChange={(e) => setReasons((p) => ({ ...p, [line.product_id]: e.target.value }))}
                              placeholder={delta !== 0 ? 'Motif obligatoire' : '—'}
                              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs disabled:opacity-60"
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              );
            })()}

            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button type="button" className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium">
                  Fermer
                </button>
              </Dialog.Close>
              {activeInv?.status === 'draft' && (
                <button
                  type="button"
                  disabled={validateMutation.isPending}
                  onClick={() => validateMutation.mutate()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#16A36A] px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Valider et ajuster le stock
                </button>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <DocumentPrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />
    </div>
  );
}
