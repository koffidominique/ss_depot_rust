import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const win = new Window({ url: 'http://localhost:3000/' });
for (const key of [
  'window',
  'document',
  'navigator',
  'Window',
  'Document',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLButtonElement',
  'HTMLFormElement',
  'HTMLSelectElement',
  'HTMLTextAreaElement',
  'SVGElement',
  'Element',
  'Node',
  'NodeFilter',
  'Text',
  'DocumentFragment',
  'DOMRect',
  'Blob',
  'URL',
  'localStorage',
  'sessionStorage',
  'Event',
  'CustomEvent',
  'FocusEvent',
  'KeyboardEvent',
  'MouseEvent',
  'PointerEvent',
  'MutationObserver',
  'ResizeObserver',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
]) {
  const val = key === 'window' ? win : win[key];
  if (val !== undefined) {
    Object.defineProperty(globalThis, key, {
      value: val,
      configurable: true,
      writable: true,
    });
  }
}

const React = await import('react');
const { MemoryRouter } = await import('react-router-dom');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { MoneyInput } = await import('../src/components/common/MoneyInput.tsx');
const { QuantityInput } = await import('../src/components/common/QuantityInput.tsx');
const { StatusBadge } = await import('../src/components/common/StatusBadge.tsx');
const { DataTable } = await import('../src/components/tables/DataTable.tsx');
const { FormTipsButton } = await import('../src/components/common/FormTipsButton.tsx');
const { BusinessTipsModal } = await import('../src/components/common/BusinessTipsModal.tsx');
const { DocumentPrintModal } = await import('../src/components/documents/DocumentPrintModal.tsx');
const { LoginPage } = await import('../src/pages/LoginPage.tsx');
const { DebtsPage } = await import('../src/pages/DebtsPage.tsx');
const { SettingsPage } = await import('../src/pages/SettingsPage.tsx');
const { SalesPage } = await import('../src/pages/SalesPage.tsx');
const { PurchasesPage } = await import('../src/pages/PurchasesPage.tsx');
const { StockPage } = await import('../src/pages/StockPage.tsx');
const { ClientsPage } = await import('../src/pages/ClientsPage.tsx');
const { SuppliersPage } = await import('../src/pages/SuppliersPage.tsx');
const { ProductsPage } = await import('../src/pages/ProductsPage.tsx');
const { ReportsPage } = await import('../src/pages/ReportsPage.tsx');
const { SalesHistoryPage } = await import('../src/pages/SalesHistoryPage.tsx');
const { InventoryPage } = await import('../src/pages/InventoryPage.tsx');
const { DashboardPage } = await import('../src/pages/DashboardPage.tsx');
const { ExpensesPage } = await import('../src/pages/ExpensesPage.tsx');
const { CashPage } = await import('../src/pages/CashPage.tsx');
const { ConsignmentsPage } = await import('../src/pages/ConsignmentsPage.tsx');
const { BackupsPage } = await import('../src/pages/BackupsPage.tsx');
const { Header } = await import('../src/layouts/Header.tsx');
const { apiClient } = await import('../src/services/api/createApiClient.ts');
const { useUiStore } = await import('../src/stores/uiStore.ts');

