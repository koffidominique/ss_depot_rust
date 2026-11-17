import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from './layouts/AppLayout.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { SalesPage } from './pages/SalesPage.tsx';
import { SalesHistoryPage } from './pages/SalesHistoryPage.tsx';
import { ClientsPage } from './pages/ClientsPage.tsx';
import { DebtsPage } from './pages/DebtsPage.tsx';
import { ProductsPage } from './pages/ProductsPage.tsx';
import { StockPage } from './pages/StockPage.tsx';
import { InventoryPage } from './pages/InventoryPage.tsx';
import { ConsignmentsPage } from './pages/ConsignmentsPage.tsx';
import { SuppliersPage } from './pages/SuppliersPage.tsx';
import { PurchasesPage } from './pages/PurchasesPage.tsx';
import { CashPage } from './pages/CashPage.tsx';
import { ExpensesPage } from './pages/ExpensesPage.tsx';
import { ReportsPage } from './pages/ReportsPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { BackupsPage } from './pages/BackupsPage.tsx';
import { useUiStore } from './stores/uiStore.ts';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/sales/new" element={<SalesPage />} />
            <Route path="/sales" element={<SalesHistoryPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/debts" element={<DebtsPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/stock" element={<StockPage />} />
            <Route path="/inventories" element={<InventoryPage />} />
            <Route path="/consignments" element={<ConsignmentsPage />} />
            <Route path="/suppliers" element={<SuppliersPage />} />
            <Route path="/purchases" element={<PurchasesPage />} />
            <Route path="/cash" element={<CashPage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/backups" element={<BackupsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
