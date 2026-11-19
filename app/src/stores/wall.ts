import { create } from 'zustand';
import { apiFetch } from '../lib/api';

export interface WallDef {
  id: string;
  name: string;
  background: string | null;
  sortOrder: number;
}

interface WallState {
  walls: WallDef[];
  loaded: boolean;
  fetchWalls: () => Promise<void>;
  createWall: (name: string, background?: string) => Promise<WallDef>;
  updateWall: (id: string, data: { name?: string; background?: string }) => Promise<void>;
  deleteWall: (id: string) => Promise<void>;
}

export const useWallStore = create<WallState>((set, get) => ({
  walls: [],
  loaded: false,

  fetchWalls: async () => {
    try {
      const res = await apiFetch('/api/walls');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ walls: Array.isArray(data) ? data : [], loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  createWall: async (name, background) => {
    const res = await apiFetch('/api/walls', { method: 'POST', body: JSON.stringify({ name, background }) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const wall: WallDef = await res.json();
    set({ walls: [...get().walls, wall] });
    return wall;
  },

  updateWall: async (id, data) => {
    const prev = get().walls;
    set({ walls: prev.map((w) => (w.id === id ? { ...w, ...data } : w)) });
    try {
      const res = await apiFetch(`/api/walls/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      set({ walls: prev });
      throw e;
    }
  },

  deleteWall: async (id) => {
    const res = await apiFetch(`/api/walls/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    set({ walls: get().walls.filter((w) => w.id !== id) });
  },
}));
