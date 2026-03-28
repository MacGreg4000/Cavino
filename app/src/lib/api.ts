// Helper fetch qui attache automatiquement le token Bearer de l'auth store
import { useAuthStore } from '../stores/auth';

export function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const token = useAuthStore.getState().token;

  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
}
