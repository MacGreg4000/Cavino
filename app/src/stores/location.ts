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
  updateLocation: (id: string, data: { name?: string; type?: string; color?: string; gridConfig?: GridConfig }) => Promise<Location>;
  deleteLocation: (id: string) => Promise<void>;
}

const API = '/api';

export const useLocationStore = create<LocationState>((set) => ({
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
    } catch {
      set({ loading: false });
    }
  },

  fetchLocation: async (id) => {
    const res = await apiFetch(`${API}/locations/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  fetchGrid: async (id) => {
    const res = await apiFetch(`${API}/locations/${id}/grid`);
    return res.json();
  },

  createLocation: async (data) => {
    const res = await apiFetch(`${API}/locations`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const location = await res.json();
    set((s) => ({ locations: [...s.locations, location] }));
    return location;
  },

  updateLocation: async (id, data) => {
    const res = await apiFetch(`${API}/locations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const location = await res.json();
    set((s) => ({
      locations: s.locations.map((l) => l.id === id ? location : l),
    }));
    return location;
  },

  deleteLocation: async (id) => {
    const res = await apiFetch(`${API}/locations/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw Object.assign(new Error(err.message || 'Delete failed'), { status: res.status, data: err });
    }
    set((s) => ({ locations: s.locations.filter((l) => l.id !== id) }));
  },
}));
