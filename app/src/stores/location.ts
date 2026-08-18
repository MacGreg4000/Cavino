import { create } from 'zustand';
import { apiFetch } from '../lib/api';

export interface GridConfig {
  rows: number;
  cols: number;
  labelRows: string[];
  labelCols: string[];
  blockedSlots: string[];
}

export interface Location {
  id: string;
  name: string;
  type: 'cellar' | 'fridge' | 'rack' | 'other';
  color?: string;
  gridConfig?: GridConfig;
  createdAt?: string;
}

export interface GridSlot {
  slot: {
    id: string;
    locationId: string;
    rowIndex: number;
    colIndex: number;
    wineId: string | null;
    nfcTagId: string | null;
    isBlocked: boolean;
  };
  wine: {
    id: string;
    name: string;
    type: string;
    vintage: number | null;
    domain: string | null;
    currentPhase: string | null;
    photoUrl: string | null;
  } | null;
}

interface LocationState {
  locations: Location[];
  loading: boolean;

  fetchLocations: () => Promise<void>;
  fetchLocation: (id: string) => Promise<Location>;
  fetchGrid: (id: string) => Promise<{ location: Location; slots: GridSlot[] }>;
  createLocation: (data: { name: string; type: string; color?: string; gridConfig: GridConfig }) => Promise<Location>;
  updateLocation: (id: string, data: { name?: string; type?: Location['type']; color?: string; gridConfig?: GridConfig }) => Promise<Location>;
  deleteLocation: (id: string) => Promise<void>;
}

const API = '/api';

const getOfflineDb = () => import('../lib/db').then((m) => m);
const getSync      = () => import('../lib/sync').then((m) => m);

export const useLocationStore = create<LocationState>((set, get) => ({
  locations: [],
  loading: false,

  fetchLocations: async () => {
    set({ loading: true });
    try {
      const res = await apiFetch(`${API}/locations`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const locations = Array.isArray(data) ? data : [];
      set({ locations, loading: false });
      getOfflineDb().then(({ cacheLocations }) => cacheLocations(locations)).catch(() => {});
    } catch {
      // Fallback cache
      try {
        const { getCachedLocations } = await getOfflineDb();
        const locations = await getCachedLocations();
        set({ locations, loading: false });
      } catch {
        set({ loading: false });
      }
    }
  },

  fetchLocation: async (id) => {
    try {
      const res = await apiFetch(`${API}/locations/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch {
      const loc = get().locations.find((l) => l.id === id);
      if (loc) return loc;
      throw new Error('Location non disponible hors ligne');
    }
  },

  fetchGrid: async (id) => {
    try {
      const res = await apiFetch(`${API}/locations/${id}/grid`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      getOfflineDb().then(({ cacheGrid }) => cacheGrid(id, data)).catch(() => {});
      return data;
    } catch {
      const db = await getOfflineDb();
      const cached = await db.getCachedGrid(id);
      if (cached) return cached;
      throw new Error('Grille non disponible hors ligne');
    }
  },

  createLocation: async (data) => {
    try {
      const res = await apiFetch(`${API}/locations`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const location: Location = await res.json();
      set((s) => ({ locations: [...s.locations, location] }));
      getOfflineDb().then(({ cacheLocations }) => cacheLocations(get().locations)).catch(() => {});
      return location;
    } catch {
      // Offline : crée un emplacement local temporaire + met en queue la vraie
      // création. L'id temporaire est remplacé par le vrai id au prochain
      // fetchLocations() une fois la sync effectuée (queueOp ne renvoie pas
      // l'id serveur, donc pas de réconciliation fine possible avant sync).
      const tempLocation: Location = { ...data, id: `offline-${crypto.randomUUID()}` } as Location;
      set((s) => ({ locations: [...s.locations, tempLocation] }));
      getOfflineDb().then(({ cacheLocations }) => cacheLocations(get().locations)).catch(() => {});
      const sync = await getSync();
      await sync.queueOp('POST', `${API}/locations`, data);
      sync.useOfflineStore.getState().refreshPendingCount();
      return tempLocation;
    }
  },

  updateLocation: async (id, data) => {
    // Optimistic
    set((s) => ({
      locations: s.locations.map((l) => l.id === id ? { ...l, ...data } : l),
    }));
    try {
      const res = await apiFetch(`${API}/locations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const location = await res.json();
      set((s) => ({
        locations: s.locations.map((l) => l.id === id ? location : l),
      }));
      getOfflineDb().then(({ cacheLocations }) => cacheLocations(get().locations)).catch(() => {});
      return location;
    } catch {
      const sync = await getSync();
      await sync.queueOp('PATCH', `${API}/locations/${id}`, data);
      sync.useOfflineStore.getState().refreshPendingCount();
      return get().locations.find((l) => l.id === id) as Location;
    }
  },

  deleteLocation: async (id) => {
    set((s) => ({ locations: s.locations.filter((l) => l.id !== id) }));
    try {
      const res = await apiFetch(`${API}/locations/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        // Rollback si erreur 409 (bouteilles présentes) — pas de queue
        if (res.status === 409) {
          // Rollback : restaure la liste depuis le cache
          const db = await getOfflineDb();
          const cached = await db.getCachedLocations();
          set({ locations: cached as Location[] });
        }
        const err = await res.json().catch(() => ({}));
        throw Object.assign(new Error(err.message || 'Delete failed'), { status: res.status, data: err });
      }
      getOfflineDb().then(({ cacheLocations }) => cacheLocations(get().locations)).catch(() => {});
    } catch (e: any) {
      if (e.status === 409) throw e; // re-throw sans queue
      const sync = await getSync();
      await sync.queueOp('DELETE', `${API}/locations/${id}`);
      sync.useOfflineStore.getState().refreshPendingCount();
    }
  },
}));
