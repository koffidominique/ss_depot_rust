import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import { Link } from 'react-router-dom';
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  CheckCircle2,
  Printer,
  AlertTriangle,
  Package,
  PauseCircle,
  PlayCircle,
  UserPlus,
  X,
} from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { useUiStore } from '../stores/uiStore.ts';
import { MoneyInput } from '../components/common/MoneyInput.tsx';
import { QuantityInput } from '../components/common/QuantityInput.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import {
  DocumentPrintModal,
  type PrintableDocumentData,
} from '../components/documents/DocumentPrintModal.tsx';
import { formatDateTime, formatFcfa, formatQty, newRequestKey } from '../utils/format.ts';
import type { PriceTier, Product, ProductPackaging, SaleDetail } from '../types/erp.ts';

export function SalesPage() {
  const qc = useQueryClient();
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
  const [quickClientName, setQuickClientName] = useState('');
  const [quickClientType, setQuickClientType] = useState<'particulier' | 'professionnel'>('particulier');
  const [quickClientPhone, setQuickClientPhone] = useState('');
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

  const { data: productsRes } = useQuery({
    queryKey: ['products-pos', search],
    queryFn: () => apiClient.listProducts({ search, page: 1, pageSize: 50 }),
    placeholderData: (prev) => prev,
  });
  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: () => apiClient.listClients(),
  });
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
  });
  const { data: cashStatus } = useQuery({
    queryKey: ['cash'],
    queryFn: () => apiClient.getCashStatus(),
  });

  const activeMethods = useMemo(
    () => (settingsData?.paymentMethods || []).filter((m) => m.active === 1),
    [settingsData]
  );

  const getTierPrice = (pkg: ProductPackaging, tier: PriceTier): number => {
    if (tier === 'wholesale') return pkg.wholesale_price ?? pkg.retail_price ?? 0;
    if (tier === 'semi_wholesale') return pkg.semi_wholesale_price ?? pkg.retail_price ?? 0;
    return pkg.retail_price ?? 0;
  };

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

  const totals = useMemo(() => {
    let subtotalMerch = 0;
    let totalDeposit = 0;
    for (const item of posCart) {
      const q = Number(item.quantity || '0');
      if (!Number.isFinite(q) || q <= 0) continue;
      const lineGross = Math.round(q * item.unitPrice);
      subtotalMerch += Math.max(0, lineGross - item.discountAmount);
      if (item.depositMode === 'deposit') {
        totalDeposit += Math.round(q) * item.depositPerPack;
      }
    }
    const netMerch = Math.max(0, subtotalMerch - globalDiscount);
    const grandTotal = netMerch + totalDeposit;
    return { subtotalMerch, netMerch, totalDeposit, grandTotal };
  }, [posCart, globalDiscount]);

  const paidTotal = useMemo(
    () => paymentRows.reduce((s, p) => s + (Number.isFinite(p.amount) ? p.amount : 0), 0),
    [paymentRows]
  );

  const createSaleMutation = useMutation({
    mutationFn: () => {
      const filteredPayments = paymentRows.filter((p) => p.amount > 0);
      return apiClient.createSale({
        request_key: requestKey,
        client_id: posClientId,
        sale_type: posSaleType,
        price_tier: posPriceTier,
        discount_amount: globalDiscount,
        due_date: posSaleType === 'credit' && dueDate ? dueDate : undefined,
        lines: posCart.map((c) => ({
          product_id: c.productId,
          packaging_id: c.packagingId,
          quantity: c.quantity,
          discount_amount: c.discountAmount,
        })),
        payments: filteredPayments,
      });
    },
    onSuccess: (sale) => {
      setValidatedSale(sale);
      clearCart();
      setGlobalDiscount(0);
      setDueDate('');
      setPaymentRows([{ method_code: 'cash', amount: 0 }]);
      setRequestKey(newRequestKey('sale'));
      setErrorMsg(null);
      qc.invalidateQueries({ queryKey: ['products-pos'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['receivables'] });
    },
    onError: (err) => setErrorMsg(err instanceof Error ? err.message : 'Erreur lors de la validation.'),
  });

  const quickClientMutation = useMutation({
    mutationFn: () =>
      apiClient.createClient({
        name: quickClientName.trim(),
        client_type: quickClientType,
        phone: quickClientPhone.trim() || undefined,
        credit_policy: 'forbidden',
      }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      setPosClientId(created.id);
      setQuickClientName('');
      setQuickClientPhone('');
      setQuickClientError(null);
      setQuickClientOpen(false);
    },
    onError: (err) =>
      setQuickClientError(err instanceof Error ? err.message : 'Erreur création client.'),
  });

  const validateSaleRef = useRef<() => void>(() => {});

  useEffect(() => {
    validateSaleRef.current = () => {
      if (posCart.length > 0 && !createSaleMutation.isPending) {
        createSaleMutation.mutate();
      }
    };
  }, [posCart.length, createSaleMutation]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === 'F9') {
        if (!quickClientOpen && !heldModalOpen && !printDoc) {
          e.preventDefault();
          validateSaleRef.current();
        }
      } else if (e.key === 'Escape') {
        if (quickClientOpen) setQuickClientOpen(false);
        else if (heldModalOpen) setHeldModalOpen(false);
        else if (validatedSale) setValidatedSale(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [quickClientOpen, heldModalOpen, printDoc, validatedSale]);

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
            <span>Aucune session de caisse ouverte. Ouvrez la caisse avant d'encaisser une vente.</span>
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
        {/* Colonne gauche : catalogue rapide */}
        <div className="space-y-4 lg:col-span-7">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleScanEnter(search);
                  }
                }}
                placeholder="Scanner code-barres ou chercher (F2)..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] py-2.5 pl-9 pr-3 text-sm focus:border-[#2563EB] focus:outline-none"
              />
            </div>
            <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] p-1">
              {(
                [
                  ['retail', 'Détail'],
                  ['semi_wholesale', 'Demi-gros'],
                  ['wholesale', 'Gros'],
                ] as const
              ).map(([tier, label]) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => handlePriceTierChange(tier)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    posPriceTier === tier
                      ? 'bg-[#2563EB] text-white'
                      : 'text-[#667085] dark:text-slate-300 hover:text-[#182230]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(productsRes?.items || []).map((prod) => (
              <div
                key={prod.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {prod.image_path ? (
                        <img
                          src={prod.image_path}
                          alt={prod.name}
                          loading="lazy"
                          className="h-10 w-10 rounded-lg border border-slate-200 dark:border-slate-700 object-cover shrink-0 bg-slate-50"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-400 shrink-0">
                          <Package className="h-4 w-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="truncate font-display text-sm font-semibold text-[#182230] dark:text-slate-100">
                          {prod.name}
                        </h3>
                        <p className="text-xs text-[#667085] dark:text-slate-400 truncate">
                          {prod.reference} · {prod.category_name}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`font-mono-num text-xs font-semibold shrink-0 ${
                        prod.stock_milli <= 0
                          ? 'text-[#DC4545]'
                          : prod.stock_milli <= prod.min_stock_milli
                          ? 'text-[#D9901A]'
                          : 'text-[#16A36A] dark:text-emerald-400'
                      }`}
                    >
                      {formatQty(prod.stock_milli, prod.base_unit)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {prod.packagings
                    .filter((pk) => pk.is_active)
                    .map((pk) => (
                      <button
                        key={pk.id}
                        type="button"
                        onClick={() => handleAddPackaging(prod, pk)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-[#182230] dark:text-slate-200 hover:border-[#2563EB] hover:text-[#2563EB] transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                        <span className="capitalize">{pk.name}</span>
                        <span className="font-mono-num text-[#667085] dark:text-slate-400">
                          {formatFcfa(getTierPrice(pk, posPriceTier))}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Colonne droite : panier & règlement */}
        <div className="space-y-4 lg:col-span-5">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-display text-sm font-semibold">
                <ShoppingCart className="h-4 w-4 text-[#2563EB]" />
                <span>Panier de vente ({posCart.length})</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {heldCarts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setHeldModalOpen(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1 text-[11px] font-semibold text-[#D9901A]"
                  >
                    <PlayCircle className="h-3.5 w-3.5" />
                    En attente ({heldCarts.length})
                  </button>
                )}
                {posCart.length > 0 && (
                  <button
                    type="button"
                    onClick={handleHoldCart}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-medium text-[#667085] hover:border-[#2563EB] hover:text-[#2563EB]"
                  >
                    <PauseCircle className="h-3.5 w-3.5" />
                    Mettre en attente
                  </button>
                )}
                <FormTipsButton topicId="sales-pos" label="Aide saisie" />
                {posCart.length > 0 && (
                  <button
                    type="button"
                    onClick={clearCart}
                    className="text-xs font-medium text-[#DC4545] hover:underline"
                  >
                    Vider
                  </button>
                )}
              </div>
            </div>

            {/* Sélection client et mode vente */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-[#667085] dark:text-slate-400">
                    Client
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickClientError(null);
                      setQuickClientOpen(true);
                    }}
                    aria-label="Créer rapidement un client"
                    className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[#2563EB] hover:underline"
                  >
                    <UserPlus className="h-3 w-3" />
                    Nouveau client
                  </button>
                </div>
                <select
                  value={posClientId ?? ''}
                  onChange={(e) => setPosClientId(e.target.value ? Number(e.target.value) : null)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs"
                >
                  <option value="">Client Comptoir (Anonyme)</option>
                  {clients?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.credit_policy === 'forbidden' ? 'Comptant' : 'Crédit OK'})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#667085] dark:text-slate-400">
                  Type de vente
                </label>
                <div className="mt-1 grid grid-cols-2 gap-1 rounded-lg border border-slate-200 dark:border-slate-700 p-0.5">
                  <button
                    type="button"
                    onClick={() => setPosSaleType('cash')}
                    className={`rounded-md py-1.5 text-xs font-medium ${
                      posSaleType === 'cash'
                        ? 'bg-[#2563EB] text-white'
                        : 'text-[#667085] dark:text-slate-300'
                    }`}
                  >
                    Comptant
                  </button>
                  <button
                    type="button"
                    onClick={() => setPosSaleType('credit')}
                    className={`rounded-md py-1.5 text-xs font-medium ${
                      posSaleType === 'credit'
                        ? 'bg-[#D9901A] text-white'
                        : 'text-[#667085] dark:text-slate-300'
                    }`}
                  >
                    À crédit
                  </button>
                </div>
              </div>
            </div>

            {(() => {
              const selectedClient = clients?.find((c) => c.id === posClientId);
              if (!selectedClient) return null;
              const availCredit =
                selectedClient.credit_policy === 'limited' && selectedClient.credit_limit !== null
                  ? Math.max(0, selectedClient.credit_limit - selectedClient.unpaid_balance)
                  : null;
              return (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-3 py-2 text-[11px] flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-[#182230] dark:text-slate-200">
                    {selectedClient.credit_policy === 'forbidden'
                      ? 'Crédit interdit'
                      : selectedClient.credit_policy === 'unlimited'
                      ? 'Crédit autorisé (sans plafond)'
                      : `Plafond ${formatFcfa(selectedClient.credit_limit ?? 0)} · Dispo ${formatFcfa(availCredit ?? 0)}`}
                  </span>
                  <span className="font-mono-num text-[#667085] dark:text-slate-400">
                    Dû : {formatFcfa(selectedClient.unpaid_balance)} · Vides : {selectedClient.returnable_pieces_due} pcs
                  </span>
                </div>
              );
            })()}

            {posSaleType === 'credit' && (
              <div>
                <label className="block text-xs font-medium text-[#667085] dark:text-slate-400">
                  Date d'échéance (optionnelle, sinon calculée selon délai client)
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono-num text-xs"
                />
              </div>
            )}

            {/* Lignes du panier */}
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {posCart.length === 0 ? (
                <p className="py-8 text-center text-xs text-[#667085] dark:text-slate-400">
                  Sélectionnez un conditionnement à gauche pour démarrer la vente.
                </p>
              ) : (
                posCart.map((item) => (
                  <div key={item.key} className="py-2.5 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-[#182230] dark:text-slate-100">
                          {item.productName}
                        </div>
                        <div className="text-[11px] text-[#667085] dark:text-slate-400">
                          <span className="capitalize">{item.packagingName}</span> · {formatFcfa(item.unitPrice)}
                          {item.depositMode === 'deposit' && item.depositPerPack > 0
                            ? ` + consigne ${formatFcfa(item.depositPerPack)}`
                            : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.key)}
                        className="text-slate-400 hover:text-[#DC4545]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <QuantityInput
                        value={item.quantity}
                        onChange={(q) => updateCartItem(item.key, { quantity: q })}
                        allowFraction={item.allowFraction}
                        unit={item.packagingName}
                        className="w-36"
                      />
                      <div className="font-mono-num text-xs font-semibold">
                        {formatFcfa(
                          Math.round(Number(item.quantity || '0') * item.unitPrice) - item.discountAmount
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Résumé financier */}
            <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-3 text-xs">
              <div className="flex justify-between">
                <span className="text-[#667085] dark:text-slate-400">Marchandises</span>
                <span className="font-mono-num font-medium">{formatFcfa(totals.subtotalMerch)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[#667085] dark:text-slate-400">Remise globale</span>
                <MoneyInput value={globalDiscount} onChange={setGlobalDiscount} className="w-40" />
              </div>
              <div className="flex justify-between">
                <span className="text-[#667085] dark:text-slate-400">Consignes emballages</span>
                <span className="font-mono-num font-medium text-[#D9901A] dark:text-amber-400">
                  {formatFcfa(totals.totalDeposit)}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-2 text-sm font-bold">
                <span>Total à payer</span>
                <span className="font-mono-num text-[#2563EB] dark:text-[#60A5FA]">
                  {formatFcfa(totals.grandTotal)}
                </span>
              </div>
            </div>

            {/* Paiements (simple ou mixte) */}
            <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Encaissement (simple ou mixte)</span>
                <div className="flex items-center gap-2">
                  {posSaleType === 'cash' && totals.grandTotal > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setPaymentRows([{ method_code: paymentRows[0]?.method_code || 'cash', amount: totals.grandTotal }])
                      }
                      className="text-[11px] font-medium text-[#2563EB] hover:underline"
                    >
                      Solder {formatFcfa(totals.grandTotal)}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPaymentRows((r) => [...r, { method_code: 'wave', amount: 0 }])}
                    className="text-[11px] font-medium text-[#2563EB] hover:underline"
                  >
                    + Ajouter moyen
                  </button>
                </div>
              </div>

              {paymentRows.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={row.method_code}
                    onChange={(e) =>
                      setPaymentRows((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, method_code: e.target.value } : p))
                      )
                    }
                    className="w-40 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs"
                  >
                    {activeMethods.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <MoneyInput
                    value={row.amount}
                    onChange={(amt) =>
                      setPaymentRows((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, amount: amt } : p))
                      )
                    }
                    className="flex-1"
                  />
                  {paymentRows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPaymentRows((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-[#DC4545]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}

              <div className="flex justify-between text-xs pt-1">
                <span className="text-[#667085] dark:text-slate-400">
                  {posSaleType === 'credit' ? 'Reste en créance client' : 'Total saisi'}
                </span>
                <span className="font-mono-num font-semibold">
                  {posSaleType === 'credit'
                    ? formatFcfa(Math.max(0, totals.grandTotal - paidTotal))
                    : formatFcfa(paidTotal)}
                </span>
              </div>
            </div>

            {errorMsg && (
              <div className="rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs text-[#DC4545]">
                {errorMsg}
              </div>
            )}

            <button
              type="button"
              disabled={posCart.length === 0 || createSaleMutation.isPending}
              onClick={() => createSaleMutation.mutate()}
              className="w-full rounded-xl bg-[#16A36A] py-3 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-40"
            >
              {createSaleMutation.isPending ? 'Validation en cours...' : 'Valider la vente (F9)'}
            </button>
          </div>
        </div>
      </div>

      {/* Reçu de vente validée */}
      {validatedSale && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-white dark:bg-[#111A2E] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-[#16A36A]" />
              <div>
                <h3 className="font-display text-base font-semibold">
                  Vente validée · {validatedSale.reference}
                </h3>
                <p className="text-xs text-[#667085] dark:text-slate-400">
                  Client : {validatedSale.client_name} · Total : {formatFcfa(validatedSale.total_amount)} ·
                  Encaissé : {formatFcfa(validatedSale.paid_amount)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 no-print">
              <button
                type="button"
                onClick={() => {
                  const s = validatedSale;
                  setPrintDoc({
                    docType: s.sale_type === 'credit' ? 'FACTURE' : 'REÇU DE VENTE',
                    reference: s.reference,
                    date: s.created_at,
                    statusLabel:
                      s.status === 'validated'
                        ? 'Validée'
                        : s.status === 'cancelled'
                          ? 'Annulée'
                          : s.status === 'partially_returned'
                            ? 'Retour partiel'
                            : 'Retournée',
                    partyTitle: 'Client',
                    partyName: s.client_name || 'Client Comptoir',
                    partyDetails: [s.client_code, s.client_phone].filter(Boolean).join(' · ') || undefined,
                    lines: [
                      ...s.lines.map((l) => ({
                        label: l.product_name,
                        sublabel: `${l.packaging_name} (×${l.coefficient_milli / 1000} ${l.base_unit})`,
                        quantity: formatQty(l.quantity_milli),
                        unitPrice: l.unit_price,
                        total: l.line_total,
                      })),
                      ...s.deposits.map((d) => ({
                        label: `Consigne : ${d.packaging_name}`,
                        sublabel: `Code ${d.packaging_code}`,
                        quantity: `${d.pieces} pcs`,
                        unitPrice: d.unit_value,
                        total: d.amount,
                      })),
                    ],
                    summaryRows: [
                      { label: 'Total marchandises', value: formatFcfa(s.total_merchandise) },
                      { label: 'Remise', value: formatFcfa(s.discount_amount) },
                      { label: 'Consignes emballages', value: formatFcfa(s.total_deposit) },
                      { label: 'Total TTC', value: formatFcfa(s.total_amount), bold: true },
                      { label: 'Encaissé', value: formatFcfa(s.paid_amount), tone: 'success' },
                      {
                        label: 'Reste à payer',
                        value: formatFcfa(s.remaining_amount),
                        tone: s.remaining_amount > 0 ? 'warning' : 'default',
                      },
                    ],
                    payments: s.payments.map((p) => ({
                      label: `${p.method_label} (${p.reference})`,
                      amount: p.part_amount,
                    })),
                    notes: s.due_date ? `Échéance crédit : ${s.due_date}` : s.notes,
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Printer className="h-3.5 w-3.5" />
                Imprimer / PDF
              </button>
              <button
                type="button"
                onClick={() => setValidatedSale(null)}
                className="rounded-lg bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Paniers en attente */}
      <Dialog.Root open={heldModalOpen} onOpenChange={setHeldModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <Dialog.Title className="font-display text-base font-semibold">
                Ventes mises en attente ({heldCarts.length})
              </Dialog.Title>
              <Dialog.Close className="rounded-lg p-1 text-slate-400">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <div className="mt-4 max-h-80 space-y-2.5 overflow-y-auto text-xs">
              {heldCarts.length === 0 ? (
                <p className="py-6 text-center text-[#667085]">Aucun panier en attente.</p>
              ) : (
                heldCarts.map((ticket) => {
                  const approxTotal = ticket.items.reduce(
                    (s, it) =>
                      s + Math.max(0, Math.round(Number(it.quantity || '0') * it.unitPrice) - it.discountAmount),
                    0
                  );
                  return (
                    <div
                      key={ticket.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-[#182230] dark:text-slate-100 truncate">
                          {ticket.label}
                        </div>
                        <div className="text-[11px] text-[#667085] font-mono-num">
                          {ticket.items.length} ligne(s) · {formatFcfa(approxTotal)} ·{' '}
                          {formatDateTime(ticket.createdAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const resumed = resumeHeldCart(ticket.id);
                            if (resumed) setGlobalDiscount(resumed.discountAmount);
                            setHeldModalOpen(false);
                          }}
                          className="rounded-lg bg-[#2563EB] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700"
                        >
                          Reprendre
                        </button>
                        <button
                          type="button"
                          aria-label={`Supprimer ticket ${ticket.label}`}
                          onClick={() => deleteHeldCart(ticket.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:text-[#DC4545]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Modal Création client rapide depuis le POS */}
      <Dialog.Root open={quickClientOpen} onOpenChange={setQuickClientOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <Dialog.Title className="font-display text-base font-semibold">
                Nouveau client rapide
              </Dialog.Title>
              <Dialog.Close className="rounded-lg p-1 text-slate-400">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            {quickClientError && (
              <div className="mt-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs text-[#DC4545]">
                {quickClientError}
              </div>
            )}
            <div className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium">Nom complet / Enseigne *</label>
                <input
                  type="text"
                  value={quickClientName}
                  onChange={(e) => setQuickClientName(e.target.value)}
                  placeholder="Ex : Maquis Horizon"
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-medium">Type</label>
                <select
                  value={quickClientType}
                  onChange={(e) =>
                    setQuickClientType(e.target.value === 'professionnel' ? 'professionnel' : 'particulier')
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
                >
                  <option value="particulier">Particulier</option>
                  <option value="professionnel">Professionnel</option>
                </select>
              </div>
              <div>
                <label className="block font-medium">Téléphone</label>
                <input
                  type="text"
                  value={quickClientPhone}
                  onChange={(e) => setQuickClientPhone(e.target.value)}
                  placeholder="+225 07..."
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium"
                >
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={!quickClientName.trim() || quickClientMutation.isPending}
                onClick={() => quickClientMutation.mutate()}
                className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
              >
                Créer & sélectionner
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <DocumentPrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />
    </div>
  );
}
