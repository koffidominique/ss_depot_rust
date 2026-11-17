import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeftRight, Download, PackageCheck, Plus, Printer, Repeat, X } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { DataTable } from '../components/tables/DataTable.tsx';
import { MetricCard } from '../components/common/MetricCard.tsx';
import { MoneyInput } from '../components/common/MoneyInput.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import {
  DocumentPrintModal,
  type PrintableDocumentData,
} from '../components/documents/DocumentPrintModal.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import { exportConsignmentBalancesCsv, exportConsignmentMovementsCsv } from '../utils/csv.ts';
import { formatDateTime, formatFcfa, formatNumber, newRequestKey } from '../utils/format.ts';
import { toNonNegativeIntFcfaBigInt } from '../features/sales/utils/saleCalculations.ts';

interface ReturnableType {
  id: number;
  code: string;
  name: string;
  producer: string;
  kind: 'bottle' | 'crate';
  deposit_value: number;
  stock_quantity: number;
}

interface ClientBalance {
  id: number;
  client_id: number;
  client_name: string;
  client_code: string;
  packaging_name: string;
  packaging_code: string;
  balance_pieces: number;
  deposit_held_amount: number;
}

interface ReturnableMovementRow {
  id: number;
  packaging_id: number;
  packaging_name: string;
  packaging_code: string;
  movement_type: 'initial' | 'entry' | 'exit' | 'breakage' | 'loss' | 'correction_in' | 'correction_out';
  quantity: number;
  stock_before: number | null;
  stock_after: number;
  reason: string;
  reference_document: string | null;
  created_at: string;
}

interface OpenIssue {
  id: number;
  sale_id: number;
  sale_reference: string;
  client_id: number | null;
  client_name: string | null;
  returnable_id: number;
  packaging_name: string;
  packaging_code: string;
  pieces: number;
  returned_pieces: number;
  unit_value: number;
  amount: number;
}

interface DepositReturnRow {
  id: number;
  reference: string;
  packaging_name: string;
  client_name: string | null;
  pieces: number;
  condition_state: 'good' | 'damaged';
  refund_amount: number;
  credit_reduction: number;
  method_label: string;
  reason: string;
  created_at: string;
}

