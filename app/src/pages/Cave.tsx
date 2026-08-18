import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wine, Grid3x3, List, MapPin, Tags, CheckSquare, Square, X } from 'lucide-react';
import { WinePhoto } from '../components/ui/WinePhoto';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { SearchBar } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import { useWineStore, type Wine as WineType } from '../stores/wine';
import { useCategoryStore } from '../stores/category';
import { normalizeForSearch, matchesNormalizedSearch } from '../lib/search-normalize';
import { slotLabel } from '../lib/slot-label';

// ── Ordre et labels des types ──────────────────────────────────────────────────

const TYPE_ORDER = [
  {
    key: 'champagne',
    label: 'Champagne & Mousseux',
    match: (t: string) =>
      t.includes('champagne') || t.includes('mousseux') || t.includes('effervescent') ||
      t.includes('crémant') || t.includes('cremant') || t.includes('pétillant') || t.includes('petillant'),
  },
  {
    key: 'blanc',
    label: 'Blancs',
    match: (t: string) => t.includes('blanc'),
  },
  {
    key: 'rosé',
    label: 'Rosés',
    match: (t: string) => t.includes('ros'),
  },
  {
    key: 'rouge',
    label: 'Rouges',
    match: (t: string) => t.includes('rouge'),
  },
  {
    key: 'moelleux',
    label: 'Moelleux & Liquoreux',
    match: (t: string) => t.includes('moelleux') || t.includes('liquoreux'),
  },
  {
    key: 'fortifié',
    label: 'Vins Fortifiés',
    match: (t: string) =>
      t.includes('fortifi') || t.includes('porto') || t.includes('xér') || t.includes('madè'),
  },
  {
    key: 'autre',
    label: 'Autres',
    match: (_: string) => true, // fallback
  },
] as const;

type TypeKey = (typeof TYPE_ORDER)[number]['key'];

function wineTypeKey(type?: string | null): TypeKey {
  const t = (type || '').toLowerCase();
  return (TYPE_ORDER.find((e) => e.match(t))?.key ?? 'autre') as TypeKey;
}

// ── Helpers visuels ────────────────────────────────────────────────────────────

const wineTypeVariant = (type?: string) => {
  const k = wineTypeKey(type);
  if (k === 'rouge')     return 'red' as const;
  if (k === 'blanc')     return 'white' as const;
  if (k === 'rosé')      return 'rose' as const;
  if (k === 'champagne') return 'champagne' as const;
  return 'default' as const;
};

function typeLeftBorder(type?: string): string {
  const k = wineTypeKey(type);
  if (k === 'rouge')     return 'border-l-wine-red/70';
  if (k === 'blanc')     return 'border-l-wine-white/50';
  if (k === 'rosé')      return 'border-l-wine-rose/70';
  if (k === 'champagne') return 'border-l-champagne/50';
  return 'border-l-border';
}

function typeTopBorder(type?: string): string {
  return typeLeftBorder(type).replace('border-l-', 'border-t-');
}

function gardeStatus(wine: WineType): { label: string; variant: 'success' | 'warning' | 'danger' | 'gold' | 'default' } {
  const year = new Date().getFullYear();
  if (wine.peakFrom && wine.peakUntil && year >= wine.peakFrom && year <= wine.peakUntil)
    return { label: 'Apogée', variant: 'gold' };
  if (wine.drinkUntil && year > wine.drinkUntil)
    return { label: 'Passé', variant: 'danger' };
  if (wine.drinkUntil && wine.drinkUntil <= year + 1)
    return { label: 'À boire', variant: 'warning' };
  if (wine.drinkFrom && year < wine.drinkFrom)
    return { label: 'Garde', variant: 'default' };
  return { label: 'Prêt', variant: 'success' };
}

// ── Cartes ─────────────────────────────────────────────────────────────────────

function WineListCard({ wine, selectMode, selected, onToggleSelect }: {
  wine: WineType;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const garde = gardeStatus(wine);
  const inner = (
    <div className={`flex items-center gap-3 bg-surface rounded-[var(--radius-md)] p-3 border border-border border-l-4 ${typeLeftBorder(wine.type)} ${selected ? '!border-accent !bg-accent/10' : 'hover:bg-surface-hover'} transition-colors active:scale-[0.99]`}>
        {selectMode && (
          selected
            ? <CheckSquare size={20} className="text-accent-bright shrink-0" />
            : <Square size={20} className="text-text-muted shrink-0" />
        )}
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
              {slotLabel(wine.slotIds[0])}
            </span>
          )}
        </div>
      </div>
  );

  if (selectMode) {
    return (
      <button type="button" onClick={onToggleSelect} className="w-full text-left cursor-pointer">
        {inner}
      </button>
    );
  }
  return <Link to={`/cave/${wine.id}`}>{inner}</Link>;
}

