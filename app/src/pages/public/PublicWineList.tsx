import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wine, Search, Clock, List, Grid3x3 } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { WinePhoto } from '../../components/ui/WinePhoto';
import type { Wine as WineType } from '../../stores/wine';
import { normalizeForSearch, matchesNormalizedSearch } from '../../lib/search-normalize';
import { slotLabel } from '../../lib/slot-label';

function getGardeStatus(wine: WineType): { label: string; variant: 'gold' | 'default' | 'danger' | 'warning' } {
  const year = new Date().getFullYear();
  if (wine.peakFrom && wine.peakUntil && year >= wine.peakFrom && year <= wine.peakUntil) {
    return { label: 'Apogée', variant: 'gold' };
  }
  if (wine.drinkUntil && year > wine.drinkUntil) {
    return { label: 'Passé', variant: 'danger' };
  }
  if (wine.drinkFrom && year < wine.drinkFrom) {
    return { label: 'Trop tôt', variant: 'default' };
  }
  if (wine.drinkUntil && year >= (wine.drinkUntil - 1)) {
    return { label: 'À boire', variant: 'warning' };
  }
  return { label: wine.currentPhase || 'OK', variant: 'default' };
}

function typeLeftBorder(type?: string): string {
  const t = type?.toLowerCase() ?? '';
  if (t.includes('rouge') || t.includes('red'))                              return 'border-l-wine-red/50';
  if (t.includes('blanc') || t.includes('white'))                            return 'border-l-wine-white/40';
  if (t.includes('rosé')  || t.includes('rose'))                             return 'border-l-wine-rose/50';
  if (t.includes('champagne') || t.includes('mousseux') || t.includes('crémant')) return 'border-l-champagne/40';
  return 'border-l-border';
}

function typeTopBorder(type?: string): string {
  const t = type?.toLowerCase() ?? '';
  if (t.includes('rouge') || t.includes('red'))                              return 'border-t-wine-red/70';
  if (t.includes('blanc') || t.includes('white'))                            return 'border-t-wine-white/50';
  if (t.includes('rosé')  || t.includes('rose'))                             return 'border-t-wine-rose/70';
  if (t.includes('champagne') || t.includes('mousseux') || t.includes('crémant')) return 'border-t-champagne/50';
  return 'border-t-border';
}

function typeBadgeVariant(type?: string): 'red' | 'white' | 'rose' | 'champagne' | 'default' {
  const t = type?.toLowerCase() ?? '';
  if (t.includes('rouge'))    return 'red';
  if (t.includes('blanc'))    return 'white';
  if (t.includes('rosé'))     return 'rose';
  if (t.includes('champagne') || t.includes('mousseux') || t.includes('crémant')) return 'champagne';
  return 'default';
}

// ── Carte vue liste ────────────────────────────────────────────────────────────

