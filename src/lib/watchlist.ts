import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WatchItem = {
  id: string;
  name: string;
  threshold: number;
  lastPrice: number | null;
  lastRetailer: string | null;
  lastChecked: string | null;
  lastProductUrl: string | null;
  lastName: string | null;
  lastImage: string | null;
  lastOriginal: number | null;
  lastSavings: number | null;
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

type WatchState = {
  items: WatchItem[];
  lastGlobalCheck: string | null;
  hydrated: boolean;
  setHydrated: () => void;
  addItem: (item: Pick<WatchItem, "name" | "threshold">) => void;
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
    >,
  ) => void;
  setLastGlobalCheck: (iso: string) => void;
  clearAll: () => void;
};

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
        lastPrice: row.lastPrice ?? null,
        lastRetailer: row.lastRetailer ?? null,
        lastChecked: row.lastChecked ?? null,
        lastProductUrl: row.lastProductUrl ?? null,
        lastName: row.lastName ?? null,
        lastImage: null,
        lastOriginal: null,
        lastSavings: null,
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
      lastGlobalCheck: null,
      hydrated: false,
      setHydrated: () => set({ hydrated: true }),
      addItem: ({ name, threshold }) =>
        set((state) => ({
          items: [
            {
              id: `${Date.now()}`,
              name,
              threshold,
              lastPrice: null,
              lastRetailer: null,
              lastChecked: null,
              lastProductUrl: null,
              lastName: null,
              lastImage: null,
              lastOriginal: null,
              lastSavings: null,
            },
            ...state.items,
          ],
        })),
      removeItem: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
      restoreItem: (item) =>
        set((state) => ({
          items: state.items.some((row) => row.id === item.id) ? state.items : [item, ...state.items],
        })),
      setThreshold: (id, threshold) =>
        set((state) => ({
          items: state.items.map((item) => (item.id === id ? { ...item, threshold } : item)),
        })),
      applyCheck: (id, patch) =>
        set((state) => ({
          items: state.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        })),
      setLastGlobalCheck: (iso) => set({ lastGlobalCheck: iso }),
      clearAll: () => set({ items: [] }),
    }),
    {
      name: "aanbieding-alert-v1",
      skipHydration: true,
      partialize: (state) => ({ items: state.items, lastGlobalCheck: state.lastGlobalCheck }),
      onRehydrateStorage: () => (state) => {
        if (state && state.items.length === 0) {
          const legacy = readLegacy();
          if (legacy && legacy.items.length) {
            state.items = legacy.items;
            state.lastGlobalCheck = legacy.lastGlobalCheck;
          }
        }
        state?.setHydrated();
      },
    },
  ),
);
