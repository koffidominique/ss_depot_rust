import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Banknote } from 'lucide-react';
import { DataTable } from '../../../components/tables/DataTable.tsx';
import { formatFcfa, formatNumber } from '../../../utils/format.ts';
import { apiClient } from '../../../services/api/createApiClient.ts';

interface PackagingObligation {
  id: number;
  sale_reference: string | null;
  pending_pieces: number;
  converted_pieces?: number;
  total_reference_value: number;
  due_date: string | null;
  overdue: boolean;
  status: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  partially_returned: 'Partiel',
  settled: 'Soldée',
  converted: 'Convertie en dette',
  cancelled: 'Annulée',
};

export function PackagingFinancialPanel() {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);

  const obligationsQuery = useQuery({
    queryKey: ['packaging-obligations', clientId],
    queryFn: () => apiClient.listPackagingObligations(clientId ?? undefined),
  });
  const clientsQuery = useQuery({
    queryKey: ['clients-light'],
    queryFn: async () => {
      const res = await apiClient.listClients();
      return (res ?? []) as Array<{ id: number; name: string }>;
    },
    staleTime: 60_000,
  });
  const dashboardQuery = useQuery({
    queryKey: ['packaging-dashboard', clientId],
    queryFn: () => apiClient.getPackagingDashboard(clientId as number),
    enabled: clientId != null,
  });

  const obligations = obligationsQuery.data ?? [];
  const dashboard = clientId != null ? dashboardQuery.data : undefined;

  async function handlePay() {
    if (clientId == null || !payAmount) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMsg('Saisissez un montant valide.');
      return;
    }
    setPaying(true);
    setErrorMsg(null);
    try {
      await apiClient.payPackagingDebt({
        client_id: clientId,
        parts: [{ method_code: 'cash', amount }],
        request_key: `pkg-pay-${clientId}-${Date.now()}`,
      });
      setPayAmount('');
      await queryClient.invalidateQueries({ queryKey: ['packaging-dashboard', clientId] });
      await queryClient.invalidateQueries({ queryKey: ['packaging-obligations'] });
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Erreur lors du règlement.');
    } finally {
      setPaying(false);
    }
  }

  const columns = [
    { header: 'Vente', accessorKey: 'sale_reference' },
    {
      header: 'Reste à restituer',
      accessorKey: 'pending_pieces',
      cell: ({ row }: { row: { original: PackagingObligation } }) =>
        `${formatNumber(row.original.pending_pieces)} pcs`,
    },
    {
      header: 'Valeur indicative',
      accessorKey: 'total_reference_value',
      cell: ({ row }: { row: { original: PackagingObligation } }) =>
        formatFcfa(row.original.total_reference_value),
    },
    {
      header: 'Déjà converti',
      accessorKey: 'converted_pieces',
      cell: ({ row }: { row: { original: PackagingObligation } }) =>
        (row.original.converted_pieces ?? 0) > 0
          ? `${formatNumber(row.original.converted_pieces ?? 0)} pcs`
          : '—',
    },
    {
      header: 'Échéance',
      accessorKey: 'due_date',
      cell: ({ row }: { row: { original: PackagingObligation } }) =>
        row.original.due_date ?? '—',
    },
    {
      header: 'Statut',
      accessorKey: 'status',
      cell: ({ row }: { row: { original: PackagingObligation } }) => (
        <span
          className={
            row.original.overdue
              ? 'rounded px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700'
              : 'rounded px-2 py-0.5 text-xs bg-slate-100 text-slate-600'
          }
        >
          {row.original.overdue
            ? 'Échu'
            : (STATUS_LABELS[row.original.status] ?? row.original.status)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="h-4 w-4" /> {errorMsg}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium text-slate-600">Client :</label>
        <select
          value={clientId ?? ''}
          onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : null)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
        >
          <option value="">Tous les clients</option>
          {clientsQuery.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {dashboard && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">Dette commerciale</p>
            <p className="text-lg font-bold">{formatFcfa(dashboard.commercial_debt)}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-700">Emballages en attente (indicatif)</p>
            <p className="text-lg font-bold text-amber-800">
              {formatFcfa(dashboard.pending_reference_value)}
            </p>
            <p className="text-xs text-amber-600">Non exigible avant échéance</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-xs text-red-700">Créance d'emballages exigible</p>
            <p className="text-lg font-bold text-red-800">
              {formatFcfa(dashboard.packaging_financial_debt)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">Total financièrement dû</p>
            <p className="text-lg font-bold">{formatFcfa(dashboard.total_financial_due)}</p>
          </div>
        </div>
      )}

      {dashboard && dashboard.packaging_financial_debt > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
          <Banknote className="h-4 w-4 text-emerald-600" />
          <input
            type="number"
            min="1"
            placeholder={`Max ${formatFcfa(dashboard.packaging_financial_debt)}`}
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
          />
          <button
            type="button"
            disabled={paying}
            onClick={handlePay}
            className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {paying ? '…' : 'Enregistrer le règlement'}
          </button>
        </div>
      )}

      <DataTable
        data={obligations}
        columns={columns}
        emptyMessage="Aucune obligation d'emballages en attente."
      />
    </div>
  );
}