export function ConsignmentsPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('issues');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [printDoc, setPrintDoc] = useState<PrintableDocumentData | null>(null);

  // Modal nouveau type
  const [typeOpen, setTypeOpen] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newProducer, setNewProducer] = useState('SOLIBRA');
  const [newKind, setNewKind] = useState<'bottle' | 'crate'>('bottle');
  const [newDepositValue, setNewDepositValue] = useState(150);
  const [newInitialStock, setNewInitialStock] = useState(0);

  // Modal ajustement stock vides
  const [adjTarget, setAdjTarget] = useState<ReturnableType | null>(null);
  const [adjType, setAdjType] = useState<'entry' | 'breakage' | 'loss' | 'exit'>('entry');
  const [adjQty, setAdjQty] = useState(1);
  const [adjReason, setAdjReason] = useState('');

  // Modal retour client
  const [returnTarget, setReturnTarget] = useState<OpenIssue | null>(null);
  const [retPieces, setRetPieces] = useState(1);
  const [retCondition, setRetCondition] = useState<'good' | 'damaged'>('good');
  const [retRefund, setRetRefund] = useState(0);
  const [retCreditRed, setRetCreditRed] = useState(0);
  const [retMethod, setRetMethod] = useState('cash');
  const [retReason, setRetReason] = useState('Retour emballages vides');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['consignments'],
    queryFn: () => apiClient.getConsignmentsOverview(),
  });

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
  });

  const activeMethods = (settingsData?.paymentMethods || []).filter((m) => m.active === 1);

  const createTypeMut = useMutation({
    mutationFn: () =>
      apiClient.createReturnableType({
        code: newCode,
        name: newName,
        producer: newProducer,
        kind: newKind,
        deposit_value: newDepositValue,
        initial_stock: newInitialStock,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consignments'] });
      setTypeOpen(false);
      setNewCode('');
      setNewName('');
      setErrorMsg(null);
    },
    onError: (err) => setErrorMsg(err instanceof Error ? err.message : 'Erreur création emballage.'),
  });

  const adjustMut = useMutation({
    mutationFn: () => {
      if (!adjTarget) throw new Error('Emballage non sélectionné');
      return apiClient.adjustReturnableStock({
        packaging_id: adjTarget.id,
        movement_type: adjType,
        quantity: adjQty,
        reason: adjReason,
        request_key: newRequestKey('ret-adj'),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consignments'] });
      setAdjTarget(null);
      setAdjReason('');
      setErrorMsg(null);
    },
    onError: (err) => setErrorMsg(err instanceof Error ? err.message : 'Erreur ajustement.'),
  });

  const returnMut = useMutation({
    mutationFn: () => {
      if (!returnTarget) throw new Error('Consigne non sélectionnée');
      const remPieces = Math.max(0, returnTarget.pieces - returnTarget.returned_pieces);
      if (!Number.isSafeInteger(retPieces) || retPieces <= 0 || retPieces > remPieces) {
        throw new Error(`Nombre de pièces retournées invalide (max ${remPieces}).`);
      }
      const refundCheck = toNonNegativeIntFcfaBigInt(retRefund, 'Remboursement client');
      if (!refundCheck.ok) throw new Error(refundCheck.error);
      const creditCheck = toNonNegativeIntFcfaBigInt(retCreditRed, 'Déduction créance');
      if (!creditCheck.ok) throw new Error(creditCheck.error);
      const unitCheck = toNonNegativeIntFcfaBigInt(returnTarget.unit_value, 'Tarif consigne');
      if (!unitCheck.ok) throw new Error(unitCheck.error);
      const maxValBig = BigInt(retPieces) * unitCheck.fcfa;
      if (refundCheck.fcfa + creditCheck.fcfa > maxValBig) {
        throw new Error(
          `La contrepartie (${formatFcfa(Number(refundCheck.fcfa + creditCheck.fcfa))}) dépasse la valeur consignée (${maxValBig <= BigInt(Number.MAX_SAFE_INTEGER) ? formatFcfa(Number(maxValBig)) : String(maxValBig)}).`
        );
      }
      return apiClient.returnClientEmpties({
        issue_id: returnTarget.id,
        pieces: retPieces,
        condition_state: retCondition,
        refund_amount: retRefund,
        credit_reduction: retCreditRed,
        method_code: retMethod,
        reason: retReason,
        request_key: newRequestKey('ret-cli'),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consignments'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
      qc.invalidateQueries({ queryKey: ['receivables'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      setReturnTarget(null);
      setErrorMsg(null);
    },
    onError: (err) => setErrorMsg(err instanceof Error ? err.message : 'Erreur retour client.'),
  });

  if (isLoading) return <LoadingState rows={5} />;
  if (error || !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Erreur chargement consignations.'}
        onRetry={() => refetch()}
      />
    );
  }

  const types = (data.types || []) as unknown as ReturnableType[];
  const clientBalances = (data.clientBalances || []) as unknown as ClientBalance[];
  const recentMovements = (data.recentMovements || []) as unknown as ReturnableMovementRow[];
  const openIssues = (data.openIssues || []) as unknown as OpenIssue[];
  const returns = (data.returns || []) as unknown as DepositReturnRow[];

  const totalDepotPieces = types.reduce((s, t) => s + t.stock_quantity, 0);
  const totalHeldAmount = clientBalances.reduce((s, b) => s + b.deposit_held_amount, 0);
  const totalClientPieces = clientBalances.reduce((s, b) => s + b.balance_pieces, 0);

  const typeCols: ColumnDef<ReturnableType>[] = [
    {
      accessorKey: 'code',
      header: 'Code',
      cell: ({ row }) => <span className="font-mono-num text-xs font-semibold">{row.original.code}</span>,
    },
    {
      accessorKey: 'name',
      header: 'Emballage consigné',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.name}</div>
          <div className="text-xs text-[#667085]">
            {row.original.producer} · {row.original.kind === 'crate' ? 'Casier' : 'Bouteille verre'}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'deposit_value',
      header: 'Tarif consigne',
      cell: ({ row }) => <span className="font-mono-num">{formatFcfa(row.original.deposit_value)}</span>,
    },
    {
      accessorKey: 'stock_quantity',
      header: 'Stock vides dépôt',
      cell: ({ row }) => (
        <span className="font-mono-num font-semibold">{formatNumber(row.original.stock_quantity)} pcs</span>
      ),
    },
    {
      id: 'actions',
      header: 'Mouvement',
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => {
            setAdjTarget(row.original);
            setAdjType('entry');
            setAdjQty(1);
            setAdjReason('');
            setErrorMsg(null);
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
          Ajuster
        </button>
      ),
    },
  ];

  const issueCols: ColumnDef<OpenIssue>[] = [
    {
      accessorKey: 'sale_reference',
      header: 'Vente',
      cell: ({ row }) => <span className="font-mono-num text-xs font-semibold">{row.original.sale_reference}</span>,
    },
    {
      accessorKey: 'client_name',
      header: 'Client',
      cell: ({ row }) => row.original.client_name || 'Comptoir',
    },
    {
      accessorKey: 'packaging_name',
      header: 'Emballage',
      cell: ({ row }) => `${row.original.packaging_name} (${row.original.packaging_code})`,
    },
    {
      id: 'remaining',
      header: 'Vides chez client',
      cell: ({ row }) => {
        const rem = row.original.pieces - row.original.returned_pieces;
        return (
          <span className="font-mono-num font-semibold text-[#D9901A]">
            {rem} / {row.original.pieces} pcs
          </span>
        );
      },
    },
    {
      id: 'val',
      header: 'Valeur consignée restante',
      cell: ({ row }) => {
        const rem = (row.original.pieces - row.original.returned_pieces) * row.original.unit_value;
        return <span className="font-mono-num">{formatFcfa(rem)}</span>;
      },
    },
    {
      id: 'actions',
      header: 'Retour',
      cell: ({ row }) => {
        const rem = row.original.pieces - row.original.returned_pieces;
        return (
          <button
            type="button"
            onClick={() => {
              setReturnTarget(row.original);
              setRetPieces(rem);
              setRetCondition('good');
              setRetRefund(rem * row.original.unit_value);
              setRetCreditRed(0);
              setRetMethod('cash');
              setRetReason('Retour emballages vides');
              setErrorMsg(null);
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-[#16A36A] px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            <PackageCheck className="h-3.5 w-3.5" />
            Enregistrer retour
          </button>
        );
      },
    },
  ];

  const balanceCols: ColumnDef<ClientBalance>[] = [
    {
      accessorKey: 'client_name',
      header: 'Client',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.client_name}</div>
          <div className="font-mono-num text-[11px] text-[#667085]">{row.original.client_code}</div>
        </div>
      ),
    },
    {
      accessorKey: 'packaging_name',
      header: 'Emballage',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.packaging_name}</div>
          <div className="font-mono-num text-[11px] text-[#667085]">{row.original.packaging_code}</div>
        </div>
      ),
    },
    {
      accessorKey: 'balance_pieces',
      header: 'Solde vides détenus',
      cell: ({ row }) => (
        <span className="font-mono-num font-semibold text-[#D9901A]">
          {formatNumber(row.original.balance_pieces)} pcs
        </span>
      ),
    },
    {
      accessorKey: 'deposit_held_amount',
      header: 'Dépôt de garantie retenu',
      cell: ({ row }) => <span className="font-mono-num font-semibold">{formatFcfa(row.original.deposit_held_amount)}</span>,
    },
  ];

  const movementCols: ColumnDef<ReturnableMovementRow>[] = [
    {
      accessorKey: 'created_at',
      header: 'Date',
      cell: ({ row }) => <span className="font-mono-num text-xs">{formatDateTime(row.original.created_at)}</span>,
    },
    {
      accessorKey: 'packaging_name',
      header: 'Emballage',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.packaging_name}</div>
          <div className="font-mono-num text-[11px] text-[#667085]">{row.original.packaging_code}</div>
        </div>
      ),
    },
    {
      accessorKey: 'movement_type',
      header: 'Type',
      cell: ({ row }) => {
        const labels: Record<ReturnableMovementRow['movement_type'], string> = {
          initial: 'Stock initial',
          entry: 'Entrée (+)',
          exit: 'Sortie (-)',
          breakage: 'Casse (-)',
          loss: 'Perte (-)',
          correction_in: 'Correction (+)',
          correction_out: 'Correction (-)',
        };
        return <span className="text-xs font-medium">{labels[row.original.movement_type] || row.original.movement_type}</span>;
      },
    },
    {
      accessorKey: 'quantity',
      header: 'Quantité',
      cell: ({ row }) => {
        const isIn = ['initial', 'entry', 'correction_in'].includes(row.original.movement_type);
        return (
          <span className={`font-mono-num font-semibold ${isIn ? 'text-[#16A36A]' : 'text-[#DC4545]'}`}>
            {isIn ? '+' : '-'}{formatNumber(row.original.quantity)} pcs
          </span>
        );
      },
    },
    {
      accessorKey: 'stock_after',
      header: 'Stock avant → après',
      cell: ({ row }) => (
        <span className="font-mono-num text-xs">
          {row.original.stock_before ?? 0} → <strong>{row.original.stock_after}</strong> pcs
        </span>
      ),
    },
    {
      accessorKey: 'reason',
      header: 'Motif / Référence',
      cell: ({ row }) => (
        <div className="text-xs">
          <div>{row.original.reason}</div>
          {row.original.reference_document && (
            <div className="font-mono-num text-[11px] text-[#667085]">{row.original.reference_document}</div>
          )}
        </div>
      ),
    },
  ];

  const returnCols: ColumnDef<DepositReturnRow>[] = [
    {
      accessorKey: 'reference',
      header: 'Référence',
      cell: ({ row }) => (
        <div>
          <div className="font-mono-num text-xs font-semibold">{row.original.reference}</div>
          <div className="font-mono-num text-[11px] text-[#667085]">{formatDateTime(row.original.created_at)}</div>
        </div>
      ),
    },
    {
      accessorKey: 'client_name',
      header: 'Client',
      cell: ({ row }) => row.original.client_name || 'Comptoir',
    },
    { accessorKey: 'packaging_name', header: 'Emballage' },
    {
      accessorKey: 'pieces',
      header: 'Quantité',
      cell: ({ row }) => (
        <span className="font-mono-num">
          {row.original.pieces} pcs ({row.original.condition_state === 'good' ? 'Bon état' : 'Cassé'})
        </span>
      ),
    },
    {
      accessorKey: 'refund_amount',
      header: 'Remboursé',
      cell: ({ row }) => <span className="font-mono-num">{formatFcfa(row.original.refund_amount)}</span>,
    },
    {
      accessorKey: 'credit_reduction',
      header: 'Déduit créance',
      cell: ({ row }) => <span className="font-mono-num">{formatFcfa(row.original.credit_reduction)}</span>,
    },
    {
      id: 'print',
      header: 'Reçu',
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() =>
            setPrintDoc({
              docType: 'REÇU RETOUR EMBALLAGES',
              reference: row.original.reference,
              date: row.original.created_at,
              partyTitle: 'Client',
              partyName: row.original.client_name || 'Client Comptoir',
              lines: [
                {
                  label: row.original.packaging_name,
                  sublabel: `État : ${row.original.condition_state === 'good' ? 'Bon état (réintégré)' : 'Endommagé / Cassé'}`,
                  quantity: `${row.original.pieces} pcs`,
                  unitPrice: null,
                  total: row.original.refund_amount + row.original.credit_reduction,
                },
              ],
              summaryRows: [
                { label: 'Remboursement client', value: formatFcfa(row.original.refund_amount) },
                { label: 'Déduction créance', value: formatFcfa(row.original.credit_reduction) },
                {
                  label: 'Total régularisé',
                  value: formatFcfa(row.original.refund_amount + row.original.credit_reduction),
                  bold: true,
                },
              ],
              payments:
                row.original.refund_amount > 0
                  ? [{ label: row.original.method_label, amount: row.original.refund_amount }]
                  : undefined,
              notes: row.original.reason,
            })
          }
          className="inline-flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <Printer className="h-3.5 w-3.5" />
          Reçu
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Vides en stock dépôt"
          value={`${formatNumber(totalDepotPieces)} pcs`}
          hint={`${types.length} type(s) d'emballages suivis`}
          icon={<Repeat className="h-4 w-4" />}
        />
        <MetricCard
          label="Vides détenus par les clients"
          value={`${formatNumber(totalClientPieces)} pcs`}
          tone={totalClientPieces > 0 ? 'warning' : 'default'}
          hint="Bouteilles et casiers à récupérer"
        />
        <MetricCard
          label="Dépôts de garantie retenus"
          value={formatFcfa(totalHeldAmount)}
          hint="Séparés du chiffre d'affaires marchandises"
        />
      </div>

      <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs.List className="inline-flex flex-wrap rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-1">
            <Tabs.Trigger
              value="issues"
              className="rounded-md px-3 py-1.5 text-xs font-medium text-[#667085] data-[state=active]:bg-[#2563EB] data-[state=active]:text-white"
            >
              Consignes clients ouvertes ({openIssues.length})
            </Tabs.Trigger>
            <Tabs.Trigger
              value="balances"
              className="rounded-md px-3 py-1.5 text-xs font-medium text-[#667085] data-[state=active]:bg-[#2563EB] data-[state=active]:text-white"
            >
              Soldes par client ({clientBalances.length})
            </Tabs.Trigger>
            <Tabs.Trigger
              value="catalog"
              className="rounded-md px-3 py-1.5 text-xs font-medium text-[#667085] data-[state=active]:bg-[#2563EB] data-[state=active]:text-white"
            >
              Catalogue & stock vides ({types.length})
            </Tabs.Trigger>
            <Tabs.Trigger
              value="movements"
              className="rounded-md px-3 py-1.5 text-xs font-medium text-[#667085] data-[state=active]:bg-[#2563EB] data-[state=active]:text-white"
            >
              Journal mouvements ({recentMovements.length})
            </Tabs.Trigger>
            <Tabs.Trigger
              value="returns"
              className="rounded-md px-3 py-1.5 text-xs font-medium text-[#667085] data-[state=active]:bg-[#2563EB] data-[state=active]:text-white"
            >
              Historique des retours ({returns.length})
            </Tabs.Trigger>
          </Tabs.List>

          <div className="flex flex-wrap items-center gap-2">
            <FormTipsButton topicId="consignments" label="Comprendre les onglets" />
            <button
              type="button"
              onClick={() =>
                activeTab === 'movements'
                  ? exportConsignmentMovementsCsv(recentMovements)
                  : exportConsignmentBalancesCsv(clientBalances)
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              {activeTab === 'movements' ? 'CSV Mouvements' : 'CSV Soldes clients'}
            </button>
            <button
              type="button"
              onClick={() =>
                setPrintDoc({
                  docType: 'ÉTAT DES CONSIGNATIONS',
                  reference: `RAP-CON-${new Date().toISOString().slice(0, 10)}`,
                  date: new Date().toISOString(),
                  statusLabel: `${clientBalances.length} compte(s) client(s)`,
                  lines: clientBalances.map((b) => ({
                    label: `${b.client_name} (${b.client_code})`,
                    sublabel: `${b.packaging_name} (${b.packaging_code})`,
                    quantity: `${b.balance_pieces} pcs`,
                    unitPrice: null,
                    total: b.deposit_held_amount,
                  })),
                  summaryRows: [
                    { label: 'Vides en stock dépôt', value: `${formatNumber(totalDepotPieces)} pcs` },
                    { label: 'Vides détenus par clients', value: `${formatNumber(totalClientPieces)} pcs`, tone: 'warning' },
                    { label: 'Dépôts de garantie retenus', value: formatFcfa(totalHeldAmount), bold: true },
                  ],
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimer état
            </button>
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setTypeOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              Nouvel emballage consigné
            </button>
          </div>
        </div>

        <Tabs.Content value="issues">
          <DataTable
            data={openIssues}
            columns={issueCols as ColumnDef<OpenIssue, unknown>[]}
            emptyMessage="Aucune consigne ouverte en attente de retour."
          />
        </Tabs.Content>

        <Tabs.Content value="balances">
          <DataTable
            data={clientBalances}
            columns={balanceCols as ColumnDef<ClientBalance, unknown>[]}
            emptyMessage="Aucun client ne détient d'emballages consignés."
          />
        </Tabs.Content>

        <Tabs.Content value="catalog">
          <DataTable
            data={types}
            columns={typeCols as ColumnDef<ReturnableType, unknown>[]}
            emptyMessage="Aucun emballage consigné configuré."
          />
        </Tabs.Content>

        <Tabs.Content value="movements">
          <DataTable
            data={recentMovements}
            columns={movementCols as ColumnDef<ReturnableMovementRow, unknown>[]}
            emptyMessage="Aucun mouvement de stock d'emballages enregistré."
          />
        </Tabs.Content>

        <Tabs.Content value="returns">
          <DataTable
            data={returns}
            columns={returnCols as ColumnDef<DepositReturnRow, unknown>[]}
            emptyMessage="Aucun retour d'emballage enregistré."
          />
        </Tabs.Content>
      </Tabs.Root>

      {/* Modal création emballage */}
      <Dialog.Root open={typeOpen} onOpenChange={setTypeOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <Dialog.Title className="font-display text-base font-semibold">
                Nouvel emballage consigné
              </Dialog.Title>
              <Dialog.Close className="rounded-lg p-1 text-slate-400">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            {errorMsg && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-[#DC4545]">{errorMsg}</div>}
            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium">Code *</label>
                  <input
                    type="text"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="CAS-SOL-24"
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium">Type *</label>
                  <select
                    value={newKind}
                    onChange={(e) => setNewKind(e.target.value as 'bottle' | 'crate')}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
                  >
                    <option value="bottle">Bouteille verre</option>
                    <option value="crate">Casier plastique</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-medium">Nom de l'emballage *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Casier 24 alvéoles SOLIBRA"
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-medium">Producteur / Brasserie *</label>
                <input
                  type="text"
                  value={newProducer}
                  onChange={(e) => setNewProducer(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MoneyInput label="Valeur consigne" value={newDepositValue} onChange={setNewDepositValue} />
                <div>
                  <label className="block font-medium">Stock vides initial</label>
                  <input
                    type="number"
                    min={0}
                    value={newInitialStock}
                    onChange={(e) => setNewInitialStock(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num"
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button type="button" className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium">
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={createTypeMut.isPending}
                onClick={() => createTypeMut.mutate()}
                className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white"
              >
                Créer
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Modal ajustement vides */}
      <Dialog.Root open={Boolean(adjTarget)} onOpenChange={(o) => !o && setAdjTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <Dialog.Title className="font-display text-base font-semibold">
              Mouvement de vides · {adjTarget?.name}
            </Dialog.Title>
            {errorMsg && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-[#DC4545]">{errorMsg}</div>}
            <div className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium">Type de mouvement</label>
                <select
                  value={adjType}
                  onChange={(e) => setAdjType(e.target.value as 'entry' | 'breakage' | 'loss' | 'exit')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
                >
                  <option value="entry">Entrée dépôt (+)</option>
                  <option value="breakage">Casse (-)</option>
                  <option value="loss">Perte / Écart (-)</option>
                  <option value="exit">Sortie fournisseur (-)</option>
                </select>
              </div>
              <div>
                <label className="block font-medium">Nombre de pièces</label>
                <input
                  type="number"
                  min={1}
                  value={adjQty}
                  onChange={(e) => setAdjQty(Math.max(1, Math.trunc(Number(e.target.value) || 1)))}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num"
                />
              </div>
              <div>
                <label className="block font-medium">Motif obligatoire *</label>
                <input
                  type="text"
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="Ex : Reprise fournisseur ou casse manutention"
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button type="button" className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium">
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={adjustMut.isPending}
                onClick={() => adjustMut.mutate()}
                className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white"
              >
                Enregistrer
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Modal retour client */}
      <Dialog.Root open={Boolean(returnTarget)} onOpenChange={(o) => !o && setReturnTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <Dialog.Title className="font-display text-base font-semibold">
                Retour de vides · {returnTarget?.sale_reference}
              </Dialog.Title>
              <FormTipsButton topicId="consignments" label="Aide retour" />
            </div>
            <p className="mt-1 text-xs text-[#667085]">
              {returnTarget?.packaging_name} — Tarif unitaire {formatFcfa(returnTarget?.unit_value ?? 0)}
            </p>
            {errorMsg && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-[#DC4545]">{errorMsg}</div>}
            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium">Pièces retournées</label>
                  <input
                    type="number"
                    min={1}
                    max={returnTarget ? returnTarget.pieces - returnTarget.returned_pieces : 1}
                    value={retPieces}
                    onChange={(e) => {
                      const val = Math.max(1, Math.trunc(Number(e.target.value) || 1));
                      setRetPieces(val);
                      if (returnTarget) {
                        const maxValBig = BigInt(val) * BigInt(Math.max(0, returnTarget.unit_value));
                        setRetRefund(
                          maxValBig <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(maxValBig) : 0
                        );
                      }
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num"
                  />
                </div>
                <div>
                  <label className="block font-medium">État</label>
                  <select
                    value={retCondition}
                    onChange={(e) => {
                      const st = e.target.value as 'good' | 'damaged';
                      setRetCondition(st);
                      if (st === 'damaged') setRetRefund(0);
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
                  >
                    <option value="good">Bon état (réintègre le stock)</option>
                    <option value="damaged">Endommagé / Cassé</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MoneyInput label="Remboursement client" value={retRefund} onChange={setRetRefund} />
                <MoneyInput label="Déduction créance" value={retCreditRed} onChange={setRetCreditRed} />
              </div>
              <div>
                <label className="block font-medium">Moyen de remboursement</label>
                <select
                  value={retMethod}
                  onChange={(e) => setRetMethod(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
                >
                  {activeMethods.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium">Motif *</label>
                <input
                  type="text"
                  value={retReason}
                  onChange={(e) => setRetReason(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button type="button" className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium">
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={returnMut.isPending}
                onClick={() => returnMut.mutate()}
                className="rounded-lg bg-[#16A36A] px-4 py-2 text-xs font-semibold text-white"
              >
                Confirmer le retour
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <DocumentPrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />
    </div>
  );
}
