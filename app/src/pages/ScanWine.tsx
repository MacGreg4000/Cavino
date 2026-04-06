import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Camera, X, RotateCcw, Sparkles, ImagePlus, AlertCircle, Images, CheckCircle, Clock, ChevronRight, RefreshCw } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { apiFetch } from '../lib/api';
import { useWineStore } from '../stores/wine';

type PhotoSlot = { file: File; preview: string } | null;
type ScanState = 'capture' | 'uploading' | 'analyzing' | 'done';

// ─── PhotoCapture ────────────────────────────────────────────────────────────

function PhotoCapture({
  label,
  photo,
  onCapture,
  onRemove,
  required,
}: {
  label: string;
  photo: PhotoSlot;
  onCapture: (file: File, preview: string) => void;
  onRemove: () => void;
  required?: boolean;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => onCapture(file, reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-text-secondary">{label}</span>
        {required ? (
          <span className="text-xs text-accent-bright">Requis</span>
        ) : (
          <span className="text-xs text-text-muted">Optionnel</span>
        )}
      </div>

      {photo ? (
        <div className="relative rounded-[var(--radius-md)] overflow-hidden aspect-[3/4] bg-surface-hover">
          <img src={photo.preview} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute bottom-2 right-2 flex gap-2">
            <button
              onClick={() => cameraRef.current?.click()}
              className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              title="Reprendre"
            >
              <RotateCcw size={16} />
            </button>
            <button
              onClick={onRemove}
              className="p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              title="Supprimer"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ) : (
        <div className="aspect-[3/4] bg-surface-hover rounded-[var(--radius-md)] flex flex-col items-center justify-center gap-4 border-2 border-dashed border-border">
          <div className="flex flex-col items-center gap-1">
            {required ? (
              <Camera size={28} className="text-accent" />
            ) : (
              <ImagePlus size={24} className="text-text-muted" />
            )}
            <span className="text-[10px] text-text-muted text-center px-2">
              {required ? 'Photo recto' : 'Verso (optionnel)'}
            </span>
          </div>
          <div className="flex flex-col gap-2 w-full px-3">
            <button
              onClick={() => cameraRef.current?.click()}
              className="flex items-center justify-center gap-2 py-1.5 rounded-[var(--radius-sm)] bg-accent/15 border border-accent/30 text-accent-bright text-xs font-medium hover:bg-accent/25 transition-colors"
            >
              <Camera size={13} /> Appareil photo
            </button>
            <button
              onClick={() => libraryRef.current?.click()}
              className="flex items-center justify-center gap-2 py-1.5 rounded-[var(--radius-sm)] bg-surface border border-border text-text-secondary text-xs font-medium hover:bg-surface-hover transition-colors"
            >
              <Images size={13} /> Bibliothèque
            </button>
          </div>
        </div>
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleChange} />
      <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
    </div>
  );
}

// ─── StatusStep ──────────────────────────────────────────────────────────────

function StatusStep({
  icon,
  label,
  sublabel,
  state,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  state: 'pending' | 'active' | 'done' | 'error';
}) {
  return (
    <div className={`flex items-center gap-3 transition-opacity ${state === 'pending' ? 'opacity-30' : 'opacity-100'}`}>
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
        state === 'done' ? 'bg-success/20' :
        state === 'error' ? 'bg-danger/20' :
        state === 'active' ? 'bg-accent/20 animate-pulse' :
        'bg-surface-hover'
      }`}>
        <span className={
          state === 'done' ? 'text-success' :
          state === 'error' ? 'text-danger' :
          state === 'active' ? 'text-accent-bright' :
          'text-text-muted'
        }>{icon}</span>
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-text">{label}</p>
        {sublabel && <p className="text-xs text-text-muted">{sublabel}</p>}
      </div>
    </div>
  );
}

// ─── ScanWine ─────────────────────────────────────────────────────────────────

export function ScanWine() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const lastScanResult = useWineStore((s) => s.lastScanResult);
  const setScanResult = useWineStore((s) => s.setScanResult);

  const [recto, setRecto] = useState<PhotoSlot>(null);
  const [verso, setVerso] = useState<PhotoSlot>(null);
  const [scanState, setScanState] = useState<ScanState>('capture');
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number>(0);

  // Clear any previous scan result when mounting
  useEffect(() => {
    setScanResult(null);
  }, [setScanResult]);

  // Elapsed timer while analyzing
  useEffect(() => {
    if (scanState !== 'analyzing') return;
    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [scanState]);

  // Watch for WebSocket result
  useEffect(() => {
    if (scanState !== 'analyzing' || !lastScanResult) return;
    setScanState('done');
  }, [lastScanResult, scanState]);

  const handleAnalyse = async () => {
    if (!recto) {
      toast('error', 'La photo recto est requise');
      return;
    }

    setScanResult(null);
    setScanState('uploading');

    try {
      const formData = new FormData();
      formData.append('recto', recto.file);
      if (verso) formData.append('verso', verso.file);

      await apiFetch('/api/scan/upload', {
        method: 'POST',
        body: formData,
        rawBody: true,
      });

      setScanState('analyzing');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur lors de l\'envoi';
      toast('error', msg);
      setScanState('capture');
    }
  };

  const handleRetry = () => {
    setScanResult(null);
    setScanState('capture');
    setRecto(null);
    setVerso(null);
    setElapsed(0);
  };

  const formatElapsed = (s: number) => {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  // ── Capture screen ──
  if (scanState === 'capture') {
    return (
      <div>
        <PageHeader title="Scanner une bouteille" back />
        <div className="px-4 pt-4 max-w-lg mx-auto pb-8 space-y-5">
          <div className="flex items-start gap-3 bg-accent/10 border border-accent/20 rounded-[var(--radius-md)] p-3">
            <Sparkles size={16} className="text-accent-bright mt-0.5 flex-shrink-0" />
            <p className="text-xs text-text-secondary leading-relaxed">
              Prends une photo de l'étiquette principale (recto). Ajoute le dos si disponible pour une analyse plus précise.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <PhotoCapture label="Recto" photo={recto} onCapture={(f, p) => setRecto({ file: f, preview: p })} onRemove={() => setRecto(null)} required />
            <PhotoCapture label="Verso" photo={verso} onCapture={(f, p) => setVerso({ file: f, preview: p })} onRemove={() => setVerso(null)} />
          </div>

          {!recto && (
            <div className="flex items-center gap-2 text-text-muted">
              <AlertCircle size={14} />
              <span className="text-xs">La photo recto est obligatoire pour lancer l'analyse.</span>
            </div>
          )}

          <Button variant="primary" className="w-full" disabled={!recto} onClick={handleAnalyse}>
            <Sparkles size={16} /> Analyser
          </Button>
        </div>
      </div>
    );
  }

  // ── Status screen (uploading / analyzing / done) ──
  const uploadState = scanState === 'uploading' ? 'active' : 'done';
  const analyzeState = scanState === 'uploading' ? 'pending' : scanState === 'analyzing' ? 'active' : (lastScanResult?.status === 'error' ? 'error' : 'done');
  const resultState = scanState === 'done' ? (lastScanResult?.status === 'error' ? 'error' : 'done') : 'pending';

  return (
    <div>
      <PageHeader title="Analyse en cours" back={scanState === 'done'} />
      <div className="px-4 pt-6 max-w-lg mx-auto pb-8 space-y-6">

        {/* Photos thumbnail */}
        <div className="flex gap-3">
          {recto && (
            <img src={recto.preview} alt="Recto" className="w-20 h-28 object-cover rounded-[var(--radius-md)] border border-border" />
          )}
          {verso && (
            <img src={verso.preview} alt="Verso" className="w-20 h-28 object-cover rounded-[var(--radius-md)] border border-border" />
          )}
          <div className="flex-1 flex flex-col justify-center gap-1">
            <p className="text-sm font-medium text-text">{verso ? '2 photos' : '1 photo'} envoyée{verso ? 's' : ''}</p>
            <p className="text-xs text-text-muted">Analyse par IA en cours…</p>
          </div>
        </div>

        {/* Steps */}
        <div className="bg-surface border border-border rounded-[var(--radius-lg)] p-4 space-y-4">
          <StatusStep
            icon={<CheckCircle size={18} />}
            label="Photos envoyées"
            sublabel="Reçues par le serveur"
            state={uploadState}
          />
          <div className="w-px h-4 bg-border ml-[18px]" />
          <StatusStep
            icon={<Sparkles size={18} />}
            label="Analyse IA"
            sublabel={
              analyzeState === 'active'
                ? `En cours… ${formatElapsed(elapsed)}`
                : analyzeState === 'error'
                ? 'Échec de l\'analyse'
                : analyzeState === 'done'
                ? 'Analyse terminée'
                : 'En attente'
            }
            state={analyzeState}
          />
          <div className="w-px h-4 bg-border ml-[18px]" />
          <StatusStep
            icon={resultState === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
            label={
              resultState === 'done'
                ? `Bouteille détectée !`
                : resultState === 'error'
                ? 'Erreur d\'import'
                : 'Validation à faire'
            }
            sublabel={
              resultState === 'done' && lastScanResult?.status === 'success'
                ? lastScanResult.wine.name
                : resultState === 'error' && lastScanResult?.status === 'error'
                ? lastScanResult.message
                : undefined
            }
            state={resultState}
          />
        </div>

        {/* Durée typique */}
        {scanState === 'analyzing' && elapsed < 30 && (
          <div className="flex items-center gap-2 text-text-muted">
            <Clock size={14} />
            <span className="text-xs">L'analyse prend généralement 30 à 90 secondes.</span>
          </div>
        )}

        {/* Actions selon état final */}
        {scanState === 'done' && lastScanResult?.status === 'success' && (
          <div className="space-y-2">
            <Link to="/cave?tab=pending">
              <div className="flex items-center gap-3 p-4 bg-success/10 border border-success/30 rounded-[var(--radius-lg)] hover:bg-success/15 transition-colors">
                <CheckCircle size={20} className="text-success flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-text">Valider la bouteille</p>
                  <p className="text-xs text-text-muted">{lastScanResult.wine.name}</p>
                </div>
                <ChevronRight size={16} className="text-text-muted" />
              </div>
            </Link>
            <Button variant="ghost" className="w-full" onClick={handleRetry}>
              <Camera size={16} /> Scanner une autre bouteille
            </Button>
          </div>
        )}

        {scanState === 'done' && lastScanResult?.status === 'error' && (
          <div className="space-y-2">
            <div className="p-3 bg-danger/10 border border-danger/20 rounded-[var(--radius-md)]">
              <p className="text-xs text-danger">{lastScanResult.message}</p>
            </div>
            <Button variant="primary" className="w-full" onClick={handleRetry}>
              <RefreshCw size={16} /> Réessayer
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
