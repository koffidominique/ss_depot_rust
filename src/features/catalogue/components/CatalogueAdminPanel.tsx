import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, Archive, History, PencilLine } from 'lucide-react';
import { DataTable } from '../../../components/tables/DataTable.tsx';
import { ErrorState, LoadingState } from '../../../components/common/States.tsx';
import { formatFcfa } from '../../../utils/format.ts';
import { apiClient } from '../../../services/api/createApiClient.ts';

interface CatalogueBrand {
  id: number;
  code: string;
  name: string;
}

interface CatalogueProduct {
  id: number;
  code: string;
  name: string;
  barcode: string | null;
  brand_id: number | null;
  brand_name: string | null;
  family_name: string | null;
  crate_type_name: string | null;
  unit_price: number;
  is_active: number;
  is_sellable: number;
}

interface PriceHistoryEntry {
  id: number;
  reference_price: number;
  reason: string | null;
  changed_by: string | null;
  created_at: string;
}

type EditState = { id: number; code: string; name: string; price: number };

export function CatalogueAdminPanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState<number | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [priceReason, setPriceReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<{ id: number; code: string } | null>(null);

  const overviewQuery = useQuery({
    queryKey: ['catalogue-admin-overview'],
    queryFn: () => apiClient.getProductCatalogueOverview(),
  });

  const archiveMut = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      apiClient.setCatalogueProductActive(id, is_active),
    onSuccess: () => {
      setErrorMsg(null);
      void queryClient.invalidateQueries({ queryKey: ['catalogue-admin-overview'] });
    },
    onError: (e) => setErrorMsg(e instanceof Error ? e.message : 'Erreur'),
  });

  const priceMut = useMutation({
    mutationFn: (input: {
      id: number;
      reference_price: number;
      reason?: string;
      request_key: string;
    }) => apiClient.setCatalogueReferencePrice(input.id, input),
    onSuccess: () => {
      setEditing(null);
      setPriceInput('');
      setPriceReason('');
      setErrorMsg(null);
      void queryClient.invalidateQueries({ queryKey: ['catalogue-admin-overview'] });
      if (historyFor) {
        void queryClient.invalidateQueries({ queryKey: ['catalogue-price-history', historyFor.id] });
      }
    },
    onError: (e) => setErrorMsg(e instanceof Error ? e.message : 'Erreur'),
  });

  const historyQuery = useQuery({
    queryKey: ['catalogue-price-history', historyFor?.id],
    queryFn: () => apiClient.getCatalogueReferencePriceHistory(historyFor!.id),
    enabled: historyFor != null,
  });

  const products: CatalogueProduct[] = useMemo(() => {
    const raw = (overviewQuery.data as { products?: CatalogueProduct[] } | undefined)?.products ?? [];
    return raw.filter((p) => {
      if (!showArchived && p.is_active === 0) return false;
      if (brandFilter !== 'all' && p.brand_id !== brandFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          (p.brand_name ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [overviewQuery.data, search, brandFilter, showArchived]);

  const brands: CatalogueBrand[] =
    (overviewQuery.data as { brands?: CatalogueBrand[] } | undefined)?.brands ?? [];

  if (overviewQuery.isLoading) return <LoadingState rows={6} />;
  if (overviewQuery.error || !overviewQuery.data) {
    return (
      <ErrorState
        message={
          overviewQuery.error instanceof Error
            ? overviewQuery.error.message
            : 'Erreur chargement du catalogue.'
        }
        onRetry={() => void overviewQuery.refetch()}
      />
    );
  }

  const activeCount = products.filter((p) => p.is_active === 1).length;
  const toVerifyCount = products.filter(
    (p) => p.name.includes('À vérifier')
  ).length;

  const columns = [
    { header: 'Code', accessorKey: 'code' },
    { header: 'Référence', accessorKey: 'name' },
    { header: 'Marque', accessorKey: 'brand_name' },
    { header: 'Famille', accessorKey: 'family_name' },
    {
      header: 'Prix de référence',
      accessorKey: 'unit_price',
      cell: ({ row }: { row: { original: CatalogueProduct } }) =>
        formatFcfa(row.original.unit_price),
    },
    {
      header: 'Statut',
      accessorKey: 'is_active',
      cell: ({ row }: { row: { original: CatalogueProduct } }) => (
        <span
          className={
            row.original.is_active === 1
              ? 'rounded px-2 py-0.5 text-xs bg-emerald-100 text-emerald-700'
              : 'rounded px-2 py-0.5 text-xs bg-slate-200 text-slate-600'
          }
        >
          {row.original.is_active === 1 ? 'Active' : 'Archivée'}
        </span>
      ),
    },
    {
      header: 'Actions',
      id: 'actions',
      cell: ({ row }: { row: { original: CatalogueProduct } }) => {
        const p = row.original;
        return (
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Modifier le prix de référence"
              onClick={() => {
                setEditing({ id: p.id, code: p.code, name: p.name, price: p.unit_price });
                setPriceInput(String(p.unit_price));
                setPriceReason('');
                setErrorMsg(null);
              }}
              className="rounded p-1.5 hover:bg-slate-100"
            >
              <PencilLine className="h-3.5 w-3.5 text-blue-600" />
            </button>
            <button
              type="button"
              title="Historique des prix"
              onClick={() => setHistoryFor({ id: p.id, code: p.code })}
              className="rounded p-1.5 hover:bg-slate-100"
            >
              <History className="h-3.5 w-3.5 text-slate-500" />
            </button>
            {p.is_active === 1 ? (
              <button
                type="button"
                title="Archiver"
                disabled={archiveMut.isPending}
                onClick={() => archiveMut.mutate({ id: p.id, is_active: false })}
                className="rounded p-1.5 hover:bg-slate-100"
              >
                <Archive className="h-3.5 w-3.5 text-amber-600" />
              </button>
            ) : (
              <button
                type="button"
                title="Réactiver"
                disabled={archiveMut.isPending}
                onClick={() => archiveMut.mutate({ id: p.id, is_active: true })}
                className="rounded p-1.5 hover:bg-slate-100"
              >
                <ArchiveRestore className="h-3.5 w-3.5 text-emerald-600" />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher (code, référence, marque)…"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs w-64"
        />
        <select
          value={brandFilter}
          onChange={(e) =>
            setBrandFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
          }
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
        >
          <option value="all">Toutes les marques</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Afficher les archivées
        </label>
        <span className="ml-auto text-xs text-slate-500">
          {activeCount} active(s) · {toVerifyCount} à vérifier · {products.length} affichée(s)
        </span>
      </div>

      <DataTable data={products} columns={columns} emptyMessage="Aucune référence." />

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-96 rounded-xl bg-white p-5 shadow-xl">
            <h3 className="mb-1 text-sm font-semibold">Prix de référence — {editing.code}</h3>
            <p className="mb-3 text-xs text-slate-500">{editing.name}</p>
            <label className="text-xs text-slate-600">Nouveau prix (FCFA)</label>
            <input
              type="number"
              min="0"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <label className="text-xs text-slate-600">Motif (facultatif)</label>
            <input
              value={priceReason}
              onChange={(e) => setPriceReason(e.target.value)}
              className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <p className="mb-3 text-xs text-slate-400">
              Ancien prix : {formatFcfa(editing.price)} — conservé dans l'historique. Les ventes
              passées ne sont jamais recalculées.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={priceMut.isPending}
                onClick={() =>
                  priceMut.mutate({
                    id: editing.id,
                    reference_price: Number(priceInput),
                    reason: priceReason || undefined,
                    request_key: `ref-price-${editing.id}-${Date.now()}`,
                  })
                }
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {priceMut.isPending ? '…' : 'Appliquer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {historyFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="max-h-[70vh] w-[30rem] overflow-auto rounded-xl bg-white p-5 shadow-xl">
            <h3 className="mb-3 text-sm font-semibold">
              Historique des prix — {historyFor.code}
            </h3>
            {(historyQuery.data ?? []).length === 0 ? (
              <p className="text-xs text-slate-500">Aucun changement de prix enregistré.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1">Nouveau prix</th>
                    <th className="py-1">Par</th>
                    <th className="py-1">Motif</th>
                    <th className="py-1">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(historyQuery.data ?? []).map((h: PriceHistoryEntry) => (
                    <tr key={h.id} className="border-t border-slate-100">
                      <td className="py-1 font-semibold">{formatFcfa(h.reference_price)}</td>
                      <td className="py-1">{h.changed_by ?? '—'}</td>
                      <td className="py-1">{h.reason ?? '—'}</td>
                      <td className="py-1">{h.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setHistoryFor(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
