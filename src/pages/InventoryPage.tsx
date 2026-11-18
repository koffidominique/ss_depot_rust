import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ClipboardCheck, Plus, Printer } from 'lucide-react';
import { DataTable } from '../components/tables/DataTable.tsx';
import { StatusBadge } from '../components/common/StatusBadge.tsx';
import {
  DocumentPrintModal,
  type PrintableDocumentData,
} from '../components/documents/DocumentPrintModal.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import { formatDateTime, formatQty } from '../utils/format.ts';
import type { InventoryRecord } from '../features/inventory/types.ts';
import {
  useInventoriesQuery,
  useInventoryMutations,
} from '../features/inventory/hooks/useInventoryData.ts';
import { InventoryCreateModal } from '../features/inventory/components/InventoryCreateModal.tsx';
import { InventoryCountModal } from '../features/inventory/components/InventoryCountModal.tsx';

export function InventoryPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [activeInv, setActiveInv] = useState<InventoryRecord | null>(null);
  const [printDoc, setPrintDoc] = useState<PrintableDocumentData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useInventoriesQuery();
  const inventories = (data || []) as unknown as InventoryRecord[];

  const { createMutation, validateMutation } = useInventoryMutations({
    onCreated: (created) => {
      setCreateOpen(false);
      setErrorMsg(null);
      setActiveInv(created);
    },
    onValidated: () => {
      setActiveInv(null);
      setErrorMsg(null);
    },
    onError: (msg) => setErrorMsg(msg),
  });

  const columns = useMemo<ColumnDef<InventoryRecord>[]>(
    () => [
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
            <span
              className={`font-mono-num text-xs font-medium ${diffs > 0 ? 'text-[#D9901A]' : 'text-[#667085]'}`}
            >
              {diffs} écart(s)
            </span>
          );
        },
      },
      {
        accessorKey: 'notes',
        header: 'Notes',
        cell: ({ row }) => (
          <span className="text-xs text-[#667085]">{row.original.notes || '—'}</span>
        ),
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
                    statusLabel:
                      inv.status === 'validated' ? 'Inventaire validé' : 'Brouillon de comptage',
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
                onClick={() => {
                  setErrorMsg(null);
                  setActiveInv(inv);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <ClipboardCheck className="h-3.5 w-3.5" />
                {inv.status === 'draft' ? 'Saisir & valider' : 'Consulter'}
              </button>
            </div>
          );
        },
      },
    ],
    []
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-[#667085] dark:text-slate-400">
          Tout écart entre quantité théorique et quantité comptée requiert un motif justificatif
          avant validation atomique.
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

      <InventoryCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        isPending={createMutation.isPending}
        onCreate={(notes) => createMutation.mutate(notes)}
      />

      <InventoryCountModal
        inventory={activeInv}
        onClose={() => setActiveInv(null)}
        errorMsg={errorMsg}
        isPending={validateMutation.isPending}
        onValidate={(id, lines) => validateMutation.mutate({ id, lines })}
      />

      <DocumentPrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />
    </div>
  );
}
