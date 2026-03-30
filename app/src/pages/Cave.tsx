import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wine, Grid3x3, List, MapPin } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { SearchBar } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { WinePhoto } from '../components/ui/WinePhoto';
import { useWineStore, type Wine as WineType } from '../stores/wine';

const wineTypeVariant = (type?: string) => {
  switch (type?.toLowerCase()) {
    case 'rouge': return 'red';
    case 'blanc': return 'white';
    case 'rosé': return 'rose';
    case 'champagne':
    case 'effervescent': return 'champagne';
    default: return 'default';
  }
};

function typeLeftBorder(type?: string): string {
  const t = type?.toLowerCase() ?? '';
  if (t.includes('rouge') || t.includes('red')) return 'border-l-wine-red/70';
  if (t.includes('blanc') || t.includes('white')) return 'border-l-wine-white/50';
  if (t.includes('rosé') || t.includes('rose')) return 'border-l-wine-rose/70';
  if (t.includes('champagne') || t.includes('mousseux') || t.includes('crémant')) return 'border-l-champagne/50';
  return 'border-l-border';
}

function gardeStatus(wine: WineType): { label: string; variant: 'success' | 'warning' | 'danger' | 'gold' | 'default' } {
  const year = new Date().getFullYear();
  if (wine.peakFrom && wine.peakUntil && year >= wine.peakFrom && year <= wine.peakUntil) {
    return { label: 'Apogée', variant: 'gold' };
  }
  if (wine.drinkUntil && year > wine.drinkUntil) {
    return { label: 'Passé', variant: 'danger' };
  }
  if (wine.drinkUntil && wine.drinkUntil <= year + 1) {
    return { label: 'À boire', variant: 'warning' };
  }
  if (wine.drinkFrom && year < wine.drinkFrom) {
    return { label: 'Garde', variant: 'default' };
  }
  return { label: 'Prêt', variant: 'success' };
}

function WineListCard({ wine }: { wine: WineType }) {
  const garde = gardeStatus(wine);
  return (
    <Link to={`/cave/${wine.id}`}>
      <div className={`flex items-center gap-3 bg-surface rounded-[var(--radius-md)] p-3 border border-border border-l-4 ${typeLeftBorder(wine.type)} hover:bg-surface-hover transition-colors active:scale-[0.99]`}>
        {wine.photoUrl ? (
          <img src={wine.photoUrl} alt="" className="w-16 h-16 rounded-[var(--radius-sm)] object-cover flex-shrink-0" />
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
          <div className="flex items-center gap-1.5 mt-1.5">
            <Badge variant={wineTypeVariant(wine.type)}>{wine.type || '?'}</Badge>
            <Badge variant={garde.variant}>{garde.label}</Badge>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className="text-sm text-text-muted font-mono">×{wine.quantity || 0}</span>
          {wine.estimatedValue && parseFloat(wine.estimatedValue) > 0 && (
            <span className="text-xs text-gold font-medium">
              {parseFloat(wine.estimatedValue).toFixed(0)}€
            </span>
          )}
          {wine.slotIds?.[0] && (
            <span className="font-mono text-[10px] text-text-muted bg-surface-active px-1.5 py-0.5 rounded">
              {wine.slotIds[0]}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function WineGridCard({ wine }: { wine: WineType }) {
  const garde = gardeStatus(wine);
  return (
    <Link to={`/cave/${wine.id}`}>
      <div className={`bg-surface rounded-[var(--radius-md)] border border-border border-t-4 ${typeLeftBorder(wine.type).replace('border-l-', 'border-t-')} overflow-hidden hover:bg-surface-hover transition-colors active:scale-[0.99]`}>
        {wine.photoUrl ? (
          <WinePhoto src={wine.photoUrl} className="aspect-[3/4]" />
        ) : (
          <div className="aspect-[3/4] bg-surface-hover flex items-center justify-center">
            <Wine size={28} className="text-text-muted" />
          </div>
        )}
        <div className="p-2.5">
          <p className="text-xs font-semibold text-text truncate">{wine.name}</p>
          <p className="text-[10px] text-text-muted mt-0.5">{wine.vintage || 'NV'}</p>
          <div className="flex items-center justify-between mt-1.5">
            <Badge variant={garde.variant}>{garde.label}</Badge>
            <span className="font-mono text-[10px] text-text-muted">×{wine.quantity || 0}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function Cave() {
  const { wines, pendingCount, fetchWines, fetchPending } = useWineStore();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  useEffect(() => {
    fetchWines();
    fetchPending();
  }, [fetchWines, fetchPending]);

  const filtered = wines.filter((w) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      w.name.toLowerCase().includes(q) ||
      w.domain?.toLowerCase().includes(q) ||
      w.appellation?.toLowerCase().includes(q) ||
      w.region?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Cave"
        subtitle={`${wines.reduce((s, w) => s + (w.quantity || 0), 0)} bouteilles`}
        action={
          <div className="flex items-center gap-1">
            <Link to="/cellar" className="p-2 rounded-[var(--radius-sm)] text-text-muted hover:text-text transition-colors">
              <MapPin size={18} />
            </Link>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-[var(--radius-sm)] transition-colors cursor-pointer ${viewMode === 'list' ? 'text-text bg-surface-hover' : 'text-text-muted'}`}
            >
              <List size={18} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-[var(--radius-sm)] transition-colors cursor-pointer ${viewMode === 'grid' ? 'text-text bg-surface-hover' : 'text-text-muted'}`}
            >
              <Grid3x3 size={18} />
            </button>
          </div>
        }
      />

      <div className="px-4 pt-4 max-w-lg mx-auto">
        {/* Pending banner */}
        {pendingCount > 0 && (
          <Link to="/pending">
            <Card hover className="mb-4 !bg-accent/10 !border-accent/30 !p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-accent-bright">
                  {pendingCount} bouteille{pendingCount > 1 ? 's' : ''} à valider
                </span>
                <Badge variant="danger" dot>{pendingCount}</Badge>
              </div>
            </Card>
          </Link>
        )}

        {/* Search */}
        <SearchBar
          placeholder="Rechercher un vin, domaine, appellation..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4"
        />

        {/* Wine list */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Wine size={48} />}
            title={search ? 'Aucun résultat' : 'Cave vide'}
            description={search ? 'Essayez un autre terme' : 'Scannez des étiquettes pour commencer'}
          />
        ) : viewMode === 'list' ? (
          <div className="flex flex-col gap-2 pb-4">
            {filtered.map((wine) => (
              <WineListCard key={wine.id} wine={wine} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 pb-4">
            {filtered.map((wine) => (
              <WineGridCard key={wine.id} wine={wine} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