function WineGridCard({ wine, selectMode, selected, onToggleSelect }: {
  wine: WineType;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const garde = gardeStatus(wine);
  const inner = (
    <div className={`relative bg-surface rounded-[var(--radius-md)] border border-border border-t-4 ${typeTopBorder(wine.type)} overflow-hidden ${selected ? '!border-accent' : 'hover:bg-surface-hover'} transition-colors active:scale-[0.99]`}>
        {selectMode && (
          <div className="absolute top-1.5 right-1.5 z-10 bg-bg/80 backdrop-blur rounded-full p-0.5">
            {selected
              ? <CheckSquare size={18} className="text-accent-bright" />
              : <Square size={18} className="text-text-muted" />}
          </div>
        )}
        {wine.photoUrl ? (
          <div className="aspect-[3/4] w-full overflow-hidden">
            <WinePhoto src={wine.photoUrl} alt="" className="h-full w-full" />
          </div>
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
  );

  if (selectMode) {
    return (
      <button type="button" onClick={onToggleSelect} className="w-full text-left cursor-pointer">
        {inner}
      </button>
    );
  }
  return <Link to={`/cave/${wine.id}`}>{inner}</Link>;
}

// ── En-tête de section ─────────────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 pt-1 pb-0.5">
      <span className="text-xs font-semibold text-text-secondary tracking-wide uppercase">
        {label}
      </span>
      <span className="text-[10px] font-mono text-text-muted">{count}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ── Page Cave ──────────────────────────────────────────────────────────────────

export function Cave() {
  const { wines, pendingCount, fetchWines, fetchPending } = useWineStore();
  const { categories, fetchCategories, bulkAssign } = useCategoryStore();
  const { toast } = useToast();
  const [search, setSearch]       = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeKey | ''>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [viewMode, setViewMode]   = useState<'list' | 'grid'>('list');

  // ── Mode sélection : réattribution en masse de bouteilles déjà en cave ───────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    fetchWines();
    fetchPending();
    fetchCategories();
  }, [fetchWines, fetchPending, fetchCategories]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setBulkCategoryId('');
  };

  const handleBulkApply = async (action: 'add' | 'remove') => {
    if (!bulkCategoryId || selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await bulkAssign(Array.from(selectedIds), bulkCategoryId, action);
      await fetchWines();
      const catName = categories.find((c) => c.id === bulkCategoryId)?.name ?? '';
      toast('success', action === 'add'
        ? `"${catName}" ajoutée à ${selectedIds.size} bouteille${selectedIds.size > 1 ? 's' : ''}`
        : `"${catName}" retirée de ${selectedIds.size} bouteille${selectedIds.size > 1 ? 's' : ''}`);
      exitSelectMode();
    } catch {
      toast('error', 'La réattribution a échoué');
    }
    setBulkBusy(false);
  };

  // ── Filtrage + tri ───────────────────────────────────────────────────────────

  const filtered = wines
    .filter((w) => {
      // Filtre type
      if (typeFilter && wineTypeKey(w.type) !== typeFilter) return false;
      // Filtre sous-catégorie
      if (categoryFilter && !(w.categoryIds ?? []).includes(categoryFilter)) return false;
      // Filtre texte
      const raw = search.trim();
      if (!raw) return true;
      const q = normalizeForSearch(raw);
      return (
        matchesNormalizedSearch(w.name, q) ||
        matchesNormalizedSearch(w.domain, q) ||
        matchesNormalizedSearch(w.appellation, q) ||
        matchesNormalizedSearch(w.region, q)
      );
    })
    .sort((a, b) => {
      const ia = TYPE_ORDER.findIndex((e) => e.key === wineTypeKey(a.type));
      const ib = TYPE_ORDER.findIndex((e) => e.key === wineTypeKey(b.type));
      if (ia !== ib) return ia - ib;
      // Au sein du même type : millésime desc, puis nom asc
      const va = a.vintage ?? 9999;
      const vb = b.vintage ?? 9999;
      if (va !== vb) return vb - va;
      return (a.name || '').localeCompare(b.name || '', 'fr');
    });

  // Groupes pour les section headers (actifs seulement si pas de filtre actif)
  const showSections = !typeFilter && !categoryFilter;
  const groups = showSections
    ? TYPE_ORDER.map((entry) => ({
        key:   entry.key,
        label: entry.label,
        wines: filtered.filter((w) => wineTypeKey(w.type) === entry.key),
      })).filter((g) => g.wines.length > 0)
    : [{ key: '', label: '', wines: filtered }];

  // Pills de filtre : uniquement les types présents dans la cave
  const availableTypes = TYPE_ORDER.filter((entry) =>
    wines.some((w) => wineTypeKey(w.type) === entry.key)
  );

  return (
    <div>
      <PageHeader
        title="Cave"
        subtitle={`${wines.reduce((s, w) => s + (w.quantity || 0), 0)} bouteilles`}
        action={
          <div className="flex items-center gap-1">
            {selectMode ? (
              <button
                onClick={exitSelectMode}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium text-text-muted hover:text-text transition-colors cursor-pointer"
              >
                <X size={16} /> Annuler
              </button>
            ) : (
              <button
                onClick={() => setSelectMode(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium text-text-muted hover:text-text transition-colors cursor-pointer"
                aria-label="Sélectionner des bouteilles"
                title="Sélectionner des bouteilles (réattribuer une sous-catégorie)"
              >
                <CheckSquare size={16} />
              </button>
            )}
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

        {/* Recherche */}
        <SearchBar
          placeholder="Rechercher un vin, domaine, appellation..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2"
        />

        {/* Pills de filtre par type */}
        {availableTypes.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-3 no-scrollbar -mx-4 px-4">
            <button
              onClick={() => setTypeFilter('')}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                typeFilter === ''
                  ? 'bg-accent/20 text-accent-bright border-accent/40'
                  : 'bg-surface-hover text-text-muted border-border hover:text-text'
              }`}
            >
              Tous
            </button>
            {availableTypes.map((entry) => (
              <button
                key={entry.key}
                onClick={() => setTypeFilter(typeFilter === entry.key ? '' : entry.key)}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                  typeFilter === entry.key
                    ? 'bg-accent/20 text-accent-bright border-accent/40'
                    : 'bg-surface-hover text-text-muted border-border hover:text-text'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        )}

        {/* Pills de filtre par sous-catégorie */}
        {categories.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-3 no-scrollbar -mx-4 px-4">
            <Tags size={13} className="text-text-muted shrink-0" />
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(categoryFilter === cat.id ? '' : cat.id)}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                  categoryFilter === cat.id
                    ? 'bg-accent/20 text-accent-bright border-accent/40'
                    : 'bg-surface-hover text-text-muted border-border hover:text-text'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Résultats */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Wine size={48} />}
            title={search || typeFilter || categoryFilter ? 'Aucun résultat' : 'Cave vide'}
            description={search || typeFilter || categoryFilter ? 'Modifiez votre recherche ou filtre' : 'Scannez des étiquettes pour commencer'}
          />
        ) : viewMode === 'list' ? (
          <div className="flex flex-col gap-2 pb-4">
            {groups.map((group) => (
              <div key={group.key}>
                {showSections && <SectionHeader label={group.label} count={group.wines.length} />}
                {group.wines.map((wine) => (
                  <WineListCard
                    key={wine.id}
                    wine={wine}
                    selectMode={selectMode}
                    selected={selectedIds.has(wine.id)}
                    onToggleSelect={() => toggleSelected(wine.id)}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="pb-4 space-y-3">
            {groups.map((group) => (
              <div key={group.key}>
                {showSections && <SectionHeader label={group.label} count={group.wines.length} />}
                <div className="grid grid-cols-2 gap-3 mt-1">
                  {group.wines.map((wine) => (
                    <WineGridCard
                      key={wine.id}
                      wine={wine}
                      selectMode={selectMode}
                      selected={selectedIds.has(wine.id)}
                      onToggleSelect={() => toggleSelected(wine.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Espace pour ne pas passer sous la barre flottante */}
        {selectMode && selectedIds.size > 0 && <div className="h-32" />}
      </div>

      {/* Barre flottante de réattribution en masse */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-30 bg-bg/95 backdrop-blur border-t border-border px-4 py-3">
          <div className="max-w-lg mx-auto space-y-2.5">
            <p className="text-xs text-text-secondary">
              <span className="font-semibold text-text">{selectedIds.size}</span> bouteille{selectedIds.size > 1 ? 's' : ''} sélectionnée{selectedIds.size > 1 ? 's' : ''}
            </p>
            <div className="flex gap-2">
              <select
                value={bulkCategoryId}
                onChange={(e) => setBulkCategoryId(e.target.value)}
                className="flex-1 bg-surface-hover border border-border rounded-[var(--radius-sm)] px-3 py-2 text-sm text-text outline-none focus:border-accent/50"
              >
                <option value="">Choisir une sous-catégorie…</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <Button
                variant="primary"
                size="sm"
                disabled={!bulkCategoryId || bulkBusy}
                loading={bulkBusy}
                onClick={() => handleBulkApply('add')}
              >
                Ajouter
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!bulkCategoryId || bulkBusy}
                onClick={() => handleBulkApply('remove')}
              >
                Retirer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
