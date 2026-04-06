import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, X, RotateCcw, Sparkles, ImagePlus, AlertCircle, Images } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { apiFetch } from '../lib/api';

type PhotoSlot = { file: File; preview: string } | null;

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
          {/* Icône centrale */}
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

          {/* Deux boutons */}
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

      {/* Input caméra */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChange}
      />
      {/* Input bibliothèque */}
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}

export function ScanWine() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [recto, setRecto] = useState<PhotoSlot>(null);
  const [verso, setVerso] = useState<PhotoSlot>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyse = async () => {
    if (!recto) {
      toast('error', 'La photo recto est requise');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('recto', recto.file);
      if (verso) formData.append('verso', verso.file);

      await apiFetch('/api/scan/upload', {
        method: 'POST',
        body: formData,
        rawBody: true,
      });

      toast('success', 'Photos envoyées — analyse en cours !');
      navigate('/cave?tab=pending');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur lors de l\'envoi';
      toast('error', msg);
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="Scanner une bouteille" back />

      <div className="px-4 pt-4 max-w-lg mx-auto pb-8 space-y-5">
        {/* Info banner */}
        <div className="flex items-start gap-3 bg-accent/10 border border-accent/20 rounded-[var(--radius-md)] p-3">
          <Sparkles size={16} className="text-accent-bright mt-0.5 flex-shrink-0" />
          <p className="text-xs text-text-secondary leading-relaxed">
            Prends une photo de l'étiquette principale (recto). Ajoute le dos si disponible pour une analyse plus précise. L'IA génère la fiche automatiquement.
          </p>
        </div>

        {/* Photos side by side */}
        <div className="grid grid-cols-2 gap-3">
          <PhotoCapture
            label="Recto"
            photo={recto}
            onCapture={(file, preview) => setRecto({ file, preview })}
            onRemove={() => setRecto(null)}
            required
          />
          <PhotoCapture
            label="Verso"
            photo={verso}
            onCapture={(file, preview) => setVerso({ file, preview })}
            onRemove={() => setVerso(null)}
          />
        </div>

        {/* Warning if no photo */}
        {!recto && (
          <div className="flex items-center gap-2 text-text-muted">
            <AlertCircle size={14} />
            <span className="text-xs">La photo recto est obligatoire pour lancer l'analyse.</span>
          </div>
        )}

        <Button
          variant="primary"
          className="w-full"
          loading={loading}
          disabled={!recto}
          onClick={handleAnalyse}
        >
          <Sparkles size={16} />
          Analyser
        </Button>
      </div>
    </div>
  );
}
