import { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Plus, Printer } from 'lucide-react';
import { DataTable } from '../components/tables/DataTable.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import {
  DocumentPrintModal,
  type PrintableDocumentData,
} from '../components/documents/DocumentPrintModal.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import { exportConsignmentBalancesCsv, exportConsignmentMovementsCsv } from '../utils/csv.ts';
import { formatFcfa, formatNumber } from '../utils/format.ts';
import {
  useConsignmentsMutations,
  useConsignmentsQueries,
} from '../features/consignments/hooks/useConsignmentsData.ts';
import { ConsignmentsSummaryCards } from '../features/consignments/components/ConsignmentsSummaryCards.tsx';
import { useConsignmentColumns } from '../features/consignments/components/useConsignmentColumns.tsx';
import { ConsignmentTypeModal } from '../features/consignments/components/ConsignmentTypeModal.tsx';
import { ConsignmentAdjustModal } from '../features/consignments/components/ConsignmentAdjustModal.tsx';
import { ConsignmentReturnModal } from '../features/consignments/components/ConsignmentReturnModal.tsx';
import { PackagingFinancialPanel } from '../features/consignments/components/PackagingFinancialPanel.tsx';
import type {
  ClientBalance,
  DepositReturnRow,
  OpenIssue,
  ReturnableMovementRow,
  ReturnableType,
} from '../features/consignments/types.ts';

export function ConsignmentsPage() {
  const [activeTab, setActiveTab] = useState('issues');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [printDoc, setPrintDoc] = useState<PrintableDocumentData | null>(null);
  const [typeOpen, setTypeOpen] = useState(false);
  const [adjTarget, setAdjTarget] = useState<ReturnableType | null>(null);
  const [returnTarget, setReturnTarget] = useState<OpenIssue | null>(null);

  const { overviewQuery, activeMethods } = useConsignmentsQueries();
  const { createTypeMut, adjustMut, returnMut } = useConsignmentsMutations({
    onTypeCreated: () => {
      setTypeOpen(false);
      setErrorMsg(null);
    },
    onAdjusted: () => {
      setAdjTarget(null);
      setErrorMsg(null);
    },
    onReturned: () => {
      setReturnTarget(null);
      setErrorMsg(null);
    },
    onError: setErrorMsg,
  });

  const { typeCols, issueCols, balanceCols, movementCols, returnCols } = useConsignmentColumns({
    onAdjustType: (target) => {
      setAdjTarget(target);
      setErrorMsg(null);
    },
    onStartReturn: (issue) => {
      setReturnTarget(issue);
      setErrorMsg(null);
    },
    onPrintReturn: setPrintDoc,
  });

  const { data, isLoading, error, refetch } = overviewQuery;

  if (isLoading) return <LoadingState rows={5} />;
  if (error || !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Erreur chargement des emballages.'}
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

  return (
    <div className="space-y-5">
      <ConsignmentsSummaryCards
        totalDepotPieces={totalDepotPieces}
        typesCount={types.length}
        totalClientPieces={totalClientPieces}
        totalHeldAmount={totalHeldAmount}
      />

      <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs.List className="inline-flex flex-wrap rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-surface p-1">
            <Tabs.Trigger
              value="issues"
              className="rounded-md px-3 py-1.5 text-xs font-medium text-[#667085] transition-all hover:text-[#182230] dark:hover:text-slate-100 data-[state=active]:bg-[#2563EB] data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              Retour emballages clients ouverts ({openIssues.length})
            </Tabs.Trigger>
            <Tabs.Trigger
              value="balances"
              className="rounded-md px-3 py-1.5 text-xs font-medium text-[#667085] transition-all hover:text-[#182230] dark:hover:text-slate-100 data-[state=active]:bg-[#2563EB] data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              Soldes par client ({clientBalances.length})
            </Tabs.Trigger>
            <Tabs.Trigger
              value="catalog"
              className="rounded-md px-3 py-1.5 text-xs font-medium text-[#667085] transition-all hover:text-[#182230] dark:hover:text-slate-100 data-[state=active]:bg-[#2563EB] data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              Catalogue &amp; stock vides ({types.length})
            </Tabs.Trigger>
            <Tabs.Trigger
              value="movements"
              className="rounded-md px-3 py-1.5 text-xs font-medium text-[#667085] data-[state=active]:bg-[#2563EB] data-[state=active]:text-white"
            >
              Journal mouvements ({recentMovements.length})
            </Tabs.Trigger>
            <Tabs.Trigger
              value="financial"
              className="rounded-md px-3 py-1.5 text-xs font-medium text-[#667085] data-[state=active]:bg-[#2563EB] data-[state=active]:text-white"
            >
              Créances d'emballages
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
                  docType: 'ÉTAT DES CRÉANCES CLIENTS',
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
                    {
                      label: 'Vides détenus par clients',
                      value: `${formatNumber(totalClientPieces)} pcs`,
                      tone: 'warning',
                    },
                    {
                      label: "Valeurs d'emballages en attente",
                      value: formatFcfa(totalHeldAmount),
                      bold: true,
                    },
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
              Nouvel emballage réutilisable
            </button>
          </div>
        </div>

        <Tabs.Content value="issues">
          <DataTable
            data={openIssues}
            columns={issueCols as ColumnDef<OpenIssue, unknown>[]}
            emptyMessage="Aucun retour emballage ouvert en attente."
          />
        </Tabs.Content>

        <Tabs.Content value="balances">
          <DataTable
            data={clientBalances}
            columns={balanceCols as ColumnDef<ClientBalance, unknown>[]}
            emptyMessage="Aucun client ne détient d'emballages suivis."
          />
        </Tabs.Content>

        <Tabs.Content value="catalog">
          <DataTable
            data={types}
            columns={typeCols as ColumnDef<ReturnableType, unknown>[]}
            emptyMessage="Aucun emballage réutilisable configuré."
          />
        </Tabs.Content>

        <Tabs.Content value="movements">
          <DataTable
            data={recentMovements}
            columns={movementCols as ColumnDef<ReturnableMovementRow, unknown>[]}
            emptyMessage="Aucun mouvement de stock d'emballages enregistré."
          />
        </Tabs.Content>

        <Tabs.Content value="financial">
          <PackagingFinancialPanel />
        </Tabs.Content>

        <Tabs.Content value="returns">
          <DataTable
            data={returns}
            columns={returnCols as ColumnDef<DepositReturnRow, unknown>[]}
            emptyMessage="Aucun retour d'emballage enregistré."
          />
        </Tabs.Content>
      </Tabs.Root>

      <ConsignmentTypeModal
        open={typeOpen}
        onOpenChange={setTypeOpen}
        error={errorMsg}
        isPending={createTypeMut.isPending}
        onSubmit={(values) => createTypeMut.mutate(values)}
      />

      <ConsignmentAdjustModal
        target={adjTarget}
        onClose={() => setAdjTarget(null)}
        error={errorMsg}
        isPending={adjustMut.isPending}
        onSubmit={(values) => adjustMut.mutate(values)}
      />

      <ConsignmentReturnModal
        target={returnTarget}
        onClose={() => setReturnTarget(null)}
        activeMethods={activeMethods}
        error={errorMsg}
        isPending={returnMut.isPending}
        onSubmit={(values) => returnMut.mutate(values)}
      />

      <DocumentPrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />
    </div>
  );
}
