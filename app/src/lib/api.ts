// Helper fetch qui attache automatiquement le token Bearer de l'auth store

export function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  // Import dynamique pour éviter les dépendances circulaires
  const token = (() => {
    try {
      return JSON.parse(localStorage.getItem('cave-auth') || '{}').state?.token as string | null;
    } catch {
      return null;
    }
  })();

  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
}
