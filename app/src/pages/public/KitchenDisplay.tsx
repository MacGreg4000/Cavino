import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Wine, Search, X, ChevronLeft, ChevronRight, List } from 'lucide-react';
import { animate } from 'motion';
import type { Wine as WineType } from '../../stores/wine';
import { normalizeForSearch, matchesNormalizedSearch } from '../../lib/search-normalize';

/**
 * Vue "Cover Flow" plein écran pour tablette murale (iPad horizontal, Home Assistant…).
 *
 * Route dédiée et indépendante de /public : pas de header/max-w-2xl hérités de
 * PublicLayout, fond volontairement toujours sombre (esthétique "Cave Noire")
 * quel que soit le thème système — un présentoir mural gagne à assumer un look
 * plutôt qu'à suivre l'heure de la journée.
 *
 * Navigation : glisser au doigt, taper une pochette latérale pour y sauter,
 * taper la pochette centrale pour ouvrir la fiche complète, flèches clavier.
 */

// ── Aides type de vin (dupliquées volontairement depuis PublicWineList : pas
//    exportées là-bas, et ce composant doit rester autonome / sans risque de
//    régression sur la page mobile existante) ────────────────────────────────

function typeGlow(type?: string): string {
  const t = type?.toLowerCase() ?? '';
  if (t.includes('rouge') || t.includes('red')) return 'rgba(224, 64, 96, 0.35)';
  if (t.includes('blanc') || t.includes('white')) return 'rgba(224, 170, 64, 0.30)';
  if (t.includes('rosé') || t.includes('rose')) return 'rgba(224, 96, 130, 0.35)';
  if (t.includes('champagne') || t.includes('mousseux') || t.includes('crémant')) return 'rgba(204, 144, 64, 0.30)';
  return 'rgba(192, 56, 79, 0.25)';
}

function typeLabelColor(type?: string): string {
  const t = type?.toLowerCase() ?? '';
  if (t.includes('rouge') || t.includes('red')) return 'text-wine-red';
  if (t.includes('blanc') || t.includes('white')) return 'text-wine-white';
  if (t.includes('rosé') || t.includes('rose')) return 'text-wine-rose';
  if (t.includes('champagne') || t.includes('mousseux') || t.includes('crémant')) return 'text-champagne';
  return 'text-accent-bright';
}

const TYPE_FILTERS = [
  { label: 'Tous', value: '' },
  { label: 'Rouge', value: 'rouge' },
  { label: 'Blanc', value: 'blanc' },
  { label: 'Rosé', value: 'rosé' },
  { label: 'Bulles', value: 'champagne|crémant|mousseux|effervescent' },
];

// Nombre de pochettes rendues de chaque côté de la pochette active. Au-delà,
// invisibles derrière la pile — inutile de les garder dans le DOM (perf sur
// une collection de plusieurs centaines de bouteilles, sur tablette).
const VISIBLE_SIDE = 6;

interface CoverProps {
  wine: WineType;
  offset: number; // position relative à la pochette active (0 = centre, ±1, ±2…)
  onSelect: () => void;
}

