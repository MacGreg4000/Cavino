import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  login: (password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,

      login: async (password: string) => {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Erreur de connexion');
        }
        const { token } = await res.json();
        set({ token });
      },

      logout: () => set({ token: null }),

      isAuthenticated: () => !!get().token,
    }),
    {
      name: 'cave-auth',
      partialize: (state) => ({ token: state.token }),
    }
  )
);
