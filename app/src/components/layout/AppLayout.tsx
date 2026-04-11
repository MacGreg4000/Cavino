import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, X, ChevronRight, CheckCircle } from 'lucide-react';
import { BottomNav } from './BottomNav';
import { useWineStore } from '../../stores/wine';
import { useWebSocket } from '../../hooks/useWebSocket';

function ScanProgressBanner() {
  const scanQueue = useWineStore((s) => s.scanQueue);
  const clearFinishedScans = useWineStore((s) => s.clearFinishedScans);
  const removeFromQueue = useWineStore((s) => s.removeFromQueue);
  const location = useLocation();
  const navigate = useNavigate();

  const isOnScanPages = location.pathname.startsWith('/scan');
  if (isOnScanPages || scanQueue.length === 0) return null;

  const analyzing = scanQueue.filter((s) => s.status === 'analyzing' || s.status === 'uploading');
  const done = scanQueue.filter((s) => s.status === 'done');
  const errors = scanQueue.filter((s) => s.status === 'error');

  // All done with at least one success
  if (analyzing.length === 0 && done.length > 0) {
    return (
      <div className="mx-3 mb-2 flex items-center gap-3 px-3 py-2 bg-success/15 border border-success/30 rounded-[var(--radius-md)]">
        <CheckCircle size={14} className="text-success flex-shrink-0" />
        <span className="text-success text-xs font-medium flex-1 truncate">
          {done.length} bouteille{done.length > 1 ? 's' : ''} analysée{done.length > 1 ? 's' : ''} — à valider
        </span>
        <button onClick={() => { navigate('/cave?tab=pending'); clearFinishedScans(); }} className="text-xs text-success flex items-center gap-1 flex-shrink-0">
          Valider <ChevronRight size={12} />
        </button>
        <button onClick={clearFinishedScans} className="text-text-muted flex-shrink-0">
          <X size={14} />
        </button>
      </div>
    );
  }

  // All failed
  if (analyzing.length === 0 && done.length === 0 && errors.length > 0) {
    return (
      <div className="mx-3 mb-2 flex items-center gap-2 px-3 py-2 bg-danger/10 border border-danger/20 rounded-[var(--radius-md)]">
        <span className="text-danger text-xs flex-1 truncate">
          Échec de l'analyse
        </span>
        <button onClick={() => errors.forEach((e) => removeFromQueue(e.scanId))} className="text-text-muted flex-shrink-0">
          <X size={14} />
        </button>
      </div>
    );
  }

  // Still analyzing — show progress of the active one
  const active = analyzing[analyzing.length - 1];
  const lastLog = active?.logs[active.logs.length - 1];
  return (
    <button
      className="mx-3 mb-2 w-[calc(100%-1.5rem)] flex items-center gap-3 px-3 py-2 bg-accent/10 border border-accent/20 rounded-[var(--radius-md)] hover:bg-accent/15 transition-colors"
      onClick={() => navigate('/scan/queue')}
    >
      <Sparkles size={14} className="text-accent-bright animate-pulse flex-shrink-0" />
      <div className="flex-1 min-w-0 text-left">
        <p className="text-xs font-medium text-text">
          {analyzing.length} analyse{analyzing.length > 1 ? 's' : ''} en cours
          {done.length > 0 ? ` · ${done.length} terminée${done.length > 1 ? 's' : ''}` : ''}
        </p>
        {lastLog && <p className="text-[11px] text-text-muted truncate">{lastLog.message}</p>}
      </div>
      <ChevronRight size={14} className="text-text-muted flex-shrink-0" />
    </button>
  );
}

export function AppLayout() {
  useWebSocket();
  const pendingCount = useWineStore((s) => s.pendingCount);

  return (
    <div className="flex-1 flex flex-col">
      <main className="flex-1 flex flex-col overflow-hidden pb-safe">
        <Outlet />
      </main>
      <ScanProgressBanner />
      <BottomNav pendingCount={pendingCount} />
    </div>
  );
}
