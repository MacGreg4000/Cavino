import { create } from 'zustand';

export interface Wine {
  id: string;
  name: string;
  domain?: string;
  appellation?: string;
  vintage?: number;
  nonVintage?: boolean;
  type?: string;
  grapes?: string[];
  country?: string;
  region?: string;
  subRegion?: string;
  classification?: string;
  mentions?: string[];
  alcohol?: string;
  bottleSize?: string;
  servingTempMin?: number;
  servingTempMax?: number;
  decanting?: boolean;
  decantingTime?: number;
  glassType?: string;
  drinkFrom?: number;
  drinkUntil?: number;
  peakFrom?: number;
  peakUntil?: number;
  currentPhase?: string;
  agingNotes?: string;
  description?: string;
  vintageNotes?: string;
  aromaPrimary?: string[];
  aromaSecondary?: string[];
  aromaTertiary?: string[];
  palate?: string;
  style?: string;
  pairingsIdeal?: string[];
  pairingsGood?: string[];
  pairingsAvoid?: string[];
  occasions?: string[];
  cheesePairings?: string[];
  quantity?: number;
  locationId?: string;
  slotIds?: string[];
  purchasePrice?: string;
  estimatedValue?: string;
  photoUrl?: string;
  awards?: Array<{ year: number; name: string; medal?: string }>;
  personalRating?: number;
  tastingNotes?: string;
  isFavorite?: boolean;
  importStatus?: 'pending' | 'available' | 'consumed';
  sourceFile?: string;
  scanDate?: string;
  scanConfidence?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface WineState {
  wines: Wine[];
  pending: Wine[];
  pendingCount: number;
  loading: boolean;
  error: string | null;

  fetchWines: () => Promise<void>;
  fetchPending: () => Promise<void>;
  validateWine: (id: string, data: { quantity: number; slotIds?: string[]; locationId?: string; purchasePrice?: number }) => Promise<void>;
  drinkWine: (id: string) => Promise<void>;
  deleteWine: (id: string) => Promise<void>;
  addPendingFromWs: (wine: Wine) => void;
}

const API = '/api';

// Lazy import offline DB to avoid blocking initial load
const getOfflineDb = () => import('../lib/db').then((m) => m);

export const useWineStore = create<WineState>((set, get) => ({
  wines: [],
  pending: [],
  pendingCount: 0,
  loading: false,
  error: null,

  fetchWines: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`${API}/wines`);
      const wines = await res.json();
      set({ wines, loading: false });
      // Cache for offline
      getOfflineDb().then(({ cacheWines }) => cacheWines(wines)).catch(() => {});
    } catch {
      // Fallback to offline cache
      try {
        const { getCachedWines } = await getOfflineDb();
        const wines = await getCachedWines();
        set({ wines, loading: false, error: wines.length > 0 ? null : 'Hors ligne' });
      } catch {
        set({ error: 'Erreur de chargement', loading: false });
      }
    }
  },

  fetchPending: async () => {
    try {
      const res = await fetch(`${API}/wines/pending`);
      const pending = await res.json();
      set({ pending, pendingCount: pending.length });
    } catch {}
  },

  validateWine: async (id, data) => {
    const res = await fetch(`${API}/wines/${id}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Validation failed');
    const updated = await res.json();

    set((s) => ({
      wines: [updated, ...s.wines],
      pending: s.pending.filter((w) => w.id !== id),
      pendingCount: s.pendingCount - 1,
    }));
  },

  drinkWine: async (id) => {
    const res = await fetch(`${API}/wines/${id}/drink`, { method: 'POST' });
    if (!res.ok) throw new Error('Drink failed');
    const updated = await res.json();

    set((s) => ({
      wines: s.wines.map((w) => (w.id === id ? updated : w)).filter((w) => w.importStatus !== 'consumed'),
    }));
  },

  deleteWine: async (id) => {
    const res = await fetch(`${API}/wines/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');

    set((s) => ({
      wines: s.wines.filter((w) => w.id !== id),
      pending: s.pending.filter((w) => w.id !== id),
      pendingCount: Math.max(0, s.pendingCount - (s.pending.some((w) => w.id === id) ? 1 : 0)),
    }));
  },

  addPendingFromWs: (wine) => {
    set((s) => ({
      pending: [wine, ...s.pending],
      pendingCount: s.pendingCount + 1,
    }));
  },
}));