function ListCard({ wine }: { wine: WineType }) {
  const garde = getGardeStatus(wine);
  return (
    <Link to={`/public/wine/${wine.id}`}>
      <div className={`flex items-center gap-3 bg-surface rounded-[var(--radius-md)] p-3 border-l-4 ${typeLeftBorder(wine.type)} hover:bg-surface-hover transition-colors active:scale-[0.99]`}>
        {wine.photoUrl ? (
          <WinePhoto
            src={wine.photoUrl}
            alt={wine.name}
            className="w-16 h-16 rounded-[var(--radius-sm)] flex-shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-[var(--radius-sm)] bg-surface-hover flex items-center justify-center flex-shrink-0">
            <Wine size={20} className="text-text-muted" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text truncate">{wine.name}</p>
          <p className="text-xs text-text-secondary mt-0.5 truncate">
            {wine.vintage || 'NV'}{wine.appellation ? ` · ${wine.appellation}` : wine.region ? ` · ${wine.region}` : ''}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {wine.type && <Badge variant={typeBadgeVariant(wine.type)}>{wine.type}</Badge>}
            <Badge variant={garde.variant}>{garde.label}</Badge>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="font-mono text-xs text-text-muted">×{wine.quantity ?? 0}</span>
          {wine.slotIds?.[0] && (
            <span className="font-mono text-[10px] text-text-muted bg-surface-hover px-1.5 py-0.5 rounded">
              {slotLabel(wine.slotIds[0])}
            </span>
          )}
          {wine.drinkUntil && (
            <div className="flex items-center gap-1 text-[10px] text-text-muted">
              <Clock size={10} />
              <span>≤{wine.drinkUntil}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── Carte vue tuile ────────────────────────────────────────────────────────────

function GridCard({ wine }: { wine: WineType }) {
  const garde = getGardeStatus(wine);
  return (
    <Link to={`/public/wine/${wine.id}`}>
      <div className={`bg-surface rounded-[var(--radius-md)] border border-border border-t-4 ${typeTopBorder(wine.type)} overflow-hidden hover:bg-surface-hover transition-colors active:scale-[0.99]`}>
        {wine.photoUrl ? (
          <div className="aspect-[3/4] w-full overflow-hidden">
            <WinePhoto src={wine.photoUrl} alt={wine.name} className="h-full w-full" />
          </div>
        ) : (
          <div className="aspect-[3/4] bg-surface-hover flex items-center justify-center">
            <Wine size={28} className="text-text-muted" />
          </div>
        )}
        <div className="p-2.5">
          <p className="text-xs font-semibold text-text truncate">{wine.name}</p>
          <p className="text-[10px] text-text-muted mt-0.5 truncate">
            {wine.vintage || 'NV'}{wine.appellation ? ` · ${wine.appellation}` : ''}
          </p>
          <div className="flex items-center justify-between mt-1.5 gap-1">
            <Badge variant={garde.variant}>{garde.label}</Badge>
            <span className="font-mono text-[10px] text-text-muted shrink-0">×{wine.quantity ?? 0}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Page principale ────────────────────────────────────────────────────────────

export function PublicWineList() {
  const [wines, setWines]     = useState<WineType[]>([]);
  const [filtered, setFiltered] = useState<WineType[]>([]);
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() =>
    (localStorage.getItem('public-view-mode') as 'list' | 'grid') || 'list'
  );

  const setView = (mode: 'list' | 'grid') => {
    setViewMode(mode);
    localStorage.setItem('public-view-mode', mode);
  };

  useEffect(() => {
    fetch('/api/public/wines')
      .then((r) => r.json())
      .then((data) => {
        setWines(data);
        setFiltered(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const raw = search.trim();
    if (!raw) { setFiltered(wines); return; }
    const q = normalizeForSearch(raw);
    setFiltered(
      wines.filter((w) =>
        matchesNormalizedSearch(w.name, q) ||
        matchesNormalizedSearch(w.domain, q) ||
        matchesNormalizedSearch(w.appellation, q) ||
        matchesNormalizedSearch(w.region, q)
      )
    );
  }, [search, wines]);

  return (
    <div className="px-4 pt-6 pb-10">
      {/* Titre + toggle */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-text">La cave</h2>
          <p className="text-text-muted text-sm mt-1">
            {wines.length} bouteille{wines.length !== 1 ? 's' : ''} disponible{wines.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-1 mt-1">
          <button
            onClick={() => setView('list')}
            className={`p-2 rounded-[var(--radius-sm)] transition-colors cursor-pointer ${viewMode === 'list' ? 'text-text bg-surface-hover' : 'text-text-muted hover:text-text'}`}
            aria-label="Vue liste"
          >
            <List size={18} />
          </button>
          <button
            onClick={() => setView('grid')}
            className={`p-2 rounded-[var(--radius-sm)] transition-colors cursor-pointer ${viewMode === 'grid' ? 'text-text bg-surface-hover' : 'text-text-muted hover:text-text'}`}
            aria-label="Vue tuile"
          >
            <Grid3x3 size={18} />
          </button>
        </div>
      </div>

      {/* Recherche */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un vin, domaine, appellation…"
          className="w-full bg-surface border border-border rounded-[var(--radius-md)] pl-9 pr-4 py-2.5 text-sm text-text placeholder:text-text-muted outline-none focus:border-accent/60 transition-colors"
        />
      </div>

      {/* Chargement */}
      {loading && (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Vide */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center h-40 text-text-muted gap-2">
          <Wine size={32} />
          <p className="text-sm">{search ? 'Aucun résultat' : 'Aucune bouteille disponible'}</p>
        </div>
      )}

      {/* Liste */}
      {!loading && filtered.length > 0 && viewMode === 'list' && (
        <div className="flex flex-col gap-2">
          {filtered.map((wine) => <ListCard key={wine.id} wine={wine} />)}
        </div>
      )}

      {/* Tuiles */}
      {!loading && filtered.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((wine) => <GridCard key={wine.id} wine={wine} />)}
        </div>
      )}
    </div>
  );
}
