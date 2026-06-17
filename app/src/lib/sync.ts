import { create } from 'zustand';
import { offlineDb, getPendingOpsCount } from './db';
import { apiFetch } from './api';

// Re-export pour que les stores importent depuis un seul endroit
export { queueOp } from './db';

// ── Offline state store ───────────────────────────────────────────────────────

interface OfflineState {
  isOnline: boolean;
  pendingOpsCount: number;
  syncing: boolean;
  lastSyncAt: number | null;

  setOnline: (v: boolean) => void;
  setPendingOpsCount: (n: number) => void;
  setSyncing: (v: boolean) => void;
  refreshPendingCount: () => Promise<void>;
}

export const useOfflineStore = create<OfflineState>((set) => ({
  isOnline: navigator.onLine,
  pendingOpsCount: 0,
  syncing: false,
  lastSyncAt: null,

  setOnline: (v) => set({ isOnline: v }),
  setPendingOpsCount: (n) => set({ pendingOpsCount: n }),
  setSyncing: (v) => set({ syncing: v }),
  refreshPendingCount: async () => {
    try {
      const n = await getPendingOpsCount();
      set({ pendingOpsCount: n });
    } catch {}
  },
}));

// ── Flush pending ops to server ───────────────────────────────────────────────

export async function flushPendingOps(): Promise<{ flushed: number; failed: number }> {
  const ops = await offlineDb.pendingOps.orderBy('createdAt').toArray();
  let flushed = 0;
  let failed = 0;

  for (const op of ops) {
    try {
      const res = await apiFetch(op.url, {
        method: op.method,
        body: op.body,
      });
      // 404 = ressource déjà supprimée côté serveur → considéré comme OK
      if (res.ok || res.status === 404 || res.status === 409) {
        await offlineDb.pendingOps.delete(op.id);
        flushed++;
      } else {
        failed++;
        break;
      }
    } catch {
      failed++;
      break;
    }
  }

  return { flushed, failed };
}

// ── Full sync : flush + reload data ──────────────────────────────────────────

let syncInProgress = false;

export async function syncNow(
  refreshFns: Array<() => Promise<void>>,
): Promise<void> {
  if (syncInProgress) return;
  syncInProgress = true;
  const { setSyncing, refreshPendingCount } = useOfflineStore.getState();
  setSyncing(true);

  try {
    await flushPendingOps();
    // Reload fresh data from server
    await Promise.allSettled(refreshFns.map((fn) => fn()));
    useOfflineStore.setState({ lastSyncAt: Date.now() });
  } finally {
    syncInProgress = false;
    setSyncing(false);
    await refreshPendingCount();
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────

let refreshFnsRef: Array<() => Promise<void>> = [];

export function startSyncListener(refreshFns: Array<() => Promise<void>>) {
  refreshFnsRef = refreshFns;

  const handleOnline = () => {
    useOfflineStore.getState().setOnline(true);
    syncNow(refreshFnsRef).catch(() => {});
  };

  const handleOffline = () => {
    useOfflineStore.getState().setOnline(false);
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Initial pending count
  useOfflineStore.getState().refreshPendingCount().catch(() => {});

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
