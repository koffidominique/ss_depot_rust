import { create } from 'zustand';
import type { PriceTier } from '../types/erp.ts';

export interface CartItem {
  key: string;
  productId: number;
  productName: string;
  reference: string;
  baseUnit: string;
  stockMilli: number;
  packagingId: number;
  packagingName: string;
  coefficientMilli: number;
  allowFraction: boolean;
  quantity: string;
  unitPrice: number;
  discountAmount: number;
  depositPerPack: number;
  depositMode: 'none' | 'deposit' | null;
}

interface UiState {
  token: string | null;
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  posCart: CartItem[];
  posClientId: number | null;
  posPriceTier: PriceTier;
  posSaleType: 'cash' | 'credit';
  tipsOpen: boolean;
  tipsTopicId: string | null;
  setToken: (token: string | null) => void;
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

const initTheme = getInitialTheme();
applyThemeClass(initTheme);

export const useUiStore = create<UiState>((set) => ({
  token: getInitialToken(),
  theme: initTheme,
  sidebarCollapsed: false,
  posCart: [],
  posClientId: null,
  posPriceTier: 'retail',
  posSaleType: 'cash',
  tipsOpen: false,
  tipsTopicId: null,

  setToken: (token) => {
    try {
      if (token) sessionStorage.setItem('depotpro_session_token', token);
      else sessionStorage.removeItem('depotpro_session_token');
    } catch {
      // ignore
    }
    set({ token });
  },

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
        const nextQty = Number(existing.quantity || '0') + Number(item.quantity || '1');
        return {
          posCart: state.posCart.map((c) =>
            c.key === item.key ? { ...c, quantity: String(nextQty) } : c
          ),
        };
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

  setPosClientId: (posClientId) => set({ posClientId }),
  setPosPriceTier: (posPriceTier) => set({ posPriceTier }),
  setPosSaleType: (posSaleType) => set({ posSaleType }),
}));
