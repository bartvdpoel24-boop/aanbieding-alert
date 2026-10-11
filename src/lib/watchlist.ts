import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ALL_STORE_IDS } from "@/lib/money";

export type StoreQuote = {
  price: number;
  name: string;
  url: string | null;
  privateLabel: boolean;
  unitLabel: string | null;
  unitPrice: number | null;
};

export type WatchItem = {
  id: string;
  name: string;
  threshold: number;
  onSale: boolean;
  lastPrice: number | null;
  lastRetailer: string | null;
  lastChecked: string | null;
  lastProductUrl: string | null;
  lastName: string | null;
  lastImage: string | null;
  lastOriginal: number | null;
  lastSavings: number | null;
  lastUnitLabel: string | null;
  lastUnitPrice: number | null;
  lastUnitNoun: string | null;
  jumbo: StoreQuote | null;
  ah: StoreQuote | null;
  quotesAt: string | null;
};

export type CartLine = {
  id: string;
  name: string;
  price: number;
  qty: number;
  imageUrl: string | null;
  productUrl: string | null;
  unitLabel: string | null;
};

type LegacyItem = {
  id?: number | string;
  name?: string;
  threshold?: number;
  lastPrice?: number | null;
  lastRetailer?: string | null;
  lastChecked?: string | null;
  lastProductUrl?: string | null;
  lastName?: string | null;
};

type NewItem = {
  name: string;
  threshold: number;
  onSale?: boolean;
  lastPrice?: number | null;
  lastRetailer?: string | null;
  lastUnitLabel?: string | null;
  lastUnitNoun?: string | null;
};

type WatchState = {
  items: WatchItem[];
  cart: CartLine[];
  retailers: string[];
  lastGlobalCheck: string | null;
  hydrated: boolean;
  setHydrated: () => void;
  addItem: (item: NewItem) => void;
  removeItem: (id: string) => void;
  restoreItem: (item: WatchItem) => void;
  setThreshold: (id: string, threshold: number) => void;
  applyCheck: (
    id: string,
    patch: Pick<
      WatchItem,
      | "lastPrice"
      | "lastRetailer"
      | "lastChecked"
      | "lastProductUrl"
      | "lastName"
      | "lastImage"
      | "lastOriginal"
      | "lastSavings"
      | "lastUnitLabel"
      | "lastUnitPrice"
      | "lastUnitNoun"
      | "onSale"
    >,
  ) => void;
  applyQuotes: (id: string, patch: Pick<WatchItem, "jumbo" | "ah" | "quotesAt">) => void;
  setLastGlobalCheck: (iso: string) => void;
  clearAll: () => void;
  toggleRetailer: (id: string) => void;
  setRetailers: (ids: string[]) => void;
  addToCart: (line: Omit<CartLine, "qty"> & { qty?: number }) => void;
  setCartQty: (id: string, qty: number) => void;
  removeFromCart: (id: string) => void;
};

function blankItem(input: NewItem): WatchItem {
  const onSale = input.onSale !== false;
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: input.name,
    threshold: input.threshold,
    onSale,
    lastPrice: input.lastPrice ?? null,
    lastRetailer: input.lastRetailer ?? null,
    lastChecked: onSale ? null : new Date().toISOString(),
    lastProductUrl: null,
    lastName: null,
    lastImage: null,
    lastOriginal: null,
    lastSavings: null,
    lastUnitLabel: input.lastUnitLabel ?? null,
    lastUnitPrice: input.lastPrice ?? null,
    lastUnitNoun: input.lastUnitNoun ?? null,
    jumbo: null,
    ah: null,
    quotesAt: null,
  };
}

function readLegacy(): { items: WatchItem[]; lastGlobalCheck: string | null } | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem("aanbiedingItems");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LegacyItem[];
    if (!Array.isArray(parsed)) return null;
    const items = parsed
      .filter((row) => row && typeof row.name === "string" && typeof row.threshold === "number")
      .map((row) => ({
        id: String(row.id ?? `${row.name}-${row.threshold}`),
        name: row.name as string,
        threshold: row.threshold as number,
        onSale: true,
        lastPrice: row.lastPrice ?? null,
        lastRetailer: row.lastRetailer ?? null,
        lastChecked: row.lastChecked ?? null,
        lastProductUrl: row.lastProductUrl ?? null,
        lastName: row.lastName ?? null,
        lastImage: null,
        lastOriginal: null,
        lastSavings: null,
        lastUnitLabel: null,
        lastUnitPrice: row.lastPrice ?? null,
        lastUnitNoun: null,
        jumbo: null,
        ah: null,
        quotesAt: null,
      }));
    return {
      items,
      lastGlobalCheck: localStorage.getItem("lastGlobalCheck"),
    };
  } catch {
    return null;
  }
}

