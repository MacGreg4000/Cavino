import { Link } from 'react-router-dom';
import { Camera, PenLine, FolderOpen, ChevronRight } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';

const MODES = [
  {
    to: '/scan',
    icon: Camera,
    title: 'Scanner une bouteille',
    description: 'Prends une photo de l\'étiquette (recto + verso). L\'IA analyse et crée la fiche automatiquement.',
    accent: 'text-accent-bright',
    border: 'border-accent/30 hover:border-accent/60 bg-accent/5',
    iconBg: 'bg-accent/15',
  },
  {
    to: '/add/manual',
    icon: PenLine,
    title: 'Saisie manuelle',
    description: 'Remplis toi-même toutes les informations de la bouteille.',
    accent: 'text-gold',
    border: 'border-gold/30 hover:border-gold/60 bg-gold/5',
    iconBg: 'bg-gold/15',
  },
  {
    to: '/add/inbox',
    icon: FolderOpen,
    title: 'Déposer dans l\'inbox',
    description: 'Ajoute des photos dans le dossier surveillé sur le NAS. L\'analyse se lance automatiquement.',
    accent: 'text-success',
    border: 'border-success/30 hover:border-success/60 bg-success/5',
    iconBg: 'bg-success/15',
  },
];

export function AddWine() {
  return (
    <div>
      <PageHeader title="Ajouter un vin" back />

      <div className="px-4 pt-6 max-w-lg mx-auto space-y-3">
        <p className="text-sm text-text-secondary mb-2">Comment veux-tu ajouter cette bouteille ?</p>

        {MODES.map(({ to, icon: Icon, title, description, accent, border, iconBg }) => (
          <Link key={to} to={to}>
            <div className={`flex items-center gap-4 p-4 rounded-[var(--radius-lg)] border transition-colors ${border}`}>
              <div className={`w-12 h-12 rounded-[var(--radius-md)] flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                <Icon size={24} className={accent} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${accent}`}>{title}</p>
                <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{description}</p>
              </div>
              <ChevronRight size={18} className="text-text-muted flex-shrink-0" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