function Cover({ wine, offset, onSelect }: CoverProps) {
  const abs = Math.abs(offset);
  const isActive = offset === 0;

  // Courbe façon macOS Cover Flow : la pochette active est de face, les
  // suivantes basculent net à ~55° puis se tassent et s'estompent au loin.
  const rotateY = offset === 0 ? 0 : offset > 0 ? -55 : 55;
  const translateX = offset === 0 ? 0 : offset > 0 ? 60 + (abs - 1) * 46 : -(60 + (abs - 1) * 46);
  const translateZ = offset === 0 ? 0 : -80 - abs * 18;
  const scale = offset === 0 ? 1 : Math.max(0.55, 0.82 - abs * 0.045);
  const opacity = abs > VISIBLE_SIDE ? 0 : Math.max(0.15, 1 - abs * 0.14);
  const zIndex = 100 - abs;

  return (
    <button
      onClick={onSelect}
      aria-label={wine.name}
      className="absolute top-1/2 left-1/2 outline-none cursor-pointer"
      style={{
        width: 'min(30vh, 260px)',
        height: 'min(30vh, 260px)',
        marginLeft: 'calc(min(30vh, 260px) / -2)',
        marginTop: 'calc(min(30vh, 260px) / -2)',
        transform: `translateX(${translateX}%) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
        transformStyle: 'preserve-3d',
        zIndex,
        opacity,
        transition: 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 420ms ease',
        willChange: 'transform, opacity',
      }}
    >
      <div
        className="relative w-full h-full rounded-md overflow-hidden bg-[#181310] border border-white/10"
        style={{
          boxShadow: isActive
            ? `0 30px 60px -15px rgba(0,0,0,0.7), 0 0 70px -10px ${typeGlow(wine.type)}`
            : '0 20px 40px -20px rgba(0,0,0,0.6)',
        }}
      >
        {wine.photoUrl ? (
          <>
            <img
              src={wine.photoUrl}
              alt=""
              aria-hidden
              className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-40"
            />
            <img
              src={wine.photoUrl}
              alt={wine.name}
              draggable={false}
              className="relative w-full h-full object-contain select-none"
            />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Wine size={48} className="text-white/20" />
          </div>
        )}
      </div>

      {/* Reflet façon Cover Flow, seulement pour la pochette active (perf).
          Volontairement court et vite estompé : la zone sous la pochette est
          étroite (le panneau d'infos commence juste en dessous). */}
      {isActive && wine.photoUrl && (
        <div
          className="absolute top-full left-0 w-full pointer-events-none opacity-40"
          style={{
            height: '35%',
            transform: 'scaleY(-1)',
            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent 90%)',
            WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent 90%)',
          }}
        >
          <img src={wine.photoUrl} alt="" aria-hidden className="w-full h-full object-cover object-top" />
        </div>
      )}
    </button>
  );
}

export function KitchenDisplay() {
  const [wines, setWines] = useState<WineType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const trackRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startIndex: number; dragging: boolean } | null>(null);
  const [dragOffset, setDragOffset] = useState(0); // décalage fractionnaire en cours de glissement

  useEffect(() => {
    document.title = 'Cavino — Cave';
    fetch('/api/public/wines')
      .then((r) => r.json())
      .then((data) => setWines(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = wines;
    if (typeFilter) {
      const alternatives = typeFilter.split('|');
      list = list.filter((w) => {
        const t = w.type?.toLowerCase() ?? '';
        return alternatives.some((a) => t.includes(a));
      });
    }
    const raw = search.trim();
    if (raw) {
      const q = normalizeForSearch(raw);
      list = list.filter(
        (w) =>
          matchesNormalizedSearch(w.name, q) ||
          matchesNormalizedSearch(w.domain, q) ||
          matchesNormalizedSearch(w.appellation, q) ||
          matchesNormalizedSearch(w.region, q)
      );
    }
    return list;
  }, [wines, search, typeFilter]);

  // Recale l'index si le filtrage réduit la liste sous l'index courant
  useEffect(() => {
    if (index > filtered.length - 1) setIndex(Math.max(0, filtered.length - 1));
  }, [filtered.length, index]);

  const goTo = useCallback(
    (target: number) => {
      const clamped = Math.max(0, Math.min(filtered.length - 1, target));
      setIndex(clamped);
    },
    [filtered.length]
  );

  // ── Navigation clavier (utile si un clavier/télécommande est un jour branché) ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') goTo(index + 1);
      if (e.key === 'ArrowLeft') goTo(index - 1);
      if (e.key === 'Escape') setSearchOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, goTo]);

  // ── Glissement tactile ──────────────────────────────────────────────────
  function onPointerDown(e: React.PointerEvent) {
    dragState.current = { startX: e.clientX, startIndex: index, dragging: true };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragState.current?.dragging || !trackRef.current) return;
    const width = trackRef.current.offsetWidth || 1;
    const deltaX = e.clientX - dragState.current.startX;
    // ~1.6 pochette traversée pour une largeur d'écran glissée
    const deltaIndex = -(deltaX / width) * 1.6;
    setDragOffset(deltaIndex);
  }

  function endDrag() {
    if (!dragState.current?.dragging) return;
    const target = Math.round(dragState.current.startIndex + dragOffset);
    dragState.current = null;
    setDragOffset(0);
    goTo(target);
  }

  const activeWine = filtered[index];

  return (
    <div className="fixed inset-0 bg-[#0A0807] text-[#F0E8DC] overflow-hidden select-none" data-theme="dark">
      {/* Vignette ambiance */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 38%, rgba(60,40,30,0.35), transparent 60%), radial-gradient(ellipse 120% 100% at 50% 100%, rgba(0,0,0,0.6), transparent)',
        }}
      />

      {/* ── Barre du haut ── */}
      <div className="relative z-20 flex items-center gap-3 px-6 pt-5">
        <Link
          to="/public"
          className="flex items-center gap-2 text-white/50 hover:text-white/90 transition-colors shrink-0"
          aria-label="Vue liste"
        >
          <List size={20} />
        </Link>

        <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto no-scrollbar">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors cursor-pointer ${
                typeFilter === f.value
                  ? 'bg-white/15 border-white/30 text-white'
                  : 'border-white/10 text-white/45 hover:text-white/80'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <span className="font-mono text-xs text-white/35 shrink-0 hidden sm:inline">
          {filtered.length ? `${index + 1} / ${filtered.length}` : '0 / 0'}
        </span>

        {searchOpen ? (
          <div className="flex items-center gap-2 bg-white/10 rounded-full pl-3 pr-1.5 py-1.5 shrink-0">
            <Search size={15} className="text-white/40" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="bg-transparent outline-none text-sm text-white placeholder:text-white/30 w-36"
            />
            <button
              onClick={() => {
                setSearch('');
                setSearchOpen(false);
              }}
              className="p-1 text-white/50 hover:text-white cursor-pointer"
              aria-label="Fermer la recherche"
            >
              <X size={15} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2 text-white/50 hover:text-white/90 transition-colors shrink-0 cursor-pointer"
            aria-label="Rechercher"
          >
            <Search size={20} />
          </button>
        )}
      </div>

      {/* ── Zone Cover Flow ── */}
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="absolute inset-x-0 top-[14%] bottom-[26%] cursor-grab active:cursor-grabbing touch-none"
        style={{ perspective: '1400px' }}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/30">
            <Wine size={40} />
            <p className="text-sm">Aucune bouteille</p>
          </div>
        )}

        {!loading &&
          filtered.map((wine, i) => {
            const offset = i - index + dragOffset;
            if (Math.abs(offset) > VISIBLE_SIDE + 1) return null;
            return (
              <Cover
                key={wine.id}
                wine={wine}
                offset={offset}
                onSelect={() => {
                  // Un simple tap sur la pochette active ouvre la fiche ; sur
                  // une pochette latérale, on s'y déplace d'abord.
                  if (Math.round(offset) === 0) {
                    window.location.href = `/public/wine/${wine.id}`;
                  } else {
                    goTo(i);
                  }
                }}
              />
            );
          })}

        {/* Flèches de navigation (souris / doigt précis) */}
        {filtered.length > 1 && (
          <>
            <button
              onClick={() => goTo(index - 1)}
              disabled={index === 0}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-[200] p-3 text-white/30 hover:text-white/80 disabled:opacity-0 transition-all cursor-pointer"
              aria-label="Précédent"
            >
              <ChevronLeft size={28} />
            </button>
            <button
              onClick={() => goTo(index + 1)}
              disabled={index === filtered.length - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-[200] p-3 text-white/30 hover:text-white/80 disabled:opacity-0 transition-all cursor-pointer"
              aria-label="Suivant"
            >
              <ChevronRight size={28} />
            </button>
          </>
        )}
      </div>

      {/* ── Fiche du vin actif ── */}
      {activeWine && (
        <InfoPanel wine={activeWine} key={activeWine.id} />
      )}
    </div>
  );
}

function InfoPanel({ wine }: { wine: WineType }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    // `y` est un raccourci propre aux composants <motion.div> React ; l'appel
    // impératif animate() sur un élément DOM attend de vraies propriétés CSS.
    animate(
      ref.current,
      { opacity: [0, 1], transform: ['translateY(10px)', 'translateY(0px)'] },
      { duration: 0.35, ease: 'easeOut' }
    );
  }, [wine.id]);

  return (
    <div
      ref={ref}
      className="absolute inset-x-0 bottom-0 z-20 px-8 pb-8 pt-6"
      style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)' }}
    >
      <div className="max-w-3xl mx-auto text-center">
        {wine.type && (
          <p className={`text-xs font-semibold tracking-[0.2em] uppercase mb-1.5 ${typeLabelColor(wine.type)}`}>
            {wine.type}
          </p>
        )}
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white leading-tight truncate">
          {wine.name}
        </h1>
        <p className="text-white/50 text-sm sm:text-base mt-1.5 truncate">
          {[wine.domain, wine.vintage || (wine.nonVintage ? 'NV' : null), wine.appellation || wine.region]
            .filter(Boolean)
            .join(' · ')}
        </p>

        <div className="flex items-center justify-center gap-4 mt-4 flex-wrap text-xs text-white/40 font-mono">
          {wine.quantity != null && <span>×{wine.quantity}</span>}
          {wine.servingTempMin != null && wine.servingTempMax != null && (
            <span>{wine.servingTempMin}–{wine.servingTempMax}°C</span>
          )}
          {wine.currentPhase && <span className="capitalize">{wine.currentPhase}</span>}
          {wine.drinkUntil && <span>garde ≤ {wine.drinkUntil}</span>}
        </div>

        <p className="text-white/25 text-xs mt-4">Toucher la pochette pour voir la fiche complète</p>
      </div>
    </div>
  );
}
