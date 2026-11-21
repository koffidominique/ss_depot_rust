import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DataTable } from '../../../components/tables/DataTable.tsx';
import { ErrorState, LoadingState } from '../../../components/common/States.tsx';
import { apiClient } from '../../../services/api/createApiClient.ts';
import {
  CataloguePriceEditModal,
  CataloguePriceHistoryModal,
} from './CatalogueAdminModals.tsx';
import {
  buildCatalogueColumns,
  type CatalogueBrand,
  type CatalogueProduct,
  type EditCataloguePriceState,
} from './catalogueColumns.tsx';

/* ============================================================================
 * Panneau d'administration OWNER du catalogue central
 * ============================================================================ */

export function CatalogueAdminPanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState<number | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<EditCataloguePriceState | null>(null);
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
  const toVerifyCount = products.filter((p) => p.name.includes('À vérifier')).length;

  const columns = buildCatalogueColumns({
    archivePending: archiveMut.isPending,
    onEditPrice: (p) => {
      setEditing({ id: p.id, code: p.code, name: p.name, price: p.unit_price });
      setPriceInput(String(p.unit_price));
      setPriceReason('');
      setErrorMsg(null);
    },
    onShowHistory: (p) => setHistoryFor({ id: p.id, code: p.code }),
    onToggleActive: (id, active) => archiveMut.mutate({ id, is_active: active }),
  });

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Filtres et compteurs */}
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

      <CataloguePriceEditModal
        editing={editing}
        priceInput={priceInput}
        priceReason={priceReason}
        isPending={priceMut.isPending}
        onChangePriceInput={setPriceInput}
        onChangePriceReason={setPriceReason}
        onClose={() => setEditing(null)}
        onConfirm={() => {
          if (!editing) return;
          priceMut.mutate({
            id: editing.id,
            reference_price: Number(priceInput),
            reason: priceReason || undefined,
            request_key: `ref-price-${editing.id}-${Date.now()}`,
          });
        }}
      />

      <CataloguePriceHistoryModal
        historyFor={historyFor}
        entries={historyQuery.data ?? []}
        onClose={() => setHistoryFor(null)}
      />
    </div>
  );
}
