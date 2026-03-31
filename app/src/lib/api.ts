// Helper fetch qui attache automatiquement le token Bearer de l'auth store
import { useAuthStore } from '../stores/auth';

export function apiFetch(url: string, options?: RequestInit & { rawBody?: boolean }): Promise<Response> {
  const token = useAuthStore.getState().token;

  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Only set Content-Type for JSON requests with a body (not FormData / rawBody)
  if (options?.body && !options?.rawBody) {
    headers['Content-Type'] = 'application/json';
  }

  const { rawBody: _, ...fetchOptions } = options ?? {};

  return fetch(url, {
    ...fetchOptions,
    headers: {
      ...headers,
      ...(fetchOptions?.headers ?? {}),
    },
  });
}
