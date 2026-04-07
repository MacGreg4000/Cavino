import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Wine } from 'lucide-react';
import { WinePhoto } from '../components/ui/WinePhoto';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { useWineStore, type Wine as WineType } from '../stores/wine';

function typeLeftBorder(type?: string): string {
  const t = type?.toLowerCase() ?? '';
  if (t.includes('rouge') || t.includes('red')) return 'border-l-wine-red/70';
  if (t.includes('blanc') || t.includes('white')) return 'border-l-wine-white/50';
  if (t.includes('rosé') || t.includes('rose')) return 'border-l-wine-rose/70';
  if (t.includes('champagne') || t.includes('mousseux') || t.includes('crémant')) return 'border-l-champagne/50';
  return 'border-l-border';
}

function WineListCard({ wine }: { wine: WineType }) {
  return (
    <Link to={`/cave/${wine.id}`}>
      <div className={`flex items-center gap-3 bg-surface rounded-[var(--radius-md)] p-3 border border-border border-l-4 ${typeLeftBorder(wine.type)} hover:bg-surface-hover transition-colors active:scale-[0.99]`}>
        {wine.photoUrl ? (
          <WinePhoto src={wine.photoUrl} className="w-16 h-16 rounded-[var(--radius-sm)] flex-shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded-[var(--radius-sm)] bg-surface-hover flex items-center justify-center flex-shrink-0">
            <Wine size={20} className="text-text-muted" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text truncate">{wine.name}</p>
          <p className="text-xs text-text-secondary truncate mt-0.5">
            {wine.domain && `${wine.domain} · `}{wine.vintage || 'NV'}
            {wine.appellation && ` · ${wine.appellation}`}
          </p>
          {wine.drinkUntil && (
            <p className="text-[10px] text-warning mt-0.5">À déguster avant {wine.drinkUntil}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className="text-sm text-text-muted font-mono">×{wine.quantity || 0}</span>
          <Badge variant="warning">À boire</Badge>
        </div>
      </div>
    </Link>
  );
}

export function DrinkNow() {
  const { wines, fetchWines } = useWineStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchWines();
  }, [fetchWines]);

  const currentYear = new Date().getFullYear();
  const drinkNow = wines
    .filter((w) => w.drinkUntil && w.drinkUntil <= currentYear)
    .sort((a, b) => (a.drinkUntil || 0) - (b.drinkUntil || 0));

  return (
    <div>
      <PageHeader
        title="À boire maintenant"
        subtitle={`${drinkNow.length} bouteille${drinkNow.length > 1 ? 's' : ''}`}
        onBack={() => navigate('/')}
      />

      <div className="px-4 pb-6 max-w-lg mx-auto">
        {drinkNow.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              title="Aucune bouteille à boire maintenant"
              description="Profitez de votre cave en attendant !"
              icon={Wine}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {drinkNow.map((wine) => (
              <WineListCard key={wine.id} wine={wine} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