describe('DEPOTPRO PREMIUM V3 — Tests React Composants, Formulaires & Interactions', () => {
  before(() => {
    useUiStore.setState({ theme: 'light', tipsOpen: false, tipsTopicId: 'dashboard' });
  });

  afterEach(() => {
    useUiStore.setState({ tipsOpen: false });
    cleanup();
  });

  after(async () => {
    await win.happyDOM.close();
  });

  it('MoneyInput filtre les caractères non numériques et conserve uniquement des entiers FCFA', () => {
    const captured = [];
    render(
      React.createElement(MoneyInput, {
        id: 'montant-test',
        label: 'Montant encaissé',
        value: 0,
        onChange: (v) => captured.push(v),
      })
    );
    const input = screen.getByLabelText('Montant encaissé');
    assert.ok(screen.getByText('FCFA'));
    fireEvent.change(input, { target: { value: '50 000abc' } });
    assert.equal(captured.at(-1), 50000);
    fireEvent.change(input, { target: { value: '' } });
    assert.equal(captured.at(-1), 0);
  });

  it('QuantityInput gère les décimales 3 chiffres max et bloque les fractions si allowFraction=false', () => {
    const fracVals = [];
    const { rerender } = render(
      React.createElement(QuantityInput, {
        id: 'qty-frac',
        label: 'Quantité',
        unit: 'bouteille',
        allowFraction: true,
        value: '',
        onChange: (v) => fracVals.push(v),
      })
    );
    const input = screen.getByLabelText('Quantité');
    fireEvent.change(input, { target: { value: '1,25' } });
    assert.equal(fracVals.at(-1), '1.25');
    fireEvent.change(input, { target: { value: '1.2345' } });
    assert.equal(fracVals.length, 1, 'Plus de 3 décimales doit être rejeté');

    const intVals = [];
    rerender(
      React.createElement(QuantityInput, {
        id: 'qty-frac',
        label: 'Quantité',
        unit: 'casier',
        allowFraction: false,
        value: '2',
        onChange: (v) => intVals.push(v),
      })
    );
    fireEvent.change(input, { target: { value: '2.5' } });
    assert.equal(intVals.length, 0, 'Fraction interdite sur emballage entier');
    fireEvent.change(input, { target: { value: '5' } });
    assert.equal(intVals.at(-1), '5');
  });

  it('StatusBadge affiche les libellés français des statuts métier', () => {
    render(
      React.createElement(
        'div',
        null,
        React.createElement(StatusBadge, { status: 'validated' }),
        React.createElement(StatusBadge, { status: 'partially_returned' }),
        React.createElement(StatusBadge, { status: 'cancelled' }),
        React.createElement(StatusBadge, { status: 'open' })
      )
    );
    assert.ok(screen.getByText('Validé'));
    assert.ok(screen.getByText('Retour partiel'));
    assert.ok(screen.getByText('Annulé'));
    assert.ok(screen.getByText('Ouverte'));
  });

  it('DataTable rend les colonnes, gère le clic ligne et le message vide', () => {
    const clicked = [];
    const rows = [
      { id: 1, name: 'Flag 65cl', price: 650 },
      { id: 2, name: 'Beaufort 50cl', price: 700 },
    ];
    const columns = [
      { accessorKey: 'name', header: 'Produit' },
      { accessorKey: 'price', header: 'Tarif' },
    ];
    const { rerender } = render(
      React.createElement(DataTable, {
        data: rows,
        columns,
        onRowClick: (r) => clicked.push(r.id),
      })
    );
    assert.ok(screen.getByText('Flag 65cl'));
    fireEvent.click(screen.getByText('Beaufort 50cl'));
    assert.deepEqual(clicked, [2]);

    rerender(
      React.createElement(DataTable, {
        data: [],
        columns,
        emptyMessage: 'Aucun article trouvé.',
      })
    );
    assert.ok(screen.getByText('Aucun article trouvé.'));
  });

  it('FormTipsButton ouvre BusinessTipsModal sur le sujet ciblé et permet de changer de thème', async () => {
    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/sales/new'] },
        React.createElement(FormTipsButton, { topicId: 'sales_pos', label: 'Aide caisse' }),
        React.createElement(BusinessTipsModal)
      )
    );
    assert.equal(useUiStore.getState().tipsOpen, false);
    fireEvent.click(screen.getByText('Aide caisse'));
    assert.equal(useUiStore.getState().tipsOpen, true);
    assert.equal(useUiStore.getState().tipsTopicId, 'sales_pos');
    await waitFor(() => {
      assert.ok(screen.getByText('Conseils & Logique Métier'));
    });

    useUiStore.getState().setTheme('dark');
    assert.equal(useUiStore.getState().theme, 'dark');
    useUiStore.getState().toggleTheme();
    assert.equal(useUiStore.getState().theme, 'light');
  });

  it('LoginPage valide le flux de création PIN 6 chiffres (confirmation et appel setupPin)', async () => {
    const origStatus = apiClient.getAuthStatus;
    const origSetup = apiClient.setupPin;
    const setupCalls = [];

    apiClient.getAuthStatus = async () => ({
      needsSetup: true,
      lockedUntil: null,
      failedAttempts: 0,
    });
    apiClient.setupPin = async (pin) => {
      setupCalls.push(pin);
      return { token: 'ui-test-token' };
    };

    try {
      render(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/login'] },
          React.createElement(LoginPage)
        )
      );
      await waitFor(() => {
        assert.ok(screen.getByText('Créer votre PIN propriétaire'));
      });
      for (const d of '123456') {
        fireEvent.click(screen.getByRole('button', { name: d }));
      }
      fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
      await waitFor(() => {
        assert.ok(screen.getByText('Confirmer le code PIN'));
      });
      for (const d of '123456') {
        fireEvent.click(screen.getByRole('button', { name: d }));
      }
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et accéder' }));
      await waitFor(() => {
        assert.deepEqual(setupCalls, ['123456']);
        assert.equal(useUiStore.getState().token, 'ui-test-token');
      });
    } finally {
      apiClient.getAuthStatus = origStatus;
      apiClient.setupPin = origSetup;
      useUiStore.getState().setToken(null);
    }
  });

  it('DocumentPrintModal affiche les lignes/totaux et déclenche generateDocumentPdf', async () => {
    const origGetSettings = apiClient.getSettings;
    const origGenerate = apiClient.generateDocumentPdf;
    const origCreateObjectUrl = URL.createObjectURL;
    const origRevokeObjectUrl = URL.revokeObjectURL;
    const generatedDocs = [];

    apiClient.getSettings = async () => ({
      settings: {
        company_name: 'DEPOTPRO Test',
        company_legal_name: 'SARL',
        address: 'Abidjan',
        phone: '01020304',
        email: null,
        city: 'Abidjan',
        country: "Côte d'Ivoire",
        currency: 'FCFA',
        allow_negative_stock: 0,
        invoice_prefix: 'FAC',
        sale_prefix: 'VTE',
        purchase_prefix: 'ACH',
        order_prefix: 'CMD',
        receipt_prefix: 'REC',
        credit_note_prefix: 'AVO',
        theme: 'light',
      },
      paymentMethods: [],
    });
    apiClient.generateDocumentPdf = async (doc) => {
      generatedDocs.push(String(doc.reference));
      return new Uint8Array([37, 80, 68, 70]);
    };
    URL.createObjectURL = () => 'blob:test-pdf';
    URL.revokeObjectURL = () => {};

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      render(
        React.createElement(
          QueryClientProvider,
          { client: qc },
          React.createElement(DocumentPrintModal, {
            doc: {
              docType: 'FACTURE',
              reference: 'FAC-TEST-001',
              date: '2026-11-17T10:00:00Z',
              statusLabel: 'Validée',
              partyTitle: 'Client',
              partyName: 'Maquis Central',
              lines: [
                {
                  label: 'Flag Spéciale 65cl',
                  sublabel: 'casier',
                  quantity: '2',
                  unitPrice: 13200,
                  total: 26400,
                },
              ],
              summaryRows: [{ label: 'Total TTC', value: '26 400 FCFA', bold: true }],
            },
            onClose: () => {},
          })
        )
      );

      assert.ok(screen.getByText('FAC-TEST-001'));
      assert.ok(screen.getByText('Flag Spéciale 65cl'));
      assert.ok(screen.getByText('Maquis Central'));
      fireEvent.click(screen.getByRole('button', { name: /Télécharger PDF/i }));
      await waitFor(() => {
        assert.deepEqual(generatedDocs, ['FAC-TEST-001']);
      });
    } finally {
      qc.clear();
      apiClient.getSettings = origGetSettings;
      apiClient.generateDocumentPdf = origGenerate;
      URL.createObjectURL = origCreateObjectUrl;
      URL.revokeObjectURL = origRevokeObjectUrl;
    }
  });

  it('DebtsPage affiche Payé, jours de retard et ouvre l’historique des paiements', async () => {
    const origListReceivables = apiClient.listReceivables;
    const origGetSettings = apiClient.getSettings;
    const origGetSaleDetail = apiClient.getSaleDetail;

    apiClient.getSettings = async () => ({
      settings: {
        company_name: 'DEPOTPRO Test',
        company_legal_name: null,
        address: null,
        phone: null,
        email: null,
        city: null,
        country: "Côte d'Ivoire",
        currency: 'FCFA',
        allow_negative_stock: 0,
        invoice_prefix: 'FAC',
        sale_prefix: 'VTE',
        purchase_prefix: 'ACH',
        order_prefix: 'CMD',
        receipt_prefix: 'REC',
        credit_note_prefix: 'AVO',
        theme: 'light',
      },
      paymentMethods: [{ code: 'cash', label: 'Espèces', is_cash: 1, active: 1 }],
    });
    apiClient.listReceivables = async () => [
      {
        id: 1,
        sale_id: 42,
        sale_reference: 'VTE-2026-001',
        invoice_number: 'FAC-2026-001',
        client_id: 3,
        client_name: 'Maquis Étoile',
        client_code: 'CLI-003',
        initial_amount: 50000,
        remaining_amount: 20000,
        due_date: '2026-01-01',
        status: 'partial',
        created_at: '2026-01-01T10:00:00Z',
      },
    ];
    apiClient.getSaleDetail = async (id) => ({
      id,
      reference: 'VTE-2026-001',
      invoice_number: 'FAC-2026-001',
      client_id: 3,
      client_name: 'Maquis Étoile',
      client_code: 'CLI-003',
      sale_type: 'credit',
      price_tier: 'wholesale',
      status: 'confirmed',
      total_merchandise: 50000,
      total_deposit: 0,
      total_amount: 50000,
      paid_amount: 30000,
      remaining_amount: 20000,
      due_date: '2026-01-01',
      created_at: '2026-01-01T10:00:00Z',
      lines: [],
      payments: [
        {
          id: 9,
          reference: 'PAY-0009',
          method_code: 'wave',
          method_label: 'Wave',
          part_amount: 30000,
          created_at: '2026-01-02T12:00:00Z',
        },
      ],
      returns: [],
      cancellation: null,
    });

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      render(
        React.createElement(QueryClientProvider, { client: qc }, React.createElement(DebtsPage))
      );
      await waitFor(() => {
        assert.ok(screen.getByText('Maquis Étoile'));
      });
      assert.ok(screen.getByText(/30\s000\sFCFA/));
      assert.ok(screen.getByText(/j retard/));
      fireEvent.click(screen.getByRole('button', { name: /Paiements/i }));
      await waitFor(() => {
        assert.ok(screen.getByText('PAY-0009'));
      });
    } finally {
      qc.clear();
      apiClient.listReceivables = origListReceivables;
      apiClient.getSettings = origGetSettings;
      apiClient.getSaleDetail = origGetSaleDetail;
    }
  });

  it('SettingsPage expose tous les préfixes et la raison sociale et enregistre la mise à jour', async () => {
    const origGetSettings = apiClient.getSettings;
    const origUpdateSettings = apiClient.updateSettings;
    const savedPayloads = [];

    apiClient.getSettings = async () => ({
      settings: {
        company_name: 'DEPOTPRO',
        company_legal_name: 'DEPOTPRO SARL',
        address: 'Marcory',
        phone: '01020304',
        email: 'info@depotpro.ci',
        city: 'Abidjan',
        country: "Côte d'Ivoire",
        currency: 'FCFA',
        allow_negative_stock: 0,
        invoice_prefix: 'FAC',
        sale_prefix: 'VTE',
        purchase_prefix: 'ACH',
        order_prefix: 'CMD',
        receipt_prefix: 'REC',
        credit_note_prefix: 'AVO',
        theme: 'light',
      },
      paymentMethods: [{ code: 'cash', label: 'Espèces', is_cash: 1, active: 1 }],
    });
    apiClient.updateSettings = async (input) => {
      savedPayloads.push(input);
      return apiClient.getSettings();
    };

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      render(
        React.createElement(QueryClientProvider, { client: qc }, React.createElement(SettingsPage))
      );
      await waitFor(() => {
        assert.ok(screen.getByDisplayValue('DEPOTPRO SARL'));
      });
      const orderInput = screen.getByDisplayValue('CMD');
      fireEvent.change(orderInput, { target: { value: 'BC26' } });
      fireEvent.click(screen.getByRole('button', { name: /Enregistrer les paramètres/i }));
      await waitFor(() => {
        assert.equal(savedPayloads.length, 1);
      });
      assert.equal(savedPayloads[0].order_prefix, 'BC26');
      assert.equal(savedPayloads[0].credit_note_prefix, 'AVO');
    } finally {
      qc.clear();
      apiClient.getSettings = origGetSettings;
      apiClient.updateSettings = origUpdateSettings;
    }
  });

  it('SalesPage ajoute instantanément un conditionnement au panier lors d’un scan code-barres + Entrée', async () => {
    const origListProducts = apiClient.listProducts;
    const origListClients = apiClient.listClients;
    const origGetSettings = apiClient.getSettings;
    const origGetCash = apiClient.getCashStatus;

    useUiStore.getState().clearCart();

    apiClient.listProducts = async () => ({
      items: [
        {
          id: 7,
          reference: 'PROD-2026-00007',
          barcode: '321000000007',
          name: 'Malta Guinness 33cl',
          brand: 'Guinness',
          category_id: 1,
          category_name: 'Sans alcool',
          supplier_id: null,
          supplier_name: null,
          description: null,
          base_unit: 'bouteille',
          stock_milli: 120000,
          min_stock_milli: 24000,
          max_stock_milli: 500000,
          average_cost_num: '400',
          average_cost_den: '1',
          average_cost_fcfa: 400,
          is_active: 1,
          image_path: null,
          packagings: [
            {
              id: 71,
              product_id: 7,
              name: 'casier',
              coefficient_milli: 24000,
              purchase_price: 9600,
              wholesale_price: 11200,
              semi_wholesale_price: 11500,
              retail_price: 12000,
              barcode: '321000000071',
              allow_fraction: 0,
              is_active: 1,
              deposit_mode: 'none',
              components: [],
            },
          ],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
    });
    apiClient.listClients = async () => [];
    apiClient.getSettings = async () => ({
      settings: {
        company_name: 'DEPOTPRO',
        company_legal_name: null,
        address: null,
        phone: null,
        email: null,
        city: null,
        country: "Côte d'Ivoire",
        currency: 'FCFA',
        allow_negative_stock: 0,
        invoice_prefix: 'FAC',
        sale_prefix: 'VTE',
        purchase_prefix: 'ACH',
        order_prefix: 'CMD',
        receipt_prefix: 'REC',
        credit_note_prefix: 'AVO',
        theme: 'light',
      },
      paymentMethods: [{ code: 'cash', label: 'Espèces', is_cash: 1, active: 1 }],
    });
    apiClient.getCashStatus = async () => ({
      activeSession: {
        id: 1,
        reference: 'CAI-001',
        opened_at: '2026-11-17T08:00:00Z',
        closed_at: null,
        status: 'open',
        opening_cash: 25000,
        theoretical_cash: 25000,
        physical_cash: null,
        difference: null,
        closing_notes: null,
      },
      summary: { theoreticalCash: 25000, byMethod: [], movements: [] },
      history: [],
    });

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      render(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(QueryClientProvider, { client: qc }, React.createElement(SalesPage))
        )
      );
      await waitFor(() => {
        assert.ok(screen.getByText('Malta Guinness 33cl'));
      });
      const scanInput = screen.getByPlaceholderText(/Scanner code-barres/i);
      fireEvent.change(scanInput, { target: { value: '321000000071' } });
      fireEvent.keyDown(scanInput, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        assert.ok(screen.getByText(/Panier de vente \(1\)/));
      });
    } finally {
      useUiStore.getState().clearCart();
      qc.clear();
      apiClient.listProducts = origListProducts;
      apiClient.listClients = origListClients;
      apiClient.getSettings = origGetSettings;
      apiClient.getCashStatus = origGetCash;
    }
  });

  it('PurchasesPage ouvre la modale Écarts & Dettes avec réceptions et dettes fournisseur', async () => {
    const origListPurchases = apiClient.listPurchases;
    const origListSuppliers = apiClient.listSuppliers;
    const origListProducts = apiClient.listProducts;
    const origListSupplierDebts = apiClient.listSupplierDebts;

    apiClient.listPurchases = async () => [
      {
        id: 11,
        reference: 'CMD-2026-00011',
        supplier_id: 2,
        supplier_name: 'SOLIBRA Distribution',
        supplier_code: 'FRN-002',
        status: 'partially_received',
        total_ordered: 100000,
        notes: null,
        created_at: '2026-11-17T09:00:00Z',
        lines: [
          {
            id: 21,
            product_id: 1,
            product_name: 'Flag Spéciale 65cl',
            packaging_id: 2,
            packaging_name: 'casier',
            base_unit: 'bouteille',
            coefficient_milli: 24000,
            ordered_quantity_milli: 10000,
            received_quantity_milli: 6000,
            unit_price: 10000,
            line_total: 100000,
          },
        ],
        receipts: [
          {
            id: 31,
            reference: 'REC-2026-00031',
            total_amount: 60000,
            created_at: '2026-11-17T09:30:00Z',
          },
        ],
      },
    ];
    apiClient.listSuppliers = async () => [];
    apiClient.listProducts = async () => ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 100,
      totalPages: 1,
    });
    apiClient.listSupplierDebts = async () => [
      {
        id: 41,
        receipt_id: 31,
        receipt_reference: 'REC-2026-00031',
        supplier_id: 2,
        supplier_name: 'SOLIBRA Distribution',
        initial_amount: 60000,
        remaining_amount: 60000,
        due_date: '2026-12-01',
        status: 'open',
        created_at: '2026-11-17T09:30:00Z',
      },
    ];

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      render(
        React.createElement(QueryClientProvider, { client: qc }, React.createElement(PurchasesPage))
      );
      await waitFor(() => {
        assert.ok(screen.getByText('CMD-2026-00011'));
      });
      fireEvent.click(screen.getByRole('button', { name: /Écarts & Dettes/i }));
      await waitFor(() => {
        assert.ok(screen.getByText(/Écart restant : 4/i));
        assert.ok(screen.getAllByText('REC-2026-00031').length >= 1);
      });
    } finally {
      qc.clear();
      apiClient.listPurchases = origListPurchases;
      apiClient.listSuppliers = origListSuppliers;
      apiClient.listProducts = origListProducts;
      apiClient.listSupplierDebts = origListSupplierDebts;
    }
  });

  it('StockPage permet un ajustement manuel motivé avec prévisualisation du solde', async () => {
    const origGetStockOverview = apiClient.getStockOverview;
    const origAdjustStock = apiClient.adjustStock;
    const submitted = [];

    apiClient.getStockOverview = async () => ({
      products: [
        {
          id: 5,
          reference: 'PROD-2026-00005',
          name: 'Castel Beer 65cl',
          brand: 'Castel',
          category_name: 'Bières',
          base_unit: 'bouteille',
          stock_milli: 24000,
          min_stock_milli: 12000,
          max_stock_milli: 120000,
          average_cost_fcfa: 500,
          valuation_fcfa: 12000,
        },
      ],
      movements: [],
    });
    apiClient.adjustStock = async (input) => {
      submitted.push(input);
      return {
        id: 99,
        product_id: input.product_id,
        product_name: 'Castel Beer 65cl',
        reference_document: 'ADJ-2026-00001',
      };
    };

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      render(
        React.createElement(QueryClientProvider, { client: qc }, React.createElement(StockPage))
      );
      await waitFor(() => {
        assert.ok(screen.getByText('Castel Beer 65cl'));
      });
      fireEvent.click(screen.getByRole('button', { name: /Ajuster le stock/i }));
      await waitFor(() => {
        assert.ok(screen.getByText(/Ajustement manuel du stock/i));
      });
      fireEvent.change(screen.getByLabelText(/Quantité ajustée/i), { target: { value: '2' } });
      await waitFor(() => {
        assert.ok(screen.getByText(/22 bouteille/i));
      });
      fireEvent.change(screen.getByLabelText(/Motif d'ajustement/i), {
        target: { value: '2 bouteilles cassées en rayon' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Valider l'ajustement/i }));
      await waitFor(() => {
        assert.equal(submitted.length, 1);
      });
      assert.equal(submitted[0].product_id, 5);
      assert.equal(submitted[0].direction, 'out');
      assert.equal(submitted[0].quantity, '2');
      assert.equal(submitted[0].reason, '2 bouteilles cassées en rayon');
      assert.match(submitted[0].request_key, /^adj-/);
    } finally {
      qc.clear();
      apiClient.getStockOverview = origGetStockOverview;
      apiClient.adjustStock = origAdjustStock;
    }
  });

  it('ClientsPage & SuppliersPage permettent la modification complète des coordonnées et conditions', async () => {
    const origListClients = apiClient.listClients;
    const origUpdateClient = apiClient.updateClient;
    const origListSuppliers = apiClient.listSuppliers;
    const origListSupplierDebts = apiClient.listSupplierDebts;
    const origGetSettings = apiClient.getSettings;
    const origUpdateSupplier = apiClient.updateSupplier;

    const updatedClients = [];
    const updatedSuppliers = [];

    apiClient.listClients = async () => [
      {
        id: 10,
        code: 'CLI-2026-00010',
        name: 'Hôtel Lagune',
        client_type: 'professionnel',
        phone: '+225 07 00 11 22',
        address: 'Zone 4',
        city: 'Abidjan',
        email: 'ancien@lagune.ci',
        contact_person: 'M. Diallo',
        is_active: 1,
        credit_policy: 'limited',
        credit_limit: 500000,
        payment_terms_days: 15,
        unpaid_balance: 0,
        returnable_pieces_due: 0,
      },
    ];
    apiClient.updateClient = async (id, input) => {
      updatedClients.push({ id, ...input });
      return {
        id,
        code: 'CLI-2026-00010',
        name: String(input.name),
        client_type: 'professionnel',
        phone: String(input.phone || ''),
        address: String(input.address || ''),
        city: String(input.city || ''),
        email: String(input.email || ''),
        contact_person: String(input.contact_person || ''),
        is_active: 1,
        credit_policy: 'limited',
        credit_limit: 500000,
        payment_terms_days: 15,
        unpaid_balance: 0,
        returnable_pieces_due: 0,
      };
    };

    apiClient.listSuppliers = async () => [
      {
        id: 20,
        code: 'FRN-2026-00020',
        name: 'Brassivoire Distribution',
        company_name: 'Brassivoire SA',
        phone: '+225 27 22 00 00',
        address: 'PK24',
        email: 'cmd@brassivoire.ci',
        contact_person: 'M. Touré',
        payment_terms_days: 30,
        total_purchases: 0,
        balance_due: 0,
        is_active: 1,
      },
    ];
    apiClient.listSupplierDebts = async () => [];
    apiClient.getSettings = async () => ({
      settings: {
        company_name: 'DEPOTPRO',
        company_legal_name: 'DEPOTPRO',
        address: '',
        phone: '',
        email: '',
        city: '',
        country: '',
        currency: 'FCFA',
        allow_negative_stock: 0,
        invoice_prefix: 'FAC',
        sale_prefix: 'VTE',
        purchase_prefix: 'ACH',
        order_prefix: 'CMD',
        receipt_prefix: 'REC',
        credit_note_prefix: 'AVO',
        theme: 'light',
      },
      paymentMethods: [],
    });
    apiClient.updateSupplier = async (id, input) => {
      updatedSuppliers.push({ id, ...input });
      return {
        id,
        code: 'FRN-2026-00020',
        name: String(input.name),
        company_name: String(input.company_name || ''),
        phone: String(input.phone || ''),
        address: String(input.address || ''),
        email: String(input.email || ''),
        contact_person: String(input.contact_person || ''),
        payment_terms_days: Number(input.payment_terms_days ?? 30),
        total_purchases: 0,
        balance_due: 0,
        is_active: 1,
      };
    };

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      const cliRender = render(
        React.createElement(QueryClientProvider, { client: qc }, React.createElement(ClientsPage))
      );
      await waitFor(() => assert.ok(screen.getByText('Hôtel Lagune')));
      fireEvent.click(screen.getByRole('button', { name: /Modifier/i }));
      await waitFor(() => assert.ok(screen.getByText(/Modifier client · CLI-2026-00010/i)));
      fireEvent.change(screen.getByLabelText(/Ville client/i), { target: { value: 'Bassam' } });
      fireEvent.change(screen.getByLabelText(/E-mail client/i), { target: { value: 'direction@lagune.ci' } });
      fireEvent.click(screen.getByRole('button', { name: /Enregistrer les modifications/i }));
      await waitFor(() => assert.equal(updatedClients.length, 1));
      assert.equal(updatedClients[0].id, 10);
      assert.equal(updatedClients[0].city, 'Bassam');
      assert.equal(updatedClients[0].email, 'direction@lagune.ci');
      cliRender.unmount();

      render(
        React.createElement(QueryClientProvider, { client: qc }, React.createElement(SuppliersPage))
      );
      await waitFor(() => assert.ok(screen.getByText('Brassivoire Distribution')));
      fireEvent.click(screen.getByRole('button', { name: /Modifier/i }));
      await waitFor(() => assert.ok(screen.getByText(/Modifier fournisseur · FRN-2026-00020/i)));
      fireEvent.change(screen.getByLabelText(/Adresse fournisseur/i), { target: { value: 'Vridi ZI' } });
      fireEvent.change(screen.getByLabelText(/Délai fournisseur/i), { target: { value: '45' } });
      fireEvent.click(screen.getByRole('button', { name: /Enregistrer les modifications/i }));
      await waitFor(() => assert.equal(updatedSuppliers.length, 1));
      assert.equal(updatedSuppliers[0].id, 20);
      assert.equal(updatedSuppliers[0].address, 'Vridi ZI');
      assert.equal(updatedSuppliers[0].payment_terms_days, 45);
    } finally {
      qc.clear();
      apiClient.listClients = origListClients;
      apiClient.updateClient = origUpdateClient;
      apiClient.listSuppliers = origListSuppliers;
      apiClient.listSupplierDebts = origListSupplierDebts;
      apiClient.getSettings = origGetSettings;
      apiClient.updateSupplier = origUpdateSupplier;
    }
  });

  it('ProductsPage charge les valeurs réelles d’un conditionnement existant lors de l’édition', async () => {
    const origListCategories = apiClient.listCategories;
    const origGetConsignments = apiClient.getConsignmentsOverview;
    const origListProducts = apiClient.listProducts;
    const origUpsertPackaging = apiClient.upsertPackaging;
    const savedPkgs = [];

    apiClient.listCategories = async () => [{ id: 1, name: 'Bières', description: null, is_active: 1 }];
    apiClient.getConsignmentsOverview = async () => ({
      types: [],
      clientBalances: [],
      recentMovements: [],
      openIssues: [],
      returns: [],
    });
    apiClient.listProducts = async () => ({
      items: [
        {
          id: 33,
          reference: 'PROD-2026-00033',
          barcode: null,
          name: 'Beaufort Lager 50cl',
          brand: 'Castel',
          category_id: 1,
          category_name: 'Bières',
          supplier_id: null,
          supplier_name: null,
          description: null,
          base_unit: 'bouteille',
          stock_milli: 24000,
          min_stock_milli: 12000,
          max_stock_milli: 120000,
          average_cost_fcfa: 450,
          purchase_price: 450,
          wholesale_price: 550,
          semi_wholesale_price: 600,
          retail_price: 650,
          image_path: null,
          is_active: 1,
          packagings: [
            {
              id: 301,
              product_id: 33,
              name: 'casier',
              base_unit: 'bouteille',
              coefficient_milli: 24000,
              purchase_price: 10800,
              wholesale_price: 13200,
              semi_wholesale_price: 14000,
              retail_price: 15000,
              barcode: '333000301',
              allow_fraction: 0,
              is_active: 1,
              deposit_mode: 'none',
              components: [],
            },
          ],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    apiClient.upsertPackaging = async (productId, pkg) => {
      savedPkgs.push({ productId, ...pkg });
      return {};
    };

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      render(
        React.createElement(QueryClientProvider, { client: qc }, React.createElement(ProductsPage))
      );
      await waitFor(() => assert.ok(screen.getByText('Beaufort Lager 50cl')));
      fireEvent.click(screen.getByTitle('Modifier casier'));
      await waitFor(() => assert.ok(screen.getByDisplayValue('333000301')));
      assert.ok(screen.getByDisplayValue('15000'));
      assert.ok(screen.getByDisplayValue('10800'));

      fireEvent.click(screen.getByRole('button', { name: /Mettre à jour le conditionnement/i }));
      await waitFor(() => assert.equal(savedPkgs.length, 1));
      assert.equal(savedPkgs[0].productId, 33);
      assert.equal(savedPkgs[0].id, 301);
      assert.equal(savedPkgs[0].purchase_price, 10800);
      assert.equal(savedPkgs[0].retail_price, 15000);
      assert.equal(savedPkgs[0].barcode, '333000301');
    } finally {
      qc.clear();
      apiClient.listCategories = origListCategories;
      apiClient.getConsignmentsOverview = origGetConsignments;
      apiClient.listProducts = origListProducts;
      apiClient.upsertPackaging = origUpsertPackaging;
    }
  });

  it('ReportsPage génère des rapports PDF dédiés pour Caisse, Fournisseurs et Consignations', async () => {
    const origGetReports = apiClient.getReports;
    const origGetCash = apiClient.getCashStatus;
    const origListSupplierDebts = apiClient.listSupplierDebts;
    const origGetConsignments = apiClient.getConsignmentsOverview;
    const origGetSettings = apiClient.getSettings;

    apiClient.getReports = async () => ({
      commercial: { count: 1, merchandise_revenue: 15000, deposit_billed: 2500, total_billed: 17500, total_collected: 17500 },
      profitability: { knownCostRevenue: 15000, knownCostTotal: 10000, knownGrossMargin: 5000, unknownCostLines: 0, expensesTotal: 1000, netKnownResult: 4000 },
      stock: { product_count: 1, knownValuationFcfa: 10000, unknown_cost_products: 0 },
      paymentBreakdown: [],
      dailySales: [],
    });
    apiClient.getCashStatus = async () => ({
      activeSession: {
        id: 1,
        reference: 'CAI-2026-00001',
        status: 'open',
        opening_cash: 25000,
        opened_at: '2026-11-17T08:00:00Z',
        closed_at: null,
        theoretical_cash: null,
        physical_cash: null,
        difference: null,
        closing_notes: null,
      },
      summary: { totalInCash: 10000, totalOutCash: 0, theoreticalCash: 35000, movementsCount: 1 },
      movements: [],
      history: [],
    });
    apiClient.listSupplierDebts = async () => [
      {
        id: 9,
        receipt_id: 2,
        receipt_reference: 'REC-2026-00002',
        order_reference: 'CMD-2026-00002',
        supplier_id: 1,
        supplier_name: 'SOLIBRA SA',
        initial_amount: 120000,
        remaining_amount: 45000,
        due_date: '2026-12-10',
        status: 'partial',
        created_at: '2026-11-17T08:00:00Z',
      },
    ];
    apiClient.getConsignmentsOverview = async () => ({
      types: [{ id: 1, code: 'CAS-24', name: 'Casier 24', producer: 'SOLIBRA', deposit_value: 2500, stock_quantity: 12 }],
      clientBalances: [{ id: 1, client_name: 'Maquis Central', packaging_name: 'Casier 24', balance_pieces: 4, deposit_held_amount: 10000 }],
      recentMovements: [],
      openIssues: [],
      returns: [],
    });
    apiClient.getSettings = async () => ({
      settings: {
        company_name: 'DEPOTPRO',
        company_legal_name: 'DEPOTPRO SARL',
        address: 'Abidjan',
        phone: '',
        email: '',
        city: 'Abidjan',
        country: "Côte d'Ivoire",
        currency: 'FCFA',
        allow_negative_stock: 0,
        invoice_prefix: 'FAC',
        sale_prefix: 'VTE',
        purchase_prefix: 'ACH',
        order_prefix: 'CMD',
        receipt_prefix: 'REC',
        credit_note_prefix: 'AVO',
        theme: 'light',
      },
      paymentMethods: [],
    });

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      render(
        React.createElement(QueryClientProvider, { client: qc }, React.createElement(ReportsPage))
      );
      await waitFor(() => assert.ok(screen.getByText(/Commercial & Finances/i)));

      // Onglet Caisse
      fireEvent.mouseDown(screen.getByRole('tab', { name: /Caisse & Trésorerie/i }));
      fireEvent.click(screen.getByRole('tab', { name: /Caisse & Trésorerie/i }));
      await waitFor(() => assert.ok(screen.getByText(/CAI-2026-00001/i)));
      fireEvent.click(screen.getByRole('button', { name: /PDF \/ Imprimer/i }));
      await waitFor(() => assert.ok(screen.getByText(/Aperçu document · RAPPORT DE CAISSE \(RAP-CAI-/i)));
      fireEvent.keyboard ? null : null;
      fireEvent.click(screen.getByRole('dialog').querySelector('button:last-child'));

      // Onglet Fournisseurs
      fireEvent.mouseDown(screen.getByRole('tab', { name: /Fournisseurs & Dettes/i }));
      fireEvent.click(screen.getByRole('tab', { name: /Fournisseurs & Dettes/i }));
      await waitFor(() => assert.ok(screen.getByText('SOLIBRA SA')));
      fireEvent.click(screen.getByRole('button', { name: /PDF \/ Imprimer/i }));
      await waitFor(() =>
        assert.ok(screen.getByText(/Aperçu document · ÉTAT DES DETTES FOURNISSEURS \(RAP-FRN-/i))
      );
      fireEvent.click(screen.getByRole('dialog').querySelector('button:last-child'));

      // Onglet Consignations
      fireEvent.mouseDown(screen.getByRole('tab', { name: /Consignations/i }));
      fireEvent.click(screen.getByRole('tab', { name: /Consignations/i }));
      await waitFor(() => assert.ok(screen.getByText('Maquis Central')));
      fireEvent.click(screen.getByRole('button', { name: /PDF \/ Imprimer/i }));
      await waitFor(() =>
        assert.ok(screen.getByText(/Aperçu document · ÉTAT DES CONSIGNATIONS \(RAP-CON-/i))
      );
    } finally {
      qc.clear();
      apiClient.getReports = origGetReports;
      apiClient.getCashStatus = origGetCash;
      apiClient.listSupplierDebts = origListSupplierDebts;
      apiClient.getConsignmentsOverview = origGetConsignments;
      apiClient.getSettings = origGetSettings;
    }
  });

  it('DocumentPrintModal affiche le logo personnalisé company.logo_path lorsque configuré', async () => {
    const origGetSettings = apiClient.getSettings;
    const logoUri =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    apiClient.getSettings = async () => ({
      settings: {
        company_name: 'Dépôt Abidjan Sud',
        company_legal_name: 'DAS SARL',
        address: 'Marcory',
        phone: null,
        email: null,
        city: 'Abidjan',
        country: "Côte d'Ivoire",
        currency: 'FCFA',
        allow_negative_stock: 0,
        invoice_prefix: 'FAC',
        sale_prefix: 'VTE',
        purchase_prefix: 'ACH',
        order_prefix: 'CMD',
        receipt_prefix: 'REC',
        credit_note_prefix: 'AVO',
        theme: 'light',
        logo_path: logoUri,
      },
      paymentMethods: [],
    });

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      render(
        React.createElement(
          QueryClientProvider,
          { client: qc },
          React.createElement(DocumentPrintModal, {
            doc: {
              docType: 'FACTURE',
              reference: 'FAC-2026-00001',
              date: '2026-11-17T10:00:00Z',
              lines: [{ label: 'Casier', quantity: '1', unitPrice: 5000, total: 5000 }],
              summaryRows: [{ label: 'Total', value: '5 000 FCFA', bold: true }],
            },
            onClose: () => {},
          })
        )
      );
      await waitFor(() => {
        const img = screen.getByAltText('Dépôt Abidjan Sud');
        assert.equal(img.getAttribute('src'), logoUri);
      });
    } finally {
      qc.clear();
      apiClient.getSettings = origGetSettings;
    }
  });

  it('SalesHistoryPage permet de choisir le moyen de remboursement (Wave) lors de l’annulation', async () => {
    const origListSales = apiClient.listSales;
    const origGetSaleDetail = apiClient.getSaleDetail;
    const origCancelSale = apiClient.cancelSale;
    const origGetSettings = apiClient.getSettings;

    let cancelPayload = null;
    const saleSummary = {
      id: 77,
      reference: 'VTE-2026-00077',
      sale_type: 'cash',
      price_tier: 'retail',
      client_name: 'Client Wave',
      total_amount: 10000,
      paid_amount: 10000,
      remaining_amount: 0,
      payment_labels: 'Wave Mobile Money',
      status: 'validated',
      created_at: '2026-11-17T08:00:00Z',
    };
    const saleDetail = {
      ...saleSummary,
      client_id: null,
      client_code: null,
      client_phone: null,
      subtotal_merchandise: 10000,
      discount_amount: 0,
      total_merchandise: 10000,
      total_deposit: 0,
      notes: null,
      lines: [],
      payments: [{ id: 1, method_code: 'wave', method_label: 'Wave Mobile Money', amount: 10000, created_at: '2026-11-17T08:00:00Z' }],
      returns: [],
      cancellations: [],
    };

    apiClient.listSales = async () => ({ items: [saleSummary], total: 1, page: 1, pageSize: 20, totalPages: 1 });
    apiClient.getSaleDetail = async () => saleDetail;
    apiClient.getSettings = async () => ({
      settings: {
        company_name: 'DEPOTPRO',
        company_legal_name: null,
        address: null,
        phone: null,
        email: null,
        city: null,
        country: null,
        currency: 'FCFA',
        allow_negative_stock: 0,
        invoice_prefix: 'FAC',
        sale_prefix: 'VTE',
        purchase_prefix: 'ACH',
        order_prefix: 'CMD',
        receipt_prefix: 'REC',
        credit_note_prefix: 'AVO',
        theme: 'light',
      },
      paymentMethods: [
        { code: 'cash', label: 'Espèces', is_cash: 1, active: 1 },
        { code: 'wave', label: 'Wave Mobile Money', is_cash: 0, active: 1 },
      ],
    });
    apiClient.cancelSale = async (_id, payload) => {
      cancelPayload = payload;
      return { ...saleDetail, status: 'cancelled' };
    };

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      render(
        React.createElement(QueryClientProvider, { client: qc }, React.createElement(SalesHistoryPage))
      );
      await waitFor(() => assert.ok(screen.getByText('VTE-2026-00077')));
      fireEvent.click(screen.getByRole('button', { name: /Détails/i }));
      await waitFor(() => assert.ok(screen.getByRole('button', { name: /Annuler la vente/i })));
      fireEvent.click(screen.getByRole('button', { name: /Annuler la vente/i }));
      await waitFor(() => assert.ok(screen.getByLabelText('Moyen de remboursement')));
      const select = screen.getByLabelText('Moyen de remboursement');
      assert.equal(select.value, 'wave');
      fireEvent.change(select, { target: { value: 'cash' } });
      fireEvent.change(select, { target: { value: 'wave' } });
      fireEvent.change(screen.getByPlaceholderText(/Erreur de saisie/i), {
        target: { value: 'Annulation test Wave' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Confirmer contre-écriture/i }));
      await waitFor(() => assert.ok(cancelPayload !== null));
      assert.equal(cancelPayload.refund_method_code, 'wave');
      assert.equal(cancelPayload.reason, 'Annulation test Wave');
    } finally {
      qc.clear();
      apiClient.listSales = origListSales;
      apiClient.getSaleDetail = origGetSaleDetail;
      apiClient.cancelSale = origCancelSale;
      apiClient.getSettings = origGetSettings;
    }
  });

  it('Header ouvre la recherche globale (Ctrl+K) et filtre écrans et entités', async () => {
    const origGetCash = apiClient.getCashStatus;
    const origListProducts = apiClient.listProducts;
    const origListClients = apiClient.listClients;
    const origListSuppliers = apiClient.listSuppliers;
    const origListSales = apiClient.listSales;

    apiClient.getCashStatus = async () => ({ activeSession: null, summary: null, history: [] });
    apiClient.listProducts = async () => ({
      items: [
        {
          id: 5,
          reference: 'PRD-0005',
          barcode: null,
          name: 'Coca-Cola 1L',
          brand: 'Coca',
          category_id: 1,
          category_name: 'Sodas',
          supplier_id: null,
          supplier_name: null,
          description: null,
          base_unit: 'bouteille',
          stock_milli: 24000,
          min_stock_milli: 12000,
          max_stock_milli: 0,
          purchase_price: 500,
          wholesale_price: 600,
          semi_wholesale_price: 650,
          retail_price: 700,
          average_cost_fcfa: null,
          image_path: null,
          is_active: 1,
          packagings: [],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    apiClient.listClients = async () => [];
    apiClient.listSuppliers = async () => [];
    apiClient.listSales = async () => ({ items: [], total: 0, page: 1, pageSize: 6, totalPages: 1 });

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      render(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/'] },
          React.createElement(QueryClientProvider, { client: qc }, React.createElement(Header))
        )
      );
      fireEvent.click(screen.getByRole('button', { name: /Ouvrir la recherche globale/i }));
      await waitFor(() => assert.ok(screen.getByLabelText('Recherche globale')));
      fireEvent.change(screen.getByLabelText('Recherche globale'), { target: { value: 'Coca' } });
      await waitFor(() => assert.ok(screen.getByText('Coca-Cola 1L')));
    } finally {
      qc.clear();
      apiClient.getCashStatus = origGetCash;
      apiClient.listProducts = origListProducts;
      apiClient.listClients = origListClients;
      apiClient.listSuppliers = origListSuppliers;
      apiClient.listSales = origListSales;
    }
  });

  it('InventoryPage filtre les articles en comptage sans perdre les autres lignes à la validation', async () => {
    const origListInventories = apiClient.listInventories;
    const origValidateInventory = apiClient.validateInventory;
    let submittedLines = null;

    apiClient.listInventories = async () => [
      {
        id: 9,
        reference: 'INV-2026-00009',
        status: 'draft',
        notes: 'Inventaire zone A',
        created_at: '2026-11-17T09:00:00Z',
        validated_at: null,
        lines: [
          {
            id: 1,
            product_id: 101,
            product_name: 'Fanta Orange 50cl',
            product_reference: 'PRD-0101',
            base_unit: 'bouteille',
            theoretical_milli: 12000,
            counted_milli: null,
            reason: null,
          },
          {
            id: 2,
            product_id: 102,
            product_name: 'Eau Céleste 1.5L',
            product_reference: 'PRD-0102',
            base_unit: 'bouteille',
            theoretical_milli: 24000,
            counted_milli: null,
            reason: null,
          },
        ],
      },
    ];
    apiClient.validateInventory = async (_id, lines) => {
      submittedLines = lines;
      return { id: 9, status: 'validated' };
    };

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      render(
        React.createElement(QueryClientProvider, { client: qc }, React.createElement(InventoryPage))
      );
      await waitFor(() => assert.ok(screen.getByText('INV-2026-00009')));
      fireEvent.click(screen.getByRole('button', { name: /Saisir & valider/i }));
      await waitFor(() => assert.ok(screen.getByLabelText("Filtrer les articles de l'inventaire")));

      fireEvent.change(screen.getByLabelText("Filtrer les articles de l'inventaire"), {
        target: { value: 'Fanta' },
      });
      await waitFor(() => {
        assert.ok(screen.getByText('Fanta Orange 50cl'));
        assert.equal(screen.queryByText('Eau Céleste 1.5L'), null);
      });

      const countInput = screen.getByDisplayValue('12');
      fireEvent.change(countInput, { target: { value: '10' } });
      fireEvent.change(screen.getByPlaceholderText('Motif obligatoire'), {
        target: { value: '2 bouteilles cassées' },
      });
      await waitFor(() => assert.ok(screen.getByText('1 écart(s)')));

      fireEvent.click(screen.getByRole('button', { name: /Valider et ajuster le stock/i }));
      await waitFor(() => assert.ok(submittedLines !== null));
      assert.equal(submittedLines.length, 2);
      assert.equal(submittedLines[0].counted_quantity, '10');
      assert.equal(submittedLines[0].reason, '2 bouteilles cassées');
      assert.equal(submittedLines[1].counted_quantity, '24');
    } finally {
      qc.clear();
      apiClient.listInventories = origListInventories;
      apiClient.validateInventory = origValidateInventory;
    }
  });

  it('PurchasesPage permet d’annuler un bon de commande non réceptionné avec motif obligatoire', async () => {
    const origListPurchases = apiClient.listPurchases;
    const origListSuppliers = apiClient.listSuppliers;
    const origListProducts = apiClient.listProducts;
    const origCancelPo = apiClient.cancelPurchaseOrder;
    let cancelledArgs = null;

    apiClient.listPurchases = async () => [
      {
        id: 88,
        reference: 'CMD-2026-00088',
        supplier_id: 2,
        supplier_name: 'SOLIBRA',
        supplier_code: 'FRN-002',
        status: 'confirmed',
        total_amount: 50000,
        received_amount: 0,
        expected_date: null,
        notes: null,
        created_at: '2026-11-17T08:00:00Z',
        lines: [],
        receipts: [],
      },
    ];
    apiClient.listSuppliers = async () => [];
    apiClient.listProducts = async () => ({ items: [], total: 0, page: 1, pageSize: 100, totalPages: 1 });
    apiClient.cancelPurchaseOrder = async (id, input) => {
      cancelledArgs = { id, input };
      return {
        id,
        reference: 'CMD-2026-00088',
        supplier_id: 2,
        supplier_name: 'SOLIBRA',
        supplier_code: 'FRN-002',
        status: 'cancelled',
        total_amount: 50000,
        received_amount: 0,
        expected_date: null,
        notes: input.reason,
        created_at: '2026-11-17T08:00:00Z',
        lines: [],
        receipts: [],
      };
    };

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      render(
        React.createElement(QueryClientProvider, { client: qc }, React.createElement(PurchasesPage))
      );
      await waitFor(() => assert.ok(screen.getByText('CMD-2026-00088')));
      fireEvent.click(screen.getByRole('button', { name: /Annuler/i }));
      await waitFor(() => assert.ok(screen.getByText(/Annuler la commande/i)));
      fireEvent.change(screen.getByPlaceholderText(/Rupture fournisseur/i), {
        target: { value: 'Erreur fournisseur' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Confirmer l'annulation/i }));
      await waitFor(() => assert.ok(cancelledArgs !== null));
      assert.equal(cancelledArgs.id, 88);
      assert.equal(cancelledArgs.input.reason, 'Erreur fournisseur');
    } finally {
      qc.clear();
      apiClient.listPurchases = origListPurchases;
      apiClient.listSuppliers = origListSuppliers;
      apiClient.listProducts = origListProducts;
      apiClient.cancelPurchaseOrder = origCancelPo;
    }
  });

  it('SalesPage gère ventes en attente, création client rapide et raccourci F9', async () => {
    const origListProducts = apiClient.listProducts;
    const origListClients = apiClient.listClients;
    const origCreateClient = apiClient.createClient;
    const origCreateSale = apiClient.createSale;
    const origGetSettings = apiClient.getSettings;
    const origGetCash = apiClient.getCashStatus;

    let createdSalePayload = null;
    const clientsList = [];

    apiClient.listProducts = async () => ({
      items: [
        {
          id: 50,
          reference: 'PRD-0050',
          barcode: null,
          name: 'Flag 65cl',
          brand: 'SOLIBRA',
          category_id: 1,
          category_name: 'Bières',
          supplier_id: null,
          supplier_name: null,
          description: null,
          base_unit: 'bouteille',
          stock_milli: 24000,
          min_stock_milli: 6000,
          max_stock_milli: 0,
          purchase_price: 500,
          wholesale_price: 600,
          semi_wholesale_price: 650,
          retail_price: 700,
          average_cost_fcfa: null,
          image_path: null,
          is_active: 1,
          packagings: [
            {
              id: 501,
              product_id: 50,
              name: 'bouteille',
              base_unit: 'bouteille',
              coefficient_milli: 1000,
              purchase_price: 500,
              wholesale_price: 600,
              semi_wholesale_price: 650,
              retail_price: 700,
              barcode: null,
              allow_fraction: 0,
              is_active: 1,
              deposit_mode: 'none',
              components: [],
            },
          ],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
    });
    apiClient.listClients = async () => clientsList;
    apiClient.createClient = async (input) => {
      const cli = {
        id: 707,
        code: 'CLI-0707',
        name: String(input.name),
        client_type: 'particulier',
        phone: null,
        address: null,
        city: null,
        email: null,
        contact_person: null,
        is_active: 1,
        credit_policy: 'forbidden',
        credit_limit: null,
        payment_terms_days: 0,
        unpaid_balance: 0,
        returnable_pieces_due: 0,
      };
      clientsList.push(cli);
      return cli;
    };
    apiClient.createSale = async (input) => {
      createdSalePayload = input;
      return {
        id: 901,
        reference: 'VTE-2026-00901',
        client_id: input.client_id ?? null,
        client_name: 'Client Express',
        client_code: 'CLI-0707',
        client_phone: null,
        sale_type: 'cash',
        price_tier: 'retail',
        subtotal_merchandise: 700,
        discount_amount: 0,
        total_merchandise: 700,
        total_deposit: 0,
        total_amount: 700,
        paid_amount: 700,
        remaining_amount: 0,
        payment_labels: 'Espèces',
        status: 'validated',
        notes: null,
        created_at: '2026-11-17T10:00:00Z',
        lines: [],
        payments: [],
        deposits: [],
        returns: [],
        cancellations: [],
      };
    };
    apiClient.getSettings = async () => ({
      settings: {
        company_name: 'DEPOTPRO',
        company_legal_name: null,
        address: null,
        phone: null,
        email: null,
        city: null,
        country: null,
        currency: 'FCFA',
        allow_negative_stock: 0,
        invoice_prefix: 'FAC',
        sale_prefix: 'VTE',
        purchase_prefix: 'ACH',
        order_prefix: 'CMD',
        receipt_prefix: 'REC',
        credit_note_prefix: 'AVO',
        theme: 'light',
      },
      paymentMethods: [{ code: 'cash', label: 'Espèces', is_cash: 1, active: 1 }],
    });
    apiClient.getCashStatus = async () => ({
      activeSession: {
        id: 1,
        reference: 'CAI-1',
        opened_at: '2026-11-17T08:00:00Z',
        closed_at: null,
        status: 'open',
        opening_cash: 0,
        theoretical_cash: 0,
        physical_cash: null,
        difference: null,
        closing_notes: null,
      },
      summary: null,
      history: [],
    });

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      useUiStore.setState({ heldCarts: [], posCart: [], posClientId: null });
      render(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/sales/new'] },
          React.createElement(QueryClientProvider, { client: qc }, React.createElement(SalesPage))
        )
      );
      await waitFor(() => assert.ok(screen.getByText('Flag 65cl')));

      // 1. Création client rapide
      fireEvent.click(screen.getByRole('button', { name: /Créer rapidement un client/i }));
      await waitFor(() => assert.ok(screen.getByText('Nouveau client rapide')));
      fireEvent.change(screen.getByPlaceholderText(/Maquis Horizon/i), {
        target: { value: 'Client Express' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Créer & sélectionner/i }));
      await waitFor(() => assert.equal(useUiStore.getState().posClientId, 707));

      // 2. Ajout article puis mise en attente + reprise
      fireEvent.click(screen.getByRole('button', { name: /bouteille/i }));
      await waitFor(() => assert.ok(screen.getByText(/Panier de vente \(1\)/)));
      fireEvent.click(screen.getByRole('button', { name: /Mettre en attente/i }));
      await waitFor(() => assert.ok(screen.getByRole('button', { name: /En attente \(1\)/i })));
      fireEvent.click(screen.getByRole('button', { name: /En attente \(1\)/i }));
      await waitFor(() => assert.ok(screen.getByRole('button', { name: /Reprendre/i })));
      fireEvent.click(screen.getByRole('button', { name: /Reprendre/i }));
      await waitFor(() => assert.ok(screen.getByText(/Panier de vente \(1\)/)));

      // 3. Raccourci F9 valide la vente
      fireEvent.keyDown(window, { key: 'F9', code: 'F9' });
      await waitFor(() => assert.ok(createdSalePayload !== null));
      assert.equal(createdSalePayload.client_id, 707);
      assert.equal(createdSalePayload.lines.length, 1);
    } finally {
      useUiStore.setState({ heldCarts: [], posCart: [], posClientId: null });
      qc.clear();
      apiClient.listProducts = origListProducts;
      apiClient.listClients = origListClients;
      apiClient.createClient = origCreateClient;
      apiClient.createSale = origCreateSale;
      apiClient.getSettings = origGetSettings;
      apiClient.getCashStatus = origGetCash;
    }
  });

  it('DashboardPage & Header affichent les alertes proactives d’échéances dépassées', async () => {
    const origGetDashboard = apiClient.getDashboard;
    const origGetReports = apiClient.getReports;
    const origGetCash = apiClient.getCashStatus;

    apiClient.getDashboard = async () => ({
      kpis: {
        revenueMerchandise: 100000,
        depositsTotal: 0,
        salesCount: 2,
        collectionsTotal: 50000,
        receivablesTotal: 50000,
        receivablesCount: 2,
        overdueReceivablesCount: 2,
        overdueReceivablesTotal: 50000,
        supplierDebtsTotal: 30000,
        supplierDebtsCount: 1,
        overdueSupplierDebtsCount: 1,
        overdueSupplierDebtsTotal: 30000,
        expensesTotal: 0,
        cashSessionOpen: true,
        cashSessionReference: 'CAI-1',
        cashPhysicalTheoretical: 50000,
        digitalSessionTotal: 0,
        lowStockCount: 0,
        outOfStockCount: 0,
      },
      lowStockProducts: [],
      topProducts: [],
      salesSeries: [],
      recentAudit: [],
    });
    apiClient.getReports = async () => ({
      commercial: { count: 0, merchandise_revenue: 0, deposit_billed: 0, paid_amount: 0 },
      profitability: {
        knownCostTotal: 0,
        knownCostRevenue: 0,
        knownGrossMargin: 0,
        unknownCostLines: 0,
        expensesTotal: 0,
        netKnownResult: 0,
      },
      paymentBreakdown: [],
      stock: { product_count: 0, unknown_cost_products: 0, knownValuationFcfa: 0 },
      dailySales: [],
    });
    apiClient.getCashStatus = async () => ({ activeSession: null, summary: null, history: [] });

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      render(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/'] },
          React.createElement(
            QueryClientProvider,
            { client: qc },
            React.createElement(
              React.Fragment,
              null,
              React.createElement(Header),
              React.createElement(DashboardPage)
            )
          )
        )
      );
      await waitFor(() => {
        assert.ok(screen.getByText(/2 créance\(s\) client à échéance dépassée/i));
        assert.ok(screen.getByText(/1 dette\(s\) fournisseur échue\(s\)/i));
        assert.ok(screen.getByText(/3 échéance\(s\)/i));
      });
    } finally {
      qc.clear();
      apiClient.getDashboard = origGetDashboard;
      apiClient.getReports = origGetReports;
      apiClient.getCashStatus = origGetCash;
    }
  });

  it('ExpensesPage valide avec Zod/RHF, affiche les justificatifs (receipt_path) et exporte le CSV', async () => {
    const origListExpenses = apiClient.listExpenses;
    const origGetSettings = apiClient.getSettings;
    const origCreateExpense = apiClient.createExpense;
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    const origClick = win.HTMLAnchorElement.prototype.click;

    const validPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const createdPayloads = [];
    const blobs = [];

    apiClient.listExpenses = async () => ({
      categories: [{ id: 1, name: 'Carburant & Livraison' }],
      items: [
        {
          id: 12,
          reference: 'DEP-2026-00012',
          category: 'Carburant & Livraison',
          amount: 4500,
          method_code: 'cash',
          method_label: 'Espèces',
          session_id: 1,
          beneficiary: 'Station Total',
          notes: 'Livraison Zone 4',
          receipt_path: validPng,
          expense_date: '2026-11-17T09:00:00Z',
        },
      ],
    });
    apiClient.getSettings = async () => ({
      settings: {
        company_name: 'DEPOTPRO',
        company_legal_name: null,
        address: null,
        phone: null,
        email: null,
        city: null,
        country: null,
        currency: 'FCFA',
        allow_negative_stock: 0,
        invoice_prefix: 'FAC',
        sale_prefix: 'VTE',
        purchase_prefix: 'ACH',
        order_prefix: 'CMD',
        receipt_prefix: 'REC',
        credit_note_prefix: 'AVO',
        theme: 'light',
      },
      paymentMethods: [{ code: 'cash', label: 'Espèces', is_cash: 1, active: 1 }],
    });
    apiClient.createExpense = async (input) => {
      createdPayloads.push(input);
      return { id: 13 };
    };
    URL.createObjectURL = (blob) => {
      blobs.push(blob);
      return 'blob:test-expenses';
    };
    URL.revokeObjectURL = () => {};
    win.HTMLAnchorElement.prototype.click = () => {};

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      render(
        React.createElement(QueryClientProvider, { client: qc }, React.createElement(ExpensesPage))
      );
      await waitFor(() => assert.ok(screen.getByText('DEP-2026-00012')));

      // 1. Visualisation du reçu existant
      fireEvent.click(screen.getByRole('button', { name: /Voir reçu/i }));
      await waitFor(() => assert.ok(screen.getByAltText('Reçu DEP-2026-00012')));
      fireEvent.keyDown(document.body, { key: 'Escape' });

      // 2. Export CSV dépenses
      fireEvent.click(screen.getByRole('button', { name: /Exporter CSV/i }));
      await waitFor(() => assert.equal(blobs.length, 1));
      const csvText = await blobs[0].text();
      assert.ok(csvText.includes('DEP-2026-00012'));
      assert.ok(csvText.includes(';Oui'));

      // 3. Validation Zod sur montant 0 FCFA puis soumission valide
      fireEvent.click(screen.getByRole('button', { name: /Ajouter une dépense/i }));
      await waitFor(() => assert.ok(screen.getByText('Enregistrer une dépense')));
      fireEvent.click(screen.getByRole('button', { name: /Valider la dépense/i }));
      await waitFor(() =>
        assert.ok(screen.getByText(/Le montant doit être supérieur à 0 FCFA/i))
      );
      assert.equal(createdPayloads.length, 0);

      fireEvent.change(screen.getByLabelText(/Montant de la dépense/i), {
        target: { value: '2500' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Valider la dépense/i }));
      await waitFor(() => assert.equal(createdPayloads.length, 1));
      assert.equal(createdPayloads[0].amount, 2500);
    } finally {
      qc.clear();
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
      win.HTMLAnchorElement.prototype.click = origClick;
      apiClient.listExpenses = origListExpenses;
      apiClient.getSettings = origGetSettings;
      apiClient.createExpense = origCreateExpense;
    }
  });

  it('SalesHistoryPage, DebtsPage & StockPage exportent leurs données en CSV', async () => {
    const origListSales = apiClient.listSales;
    const origListReceivables = apiClient.listReceivables;
    const origGetStock = apiClient.getStockOverview;
    const origGetSettings = apiClient.getSettings;
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    const origClick = win.HTMLAnchorElement.prototype.click;

    const downloaded = [];
    URL.createObjectURL = (blob) => {
      downloaded.push(blob);
      return 'blob:test-csv';
    };
    URL.revokeObjectURL = () => {};
    win.HTMLAnchorElement.prototype.click = () => {};

    apiClient.getSettings = async () => ({
      settings: {
        company_name: 'DEPOTPRO',
        company_legal_name: null,
        address: null,
        phone: null,
        email: null,
        city: null,
        country: null,
        currency: 'FCFA',
        allow_negative_stock: 0,
        invoice_prefix: 'FAC',
        sale_prefix: 'VTE',
        purchase_prefix: 'ACH',
        order_prefix: 'CMD',
        receipt_prefix: 'REC',
        credit_note_prefix: 'AVO',
        theme: 'light',
      },
      paymentMethods: [{ code: 'cash', label: 'Espèces', is_cash: 1, active: 1 }],
    });
    apiClient.listSales = async () => ({
      items: [
        {
          id: 1,
          reference: 'VTE-2026-00001',
          client_id: null,
          client_name: 'Client Comptoir',
          sale_type: 'cash',
          price_tier: 'retail',
          subtotal_merchandise: 1000,
          discount_amount: 0,
          total_merchandise: 1000,
          total_deposit: 0,
          total_amount: 1000,
          paid_amount: 1000,
          remaining_amount: 0,
          payment_labels: 'Espèces',
          status: 'validated',
          created_at: '2026-11-17T08:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    apiClient.listReceivables = async () => [
      {
        id: 2,
        sale_id: 1,
        sale_reference: 'VTE-2026-00002',
        sale_date: '2026-11-10',
        sale_total: 12000,
        client_id: 5,
        client_name: 'Maquis CSV',
        client_code: 'CLI-0005',
        client_phone: '07000000',
        initial_amount: 12000,
        remaining_amount: 4000,
        due_date: '2026-11-25',
        status: 'partial',
        created_at: '2026-11-10T10:00:00Z',
      },
    ];
    apiClient.getStockOverview = async () => ({
      products: [
        {
          id: 3,
          reference: 'PRD-003',
          name: 'Flag 65cl',
          brand: 'SOLIBRA',
          category_name: 'Bières',
          base_unit: 'bouteille',
          stock_milli: 24000,
          min_stock_milli: 6000,
          max_stock_milli: 0,
          average_cost_fcfa: 500,
          valuation_fcfa: 12000,
        },
      ],
      movements: [
        {
          id: 99,
          product_id: 3,
          product_name: 'Flag 65cl',
          product_reference: 'PRD-003',
          base_unit: 'bouteille',
          movement_type: 'manual_adjust',
          quantity_milli: -1000,
          stock_before_milli: 25000,
          stock_after_milli: 24000,
          reason: 'Casse test',
          reference_document: 'ADJ-2026-00001',
          created_at: '2026-11-17T09:00:00Z',
        },
      ],
    });

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      const sh = render(
        React.createElement(QueryClientProvider, { client: qc }, React.createElement(SalesHistoryPage))
      );
      await waitFor(() => assert.ok(screen.getByText('VTE-2026-00001')));
      fireEvent.click(screen.getByRole('button', { name: /Exporter CSV/i }));
      await waitFor(() => assert.equal(downloaded.length, 1));
      assert.ok((await downloaded[0].text()).includes('VTE-2026-00001'));
      sh.unmount();

      const db = render(
        React.createElement(QueryClientProvider, { client: qc }, React.createElement(DebtsPage))
      );
      await waitFor(() => assert.ok(screen.getByText('Maquis CSV')));
      fireEvent.click(screen.getByRole('button', { name: /Exporter CSV/i }));
      await waitFor(() => assert.equal(downloaded.length, 2));
      assert.ok((await downloaded[1].text()).includes('Maquis CSV;CLI-0005'));
      db.unmount();

      render(
        React.createElement(QueryClientProvider, { client: qc }, React.createElement(StockPage))
      );
      await waitFor(() => assert.ok(screen.getByText('Flag 65cl')));
      const movTab = screen.getByRole('tab', { name: /Journal des mouvements/i });
      fireEvent.mouseDown(movTab);
      fireEvent.click(movTab);
      await waitFor(() => assert.ok(screen.getByRole('button', { name: /CSV Mouvements/i })));
      fireEvent.click(screen.getByRole('button', { name: /CSV Mouvements/i }));
      await waitFor(() => assert.equal(downloaded.length, 3));
      assert.ok((await downloaded[2].text()).includes('ADJ-2026-00001'));
    } finally {
      qc.clear();
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
      win.HTMLAnchorElement.prototype.click = origClick;
      apiClient.listSales = origListSales;
      apiClient.listReceivables = origListReceivables;
      apiClient.getStockOverview = origGetStock;
      apiClient.getSettings = origGetSettings;
    }
  });

  it('ClientsPage bloque la soumission Zod lorsque le nom est vide', async () => {
    const origListClients = apiClient.listClients;
    const origCreateClient = apiClient.createClient;
    let createCalls = 0;

    apiClient.listClients = async () => [];
    apiClient.createClient = async () => {
      createCalls += 1;
      throw new Error('Ne doit pas être appelé');
    };

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      render(
        React.createElement(QueryClientProvider, { client: qc }, React.createElement(ClientsPage))
      );
      await waitFor(() => assert.ok(screen.getByRole('button', { name: /Nouveau client/i })));
      fireEvent.click(screen.getByRole('button', { name: /Nouveau client/i }));
      await waitFor(() => assert.ok(screen.getByRole('button', { name: /Créer le client/i })));
      fireEvent.click(screen.getByRole('button', { name: /Créer le client/i }));
      await waitFor(() =>
        assert.ok(screen.getByText(/Le nom ou la raison sociale est obligatoire/i))
      );
      assert.equal(createCalls, 0);
    } finally {
      qc.clear();
      apiClient.listClients = origListClients;
      apiClient.createClient = origCreateClient;
    }
  });

  it('ProductsPage valide avec Zod/RHF et crée un nouveau produit', async () => {
    const origListCategories = apiClient.listCategories;
    const origGetConsignments = apiClient.getConsignmentsOverview;
    const origListProducts = apiClient.listProducts;
    const origCreateProduct = apiClient.createProduct;

    const createdPayloads = [];
    apiClient.listCategories = async () => [{ id: 1, name: 'Bières', description: null }];
    apiClient.getConsignmentsOverview = async () => ({
      types: [],
      clientBalances: [],
      recentMovements: [],
      openIssues: [],
      returns: [],
    });
    apiClient.listProducts = async () => ({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 });
    apiClient.createProduct = async (input) => {
      createdPayloads.push(input);
      return {
        id: 99,
        reference: 'PRD-0099',
        barcode: null,
        name: String(input.name),
        brand: null,
        category_id: 1,
        category_name: 'Bières',
        supplier_id: null,
        supplier_name: null,
        description: null,
        base_unit: 'bouteille',
        stock_milli: 0,
        min_stock_milli: 24000,
        max_stock_milli: 0,
        purchase_price: 0,
        wholesale_price: 0,
        semi_wholesale_price: 0,
        retail_price: 700,
        average_cost_fcfa: null,
        image_path: null,
        is_active: 1,
        packagings: [],
      };
    };

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      render(
        React.createElement(QueryClientProvider, { client: qc }, React.createElement(ProductsPage))
      );
      await waitFor(() => assert.ok(screen.getByRole('button', { name: /Nouveau produit/i })));
      fireEvent.click(screen.getByRole('button', { name: /Nouveau produit/i }));
      await waitFor(() => assert.ok(screen.getByLabelText(/Nom du produit/i)));

      // Soumission vide -> bloquée par Zod
      fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/i }));
      await waitFor(() => assert.ok(screen.getByText(/Le nom du produit est obligatoire/i)));
      assert.equal(createdPayloads.length, 0);

      // Saisie valide
      fireEvent.change(screen.getByLabelText(/Nom du produit/i), {
        target: { value: 'Castel Beer 65cl' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/i }));
      await waitFor(() => assert.equal(createdPayloads.length, 1));
      assert.equal(createdPayloads[0].name, 'Castel Beer 65cl');
    } finally {
      qc.clear();
      apiClient.listCategories = origListCategories;
      apiClient.getConsignmentsOverview = origGetConsignments;
      apiClient.listProducts = origListProducts;
      apiClient.createProduct = origCreateProduct;
    }
  });

  it('SalesHistoryPage filtre par plage de dates (from / to) et réinitialise', async () => {
    const origListSales = apiClient.listSales;
    const origGetSettings = apiClient.getSettings;
    const calls = [];

    apiClient.getSettings = async () => ({
      settings: {
        company_name: 'DEPOTPRO',
        company_legal_name: null,
        address: null,
        phone: null,
        email: null,
        city: null,
        country: null,
        currency: 'FCFA',
        allow_negative_stock: 0,
        invoice_prefix: 'FAC',
        sale_prefix: 'VTE',
        purchase_prefix: 'ACH',
        order_prefix: 'CMD',
        receipt_prefix: 'REC',
        credit_note_prefix: 'AVO',
        theme: 'light',
        logo_path: null,
      },
      paymentMethods: [],
    });
    apiClient.listSales = async (params) => {
      calls.push(params);
      return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };
    };

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      render(
        React.createElement(QueryClientProvider, { client: qc }, React.createElement(SalesHistoryPage))
      );
      await waitFor(() => assert.ok(calls.length >= 1));
      fireEvent.change(screen.getByLabelText(/Date début ventes/i), {
        target: { value: '2026-11-01' },
      });
      fireEvent.change(screen.getByLabelText(/Date fin ventes/i), {
        target: { value: '2026-11-17' },
      });
      await waitFor(() =>
        assert.ok(calls.some((c) => c.from === '2026-11-01' && c.to === '2026-11-17'))
      );

      fireEvent.click(screen.getByRole('button', { name: /Réinitialiser/i }));
      await waitFor(() => {
        const last = calls[calls.length - 1];
        assert.equal(last.from, undefined);
        assert.equal(last.to, undefined);
      });
    } finally {
      qc.clear();
      apiClient.listSales = origListSales;
      apiClient.getSettings = origGetSettings;
    }
  });

  it('CashPage valide l’écart avec Zod/RHF et exporte CSV ; PurchasesPage & ConsignmentsPage exportent CSV', async () => {
    const origGetCash = apiClient.getCashStatus;
    const origCloseCash = apiClient.closeCashSession;
    const origListPurchases = apiClient.listPurchases;
    const origListSuppliers = apiClient.listSuppliers;
    const origListProducts = apiClient.listProducts;
    const origGetConsignments = apiClient.getConsignmentsOverview;
    const origGetSettings = apiClient.getSettings;
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    const origClick = win.HTMLAnchorElement.prototype.click;

    let closeCalls = 0;
    const blobs = [];
    URL.createObjectURL = (blob) => {
      blobs.push(blob);
      return 'blob:priority4-csv';
    };
    URL.revokeObjectURL = () => {};
    win.HTMLAnchorElement.prototype.click = () => {};

    apiClient.getSettings = async () => ({
      settings: {
        company_name: 'DEPOTPRO',
        company_legal_name: null,
        address: null,
        phone: null,
        email: null,
        city: null,
        country: null,
        currency: 'FCFA',
        allow_negative_stock: 0,
        invoice_prefix: 'FAC',
        sale_prefix: 'VTE',
        purchase_prefix: 'ACH',
        order_prefix: 'CMD',
        receipt_prefix: 'REC',
        credit_note_prefix: 'AVO',
        theme: 'light',
        logo_path: null,
      },
      paymentMethods: [{ code: 'cash', label: 'Espèces', is_cash: 1, active: 1 }],
    });
    apiClient.getCashStatus = async () => ({
      activeSession: {
        id: 10,
        reference: 'CAI-2026-00010',
        opening_cash: 20000,
        theoretical_cash: null,
        physical_cash: null,
        difference: null,
        status: 'open',
        closing_notes: null,
        opened_at: '2026-11-17T08:00:00Z',
        closed_at: null,
      },
      summary: {
        theoreticalCash: 30000,
        byMethod: [{ method_code: 'cash', label: 'Espèces', is_cash: 1, total_in: 10000, total_out: 0 }],
        movements: [
          {
            id: 1,
            created_at: '2026-11-17T09:00:00Z',
            description: 'Vente VTE-2026-00010',
            method_code: 'cash',
            method_label: 'Espèces',
            is_cash: 1,
            direction: 'in',
            amount: 10000,
            reference_document: 'VTE-2026-00010',
          },
        ],
      },
      history: [
        {
          id: 9,
          reference: 'CAI-2026-00009',
          opening_cash: 15000,
          theoretical_cash: 25000,
          physical_cash: 25000,
          difference: 0,
          status: 'closed',
          closing_notes: 'RAS',
          opened_at: '2026-11-16T08:00:00Z',
          closed_at: '2026-11-16T19:00:00Z',
        },
      ],
    });
    apiClient.closeCashSession = async () => {
      closeCalls += 1;
      return {};
    };
    apiClient.listPurchases = async () => [
      {
        id: 1,
        reference: 'CMD-2026-00050',
        supplier_id: 1,
        supplier_name: 'SOLIBRA SA',
        supplier_code: 'FRN-0001',
        status: 'ordered',
        total_amount: 50000,
        received_amount: 0,
        expected_date: null,
        notes: null,
        created_at: '2026-11-17T08:00:00Z',
        lines: [],
        receipts: [],
      },
    ];
    apiClient.listSuppliers = async () => [];
    apiClient.listProducts = async () => ({ items: [], total: 0, page: 1, pageSize: 100, totalPages: 1 });
    apiClient.getConsignmentsOverview = async () => ({
      types: [],
      clientBalances: [
        {
          id: 1,
          client_id: 2,
          client_name: 'Bar Étoile',
          client_code: 'CLI-0002',
          packaging_name: 'Casier 24',
          packaging_code: 'CAS-24',
          balance_pieces: 5,
          deposit_held_amount: 12500,
        },
      ],
      recentMovements: [],
      openIssues: [],
      returns: [],
    });

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      const cashView = render(
        React.createElement(QueryClientProvider, { client: qc }, React.createElement(CashPage))
      );
      await waitFor(() => assert.ok(screen.getByText(/Session active · CAI-2026-00010/i)));

      fireEvent.click(screen.getByRole('button', { name: /CSV Mouvements/i }));
      fireEvent.click(screen.getByRole('button', { name: /CSV Sessions/i }));
      await waitFor(() => assert.equal(blobs.length, 2));

      fireEvent.click(screen.getByRole('button', { name: /Clôturer la caisse/i }));
      await waitFor(() => assert.ok(screen.getByLabelText(/Espèces physiques comptées/i)));
      fireEvent.change(screen.getByLabelText(/Espèces physiques comptées/i), {
        target: { value: '28000' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Clôturer définitivement/i }));
      await waitFor(() =>
        assert.ok(screen.getByText(/Un commentaire justificatif est obligatoire/i))
      );
      assert.equal(closeCalls, 0);
      cashView.unmount();

      const poView = render(
        React.createElement(QueryClientProvider, { client: qc }, React.createElement(PurchasesPage))
      );
      await waitFor(() => assert.ok(screen.getByText('CMD-2026-00050')));
      fireEvent.click(screen.getByRole('button', { name: /Exporter CSV/i }));
      await waitFor(() => assert.equal(blobs.length, 3));
      assert.ok((await blobs[2].text()).includes('CMD-2026-00050;'));
      poView.unmount();

      render(
        React.createElement(QueryClientProvider, { client: qc }, React.createElement(ConsignmentsPage))
      );
      await waitFor(() => assert.ok(screen.getByText(/Vides en stock dépôt/i)));
      fireEvent.click(screen.getByRole('button', { name: /CSV Soldes clients/i }));
      await waitFor(() => assert.equal(blobs.length, 4));
      assert.ok((await blobs[3].text()).includes('Bar Étoile;CLI-0002'));
    } finally {
      qc.clear();
      URL.createObjectURL = origCreateObjectURL;
      URL.revokeObjectURL = origRevokeObjectURL;
      win.HTMLAnchorElement.prototype.click = origClick;
      apiClient.getCashStatus = origGetCash;
      apiClient.closeCashSession = origCloseCash;
      apiClient.listPurchases = origListPurchases;
      apiClient.listSuppliers = origListSuppliers;
      apiClient.listProducts = origListProducts;
      apiClient.getConsignmentsOverview = origGetConsignments;
      apiClient.getSettings = origGetSettings;
    }
  });

  it('LoginPage gère saisie clavier rapide sans doublon, reprise sur erreur serveur et session cookie', async () => {
    const origStatus = apiClient.getAuthStatus;
    const origSetup = apiClient.setupPin;
    const origLogin = apiClient.login;
    let statusCalls = 0;
    const setupPins = [];

    apiClient.getAuthStatus = async () => {
      statusCalls += 1;
      if (statusCalls === 1) {
        throw new Error('Serveur non prêt');
      }
      if (statusCalls === 2) {
        return { needsSetup: true, lockedUntil: null, failedAttempts: 0, authenticated: false };
      }
      return { needsSetup: false, lockedUntil: null, failedAttempts: 0, authenticated: true };
    };
    apiClient.setupPin = async (pin) => {
      setupPins.push(pin);
      return { token: 'login-fix-token' };
    };

    try {
      const firstView = render(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/login'] },
          React.createElement(LoginPage)
        )
      );
      await waitFor(() =>
        assert.ok(screen.getByText(/Impossible de contacter le serveur local DEPOTPRO/i))
      );
      fireEvent.click(screen.getByRole('button', { name: /Réessayer/i }));
      await waitFor(() => assert.ok(screen.getByText('Créer votre PIN propriétaire')));

      // Saisie clavier rapide (6 chiffres dans la même frame) + Entrée
      for (const d of '654321') {
        fireEvent.keyDown(win, { key: d });
      }
      await waitFor(() =>
        assert.equal(screen.getByRole('button', { name: 'Continuer' }).hasAttribute('disabled'), false)
      );
      fireEvent.keyDown(win, { key: 'Enter' });
      await waitFor(() => assert.ok(screen.getByText('Confirmer le code PIN')));

      for (const d of '654321') {
        fireEvent.keyDown(win, { key: d });
      }
      await waitFor(() =>
        assert.equal(
          screen.getByRole('button', { name: 'Enregistrer et accéder' }).hasAttribute('disabled'),
          false
        )
      );
      fireEvent.keyDown(win, { key: 'Enter' });
      await waitFor(() => {
        assert.deepEqual(setupPins, ['654321']);
        assert.equal(useUiStore.getState().token, 'login-fix-token');
      });
      firstView.unmount();
      useUiStore.getState().setToken(null);

      // Reprise automatique si authenticated=true (cookie HttpOnly actif)
      render(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/login'] },
          React.createElement(LoginPage)
        )
      );
      await waitFor(() => assert.equal(useUiStore.getState().token, 'cookie-session'));
    } finally {
      apiClient.getAuthStatus = origStatus;
      apiClient.setupPin = origSetup;
      apiClient.login = origLogin;
      useUiStore.getState().setToken(null);
    }
  });

  it('SalesHistoryPage & PurchasesPage bloquent les dépassements de quantité côté UI et normalisent les saisies', async () => {
    const origListSales = apiClient.listSales;
    const origGetSaleDetail = apiClient.getSaleDetail;
    const origCreateReturn = apiClient.createSaleReturn;
    const origListPurchases = apiClient.listPurchases;
    const origListSuppliers = apiClient.listSuppliers;
    const origListProducts = apiClient.listProducts;
    const origReceivePo = apiClient.receivePurchaseOrder;
    const origGetSettings = apiClient.getSettings;

    const returnCalls = [];
    const receiveCalls = [];

    apiClient.getSettings = async () => ({
      settings: {
        company_name: 'DEPOTPRO',
        company_legal_name: null,
        address: null,
        phone: null,
        email: null,
        city: null,
        country: "Côte d'Ivoire",
        currency: 'FCFA',
        allow_negative_stock: 0,
        invoice_prefix: 'FAC',
        sale_prefix: 'VTE',
        purchase_prefix: 'ACH',
        order_prefix: 'CMD',
        receipt_prefix: 'REC',
        credit_note_prefix: 'AVO',
        theme: 'light',
        logo_path: null,
      },
      paymentMethods: [{ code: 'cash', label: 'Espèces', is_cash: 1, active: 1 }],
    });

    const saleDetail = {
      id: 91,
      reference: 'VTE-2026-00091',
      client_id: null,
      client_name: 'Client Comptoir',
      sale_type: 'cash',
      price_tier: 'retail',
      subtotal_merchandise: 3000,
      discount_amount: 0,
      total_merchandise: 3000,
      total_deposit: 0,
      total_amount: 3000,
      paid_amount: 3000,
      remaining_amount: 0,
      payment_labels: 'Espèces',
      status: 'partially_returned',
      notes: null,
      created_at: '2026-11-17T10:00:00Z',
      client_code: null,
      client_phone: null,
      receivable_id: null,
      due_date: null,
      lines: [
        {
          id: 501,
          sale_id: 91,
          product_id: 1,
          packaging_id: 1,
          product_name: 'Flag 65cl',
          packaging_name: 'bouteille',
          base_unit: 'bouteille',
          coefficient_milli: 1000,
          quantity_milli: 5000,
          base_quantity_milli: 5000,
          unit_price: 600,
          discount_amount: 0,
          line_total: 3000,
          returned_base_milli: 2000,
        },
        {
          id: 502,
          sale_id: 91,
          product_id: 2,
          packaging_id: 2,
          product_name: 'Coca 33cl',
          packaging_name: 'canette',
          base_unit: 'canette',
          coefficient_milli: 1000,
          quantity_milli: 2000,
          base_quantity_milli: 2000,
          unit_price: 500,
          discount_amount: 0,
          line_total: 1000,
          returned_base_milli: 2000,
        },
      ],
      payments: [{ id: 1, reference: 'REC-1', method_code: 'cash', method_label: 'Espèces', part_amount: 3000, created_at: '2026-11-17T10:00:00Z' }],
      deposits: [],
      cancellation: null,
      returns: [],
    };
    apiClient.listSales = async () => ({
      items: [saleDetail],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    apiClient.getSaleDetail = async () => saleDetail;
    apiClient.createSaleReturn = async (saleId, input) => {
      returnCalls.push({ saleId, input });
      return saleDetail;
    };

    apiClient.listSuppliers = async () => [];
    apiClient.listProducts = async () => ({ items: [], total: 0, page: 1, pageSize: 100, totalPages: 1 });
    apiClient.listPurchases = async () => [
      {
        id: 77,
        reference: 'CMD-2026-00077',
        supplier_id: 1,
        supplier_name: 'SOLIBRA',
        supplier_code: 'FRN-001',
        status: 'partial',
        total_amount: 100000,
        received_amount: 60000,
        expected_date: null,
        notes: null,
        created_at: '2026-11-17T08:00:00Z',
        lines: [
          {
            id: 901,
            product_id: 1,
            packaging_id: 1,
            product_name: 'Flag 65cl',
            packaging_name: 'casier',
            base_unit: 'bouteille',
            coefficient_milli: 24000,
            ordered_quantity_milli: 10000,
            received_quantity_milli: 6000,
            unit_price: 10000,
            line_total: 100000,
          },
        ],
        receipts: [],
      },
    ];
    apiClient.receivePurchaseOrder = async (orderId, input) => {
      receiveCalls.push({ orderId, input });
      return { id: 1 };
    };

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      const shView = render(
        React.createElement(QueryClientProvider, { client: qc }, React.createElement(SalesHistoryPage))
      );
      await waitFor(() => assert.ok(screen.getByText('VTE-2026-00091')));
      fireEvent.click(screen.getByRole('button', { name: /Détails/i }));
      await waitFor(() => assert.ok(screen.getByRole('button', { name: /Retour & Avoir/i })));
      fireEvent.click(screen.getByRole('button', { name: /Retour & Avoir/i }));
      await waitFor(() => assert.ok(screen.getByText(/Déjà intégralement retournée/i)));

      const cocaInput = screen.getByLabelText('Quantité retour Coca 33cl');
      assert.equal(cocaInput.hasAttribute('disabled'), true);

      const flagInput = screen.getByLabelText('Quantité retour Flag 65cl');
      fireEvent.change(flagInput, { target: { value: '5' } });
      fireEvent.change(flagInput.closest('div.space-y-3').querySelector('input[type="text"]:not([aria-label])'), {
        target: { value: 'Motif test' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Générer l'avoir/i }));
      await waitFor(() =>
        assert.ok(screen.getByText(/Quantité retournée supérieure au solde restant/i))
      );
      assert.equal(returnCalls.length, 0);

      fireEvent.change(flagInput, { target: { value: '1,5' } });
      fireEvent.click(screen.getByRole('button', { name: /Générer l'avoir/i }));
      await waitFor(() => assert.equal(returnCalls.length, 1));
      assert.deepEqual(returnCalls[0].input.lines, [{ sale_line_id: 501, base_quantity: '1.5' }]);
      shView.unmount();

      render(
        React.createElement(QueryClientProvider, { client: qc }, React.createElement(PurchasesPage))
      );
      await waitFor(() => assert.ok(screen.getByText('CMD-2026-00077')));
      fireEvent.click(screen.getByRole('button', { name: /Réceptionner/i }));
      await waitFor(() => assert.ok(screen.getByText(/Restant : 4 casier/i)));

      const recInput = screen.getByLabelText('Quantité reçue');
      fireEvent.change(recInput, { target: { value: '6' } });
      fireEvent.click(screen.getByRole('button', { name: /Valider la réception en stock/i }));
      await waitFor(() =>
        assert.ok(screen.getByText(/La quantité reçue dépasse le reliquat commandé/i))
      );
      assert.equal(receiveCalls.length, 0);

      fireEvent.change(recInput, { target: { value: '2' } });
      fireEvent.click(screen.getByRole('button', { name: /Valider la réception en stock/i }));
      await waitFor(() => assert.equal(receiveCalls.length, 1));
      assert.equal(receiveCalls[0].input.lines[0].purchase_order_line_id, 901);
      assert.equal(receiveCalls[0].input.lines[0].received_quantity, '2');
    } finally {
      qc.clear();
      apiClient.listSales = origListSales;
      apiClient.getSaleDetail = origGetSaleDetail;
      apiClient.createSaleReturn = origCreateReturn;
      apiClient.listPurchases = origListPurchases;
      apiClient.listSuppliers = origListSuppliers;
      apiClient.listProducts = origListProducts;
      apiClient.receivePurchaseOrder = origReceivePo;
      apiClient.getSettings = origGetSettings;
    }
  });

  it('Lot 2 — SalesPage calcule en BigInt exact, bloque les fractions invalides et conserve le panier après échec', async () => {
    const origListProducts = apiClient.listProducts;
    const origListClients = apiClient.listClients;
    const origGetSettings = apiClient.getSettings;
    const origGetCash = apiClient.getCashStatus;
    const origCreateSale = apiClient.createSale;

    apiClient.listProducts = async () => ({
      items: [
        {
          id: 95,
          reference: 'PRD-0095',
          barcode: null,
          name: 'Sirop Lot 2 UI',
          brand: null,
          category_id: 1,
          category_name: 'Sirops',
          supplier_id: null,
          supplier_name: null,
          description: null,
          base_unit: 'litre',
          stock_milli: 50_000,
          min_stock_milli: 5_000,
          max_stock_milli: 0,
          purchase_price: 80,
          wholesale_price: 90,
          semi_wholesale_price: 95,
          retail_price: 100,
          average_cost_fcfa: null,
          image_path: null,
          is_active: 1,
          packagings: [
            {
              id: 951,
              product_id: 95,
              name: 'bouteille',
              base_unit: 'litre',
              coefficient_milli: 1000,
              purchase_price: 80,
              wholesale_price: 90,
              semi_wholesale_price: 95,
              retail_price: 100,
              barcode: null,
              allow_fraction: 1,
              is_active: 1,
              deposit_mode: 'none',
              components: [],
            },
          ],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
    });
    apiClient.listClients = async () => [];
    apiClient.getSettings = async () => ({
      settings: {
        company_name: 'DEPOTPRO',
        company_legal_name: null,
        address: null,
        phone: null,
        email: null,
        city: null,
        country: null,
        currency: 'FCFA',
        allow_negative_stock: 0,
        invoice_prefix: 'FAC',
        sale_prefix: 'VTE',
        purchase_prefix: 'ACH',
        order_prefix: 'CMD',
        receipt_prefix: 'REC',
        credit_note_prefix: 'AVO',
        theme: 'light',
      },
      paymentMethods: [{ code: 'cash', label: 'Espèces', is_cash: 1, active: 1 }],
    });
    apiClient.getCashStatus = async () => ({
      activeSession: {
        id: 1,
        reference: 'CAI-1',
        opened_at: '2026-11-17T08:00:00Z',
        closed_at: null,
        status: 'open',
        opening_cash: 0,
        theoretical_cash: 0,
        physical_cash: null,
        difference: null,
        closing_notes: null,
      },
      summary: null,
      history: [],
    });
    apiClient.createSale = async () => {
      throw new Error('Encaissement insuffisant côté serveur');
    };

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      useUiStore.setState({ heldCarts: [], posCart: [], posClientId: null, posSaleType: 'cash' });

      // Vérifie l'addition décimale exacte dans le store POS (0.1 + 0.2 === 0.3, sans 0.30000000000000004)
      useUiStore.getState().addToCart({
        key: '95-951',
        productId: 95,
        productName: 'Sirop Lot 2 UI',
        reference: 'PRD-0095',
        baseUnit: 'litre',
        stockMilli: 50_000,
        packagingId: 951,
        packagingName: 'bouteille',
        coefficientMilli: 1000,
        allowFraction: true,
        quantity: '0.1',
        unitPrice: 100,
        discountAmount: 0,
        depositPerPack: 0,
        depositMode: 'none',
      });
      useUiStore.getState().addToCart({
        key: '95-951',
        productId: 95,
        productName: 'Sirop Lot 2 UI',
        reference: 'PRD-0095',
        baseUnit: 'litre',
        stockMilli: 50_000,
        packagingId: 951,
        packagingName: 'bouteille',
        coefficientMilli: 1000,
        allowFraction: true,
        quantity: '0.2',
        unitPrice: 100,
        discountAmount: 0,
        depositPerPack: 0,
        depositMode: 'none',
      });
      assert.equal(useUiStore.getState().posCart[0].quantity, '0.3');

      render(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/sales/new'] },
          React.createElement(QueryClientProvider, { client: qc }, React.createElement(SalesPage))
        )
      );
      await waitFor(() => assert.ok(screen.getByText('Sirop Lot 2 UI')));

      // Quantité 0.333 × 100 FCFA -> non entier FCFA : doit afficher erreur, masquer total exact et désactiver validation
      const qtyInputs = screen.getAllByRole('textbox');
      const lineQtyInput = qtyInputs.find((el) => el.value === '0.3');
      assert.ok(lineQtyInput);
      fireEvent.change(lineQtyInput, { target: { value: '0.333' } });

      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        assert.ok(
          alerts.some((a) => /nombre entier de FCFA/i.test(a.textContent || ''))
        );
      });
      const submitBtn = screen.getByRole('button', { name: /Valider la vente \(F9\)/i });
      assert.equal(submitBtn.hasAttribute('disabled'), true);

      // Quantité valide 0.5 × 100 = 50 FCFA exact
      fireEvent.change(lineQtyInput, { target: { value: '0.5' } });
      await waitFor(() => {
        assert.equal(submitBtn.hasAttribute('disabled'), false);
        assert.ok(screen.getAllByText(/50 FCFA/).length >= 1);
      });

      // Échec API : le message d'erreur s'affiche et le panier n'est PAS vidé
      fireEvent.click(submitBtn);
      await waitFor(() => {
        assert.ok(screen.getByText(/Encaissement insuffisant côté serveur/i));
      });
      assert.equal(useUiStore.getState().posCart.length, 1);
    } finally {
      useUiStore.setState({ heldCarts: [], posCart: [], posClientId: null, posSaleType: 'cash' });
      qc.clear();
      apiClient.listProducts = origListProducts;
      apiClient.listClients = origListClients;
      apiClient.getSettings = origGetSettings;
      apiClient.getCashStatus = origGetCash;
      apiClient.createSale = origCreateSale;
    }
  });

  it('Lot 4 — DashboardPage affiche l’assistant de première configuration quand setup_completed === 0', async () => {
    const origGetDashboard = apiClient.getDashboard;
    const origGetReports = apiClient.getReports;
    const origGetSettings = apiClient.getSettings;
    const origUpdateSettings = apiClient.updateSettings;
    const savedCalls = [];

    apiClient.getDashboard = async () => ({
      kpis: {
        revenueMerchandise: 0,
        depositsTotal: 0,
        salesCount: 0,
        collectionsTotal: 0,
        receivablesTotal: 0,
        receivablesCount: 0,
        supplierDebtsTotal: 0,
        supplierDebtsCount: 0,
        expensesTotal: 0,
        cashSessionOpen: false,
        cashSessionReference: null,
        cashPhysicalTheoretical: 0,
        digitalSessionTotal: 0,
        lowStockCount: 0,
        outOfStockCount: 0,
      },
      lowStockProducts: [],
      topProducts: [],
      salesSeries: [],
      recentAudit: [],
    });
    apiClient.getReports = async () => ({
      commercial: { count: 0, merchandise_revenue: 0, deposit_billed: 0, paid_amount: 0 },
      profitability: {
        knownCostTotal: 0,
        knownCostRevenue: 0,
        knownGrossMargin: 0,
        unknownCostLines: 0,
        expensesTotal: 0,
        netKnownResult: 0,
      },
      paymentBreakdown: [],
      stock: { product_count: 0, unknown_cost_products: 0, knownValuationFcfa: 0 },
      dailySales: [],
    });
    apiClient.getSettings = async () => ({
      settings: {
        company_name: 'Mon Dépôt',
        company_legal_name: null,
        address: null,
        phone: null,
        email: null,
        city: null,
        country: null,
        currency: 'FCFA',
        allow_negative_stock: 0,
        invoice_prefix: 'FAC',
        sale_prefix: 'VTE',
        purchase_prefix: 'ACH',
        order_prefix: 'CMD',
        receipt_prefix: 'REC',
        credit_note_prefix: 'AVO',
        theme: 'light',
        logo_path: null,
        setup_completed: 0,
      },
      paymentMethods: [],
    });
    apiClient.updateSettings = async (input) => {
      savedCalls.push(input);
      return {
        settings: {
          company_name: String(input.company_name || 'Mon Dépôt'),
          company_legal_name: input.company_legal_name ?? null,
          address: input.address ?? null,
          phone: input.phone ?? null,
          email: null,
          city: input.city ?? null,
          country: input.country ?? null,
          currency: 'FCFA',
          allow_negative_stock: 0,
          invoice_prefix: 'FAC',
          sale_prefix: 'VTE',
          purchase_prefix: 'ACH',
          order_prefix: 'CMD',
          receipt_prefix: 'REC',
          credit_note_prefix: 'AVO',
          theme: 'light',
          logo_path: null,
          setup_completed: 1,
        },
        paymentMethods: [],
      };
    };

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      render(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/'] },
          React.createElement(QueryClientProvider, { client: qc }, React.createElement(DashboardPage))
        )
      );
      await waitFor(() =>
        assert.ok(screen.getByText(/Assistant de première configuration/i))
      );
      fireEvent.click(screen.getByRole('button', { name: /Configurer mon dépôt/i }));
      await waitFor(() =>
        assert.ok(screen.getByRole('heading', { name: /Identité de votre dépôt/i }))
      );

      const nameInput = screen.getByPlaceholderText(/Ex\. Dépôt Boissons Étoile/i);
      fireEvent.change(nameInput, { target: { value: 'Dépôt Cocody Boissons' } });
      fireEvent.click(screen.getByRole('button', { name: /Enregistrer et terminer/i }));

      await waitFor(() => assert.equal(savedCalls.length, 1));
      assert.equal(savedCalls[0].company_name, 'Dépôt Cocody Boissons');
      assert.equal(savedCalls[0].setup_completed, true);
    } finally {
      qc.clear();
      apiClient.getDashboard = origGetDashboard;
      apiClient.getReports = origGetReports;
      apiClient.getSettings = origGetSettings;
      apiClient.updateSettings = origUpdateSettings;
    }
  });

  it('Lot 5 — BackupsPage affiche SHA-256, vérification lecture seule, incompatibilité et restauration sécurisée', async () => {
    const origListBackups = apiClient.listBackups;
    const origVerifyBackup = apiClient.verifyBackup;
    const origRestoreBackup = apiClient.restoreBackup;

    apiClient.listBackups = async () => [
      {
        name: 'depotpro_backup_20261117120000_aaaaaa.db',
        size: 163840,
        createdAt: '2026-11-17T12:00:00Z',
        sha256: 'a1b2c3d4e5f60708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
      },
      {
        name: 'depotpro_backup_20261117110000_future.db',
        size: 163840,
        createdAt: '2026-11-17T11:00:00Z',
        sha256: 'ffffffffffff0708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
      },
    ];
    apiClient.verifyBackup = async (name) =>
      name.includes('future')
        ? {
            name,
            integrity: 'ok',
            foreignKeyErrors: 0,
            schemaVersion: 99,
            compatible: false,
            compatibilityReason: 'Version de schéma incompatible (v99 > v4).',
          }
        : {
            name,
            integrity: 'ok',
            foreignKeyErrors: 0,
            schemaVersion: 4,
            compatible: true,
            compatibilityReason: null,
            sha256: 'a1b2c3d4e5f60708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
          };
    apiClient.restoreBackup = async (name) => ({
      restored: name,
      safetyBackup: 'depotpro_backup_20261117120500_safety.db',
      counts: {
        products: 5,
        stockMovements: 8,
        clients: 2,
        suppliers: 1,
        sales: 3,
        salesReturns: 1,
        customerReceivables: 1,
        purchaseOrders: 1,
        purchaseReceipts: 1,
        supplierDebts: 1,
        returnableStockMovements: 1,
        cashMovements: 4,
        expenses: 1,
        auditLogs: 12,
      },
    });

    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
        mutations: { gcTime: Number.POSITIVE_INFINITY },
      },
    });
    try {
      render(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/backups'] },
          React.createElement(QueryClientProvider, { client: qc }, React.createElement(BackupsPage))
        )
      );

      await waitFor(() => assert.ok(screen.getByText(/a1b2c3d4e5f6…/i)));

      fireEvent.click(screen.getAllByRole('button', { name: /^Vérifier$/i })[0]);
      await waitFor(() =>
        assert.ok(screen.getByText(/lecture seule.*compatible/i))
      );

      fireEvent.click(screen.getAllByRole('button', { name: /^Vérifier$/i })[1]);
      await waitFor(() =>
        assert.ok(screen.getByText(/incompatible.*v99 > v4/i))
      );

      fireEvent.click(screen.getAllByRole('button', { name: /^Restaurer$/i })[0]);
      await waitFor(() =>
        assert.ok(screen.getByRole('button', { name: /Restaurer cette sauvegarde/i }))
      );
      fireEvent.click(screen.getByRole('button', { name: /Restaurer cette sauvegarde/i }));
      await waitFor(() =>
        assert.ok(screen.getByText(/sauvegarde sécurité : depotpro_backup_20261117120500_safety\.db/i))
      );
    } finally {
      qc.clear();
      apiClient.listBackups = origListBackups;
      apiClient.verifyBackup = origVerifyBackup;
      apiClient.restoreBackup = origRestoreBackup;
    }
  });

  it('Lot 6 — LoginPage multi-utilisateur, BackupsPage chiffrée AES-256 et SettingsPage RBAC', async () => {
    const origStatus = apiClient.getAuthStatus;
    const origLogin = apiClient.login;
    const origListBackups = apiClient.listBackups;
    const origCreateEnc = apiClient.createEncryptedBackup;
    const origGetSettings = apiClient.getSettings;
    const origListUsers = apiClient.listUsers;
    const origCreateUser = apiClient.createUser;

    const loginCalls = [];
    apiClient.getAuthStatus = async () => ({
      needsSetup: false,
      lockedUntil: null,
      failedAttempts: 0,
    });
    apiClient.login = async (pin, username) => {
      loginCalls.push({ pin, username });
      return {
        token: 'tok-cashier',
        user: {
          userId: '2',
          username: username || 'owner',
          displayName: 'Mariam Caisse',
          role: 'cashier',
          roleLabel: 'Caissier',
          permissions: ['sales:read', 'sales:write'],
        },
      };
    };

    try {
      const { unmount } = render(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/login'] },
          React.createElement(LoginPage)
        )
      );
      await waitFor(() => assert.ok(screen.getByLabelText(/Identifiant/i)));
      fireEvent.change(screen.getByLabelText(/Identifiant/i), { target: { value: 'caissier1' } });
      for (const d of '112233') {
        fireEvent.click(screen.getByRole('button', { name: d }));
      }
      fireEvent.click(screen.getByRole('button', { name: 'Déverrouiller' }));
      await waitFor(() => {
        assert.deepEqual(loginCalls, [{ pin: '112233', username: 'caissier1' }]);
        assert.equal(useUiStore.getState().currentUser?.role, 'cashier');
      });
      unmount();

      apiClient.listBackups = async () => [
        {
          name: 'depotpro_backup_20261117130000_enc001.dpbkp',
          size: 81920,
          createdAt: '2026-11-17T13:00:00Z',
          sha256: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          encrypted: true,
        },
      ];
      apiClient.createEncryptedBackup = async (passphrase) => ({
        name: 'depotpro_backup_20261117130100_enc002.dpbkp',
        size: 81920,
        createdAt: '2026-11-17T13:01:00Z',
        sha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        encrypted: true,
      });

      const qc = new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
          mutations: { gcTime: Number.POSITIVE_INFINITY },
        },
      });
      const backupsRender = render(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/backups'] },
          React.createElement(QueryClientProvider, { client: qc }, React.createElement(BackupsPage))
        )
      );
      await waitFor(() => assert.ok(screen.getByText('AES-256')));
      fireEvent.click(screen.getByRole('button', { name: /Sauvegarde chiffrée/i }));
      await waitFor(() => assert.ok(screen.getByLabelText(/Phrase secrète de chiffrement/i)));
      fireEvent.change(screen.getByLabelText(/Phrase secrète de chiffrement/i), {
        target: { value: 'SecretKey2026!' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Chiffrer et sauvegarder/i }));
      await waitFor(() =>
        assert.ok(screen.getByText(/Sauvegarde chiffrée AES-256-GCM créée/i))
      );
      backupsRender.unmount();

      apiClient.getSettings = async () => ({
        settings: {
          company_name: 'DEPOTPRO Test',
          company_legal_name: null,
          address: null,
          phone: null,
          email: null,
          city: null,
          country: null,
          currency: 'FCFA',
          allow_negative_stock: 0,
          invoice_prefix: 'FAC',
          sale_prefix: 'VTE',
          purchase_prefix: 'ACH',
          order_prefix: 'CMD',
          receipt_prefix: 'REC',
          credit_note_prefix: 'AVO',
          theme: 'light',
          setup_completed: 1,
        },
        paymentMethods: [],
      });
      apiClient.listUsers = async () => [
        {
          id: 1,
          username: 'owner',
          displayName: 'Propriétaire',
          role: 'owner',
          roleLabel: 'Propriétaire',
          active: true,
          failedAttempts: 0,
          lockedUntil: null,
          createdAt: '2026-11-17T10:00:00Z',
        },
      ];
      const createdUsers = [];
      apiClient.createUser = async (payload) => {
        createdUsers.push(payload);
        return {
          id: 2,
          username: payload.username,
          displayName: payload.displayName,
          role: payload.role,
          roleLabel: 'Caissier',
          active: true,
          failedAttempts: 0,
          lockedUntil: null,
          createdAt: '2026-11-17T10:05:00Z',
        };
      };

      const qc2 = new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
          mutations: { gcTime: Number.POSITIVE_INFINITY },
        },
      });
      const settingsRender = render(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/settings'] },
          React.createElement(QueryClientProvider, { client: qc2 }, React.createElement(SettingsPage))
        )
      );
      await waitFor(() => assert.ok(screen.getByText(/Opérateurs & Rôles \(RBAC\)/i)));
      fireEvent.change(screen.getByPlaceholderText(/Identifiant/i), { target: { value: 'caisse_ui' } });
      fireEvent.change(screen.getByPlaceholderText(/Nom affiché/i), { target: { value: 'Caisse UI' } });
      fireEvent.change(screen.getByPlaceholderText(/PIN 6 chiffres/i), { target: { value: '445566' } });
      fireEvent.click(screen.getByRole('button', { name: /Ajouter un compte opérateur/i }));
      await waitFor(() => {
        assert.equal(createdUsers.length, 1);
        assert.equal(createdUsers[0].username, 'caisse_ui');
      });
      settingsRender.unmount();
      qc.clear();
      qc2.clear();
    } finally {
      useUiStore.getState().setToken(null);
      apiClient.getAuthStatus = origStatus;
      apiClient.login = origLogin;
      apiClient.listBackups = origListBackups;
      apiClient.createEncryptedBackup = origCreateEnc;
      apiClient.getSettings = origGetSettings;
      apiClient.listUsers = origListUsers;
      apiClient.createUser = origCreateUser;
    }
  });
});
