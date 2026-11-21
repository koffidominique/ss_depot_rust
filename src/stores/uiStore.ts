import { create } from 'zustand';
import type { DepositComponent, PriceTier, SessionUser } from '../types/erp.ts';
import { parseQtyInputToMilliBigInt } from '../features/sales/utils/saleCalculations.ts';

function formatDotMilli(milli: bigint): string {
  const intPart = milli / 1000n;
  const fracPart = milli % 1000n;
  if (fracPart === 0n) return intPart.toString();
  return `${intPart.toString()}.${fracPart.toString().padStart(3, '0').replace(/0+$/, '')}`;
}

export interface CartItem {
  key: string;
  productId: number;
  productName: string;
  reference: string;
  baseUnit: string;
  stockMilli: number;
  packagingId: number;
  packagingName: string;
  salesUnitId?: number | null;
  salesUnitLabel?: string | null;
  coefficientMilli: number;
  allowFraction: boolean;
  quantity: string;
  supportQuantity: string;  // Number of supports (plastic crates) - tracked separately from bottles
  unitPrice: number;
  discountAmount: number;
  depositPerPack: number;
  depositMode: 'none' | 'deposit' | null;
  depositComponents?: DepositComponent[];
}

export interface HeldCart {
  id: string;
  label: string;
  createdAt: string;
  items: CartItem[];
  clientId: number | null;
  priceTier: PriceTier;
  saleType: 'cash' | 'credit';
  discountAmount: number;
}

interface UiState {
  token: string | null;
  currentUser: SessionUser | null;
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  posCart: CartItem[];
  posClientId: number | null;
  posPriceTier: PriceTier;
  posSaleType: 'cash' | 'credit';
  heldCarts: HeldCart[];
  tipsOpen: boolean;
  tipsTopicId: string | null;
  setToken: (token: string | null) => void;
  setCurrentUser: (user: SessionUser | null) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  openTips: (topicId?: string | null) => void;
  closeTips: () => void;
  setTipsTopicId: (topicId: string | null) => void;
  addToCart: (item: CartItem) => void;
  updateCartItem: (key: string, patch: Partial<CartItem>) => void;
  removeFromCart: (key: string) => void;
  clearCart: () => void;
  holdCurrentCart: (label: string, discountAmount: number) => void;
  resumeHeldCart: (id: string) => HeldCart | null;
  deleteHeldCart: (id: string) => void;
  setPosClientId: (id: number | null) => void;
  setPosPriceTier: (tier: PriceTier) => void;
  setPosSaleType: (t: 'cash' | 'credit') => void;
}

function getInitialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem('depotpro_theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // ignore storage errors
  }
  return 'light';
}

function getInitialToken(): string | null {
  try {
    return sessionStorage.getItem('depotpro_session_token');
  } catch {
    return null;
  }
}

function applyThemeClass(theme: 'light' | 'dark') {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }
}

function getInitialHeldCarts(): HeldCart[] {
  try {
    const raw = localStorage.getItem('depotpro_held_carts');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistHeldCarts(carts: HeldCart[]) {
  try {
    localStorage.setItem('depotpro_held_carts', JSON.stringify(carts));
  } catch {
    // ignore
  }
}

const initTheme = getInitialTheme();
applyThemeClass(initTheme);

export const useUiStore = create<UiState>((set, get) => ({
  token: getInitialToken(),
  currentUser: null,
  theme: initTheme,
  sidebarCollapsed: false,
  posCart: [],
  posClientId: null,
  posPriceTier: 'retail',
  posSaleType: 'cash',
  heldCarts: getInitialHeldCarts(),
  tipsOpen: false,
  tipsTopicId: null,

  setToken: (token) => {
    try {
      if (token) sessionStorage.setItem('depotpro_session_token', token);
      else sessionStorage.removeItem('depotpro_session_token');
    } catch {
      // ignore
    }
    set((state) => ({ token, currentUser: token ? state.currentUser : null }));
  },

  setCurrentUser: (currentUser) => set({ currentUser }),

  setTheme: (theme) => {
    try {
      localStorage.setItem('depotpro_theme', theme);
    } catch {
      // ignore
    }
    applyThemeClass(theme);
    set({ theme });
  },

  toggleTheme: () =>
    set((state) => {
      const next = state.theme === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem('depotpro_theme', next);
      } catch {
        // ignore
      }
      applyThemeClass(next);
      return { theme: next };
    }),

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  openTips: (topicId) =>
    set((state) => ({
      tipsOpen: true,
      tipsTopicId: topicId ?? state.tipsTopicId ?? 'dashboard',
    })),
  closeTips: () => set({ tipsOpen: false }),
  setTipsTopicId: (tipsTopicId) => set({ tipsTopicId }),

  addToCart: (item) =>
    set((state) => {
      const existing = state.posCart.find((c) => c.key === item.key);
      if (existing) {
        const curMilli = parseQtyInputToMilliBigInt(existing.quantity || '0');
        const addMilli = parseQtyInputToMilliBigInt(item.quantity || '1');
        if (curMilli.ok && addMilli.ok) {
          const nextMilli = curMilli.milli + addMilli.milli;
          if (nextMilli <= BigInt(Number.MAX_SAFE_INTEGER)) {
            return {
              posCart: state.posCart.map((c) =>
                c.key === item.key ? { ...c, quantity: formatDotMilli(nextMilli) } : c
              ),
            };
          }
        }
        return state;
      }
      return { posCart: [...state.posCart, item] };
    }),

  updateCartItem: (key, patch) =>
    set((state) => ({
      posCart: state.posCart.map((c) => (c.key === key ? { ...c, ...patch } : c)),
    })),

  removeFromCart: (key) =>
    set((state) => ({ posCart: state.posCart.filter((c) => c.key !== key) })),

  clearCart: () => set({ posCart: [], posSaleType: 'cash' }),

  holdCurrentCart: (label, discountAmount) =>
    set((state) => {
      if (state.posCart.length === 0) return state;
      const ticket: HeldCart = {
        id: `hold-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: label.trim() || `Ticket ${state.heldCarts.length + 1}`,
        createdAt: new Date().toISOString(),
        items: state.posCart,
        clientId: state.posClientId,
        priceTier: state.posPriceTier,
        saleType: state.posSaleType,
        discountAmount: Math.max(0, discountAmount),
      };
      const nextHeld = [ticket, ...state.heldCarts];
      persistHeldCarts(nextHeld);
      return {
        heldCarts: nextHeld,
        posCart: [],
        posClientId: null,
        posSaleType: 'cash',
      };
    }),

  resumeHeldCart: (id) => {
    const target = get().heldCarts.find((h) => h.id === id) || null;
    if (!target) return null;
    const remaining = get().heldCarts.filter((h) => h.id !== id);
    persistHeldCarts(remaining);
    set({
      heldCarts: remaining,
      posCart: target.items,
      posClientId: target.clientId,
      posPriceTier: 'retail',
      posSaleType: target.saleType,
    });
    return target;
  },

  deleteHeldCart: (id) =>
    set((state) => {
      const remaining = state.heldCarts.filter((h) => h.id !== id);
      persistHeldCarts(remaining);
      return { heldCarts: remaining };
    }),

  setPosClientId: (posClientId) => set({ posClientId }),
  setPosPriceTier: () => set({ posPriceTier: 'retail' }),
  setPosSaleType: (posSaleType) => set({ posSaleType }),
}));
