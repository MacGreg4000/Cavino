import { create } from 'zustand';
import { apiFetch } from '../lib/api';

export interface WineCategory {
  id: string;
  name: string;
  color?: string | null;
  sortOrder: number;
  createdAt?: string;
}

interface CategoryState {
  categories: WineCategory[];
  loading: boolean;

  fetchCategories: () => Promise<void>;
  createCategory: (data: { name: string; color?: string }) => Promise<WineCategory>;
  updateCategory: (id: string, data: { name?: string; color?: string; sortOrder?: number }) => Promise<WineCategory>;
  deleteCategory: (id: string) => Promise<void>;
  /** Ajoute/retire une sous-catégorie sur plusieurs bouteilles en un seul appel
   * (réattribution en masse de bouteilles déjà en cave). */
  bulkAssign: (wineIds: string[], categoryId: string, action: 'add' | 'remove') => Promise<void>;
}

const API = '/api';

export const useCategoryStore = create<CategoryState>((set) => ({
  categories: [],
  loading: false,

  fetchCategories: async () => {
    set({ loading: true });
    try {
      const res = await apiFetch(`${API}/categories`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      set({ categories: Array.isArray(data) ? data : [], loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createCategory: async (data) => {
    const res = await apiFetch(`${API}/categories`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw Object.assign(new Error(err.error || 'Création impossible'), { status: res.status });
    }
    const category = await res.json();
    set((s) => ({ categories: [...s.categories, category].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'fr')) }));
    return category;
  },

  updateCategory: async (id, data) => {
    const res = await apiFetch(`${API}/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw Object.assign(new Error(err.error || 'Mise à jour impossible'), { status: res.status });
    }
    const category = await res.json();
    set((s) => ({ categories: s.categories.map((c) => (c.id === id ? category : c)) }));
    return category;
  },

  deleteCategory: async (id) => {
    const res = await apiFetch(`${API}/categories/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Suppression impossible');
    set((s) => ({ categories: s.categories.filter((c) => c.id !== id) }));
  },

  bulkAssign: async (wineIds, categoryId, action) => {
    const res = await apiFetch(`${API}/categories/bulk-assign`, {
      method: 'POST',
      body: JSON.stringify({ wineIds, categoryId, action }),
    });
    if (!res.ok) throw new Error('Réattribution impossible');
  },
}));
