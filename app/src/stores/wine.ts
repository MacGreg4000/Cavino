import { create } from 'zustand';
import { apiFetch } from '../lib/api';

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
  nfcTagId?: string;
  purchasePrice?: string;
  estimatedValue?: string;
  photoUrl?: string;
  awards?: Array<{ year: number; name: string; medal?: string }>;
  personalRating?: number;
  tastingNotes?: string;
  /** Commentaire personnel (cadeau, notes…) — privé, pas sur la page publique */
  personalComment?: string | null;
  isFavorite?: boolean;
  importStatus?: 'pending' | 'available' | 'consumed';
  sourceFile?: string;
  scanDate?: string;
  scanConfidence?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ScanResult =
  | { status: 'success'; wine: Wine }
  | { status: 'error'; message: string };

export interface ScanProgressEntry {
  ts: string;
  stage: string;
  message: string;
  level: 'info' | 'warning' | 'error';
}

export interface QueuedScan {
  scanId: string;
  startedAt: number;
  logs: ScanProgressEntry[];
  status: 'uploading' | 'analyzing' | 'done' | 'error';
  result?: ScanResult;
}

// Backward-compat alias (used in AppLayout banner)
export type ActiveScan = QueuedScan;

interface WineState {
  wines: Wine[];
  pending: Wine[];
  pendingCount: number;
  loading: boolean;
  error: string | null;

  // Scan queue — replaces single activeScan + lastScanResult
  scanQueue: QueuedScan[];

  fetchWines: () => Promise<void>;
  fetchPending: () => Promise<void>;
  createWine: (data: Partial<Wine>) => Promise<Wine>;
  validateWine: (id: string, data: { quantity: number; slotIds?: string[]; locationId?: string; purchasePrice?: number }) => Promise<void>;
  updateWine: (id: string, data: Partial<Pick<Wine, 'slotIds' | 'locationId' | 'quantity' | 'bottleSize' | 'personalComment' | 'tastingNotes' | 'personalRating' | 'isFavorite' | 'name'>>) => Promise<Wine>;
  drinkWine: (id: string) => Promise<void>;
  deleteWine: (id: string) => Promise<void>;

  // Scan queue actions
  addToQueue: (scanId: string) => void;
  addScanProgress: (scanId: string, entry: ScanProgressEntry) => void;
  addPendingFromWs: (wine: Wine) => void;
  markScanError: (scanId?: string) => void;
  removeFromQueue: (scanId: string) => void;
  clearFinishedScans: () => void;

  // Legacy compat (used by AppLayout banner + ScanWine)
  /** @deprecated use scanQueue */
  activeScan: QueuedScan | null;
  /** @deprecated use scanQueue */
  lastScanResult: ScanResult | null;
  /** @deprecated use addToQueue */
  setActiveScan: (scanId: string) => void;
  /** @deprecated use removeFromQueue */
  clearActiveScan: () => void;
  /** @deprecated use markScanError */
  setActiveScanError: () => void;
  /** @deprecated */
  setScanResult: (result: ScanResult | null) => void;
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
  scanQueue: [],

  // Legacy computed shims
  get activeScan() {
    const q = get().scanQueue;
    return q.find((s) => s.status === 'uploading' || s.status === 'analyzing') ?? q[q.length - 1] ?? null;
  },
  get lastScanResult() {
    const q = get().scanQueue;
    const done = q.filter((s) => s.status === 'done' || s.status === 'error');
    return done.length > 0 ? (done[done.length - 1].result ?? null) : null;
  },

