import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { useUiStore } from '../stores/uiStore.ts';
import {
  DocumentPrintModal,
  type PrintableDocumentData,
} from '../components/documents/DocumentPrintModal.tsx';
import { newRequestKey } from '../utils/format.ts';
import { calculateSaleCart } from '../features/sales/utils/saleCalculations.ts';
import {
  getTierPrice,
  usePosMutations,
  usePosQueries,
} from '../features/sales/hooks/usePosData.ts';
import { usePosShortcuts } from '../features/sales/hooks/usePosShortcuts.ts';
import { PosCatalogPanel } from '../features/sales/components/PosCatalogPanel.tsx';
import { PosCartPanel } from '../features/sales/components/PosCartPanel.tsx';
import { ValidatedSaleBanner } from '../features/sales/components/ValidatedSaleBanner.tsx';
import { HeldSalesModal } from '../features/sales/components/HeldSalesModal.tsx';
import { QuickClientModal } from '../features/sales/components/QuickClientModal.tsx';
import type { PriceTier, Product, ProductPackaging, SaleDetail } from '../types/erp.ts';

export function SalesPage() {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState('');
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [dueDate, setDueDate] = useState('');
  const [paymentRows, setPaymentRows] = useState<Array<{ method_code: string; amount: number }>>([
    { method_code: 'cash', amount: 0 },
  ]);
  const [requestKey, setRequestKey] = useState(() => newRequestKey('sale'));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [validatedSale, setValidatedSale] = useState<SaleDetail | null>(null);
  const [printDoc, setPrintDoc] = useState<PrintableDocumentData | null>(null);
  const [heldModalOpen, setHeldModalOpen] = useState(false);
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [quickClientError, setQuickClientError] = useState<string | null>(null);

  const {
    posCart,
    posClientId,
    posPriceTier,
    posSaleType,
    heldCarts,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    holdCurrentCart,
    resumeHeldCart,
    deleteHeldCart,
    setPosClientId,
    setPosPriceTier,
    setPosSaleType,
  } = useUiStore();

  const { productsRes, clients, cashStatus, activeMethods } = usePosQueries(search);

  const totals = useMemo(
    () => calculateSaleCart(posCart, globalDiscount, paymentRows),
    [posCart, globalDiscount, paymentRows]
  );

  const { createSaleMutation, quickClientMutation } = usePosMutations({
    requestKey,
    posClientId,
    posSaleType,
    posPriceTier,
    globalDiscount,
    dueDate,
    posCart,
    paymentRows,
    totals,
    onSaleSuccess: (sale) => {
      setValidatedSale(sale);
      clearCart();
      setGlobalDiscount(0);
      setDueDate('');
      setPaymentRows([{ method_code: 'cash', amount: 0 }]);
      setRequestKey(newRequestKey('sale'));
      setErrorMsg(null);
    },
    onSaleError: setErrorMsg,
    onQuickClientSuccess: (clientId) => {
      setPosClientId(clientId);
      setQuickClientError(null);
      setQuickClientOpen(false);
    },
    onQuickClientError: setQuickClientError,
  });

  const handleEscape = useCallback(() => {
    if (quickClientOpen) setQuickClientOpen(false);
    else if (heldModalOpen) setHeldModalOpen(false);
    else if (validatedSale) setValidatedSale(null);
  }, [quickClientOpen, heldModalOpen, validatedSale]);

  usePosShortcuts({
    searchInputRef,
    canValidate: posCart.length > 0 && totals.isValid && !createSaleMutation.isPending,
    onValidate: () => createSaleMutation.mutate(),
    hasModalOpen: quickClientOpen || heldModalOpen || Boolean(printDoc),
    onEscape: handleEscape,
  });

  const handleAddPackaging = (prod: Product, pkg: ProductPackaging) => {
    setErrorMsg(null);
    const depositPerPack =
      pkg.deposit_mode === 'deposit'
        ? pkg.components.reduce((acc, c) => acc + c.pieces_per_pack * c.deposit_value, 0)
        : 0;
    addToCart({
      key: `${prod.id}-${pkg.id}`,
      productId: prod.id,
      productName: prod.name,
      reference: prod.reference,
      baseUnit: prod.base_unit,
      stockMilli: prod.stock_milli,
      packagingId: pkg.id,
      packagingName: pkg.name,
      coefficientMilli: pkg.coefficient_milli,
      allowFraction: pkg.allow_fraction === 1,
      quantity: '1',
      unitPrice: getTierPrice(pkg, posPriceTier),
      discountAmount: 0,
      depositPerPack,
      depositMode: pkg.deposit_mode,
    });
  };

  const handleHoldCart = () => {
    if (posCart.length === 0) return;
    const selectedClient = clients?.find((c) => c.id === posClientId);
    const label = selectedClient ? selectedClient.name : `Ticket ${heldCarts.length + 1}`;
    holdCurrentCart(label, globalDiscount);
    setGlobalDiscount(0);
    setDueDate('');
    setPaymentRows([{ method_code: 'cash', amount: 0 }]);
    setErrorMsg(null);
  };

  const handlePriceTierChange = (nextTier: PriceTier) => {
    setPosPriceTier(nextTier);
    const products = productsRes?.items || [];
    for (const item of posCart) {
      const prod = products.find((p) => p.id === item.productId);
      const pkg = prod?.packagings.find((pk) => pk.id === item.packagingId);
      if (pkg) {
        updateCartItem(item.key, { unitPrice: getTierPrice(pkg, nextTier) });
      }
    }
  };

  const handleScanEnter = async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;
    const findAndAdd = (products: Product[]): boolean => {
      for (const prod of products) {
        const matchedPkg = prod.packagings.find(
          (pk) =>
            pk.is_active && pk.barcode && pk.barcode.trim().toLowerCase() === code.toLowerCase()
        );
        if (matchedPkg) {
          handleAddPackaging(prod, matchedPkg);
          setSearch('');
          return true;
        }
      }
      const matchedProd = products.find(
        (prod) =>
          (prod.barcode && prod.barcode.trim().toLowerCase() === code.toLowerCase()) ||
          prod.reference.toLowerCase() === code.toLowerCase()
      );
      const defaultPkg = matchedProd?.packagings.find((pk) => pk.is_active);
      if (matchedProd && defaultPkg) {
        handleAddPackaging(matchedProd, defaultPkg);
        setSearch('');
        return true;
      }
      return false;
    };

    if (findAndAdd(productsRes?.items || [])) return;
    try {
      const fresh = await apiClient.listProducts({ search: code, page: 1, pageSize: 20 });
      findAndAdd(fresh.items || []);
    } catch {
      // L'utilisateur verra le résultat filtré normal si l'appel échoue
    }
  };

  return (
    <div className="space-y-4">
      {!cashStatus?.activeSession && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/30 px-4 py-3 text-xs text-[#D9901A] dark:text-amber-400">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Aucune session de caisse ouverte. Ouvrez la caisse avant d&apos;encaisser une vente.
            </span>
          </div>
          <Link
            to="/cash"
            className="rounded-lg bg-[#D9901A] px-3 py-1.5 font-semibold text-white whitespace-nowrap shrink-0"
          >
            Ouvrir la caisse
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <PosCatalogPanel
          searchInputRef={searchInputRef}
          search={search}
          onSearchChange={setSearch}
          onScanEnter={handleScanEnter}
          posPriceTier={posPriceTier}
          onPriceTierChange={handlePriceTierChange}
          products={productsRes?.items || []}
          onAddPackaging={handleAddPackaging}
        />

        <PosCartPanel
          posCart={posCart}
          heldCarts={heldCarts}
          clients={clients}
          posClientId={posClientId}
          onClientChange={setPosClientId}
          posSaleType={posSaleType}
          onSaleTypeChange={setPosSaleType}
          dueDate={dueDate}
          onDueDateChange={setDueDate}
          globalDiscount={globalDiscount}
          onGlobalDiscountChange={setGlobalDiscount}
          totals={totals}
          paymentRows={paymentRows}
          onPaymentRowsChange={setPaymentRows}
          activeMethods={activeMethods}
          errorMsg={errorMsg}
          isSubmitting={createSaleMutation.isPending}
          onUpdateCartItem={updateCartItem}
          onRemoveFromCart={removeFromCart}
          onClearCart={clearCart}
          onHoldCart={handleHoldCart}
          onOpenHeldModal={() => setHeldModalOpen(true)}
          onOpenQuickClient={() => {
            setQuickClientError(null);
            setQuickClientOpen(true);
          }}
          onSubmitSale={() => createSaleMutation.mutate()}
        />
      </div>

      {validatedSale && (
        <ValidatedSaleBanner
          sale={validatedSale}
          onPrint={setPrintDoc}
          onClose={() => setValidatedSale(null)}
        />
      )}

      <HeldSalesModal
        open={heldModalOpen}
        onOpenChange={setHeldModalOpen}
        heldCarts={heldCarts}
        onResume={(ticketId) => {
          const resumed = resumeHeldCart(ticketId);
          if (resumed) setGlobalDiscount(resumed.discountAmount);
          setHeldModalOpen(false);
        }}
        onDelete={deleteHeldCart}
      />

      <QuickClientModal
        open={quickClientOpen}
        onOpenChange={setQuickClientOpen}
        error={quickClientError}
        isPending={quickClientMutation.isPending}
        onSubmit={(values) => quickClientMutation.mutate(values)}
      />

      <DocumentPrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />
    </div>
  );
}
