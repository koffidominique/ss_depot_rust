import { Component, Suspense, lazy, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { AppLayout } from './layouts/AppLayout.tsx';
import { LoadingState } from './components/common/States.tsx';
import { ApiError } from './services/api/ApiClient.ts';
import { useUiStore } from './stores/uiStore.ts';

const LoginPage = lazy(() => import('./pages/LoginPage.tsx').then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage.tsx').then((m) => ({ default: m.DashboardPage })));
const SalesPage = lazy(() => import('./pages/SalesPage.tsx').then((m) => ({ default: m.SalesPage })));
const OrdersPage = lazy(() => import('./pages/OrdersPage.tsx').then((m) => ({ default: m.OrdersPage })));
const SalesHistoryPage = lazy(() =>
  import('./pages/SalesHistoryPage.tsx').then((m) => ({ default: m.SalesHistoryPage }))
);
const CommercialDocumentsPage = lazy(() =>
  import('./pages/CommercialDocumentsPage.tsx').then((m) => ({ default: m.CommercialDocumentsPage }))
);
const ClientsPage = lazy(() => import('./pages/ClientsPage.tsx').then((m) => ({ default: m.ClientsPage })));
const DebtsPage = lazy(() => import('./pages/DebtsPage.tsx').then((m) => ({ default: m.DebtsPage })));
const ProductsPage = lazy(() => import('./pages/ProductsPage.tsx').then((m) => ({ default: m.ProductsPage })));
const StockPage = lazy(() => import('./pages/StockPage.tsx').then((m) => ({ default: m.StockPage })));
const InventoryPage = lazy(() => import('./pages/InventoryPage.tsx').then((m) => ({ default: m.InventoryPage })));
const ConsignmentsPage = lazy(() =>
  import('./pages/ConsignmentsPage.tsx').then((m) => ({ default: m.ConsignmentsPage }))
);
const SuppliersPage = lazy(() => import('./pages/SuppliersPage.tsx').then((m) => ({ default: m.SuppliersPage })));
const PurchasesPage = lazy(() => import('./pages/PurchasesPage.tsx').then((m) => ({ default: m.PurchasesPage })));
const CashPage = lazy(() => import('./pages/CashPage.tsx').then((m) => ({ default: m.CashPage })));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage.tsx').then((m) => ({ default: m.ExpensesPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage.tsx').then((m) => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage.tsx').then((m) => ({ default: m.SettingsPage })));
const BackupsPage = lazy(() => import('./pages/BackupsPage.tsx').then((m) => ({ default: m.BackupsPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: (failureCount, err) => {
        if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
          return false;
        }
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
  },
});

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || 'Erreur inattendue.' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('DEPOTPRO UI error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F7FB] dark:bg-[#0B1220] px-4 text-center">
          <div className="max-w-md rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-white dark:bg-[#111A2E] p-6 shadow-sm">
            <h1 className="font-display text-base font-semibold text-[#182230] dark:text-slate-100">
              Erreur d’affichage de l’application
            </h1>
            <p className="mt-2 text-xs text-[#667085] dark:text-slate-400">{this.state.message}</p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.assign('/');
              }}
              className="mt-4 rounded-xl bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Recharger l’application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function RouteFallback() {
  return (
    <div className="p-6">
      <LoadingState rows={6} />
    </div>
  );
}

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
    <AppErrorBoundary>
      <MotionConfig reducedMotion="user">
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<AppLayout />}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/sales/new" element={<SalesPage />} />
                  <Route path="/orders" element={<OrdersPage />} />
                  <Route path="/sales" element={<SalesHistoryPage />} />
                  <Route path="/commercial-documents" element={<CommercialDocumentsPage />} />
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
            </Suspense>
          </BrowserRouter>
        </QueryClientProvider>
      </MotionConfig>
    </AppErrorBoundary>
  );
}
