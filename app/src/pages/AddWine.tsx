import { Link } from 'react-router-dom';
import { Camera, PenLine, ChevronRight } from 'lucide-react';
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
];

export function AddWine() {
  return (
    <div>
      <PageHeader title="Ajouter un vin" back />

      <div className="px-4 pt-10 max-w-lg mx-auto pb-10">
        <div className="flex flex-col gap-8">
        <p className="text-sm text-text-secondary mb-2">Comment veux-tu ajouter cette bouteille ?</p>

        {MODES.map(({ to, icon: Icon, title, description, accent, border, iconBg }) => (
          <Link key={to} to={to}>
            <div className={`flex items-center gap-5 p-5 rounded-[var(--radius-lg)] border transition-colors ${border}`}>
              <div className={`w-14 h-14 rounded-[var(--radius-md)] flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                <Icon size={26} className={accent} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${accent}`}>{title}</p>
                <p className="text-xs text-text-secondary mt-1 leading-relaxed">{description}</p>
              </div>
              <ChevronRight size={18} className="text-text-muted flex-shrink-0" />
            </div>
          </Link>
        ))}
        </div>
      </div>
    </div>
  );
}
