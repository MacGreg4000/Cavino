import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wine, GlassWater, Calendar, Star } from 'lucide-react';
import { WinePhoto } from '../components/ui/WinePhoto';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { SearchBar } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { apiFetch } from '../lib/api';
import { normalizeForSearch, matchesNormalizedSearch } from '../lib/search-normalize';
import type { Wine as WineType } from '../stores/wine';

function typeLeftBorder(type?: string): string {
  const t = type?.toLowerCase() ?? '';
  if (t.includes('rouge') || t.includes('red')) return 'border-l-wine-red/70';
  if (t.includes('blanc') || t.includes('white')) return 'border-l-wine-white/50';
  if (t.includes('rosé') || t.includes('rose')) return 'border-l-wine-rose/70';
  if (t.includes('champagne') || t.includes('mousseux') || t.includes('crémant')) return 'border-l-champagne/50';
  return 'border-l-border';
}

function wineTypeVariant(type?: string) {
  const t = type?.toLowerCase() ?? '';
  if (t.includes('rouge')) return 'red' as const;
  if (t.includes('blanc')) return 'white' as const;
  if (t.includes('rosé') || t.includes('rose')) return 'rose' as const;
  if (t.includes('champagne') || t.includes('mousseux') || t.includes('crémant')) return 'champagne' as const;
  return 'default' as const;
}

function formatConsumedDate(dateStr?: string): string {
  if (!dateStr) return 'Date inconnue';
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function ConsumedWineCard({ wine }: { wine: WineType }) {
  const consumedDate = formatConsumedDate(wine.updatedAt);
  return (
    <Link to={`/cave/${wine.id}`}>
      <div
        className={`flex items-center gap-3 bg-surface rounded-[var(--radius-md)] p-3 border border-border border-l-4 ${typeLeftBorder(wine.type)} hover:bg-surface-hover transition-colors active:scale-[0.99] opacity-80 hover:opacity-100`}
      >
        {wine.photoUrl ? (
          <WinePhoto src={wine.photoUrl} className="w-16 h-16 rounded-[var(--radius-sm)] flex-shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded-[var(--radius-sm)] bg-surface-hover flex items-center justify-center flex-shrink-0">
            <GlassWater size={20} className="text-text-muted" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text truncate">{wine.name}</p>
          <p className="text-xs text-text-secondary truncate mt-0.5">
            {wine.domain && `${wine.domain} · `}{wine.vintage || 'NV'}
            {wine.appellation && ` · ${wine.appellation}`}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <Badge variant={wineTypeVariant(wine.type)}>{wine.type || '?'}</Badge>
            <Badge variant="danger">Débouchée</Badge>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 flex-shrink-0 text-right">
          <div className="flex items-center gap-1 text-text-muted">
            <Calendar size={10} />
            <span className="text-[10px] font-mono">{consumedDate}</span>
          </div>
          {wine.personalRating != null && wine.personalRating > 0 && (
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  size={10}
                  className={s <= (wine.personalRating ?? 0) ? 'fill-gold text-gold' : 'fill-transparent text-border'}
                />
              ))}
            </div>
          )}
          {wine.tastingNotes && (
            <p className="text-[10px] text-text-muted italic max-w-[120px] truncate">{wine.tastingNotes}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

export function ConsumedWines() {
  const [wines, setWines] = useState<WineType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiFetch('/api/wines?status=consumed')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: WineType[]) => {
        // Trier par date de consommation décroissante (updatedAt)
        const sorted = [...data].sort((a, b) => {
          const da = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const db = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return db - da;
        });
        setWines(sorted);
      })
      .catch(() => setWines([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = wines.filter((w) => {
    const raw = search.trim();
    if (!raw) return true;
    const q = normalizeForSearch(raw);
    return (
      matchesNormalizedSearch(w.name, q) ||
      matchesNormalizedSearch(w.domain, q) ||
      matchesNormalizedSearch(w.appellation, q) ||
      matchesNormalizedSearch(w.region, q)
    );
  });

  // Grouper par année de consommation
  const byYear = filtered.reduce<Record<string, WineType[]>>((acc, w) => {
    const year = w.updatedAt
      ? new Date(w.updatedAt).getFullYear().toString()
      : 'Inconnue';
    if (!acc[year]) acc[year] = [];
    acc[year].push(w);
    return acc;
  }, {});

  const years = Object.keys(byYear).sort((a, b) => Number(b) - Number(a));

  return (
    <div>
      <PageHeader
        title="Historique"
        subtitle={wines.length > 0 ? `${wines.length} bouteille${wines.length > 1 ? 's' : ''} débouchée${wines.length > 1 ? 's' : ''}` : undefined}
      />

      <div className="px-4 pt-4 max-w-lg mx-auto pb-8">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-text-muted">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : wines.length === 0 ? (
          <EmptyState
            icon={<GlassWater size={48} />}
            title="Aucune bouteille débouchée"
            description="Les bouteilles que vous débouchez apparaîtront ici"
          />
        ) : (
          <>
            <SearchBar
              placeholder="Rechercher dans l'historique…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-4"
            />

            {filtered.length === 0 ? (
              <EmptyState
                icon={<Wine size={48} />}
                title="Aucun résultat"
                description="Essayez un autre terme"
              />
            ) : (
              <div className="space-y-6">
                {years.map((year) => (
                  <div key={year}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-text-secondary tracking-widest uppercase">{year}</span>
                      <span className="text-[10px] text-text-muted font-mono">
                        · {byYear[year].length} bouteille{byYear[year].length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {byYear[year].map((wine) => (
                        <ConsumedWineCard key={wine.id} wine={wine} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
