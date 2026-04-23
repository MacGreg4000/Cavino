import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Camera, X, RotateCcw, Sparkles, ImagePlus, AlertCircle, Images, List } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { apiFetch } from '../lib/api';
import { useWineStore } from '../stores/wine';

type PhotoSlot = { file: File; preview: string } | null;

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

// ─── ScanWine ─────────────────────────────────────────────────────────────────

export function ScanWine() {
  const { toast } = useToast();
  const addToQueue = useWineStore((s) => s.addToQueue);
  const scanQueue = useWineStore((s) => s.scanQueue);

  const [recto, setRecto] = useState<PhotoSlot>(null);
  const [verso, setVerso] = useState<PhotoSlot>(null);
  const [hint, setHint] = useState('');
  const [uploading, setUploading] = useState(false);

  const activeCount = scanQueue.filter((s) => s.status === 'uploading' || s.status === 'analyzing').length;
  const doneCount = scanQueue.filter((s) => s.status === 'done').length;

  const handleAnalyse = async () => {
    if (!recto || uploading) return;   // garde double-submit
    if (!recto) {
      toast('error', 'La photo recto est requise');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('recto', recto.file);
      if (verso) formData.append('verso', verso.file);
      if (hint.trim()) formData.append('hint', hint.trim());

      const res = await apiFetch('/api/scan/upload', {
        method: 'POST',
        body: formData,
        rawBody: true,
      });
      if (!res.ok) throw new Error('Erreur lors de l\'envoi');
      const { scanId } = await res.json();
      addToQueue(scanId);

      // Reset form immediately — user can scan next bottle right away
      setRecto(null);
      setVerso(null);
      setHint('');
      toast('info', 'Analyse lancée — scannez la prochaine bouteille !');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur lors de l\'envoi';
      toast('error', msg);
    }
    setUploading(false);
  };

  return (
    <div>
      <PageHeader title="Scanner une bouteille" back />
      <div className="px-4 pt-4 max-w-lg mx-auto pb-8 space-y-5">

        {/* Queue status pill */}
        {(activeCount > 0 || doneCount > 0) && (
          <Link to="/scan/queue">
            <div className="flex items-center gap-3 px-3 py-2.5 bg-surface border border-border rounded-[var(--radius-md)] hover:border-accent/40 transition-colors">
              <List size={15} className="text-accent-bright flex-shrink-0" />
              <div className="flex-1 text-sm text-text">
                {activeCount > 0 && (
                  <span className="text-accent-bright font-medium">{activeCount} en cours</span>
                )}
                {activeCount > 0 && doneCount > 0 && <span className="text-text-muted"> · </span>}
                {doneCount > 0 && (
                  <span className="text-success">{doneCount} à valider</span>
                )}
              </div>
              <span className="text-xs text-text-muted">Voir la file →</span>
            </div>
          </Link>
        )}

        <div className="flex items-start gap-3 bg-accent/10 border border-accent/20 rounded-[var(--radius-md)] p-3">
          <Sparkles size={16} className="text-accent-bright mt-0.5 flex-shrink-0" />
          <p className="text-xs text-text-secondary leading-relaxed">
            Prends une photo de l'étiquette principale (recto). Ajoute le dos si disponible pour une analyse plus précise.
            Tu peux scanner plusieurs bouteilles à la suite sans attendre.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <PhotoCapture label="Recto" photo={recto} onCapture={(f, p) => setRecto({ file: f, preview: p })} onRemove={() => setRecto(null)} required />
          <PhotoCapture label="Verso" photo={verso} onCapture={(f, p) => setVerso({ file: f, preview: p })} onRemove={() => setVerso(null)} />
        </div>

        {/* Hint field */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text-secondary">
            Indice <span className="text-text-muted font-normal">(optionnel)</span>
          </label>
          <textarea
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="Ex : Zefiro, Primitivo di Manduria, 2020, environ 9€…"
            rows={2}
            className="w-full bg-surface-hover border border-border rounded-[var(--radius-md)] px-3 py-2 text-sm text-text placeholder:text-text-muted resize-none focus:outline-none focus:border-accent/50 transition-colors"
          />
          <p className="text-[11px] text-text-muted leading-relaxed">
            Aide le modèle si l'étiquette est illisible : nom exact, millésime, domaine, prix indicatif…
          </p>
        </div>

        {!recto && (
          <div className="flex items-center gap-2 text-text-muted">
            <AlertCircle size={14} />
            <span className="text-xs">La photo recto est obligatoire pour lancer l'analyse.</span>
          </div>
        )}

        <Button variant="primary" className="w-full" disabled={!recto || uploading} loading={uploading} onClick={handleAnalyse}>
          <Sparkles size={16} /> Analyser
        </Button>
      </div>
    </div>
  );
}
