import { WifiOff, RefreshCw } from 'lucide-react';
import { useOfflineStore, syncNow } from '../../lib/sync';
import { useWineStore } from '../../stores/wine';
import { useLocationStore } from '../../stores/location';

export function OfflineBanner() {
  const { isOnline, pendingOpsCount, syncing } = useOfflineStore();

  const fetchWines     = useWineStore((s) => s.fetchWines);
  const fetchLocations = useLocationStore((s) => s.fetchLocations);

  if (isOnline && pendingOpsCount === 0) return null;

  const handleSync = () => {
    if (syncing) return;
    syncNow([fetchWines, fetchLocations]);
  };

  if (!isOnline) {
    return (
      <div className="mx-3 mb-2 flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-[var(--radius-md)]">
        <WifiOff size={13} className="text-text-muted flex-shrink-0" />
        <span className="text-xs text-text-secondary flex-1">
          Hors ligne
          {pendingOpsCount > 0 && (
            <span className="text-text-muted">
              {' '}· {pendingOpsCount} modification{pendingOpsCount > 1 ? 's' : ''} en attente
            </span>
          )}
        </span>
      </div>
    );
  }

  // Online mais des ops en attente (juste reconnecté)
  return (
    <div className="mx-3 mb-2 flex items-center gap-2 px-3 py-2 bg-accent/10 border border-accent/20 rounded-[var(--radius-md)]">
      <RefreshCw
        size={13}
        className={`text-accent-bright flex-shrink-0 ${syncing ? 'animate-spin' : ''}`}
      />
      <span className="text-xs text-accent-bright flex-1">
        {syncing
          ? 'Synchronisation en cours…'
          : `${pendingOpsCount} modification${pendingOpsCount > 1 ? 's' : ''} à synchroniser`}
      </span>
      {!syncing && (
        <button
          onClick={handleSync}
          className="text-xs text-accent-bright font-medium underline underline-offset-2 flex-shrink-0"
        >
          Sync
        </button>
      )}
    </div>
  );
}
