import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wine, Search, Clock } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import type { Wine as WineType } from '../../stores/wine';

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

function typeColor(type?: string): string {
  const t = type?.toLowerCase() ?? '';
  if (t.includes('rouge') || t.includes('red')) return 'border-wine-red/50';
  if (t.includes('blanc') || t.includes('white')) return 'border-wine-white/40';
  if (t.includes('rosé') || t.includes('rose')) return 'border-wine-rose/50';
  if (t.includes('champagne') || t.includes('mousseux') || t.includes('crémant')) return 'border-champagne/40';
  return 'border-border';
}

export function PublicWineList() {
  const [wines, setWines] = useState<WineType[]>([]);
  const [filtered, setFiltered] = useState<WineType[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

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
    if (!search) {
      setFiltered(wines);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(
      wines.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          w.domain?.toLowerCase().includes(q) ||
          w.appellation?.toLowerCase().includes(q) ||
          w.region?.toLowerCase().includes(q)
      )
    );
  }, [search, wines]);

  return (
    <div className="px-4 pt-6 pb-10">
      {/* Titre */}
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold text-text">La cave</h2>
        <p className="text-text-muted text-sm mt-1">{wines.length} bouteille{wines.length !== 1 ? 's' : ''} disponible{wines.length !== 1 ? 's' : ''}</p>
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

      {loading && (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center h-40 text-text-muted gap-2">
          <Wine size={32} />
          <p className="text-sm">{search ? 'Aucun résultat' : 'Aucune bouteille disponible'}</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {filtered.map((wine) => {
          const garde = getGardeStatus(wine);
          return (
            <Link key={wine.id} to={`/public/wine/${wine.id}`}>
              <div className={`flex items-center gap-3 bg-surface rounded-[var(--radius-md)] p-3 border-l-4 ${typeColor(wine.type)} hover:bg-surface-hover transition-colors active:scale-[0.99]`}>
                {/* Photo */}
                {wine.photoUrl ? (
                  <img
                    src={wine.photoUrl}
                    alt={wine.name}
                    className="w-16 h-16 rounded-[var(--radius-sm)] object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-[var(--radius-sm)] bg-surface-hover flex items-center justify-center flex-shrink-0">
                    <Wine size={20} className="text-text-muted" />
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text truncate">{wine.name}</p>
                  <p className="text-xs text-text-secondary mt-0.5 truncate">
                    {wine.vintage || 'NV'}{wine.appellation ? ` · ${wine.appellation}` : wine.region ? ` · ${wine.region}` : ''}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {wine.type && (
                      <Badge variant={wine.type.toLowerCase().includes('rouge') ? 'red' : wine.type.toLowerCase().includes('blanc') ? 'white' : 'champagne'}>
                        {wine.type}
                      </Badge>
                    )}
                    <Badge variant={garde.variant}>{garde.label}</Badge>
                  </div>
                </div>

                {/* Quantité + emplacement */}
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="font-mono text-xs text-text-muted">×{wine.quantity ?? 0}</span>
                  {wine.slotIds?.[0] && (
                    <span className="font-mono text-[10px] text-text-muted bg-surface-hover px-1.5 py-0.5 rounded">
                      {wine.slotIds[0]}
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
        })}
      </div>
    </div>
  );
}
