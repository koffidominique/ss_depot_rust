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
  buildCartItemFromPackaging,
  buildCartItemFromSalesUnit,
  matchBarcodeProduct,
} from '../features/sales/utils/posCartBuilders.ts';
import {
  getSalesUnitTierPrice,
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
import type {
  PriceTier,
  Product,
  ProductPackaging,
  ProductSalesUnit,
  SaleDetail,
} from '../types/erp.ts';

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
    posPriceTier,
    posSaleType,
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

  const handleAddPackaging = (prod: Product, pkg: ProductPackaging, tier = posPriceTier) => {
    const built = buildCartItemFromPackaging(prod, pkg, tier);
    if (!built.ok) {
      setErrorMsg(built.error);
      return;
    }
    setErrorMsg(null);
    addToCart(built.item);
  };

  const handleAddSalesUnit = (prod: Product, unit: ProductSalesUnit, tier = posPriceTier) => {
    const built = buildCartItemFromSalesUnit(prod, unit, tier);
    if (!built.ok) {
      setErrorMsg(built.error);
      return;
    }
    setErrorMsg(null);
    addToCart(built.item);
  };

  const handlePriceTierChange = (tier: PriceTier) => {
    setPosPriceTier(tier);
    for (const cartItem of posCart) {
      const prod = (productsRes?.items ?? []).find((p) => p.id === cartItem.productId);
      if (!prod) continue;
      if (cartItem.salesUnitId) {
        const su = prod.sales_units?.find((u) => u.id === cartItem.salesUnitId);
        if (su) updateCartItem(cartItem.key, { unitPrice: getSalesUnitTierPrice(su, tier) });
      } else {
        const pk = prod.packagings.find((p) => p.id === cartItem.packagingId);
        if (pk) updateCartItem(cartItem.key, { unitPrice: getTierPrice(pk, tier) });
      }
    }
  };

  const handleHoldCart = () => {
    if (posCart.length === 0) return;
    const selectedClient = clients?.find((c) => c.id === posClientId);
    holdCurrentCart(selectedClient ? selectedClient.name : `Ticket ${heldCarts.length + 1}`, globalDiscount);
    setGlobalDiscount(0);
    setDueDate('');
    setPaymentRows([{ method_code: 'cash', amount: 0 }]);
    setErrorMsg(null);
  };

  const handleScanEnter = async (rawCode: string) => {
    const applyMatch = (prods: Product[]) => {
      const m = matchBarcodeProduct(prods, rawCode);
      if (!m) return false;
      if (m.type === 'unit') handleAddSalesUnit(m.prod, m.unit);
      else handleAddPackaging(m.prod, m.pkg);
      setSearch('');
      return true;
    };
    if (applyMatch(productsRes?.items || [])) return;
    try {
      const fresh = await apiClient.listProducts({ search: rawCode.trim(), page: 1, pageSize: 20 });
      applyMatch(fresh.items || []);
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
            <span>Aucune session de caisse ouverte. Ouvrez la caisse avant d&apos;encaisser une vente.</span>
          </div>
          <Link to="/cash" className="rounded-lg bg-[#D9901A] px-3 py-1.5 font-semibold text-white whitespace-nowrap shrink-0">
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
          priceTier={posPriceTier}
          onPriceTierChange={handlePriceTierChange}
          products={productsRes?.items || []}
          onAddPackaging={(p, pk) => handleAddPackaging(p, pk)}
          onAddSalesUnit={(p, su) => handleAddSalesUnit(p, su)}
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

      {validatedSale && <ValidatedSaleBanner sale={validatedSale} onPrint={setPrintDoc} onClose={() => setValidatedSale(null)} />}
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
