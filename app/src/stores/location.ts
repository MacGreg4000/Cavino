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
  } | null;
}

interface LocationState {
  locations: Location[];
  loading: boolean;

  fetchLocations: () => Promise<void>;
  fetchGrid: (id: string) => Promise<{ location: Location; slots: GridSlot[] }>;
  createLocation: (data: { name: string; type: string; color?: string; gridConfig: GridConfig }) => Promise<Location>;
}

const API = '/api';

export const useLocationStore = create<LocationState>((set) => ({
  locations: [],
  loading: false,

  fetchLocations: async () => {
    set({ loading: true });
    try {
      const res = await apiFetch(`${API}/locations`);
      const locations = await res.json();
      set({ locations, loading: false });
    } catch {
      set({ loading: false });
    }
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
}));
