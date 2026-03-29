// Helper fetch qui attache automatiquement le token Bearer de l'auth store
import { useAuthStore } from '../stores/auth';

export function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const token = useAuthStore.getState().token;

  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Only set Content-Type for requests with a body
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options?.headers ?? {}),
    },
  });
}
