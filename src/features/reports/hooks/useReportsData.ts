import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../services/api/createApiClient.ts';
import type { ReportsOverview } from '../../../types/erp.ts';

export function useReportsQueries(fromDate: string, toDate: string, activeTab: string) {
  const reportsQuery = useQuery<ReportsOverview>({
    queryKey: ['reports', fromDate, toDate],
    queryFn: () => apiClient.getReports(fromDate || undefined, toDate || undefined),
  });

  const stockQuery = useQuery({
    queryKey: ['stock'],
    queryFn: () => apiClient.getStockOverview(),
    enabled: activeTab === 'stock',
  });

  const cashQuery = useQuery({
    queryKey: ['cash'],
    queryFn: () => apiClient.getCashStatus(),
    enabled: activeTab === 'cash',
  });

  const receivablesQuery = useQuery({
    queryKey: ['receivables'],
    queryFn: () => apiClient.listReceivables(),
    enabled: activeTab === 'receivables',
  });

  const supplierDebtsQuery = useQuery({
    queryKey: ['supplier-debts'],
    queryFn: () => apiClient.listSupplierDebts(),
    enabled: activeTab === 'suppliers',
  });

  const consignmentsQuery = useQuery({
    queryKey: ['consignments'],
    queryFn: () => apiClient.getConsignmentsOverview(),
    enabled: activeTab === 'consignments',
  });

  return {
    reportsQuery,
    stockQuery,
    cashQuery,
    receivablesQuery,
    supplierDebtsQuery,
    consignmentsQuery,
  };
}
