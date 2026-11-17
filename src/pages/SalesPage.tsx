import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  CheckCircle2,
  Printer,
  AlertTriangle,
} from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { useUiStore } from '../stores/uiStore.ts';
import { MoneyInput } from '../components/common/MoneyInput.tsx';
import { QuantityInput } from '../components/common/QuantityInput.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import { formatFcfa, formatQty, newRequestKey } from '../utils/format.ts';
import type { PriceTier, Product, ProductPackaging, SaleDetail } from '../types/erp.ts';

export function SalesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [paymentRows, setPaymentRows] = useState<Array<{ method_code: string; amount: number }>>([
    { method_code: 'cash', amount: 0 },
  ]);
  const [requestKey, setRequestKey] = useState(() => newRequestKey('sale'));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [validatedSale, setValidatedSale] = useState<SaleDetail | null>(null);

  const {
    posCart,
    posClientId,
    posPriceTier,
    posSaleType,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    setPosClientId,
    setPosPriceTier,
    setPosSaleType,
  } = useUiStore();

  const { data: productsRes } = useQuery({
    queryKey: ['products-pos', search],
    queryFn: () => apiClient.listProducts({ search, page: 1, pageSize: 50 }),
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
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Scanner code-barres ou chercher une boisson..."
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
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-sm font-semibold text-[#182230] dark:text-slate-100">
                        {prod.name}
                      </h3>
                      <p className="text-xs text-[#667085] dark:text-slate-400">
                        {prod.reference} · {prod.category_name}
                      </p>
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
              <div className="flex items-center gap-2">
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
                <label className="block text-xs font-medium text-[#667085] dark:text-slate-400">
                  Client
                </label>
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
              {createSaleMutation.isPending ? 'Validation en cours...' : 'Valider la vente'}
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
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium"
              >
                <Printer className="h-3.5 w-3.5" />
                Imprimer reçu
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
    </div>
  );
}
