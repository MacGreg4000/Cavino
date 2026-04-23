import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, CheckCircle, AlertCircle, Clock, ChevronRight, X, ChevronDown, Trash2, RefreshCw, Copy } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { useWineStore, type QueuedScan } from '../stores/wine';

// ─── ScanCard ────────────────────────────────────────────────────────────────

const WARN_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes → afficher avertissement

function ScanCard({ scan, onRemove, onMarkError }: { scan: QueuedScan; onRemove: () => void; onMarkError: () => void }) {
  const [logsOpen, setLogsOpen] = useState(false);
  const elapsed = Math.round((Date.now() - scan.startedAt) / 1000);

  const lastActivity = scan.logs.length > 0
    ? new Date(scan.logs[scan.logs.length - 1].ts).getTime()
    : scan.startedAt;
  const isStaleWarn = (scan.status === 'analyzing' || scan.status === 'uploading')
    && (Date.now() - lastActivity > WARN_THRESHOLD_MS);
  const lastLog = scan.logs[scan.logs.length - 1];

  const isDuplicate = scan.result?.status === 'duplicate';

  const statusIcon = isDuplicate
    ? <Copy size={16} className="text-warning" />
    : {
      uploading: <Clock size={16} className="text-text-muted" />,
      analyzing: <Sparkles size={16} className="text-accent-bright animate-pulse" />,
      done: <CheckCircle size={16} className="text-success" />,
      error: <AlertCircle size={16} className="text-danger" />,
    }[scan.status];

  const statusLabel = isDuplicate
    ? 'Déjà dans la cave'
    : {
      uploading: 'En attente…',
      analyzing: 'Analyse IA en cours…',
      done: 'Terminé',
      error: 'Échec',
    }[scan.status];

  const wineName = scan.result?.status === 'success' ? scan.result.wine.name : null;
  const wineId = scan.result?.status === 'success' ? scan.result.wine.id : null;

  const levelColor = (level: string) => {
    if (level === 'error') return 'text-danger';
    if (level === 'warning') return 'text-warning';
    return 'text-text-muted';
  };

  const stageIcon: Record<string, string> = {
    queued: '⏳', start: '▶', convert: '⟳', ollama: '✦', validate: '✓', photo: '⊞', done: '●',
  };

  return (
    <div className={`rounded-[var(--radius-lg)] border overflow-hidden ${
      isDuplicate ? 'border-warning/30 bg-warning/5'
      : scan.status === 'done' ? 'border-success/30 bg-success/5'
      : scan.status === 'error' ? 'border-danger/20 bg-danger/5'
      : 'border-border bg-surface'
    }`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        {statusIcon}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text truncate">
            {wineName ?? statusLabel}
          </p>
          <p className="text-[11px] text-text-muted font-mono">
            {scan.scanId.slice(-8)}
            {scan.status === 'analyzing' && ` · ${elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m${elapsed % 60}s`}`}
            {scan.status === 'uploading' && ' · en file'}
          </p>
        </div>
        {scan.status === 'done' && wineId && (
          <Link to="/cave?tab=pending">
            <div className="flex items-center gap-1 text-xs text-success font-medium">
              Valider <ChevronRight size={12} />
            </div>
          </Link>
        )}
        {(scan.status === 'done' || scan.status === 'error') && (
          <button onClick={onRemove} className="p-1 text-text-muted hover:text-text transition-colors ml-1">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Progress bar — only for the scan actually running */}
      {scan.status === 'analyzing' && (
        <div className="h-0.5 bg-surface-hover mx-4 mb-3 rounded-full overflow-hidden">
          <div className="h-full bg-accent-bright rounded-full animate-pulse" style={{ width: '60%' }} />
        </div>
      )}
      {scan.status === 'uploading' && (
        <div className="h-0.5 bg-surface-hover mx-4 mb-3 rounded-full overflow-hidden">
          <div className="h-full bg-border rounded-full" style={{ width: '100%' }} />
        </div>
      )}

      {/* Last log line */}
      {lastLog && scan.status === 'analyzing' && (
        <p className="px-4 pb-2 text-[11px] text-text-muted truncate">{lastLog.message}</p>
      )}

      {/* Error message */}
      {scan.status === 'error' && scan.result?.status === 'error' && (
        <p className="px-4 pb-3 text-xs text-danger">{scan.result.message}</p>
      )}

      {/* Duplicate message */}
      {isDuplicate && (
        <p className="px-4 pb-3 text-xs text-warning">Cette bouteille est déjà présente dans ta cave.</p>
      )}

      {/* Stale warning */}
      {isStaleWarn && (
        <div className="mx-4 mb-3 flex items-center justify-between gap-2 rounded-lg bg-warning/10 border border-warning/20 px-3 py-2">
          <p className="text-[11px] text-warning">Résultat attendu depuis +5 min — connexion perdue ?</p>
          <button
            onClick={onMarkError}
            className="flex items-center gap-1 text-[11px] text-warning font-medium whitespace-nowrap hover:text-text transition-colors"
          >
            <RefreshCw size={11} /> Abandonner
          </button>
        </div>
      )}

      {/* Logs toggle */}
      {scan.logs.length > 0 && (
        <div className="border-t border-border/50">
          <button
            onClick={() => setLogsOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-[11px] text-text-muted hover:text-text transition-colors"
          >
            <span>{scan.logs.length} étape{scan.logs.length > 1 ? 's' : ''}</span>
            <ChevronDown size={12} className={`transition-transform ${logsOpen ? 'rotate-180' : ''}`} />
          </button>
          {logsOpen && (
            <div className="px-4 pb-3 space-y-0.5 max-h-40 overflow-y-auto">
              {scan.logs.map((entry, i) => (
                <div key={i} className="flex gap-2 text-[11px] leading-5 font-mono">
                  <span className="text-text-muted flex-shrink-0 w-3 text-center">
                    {stageIcon[entry.stage] ?? '·'}
                  </span>
                  <span className={levelColor(entry.level)}>{entry.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes sans activité = scan perdu

// ─── ScanQueue page ───────────────────────────────────────────────────────────

export function ScanQueue() {
  const scanQueue = useWineStore((s) => s.scanQueue);
  const removeFromQueue = useWineStore((s) => s.removeFromQueue);
  const clearFinishedScans = useWineStore((s) => s.clearFinishedScans);
  const markScanError = useWineStore((s) => s.markScanError);

  // Tick every 30s to refresh elapsed times + detect stale scans
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      // Auto-mark stale scans as error
      const now = Date.now();
      scanQueue.forEach((scan) => {
        if ((scan.status === 'analyzing' || scan.status === 'uploading')) {
          const lastActivity = scan.logs.length > 0
            ? new Date(scan.logs[scan.logs.length - 1].ts).getTime()
            : scan.startedAt;
          if (now - lastActivity > STALE_THRESHOLD_MS) {
            markScanError(scan.scanId);
          }
        }
      });
    }, 30_000);
    return () => clearInterval(id);
  }, [scanQueue, markScanError]);

  const analyzing = scanQueue.filter((s) => s.status === 'analyzing' || s.status === 'uploading');
  const finished = scanQueue.filter((s) => s.status === 'done' || s.status === 'error');
  const doneCount = scanQueue.filter((s) => s.status === 'done').length;

  return (
    <div>
      <PageHeader title="File d'analyse" back />

      <div className="px-4 pt-4 max-w-lg mx-auto pb-8 space-y-4">

        {scanQueue.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-text-muted">
            <Sparkles size={32} className="opacity-30" />
            <p className="text-sm">Aucune analyse en cours</p>
            <Link to="/scan">
              <Button variant="ghost">Scanner une bouteille</Button>
            </Link>
          </div>
        )}

        {/* In progress */}
        {analyzing.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              {analyzing.filter(s => s.status === 'analyzing').length > 0
                ? `En cours · ${analyzing.filter(s => s.status === 'uploading').length} en attente`
                : `En attente (${analyzing.length})`}
            </p>
            {analyzing.map((scan) => (
              <ScanCard key={scan.scanId} scan={scan} onRemove={() => removeFromQueue(scan.scanId)} onMarkError={() => markScanError(scan.scanId)} />
            ))}
          </div>
        )}

        {/* Finished */}
        {finished.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Terminé ({finished.length})
              </p>
              <button onClick={clearFinishedScans} className="flex items-center gap-1 text-xs text-text-muted hover:text-text transition-colors">
                <Trash2 size={11} /> Effacer tout
              </button>
            </div>
            {finished.map((scan) => (
              <ScanCard key={scan.scanId} scan={scan} onRemove={() => removeFromQueue(scan.scanId)} onMarkError={() => markScanError(scan.scanId)} />
            ))}
          </div>
        )}

        {/* Validate CTA */}
        {doneCount > 0 && (
          <Link to="/cave?tab=pending">
            <Button variant="primary" className="w-full">
              <CheckCircle size={16} />
              Valider {doneCount} bouteille{doneCount > 1 ? 's' : ''}
            </Button>
          </Link>
        )}

        {/* Scan another */}
        <Link to="/scan">
          <Button variant="ghost" className="w-full">
            <Sparkles size={16} /> Scanner une autre bouteille
          </Button>
        </Link>
      </div>
    </div>
  );
}
