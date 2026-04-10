import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, X, ChevronRight } from 'lucide-react';
import { BottomNav } from './BottomNav';
import { useWineStore } from '../../stores/wine';
import { useWebSocket } from '../../hooks/useWebSocket';

function ScanProgressBanner() {
  const activeScan = useWineStore((s) => s.activeScan);
  const clearActiveScan = useWineStore((s) => s.clearActiveScan);
  const lastScanResult = useWineStore((s) => s.lastScanResult);
  const location = useLocation();
  const navigate = useNavigate();

  if (!activeScan || location.pathname === '/scan') return null;

  if (activeScan.status === 'done' && lastScanResult?.status === 'success') {
    return (
      <div className="mx-3 mb-2 flex items-center gap-3 px-3 py-2 bg-success/15 border border-success/30 rounded-[var(--radius-md)]">
        <span className="text-success text-xs font-medium flex-1 truncate">
          ✓ {lastScanResult.wine.name}
        </span>
        <button onClick={() => { navigate('/cave?tab=pending'); clearActiveScan(); }} className="text-xs text-success flex items-center gap-1 flex-shrink-0">
          Valider <ChevronRight size={12} />
        </button>
        <button onClick={clearActiveScan} className="text-text-muted flex-shrink-0">
          <X size={14} />
        </button>
      </div>
    );
  }

  if (activeScan.status === 'error') {
    return (
      <div className="mx-3 mb-2 flex items-center gap-2 px-3 py-2 bg-danger/10 border border-danger/20 rounded-[var(--radius-md)]">
        <span className="text-danger text-xs flex-1 truncate">
          Échec de l'analyse
        </span>
        <button onClick={clearActiveScan} className="text-text-muted flex-shrink-0">
          <X size={14} />
        </button>
      </div>
    );
  }

  const lastLog = activeScan.logs[activeScan.logs.length - 1];
  return (
    <button
      className="mx-3 mb-2 w-[calc(100%-1.5rem)] flex items-center gap-3 px-3 py-2 bg-accent/10 border border-accent/20 rounded-[var(--radius-md)] hover:bg-accent/15 transition-colors"
      onClick={() => navigate('/scan')}
    >
      <Sparkles size={14} className="text-accent-bright animate-pulse flex-shrink-0" />
      <div className="flex-1 min-w-0 text-left">
        <p className="text-xs font-medium text-text">Analyse en cours…</p>
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
      <main className="flex-1 pb-safe">
        <Outlet />
      </main>
      <ScanProgressBanner />
      <BottomNav pendingCount={pendingCount} />
    </div>
  );
}