export const useWatchlist = create<WatchState>()(
  persist(
    (set) => ({
      items: [],
      cart: [],
      retailers: ALL_STORE_IDS,
      lastGlobalCheck: null,
      hydrated: false,
      setHydrated: () => set({ hydrated: true }),
      addItem: (input) => set((state) => ({ items: [blankItem(input), ...state.items] })),
      removeItem: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
      restoreItem: (item) =>
        set((state) => ({
          items: state.items.some((row) => row.id === item.id) ? state.items : [item, ...state.items],
        })),
      setThreshold: (id, threshold) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, threshold: Math.round(threshold * 100) / 100 } : item,
          ),
        })),
      applyCheck: (id, patch) =>
        set((state) => ({
          items: state.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        })),
      applyQuotes: (id, patch) =>
        set((state) => ({
          items: state.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        })),
      setLastGlobalCheck: (iso) => set({ lastGlobalCheck: iso }),
      clearAll: () => set({ items: [] }),
      toggleRetailer: (id) =>
        set((state) => {
          const has = state.retailers.includes(id);
          if (has && state.retailers.length === 1) return state;
          return {
            retailers: has ? state.retailers.filter((row) => row !== id) : [...state.retailers, id],
          };
        }),
      setRetailers: (ids) => set({ retailers: ids.length > 0 ? ids : ALL_STORE_IDS }),
      addToCart: (line) =>
        set((state) => {
          const existing = state.cart.find((row) => row.id === line.id);
          if (existing) {
            return {
              cart: state.cart.map((row) =>
                row.id === line.id ? { ...row, qty: row.qty + (line.qty ?? 1), price: line.price } : row,
              ),
            };
          }
          return {
            cart: [
              {
                id: line.id,
                name: line.name,
                price: line.price,
                qty: line.qty ?? 1,
                imageUrl: line.imageUrl,
                productUrl: line.productUrl,
                unitLabel: line.unitLabel,
              },
              ...state.cart,
            ],
          };
        }),
      setCartQty: (id, qty) =>
        set((state) => ({
          cart:
            qty < 1
              ? state.cart.filter((row) => row.id !== id)
              : state.cart.map((row) => (row.id === id ? { ...row, qty } : row)),
        })),
      removeFromCart: (id) => set((state) => ({ cart: state.cart.filter((row) => row.id !== id) })),
    }),
    {
      name: "aanbieding-alert-v1",
      skipHydration: true,
      partialize: (state) => ({
        items: state.items,
        cart: state.cart,
        retailers: state.retailers,
        lastGlobalCheck: state.lastGlobalCheck,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && state.items.length === 0) {
          const legacy = readLegacy();
          if (legacy && legacy.items.length) {
            state.items = legacy.items;
            state.lastGlobalCheck = legacy.lastGlobalCheck;
          }
        }
        if (state) {
          state.items = state.items.map((item) => {
            const row = item as WatchItem & { category?: string };
            return {
              ...row,
              threshold: typeof row.threshold === "number" ? row.threshold : 0,
              lastUnitPrice: row.lastUnitPrice ?? row.lastPrice ?? null,
              lastUnitNoun: row.lastUnitNoun ?? null,
              jumbo: row.jumbo ? { ...row.jumbo, unitPrice: row.jumbo.unitPrice ?? null } : null,
              ah: row.ah ? { ...row.ah, unitPrice: row.ah.unitPrice ?? null } : null,
              quotesAt: row.quotesAt ?? null,
            };
          });
          if (!state.retailers || state.retailers.length === 0) state.retailers = ALL_STORE_IDS;
          if (!state.cart) state.cart = [];
        }
        state?.setHydrated();
      },
    },
  ),
);