  fetchWines: async () => {
    set({ loading: true, error: null });
    try {
      const res = await apiFetch(`${API}/wines`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const wines = Array.isArray(data) ? data : [];
      set({ wines, loading: false });
      getOfflineDb().then(({ cacheWines }) => cacheWines(wines)).catch(() => {});
    } catch {
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
      const res = await apiFetch(`${API}/wines/pending`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const pending = Array.isArray(data) ? data : [];
      set({ pending, pendingCount: pending.length });
    } catch {}
  },

  createWine: async (data) => {
    const res = await apiFetch(`${API}/wines`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Création échouée');
    }
    const created: Wine = await res.json();
    set((s) => ({ wines: [created, ...s.wines] }));
    return created;
  },

  validateWine: async (id, data) => {
    const res = await apiFetch(`${API}/wines/${id}/validate`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || 'Validation failed');
    }
    const updated = await res.json();
    set((s) => ({
      wines: [updated, ...s.wines],
      pending: s.pending.filter((w) => w.id !== id),
      pendingCount: s.pendingCount - 1,
    }));
  },

  updateWine: async (id, data) => {
    const res = await apiFetch(`${API}/wines/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Update failed');
    const updated: Wine = await res.json();
    set((s) => ({
      wines: s.wines.map((w) => (w.id === id ? updated : w)),
      pending: s.pending.map((w) => (w.id === id ? updated : w)),
    }));
    return updated;
  },

  drinkWine: async (id) => {
    const res = await apiFetch(`${API}/wines/${id}/drink`, { method: 'POST' });
    if (!res.ok) throw new Error('Drink failed');
    const updated = await res.json();
    set((s) => ({
      wines: s.wines.map((w) => (w.id === id ? updated : w)).filter((w) => w.importStatus !== 'consumed'),
    }));
  },

  deleteWine: async (id) => {
    const res = await apiFetch(`${API}/wines/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    set((s) => ({
      wines: s.wines.filter((w) => w.id !== id),
      pending: s.pending.filter((w) => w.id !== id),
      pendingCount: Math.max(0, s.pendingCount - (s.pending.some((w) => w.id === id) ? 1 : 0)),
    }));
  },

  // ── Scan queue ───────────────────────────────────────────────────────────────

  addToQueue: (scanId) => set((s) => ({
    scanQueue: [
      ...s.scanQueue,
      { scanId, startedAt: Date.now(), logs: [], status: 'analyzing' },
    ],
  })),

  addScanProgress: (scanId, entry) => set((s) => ({
    scanQueue: s.scanQueue.map((scan) =>
      scan.scanId === scanId
        ? { ...scan, status: 'analyzing' as const, logs: [...scan.logs, entry] }
        : scan
    ),
  })),

  // WINE_PENDING: match FIFO to the oldest still-analyzing scan
  addPendingFromWs: (wine) => {
    set((s) => {
      const idx = s.scanQueue.findIndex((sc) => sc.status === 'analyzing');
      const newQueue = s.scanQueue.map((sc, i) =>
        i === idx
          ? { ...sc, status: 'done' as const, result: { status: 'success' as const, wine } }
          : sc
      );
      return {
        pending: [wine, ...s.pending],
        pendingCount: s.pendingCount + 1,
        scanQueue: newQueue,
      };
    });
  },

  // IMPORT_ERROR: match FIFO to the oldest still-analyzing scan
  markScanError: (scanId) => set((s) => {
    const idx = scanId
      ? s.scanQueue.findIndex((sc) => sc.scanId === scanId)
      : s.scanQueue.findIndex((sc) => sc.status === 'analyzing');
    if (idx === -1) return s;
    const newQueue = s.scanQueue.map((sc, i) =>
      i === idx
        ? { ...sc, status: 'error' as const, result: { status: 'error' as const, message: 'Échec de l\'analyse' } }
        : sc
    );
    return { scanQueue: newQueue };
  }),

  removeFromQueue: (scanId) => set((s) => ({
    scanQueue: s.scanQueue.filter((sc) => sc.scanId !== scanId),
  })),

  clearFinishedScans: () => set((s) => ({
    scanQueue: s.scanQueue.filter((sc) => sc.status === 'uploading' || sc.status === 'analyzing'),
  })),

  // ── Legacy compat shims ──────────────────────────────────────────────────────
  setActiveScan: (scanId) => get().addToQueue(scanId),
  clearActiveScan: () => {
    const q = get().scanQueue;
    const last = q[q.length - 1];
    if (last) get().removeFromQueue(last.scanId);
  },
  setActiveScanError: () => get().markScanError(),
  setScanResult: () => {}, // no-op, results are now per-scan
}));
