import { FolderOpen, Wifi, ArrowRight, Info } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';

const STEPS = [
  { icon: Wifi, text: 'Connecte-toi au réseau local ou au NAS en SSH/SMB' },
  { icon: FolderOpen, text: 'Dépose tes photos dans le dossier "A analyser"' },
  { icon: ArrowRight, text: 'Le service de scan détecte les fichiers automatiquement' },
];

export function AddWineInbox() {
  return (
    <div>
      <PageHeader title="Déposer dans l'inbox" back />

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-4 pb-8">
        <Card>
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-success/15 flex items-center justify-center flex-shrink-0">
              <FolderOpen size={20} className="text-success" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text">Dépôt automatique via NAS</p>
              <p className="text-xs text-text-secondary mt-0.5">
                Le service de scan surveille en permanence un dossier sur le NAS. Il suffit d'y déposer tes photos.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {STEPS.map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-surface-hover border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-text-secondary">{i + 1}</span>
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <Icon size={14} className="text-success flex-shrink-0" />
                  <p className="text-xs text-text-secondary">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-2 mb-3">
            <Info size={14} className="text-accent-bright mt-0.5 flex-shrink-0" />
            <p className="text-xs font-semibold text-text">Chemin du dossier</p>
          </div>
          <div className="bg-surface-hover rounded-[var(--radius-sm)] p-3 font-mono text-xs text-accent-bright break-all">
            /volume1/docker/cavino/data/inbox/A analyser/
          </div>
          <p className="text-[10px] text-text-muted mt-2">
            Formats acceptés : HEIC, JPG, JPEG, PNG. Les photos recto/verso doivent être nommées avec le suffixe _1/_2 ou _recto/_verso, ou être des fichiers consécutifs (ex: IMG_0272 + IMG_0273).
          </p>
        </Card>
      </div>
    </div>
  );
}
