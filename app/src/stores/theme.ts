import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeState {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

function applyTheme(pref: ThemePreference) {
  const root = document.documentElement;
  if (pref === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', pref);
  }
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      preference: 'system',
      setPreference: (preference) => {
        set({ preference });
        applyTheme(preference);
      },
    }),
    { name: 'cave-theme' }
  )
);

/** À appeler avant le rendu React pour éviter le flash de couleur */
export function initTheme() {
  try {
    const stored = localStorage.getItem('cave-theme');
    const pref: ThemePreference = stored
      ? (JSON.parse(stored).state?.preference ?? 'system')
      : 'system';
    applyTheme(pref);
  } catch {
    // pas de localStorage disponible
  }
}
