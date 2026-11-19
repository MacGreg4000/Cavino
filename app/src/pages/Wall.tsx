import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Move, Check, Search, X, ZoomIn, ZoomOut, Maximize, Image as ImageIcon, RotateCw } from 'lucide-react';
import { useLocationStore, type Location, type GridSlot } from '../stores/location';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Button } from '../components/ui/Button';
import { normalizeForSearch, matchesNormalizedSearch } from '../lib/search-normalize';
import { WALL_BACKGROUNDS, getWallBackground } from '../lib/wallBackgrounds';

const BG_KEY = 'cave-wall-bg';
function loadBgId(): string {
  try { return localStorage.getItem(BG_KEY) || WALL_BACKGROUNDS[0].id; } catch { return WALL_BACKGROUNDS[0].id; }
}

/**
 * Vue "Mur" : tous les racks posés côte à côte sur un mur en brique, à
 * l'image de la réalité. Mode Organiser : on glisse les racks pour les
 * placer comme dans la cave ; la position est enregistrée par rack
 * (locations.wall_position) donc partagée entre tous les appareils.
 *
 * Les coordonnées sont "virtuelles" (px d'un mur de taille fixe) ; l'ensemble
 * est mis à l'échelle pour tenir dans l'écran (scale), les positions ne
 * dépendent donc jamais de la taille de l'écran.
 */

// ── Géométrie d'un rack (px virtuels) ───────────────────────────────────────
const CELL = 30;   // alvéole carrée
const DISC = 22;   // fond de bouteille (rond) dans l'alvéole
const GAP = 3;     // séparateurs en bois
const FRAME = 10;  // cadre en bois
const HEADER = 34; // traverse haute avec la plaquette
const SNAP = 8;
const WALL_MIN_W = 1960;
const WALL_MIN_H = 880;
const MARGIN = 50;

function rackSize(loc: Location) {
  const cfg = loc.gridConfig;
  const rows = cfg?.rows ?? 1;
  const cols = cfg?.cols ?? 1;
  return {
    w: cols * CELL + (cols - 1) * GAP + FRAME * 2,
    h: rows * CELL + (rows - 1) * GAP + FRAME * 2 + HEADER,
  };
}

// ── Teinte d'une bouteille selon son type (verre teinté, sobre) ─────────────
function bottleTint(type?: string | null): { light: string; dark: string } {
  const t = type?.toLowerCase() ?? '';
  if (t.includes('rouge') || t.includes('red')) return { light: '#9b2a41', dark: '#4a0f1c' };
  if (t.includes('blanc') || t.includes('white')) return { light: '#e6d7a0', dark: '#9a8748' };
  if (t.includes('rosé') || t.includes('rose')) return { light: '#e49aab', dark: '#a3475d' };
  if (t.includes('champagne') || t.includes('mousseux') || t.includes('crémant') || t.includes('effervescent'))
    return { light: '#e2c06a', dark: '#8d6a22' };
  if (t.includes('moelleux') || t.includes('liquoreux')) return { light: '#d9a548', dark: '#85591a' };
  return { light: '#8b8176', dark: '#403a33' };
}

interface RackProps {
  loc: Location;
  slots: GridSlot[];
  x: number;
  y: number;
  editing: boolean;
  dragging: boolean;
  query: string; // recherche normalisée
  onSlotTap: (s: GridSlot) => void;
  onOpen: () => void;
  onDragStart: (e: React.PointerEvent) => void;
}

function Rack({ loc, slots, x, y, editing, dragging, query, onSlotTap, onOpen, onDragStart }: RackProps) {
  const cfg = loc.gridConfig;
  const { w, h } = rackSize(loc);
  const accent = loc.color || '#8B1A1A';

  const byPos = useMemo(() => {
    const m = new Map<string, GridSlot>();
    for (const s of slots) {
      const k = `${s.slot.rowIndex}-${s.slot.colIndex}`;
      const ex = m.get(k);
      if (!ex || (!ex.wine && s.wine)) m.set(k, s);
    }
    return m;
  }, [slots]);

  if (!cfg) return null;

  const matches = (s?: GridSlot) =>
    !!query && !!s?.wine && (matchesNormalizedSearch(s.wine.name, query) || matchesNormalizedSearch(s.wine.domain, query));
  const rackHasMatch = !!query && slots.some((s) => matches(s));

  const shadow = dragging
    ? '0 34px 46px -10px rgba(0,0,0,0.75)'
    : '0 18px 26px -10px rgba(0,0,0,0.7), 0 3px 6px rgba(0,0,0,0.45)';
  const rings = [
    'inset 0 1px 0 rgba(255,255,255,0.18)',
    'inset 0 -2px 0 rgba(0,0,0,0.4)',
    editing ? '0 0 0 2px rgba(255,255,255,0.55)' : '',
    rackHasMatch ? '0 0 26px rgba(245,215,138,0.6)' : '',
  ].filter(Boolean).join(', ');

  return (
    <div
      onPointerDown={editing ? onDragStart : undefined}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        touchAction: editing ? 'none' : 'auto',
        cursor: editing ? (dragging ? 'grabbing' : 'grab') : 'default',
        zIndex: dragging ? 50 : 1,
        transform: dragging ? 'scale(1.03)' : undefined,
        transition: dragging ? 'none' : 'transform 150ms ease',
        borderRadius: 5,
        // Bois : fines veines + dégradé
        background:
          'repeating-linear-gradient(90deg, rgba(0,0,0,0.07) 0 1px, transparent 1px 9px), linear-gradient(180deg, #7a5736 0%, #583b22 55%, #482f1a 100%)',
        boxShadow: `${shadow}, ${rings}`,
      }}
    >
      {/* Traverse haute + plaquette laiton */}
      <div style={{ height: HEADER }} className="flex items-center justify-center">
        <button
          type="button"
          onClick={editing ? undefined : onOpen}
          className="flex items-center gap-1.5 max-w-[88%] px-3 py-[3px] rounded-[3px] text-[12px] font-semibold tracking-wide text-[#2a1c08]"
          style={{
            background: 'linear-gradient(180deg, #e3c98c 0%, #c4a35e 50%, #a8873f 100%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 0 rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.5)',
            cursor: editing ? 'inherit' : 'pointer',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accent, boxShadow: '0 0 0 1px rgba(0,0,0,0.35)' }} />
          <span className="truncate">{loc.name}</span>
        </button>
      </div>

      {/* Alvéoles : fond sombre, séparateurs = bois du cadre */}
      <div
        style={{
          margin: `0 ${FRAME}px ${FRAME}px`,
          display: 'grid',
          gridTemplateColumns: `repeat(${cfg.cols}, ${CELL}px)`,
          gap: GAP,
          pointerEvents: editing ? 'none' : 'auto',
        }}
      >
        {Array.from({ length: cfg.rows * cfg.cols }, (_, i) => {
          const r = Math.floor(i / cfg.cols);
          const c = i % cfg.cols;
          const s = byPos.get(`${r}-${c}`);
          const wine = s?.wine;
          const blocked = s?.slot.isBlocked;
          const hit = matches(s);
          const dim = !!query && !hit;
          const tint = wine ? bottleTint(wine.type) : null;
          return (
            <button
              key={i}
              type="button"
              disabled={!wine}
              onClick={() => s && wine && onSlotTap(s)}
              aria-label={wine ? wine.name : 'Vide'}
              style={{
                width: CELL,
                height: CELL,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 2,
                background: blocked ? 'transparent' : 'linear-gradient(180deg, #0b0705 0%, #1a110a 100%)',
                boxShadow: blocked ? 'none' : 'inset 0 2px 4px rgba(0,0,0,0.85), inset 0 -1px 0 rgba(255,255,255,0.05)',
                opacity: dim ? 0.22 : 1,
                transition: 'opacity 150ms',
              }}
            >
              {!blocked && tint && (
                <span
                  style={{
                    width: DISC,
                    height: DISC,
                    borderRadius: '50%',
                    background:
                      `radial-gradient(circle at 34% 28%, rgba(255,255,255,0.45) 0, rgba(255,255,255,0) 32%), ` +
                      `radial-gradient(circle at 50% 50%, ${tint.light} 0, ${tint.dark} 62%, #0a0605 66%, #0a0605 100%)`,
                    boxShadow: hit
                      ? '0 0 0 2px #F5D78A, 0 0 12px #F5D78A'
                      : '0 1px 2px rgba(0,0,0,0.7)',
                  }}
                />
              )}
              {!blocked && !tint && (
                <span
                  style={{
                    width: DISC,
                    height: DISC,
                    borderRadius: '50%',
                    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Wall() {
  const navigate = useNavigate();
  const { locations, fetchLocations, fetchGrid, updateLocation } = useLocationStore();
  const [grids, setGrids] = useState<Record<string, GridSlot[]>>({});
  const [editing, setEditing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<GridSlot | null>(null);
  const [bgId, setBgId] = useState(loadBgId);
  const [bgOpen, setBgOpen] = useState(false);
  const [portrait, setPortrait] = useState(false);
  // positions en cours d'édition / pas encore sauvegardées
  const [overrides, setOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportW, setViewportW] = useState(1200);
  const [viewportH, setViewportH] = useState(700);

  useEffect(() => {
    document.title = 'Cavino — Mur';
    fetchLocations();
  }, [fetchLocations]);

  // Grilles de tous les racks (couleurs des bouteilles)
  useEffect(() => {
    let cancelled = false;
    for (const loc of locations) {
      if (grids[loc.id] || loc.id.startsWith('offline-')) continue;
      fetchGrid(loc.id)
        .then((d) => { if (!cancelled) setGrids((g) => ({ ...g, [loc.id]: d.slots })); })
        .catch(() => {});
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, fetchGrid]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { setViewportW(el.clientWidth); setViewportH(el.clientHeight); setPortrait(window.innerHeight > window.innerWidth); });
    ro.observe(el);
    setViewportW(el.clientWidth);
    setViewportH(el.clientHeight);
    setPortrait(window.innerHeight > window.innerWidth);
    return () => ro.disconnect();
  }, []);

  // Positions effectives : enregistrée > locale > défaut (rangées qui se remplissent)
  const positions = useMemo(() => {
    const sorted = [...locations].sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
    const out: Record<string, { x: number; y: number }> = {};
    let cx = MARGIN, cy = MARGIN, rowH = 0;
    for (const loc of sorted) {
      const { w, h } = rackSize(loc);
      const saved = overrides[loc.id] ?? loc.wallPosition;
      if (saved) { out[loc.id] = saved; continue; }
      if (cx + w > WALL_MIN_W - MARGIN) { cx = MARGIN; cy += rowH + 36; rowH = 0; }
      out[loc.id] = { x: cx, y: cy };
      cx += w + 32;
      rowH = Math.max(rowH, h);
    }
    return out;
  }, [locations, overrides]);

  const wallSize = useMemo(() => {
    let maxX = WALL_MIN_W, maxY = WALL_MIN_H;
    for (const loc of locations) {
      const p = positions[loc.id];
      if (!p) continue;
      const { w, h } = rackSize(loc);
      maxX = Math.max(maxX, p.x + w + MARGIN);
      maxY = Math.max(maxY, p.y + h + MARGIN);
    }
    // Le mur remplit toujours la hauteur de l'écran (pas de bande vide dessous)
    maxY = Math.max(maxY, (viewportH * maxX) / Math.max(viewportW, 1));
    return { w: maxX, h: maxY };
  }, [locations, positions, viewportW, viewportH]);

  const fitScale = viewportW / wallSize.w;
  const scale = fitScale * zoom;
  const bg = getWallBackground(bgId);
  const pickBg = (id: string) => {
    setBgId(id);
    try { localStorage.setItem(BG_KEY, id); } catch { /* stockage indisponible */ }
    setBgOpen(false);
  };
  const query = search.trim() ? normalizeForSearch(search.trim()) : '';

  // ── Glisser-déposer ──────────────────────────────────────────────────────
  const startDrag = useCallback(
    (loc: Location) => (e: React.PointerEvent) => {
      e.preventDefault();
      const start = positions[loc.id];
      const sx = e.clientX, sy = e.clientY;
      const { w, h } = rackSize(loc);
      setDraggingId(loc.id);
      let last = start;

      const onMove = (ev: PointerEvent) => {
        const nx = Math.round((start.x + (ev.clientX - sx) / scale) / SNAP) * SNAP;
        const ny = Math.round((start.y + (ev.clientY - sy) / scale) / SNAP) * SNAP;
        last = {
          x: Math.max(0, Math.min(wallSize.w - w + MARGIN, nx)),
          y: Math.max(0, Math.min(wallSize.h - h + MARGIN, ny)),
        };
        setOverrides((o) => ({ ...o, [loc.id]: last }));
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        setDraggingId(null);
        updateLocation(loc.id, { wallPosition: last }).catch(() => {});
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [positions, scale, wallSize, updateLocation]
  );

  // Au passage en mode Organiser, fige les positions par défaut (sinon un rack
  // jamais déplacé changerait de place quand on en ajoute un autre).
  const toggleEditing = () => {
    if (!editing) {
      for (const loc of locations) {
        if (!loc.wallPosition) updateLocation(loc.id, { wallPosition: positions[loc.id] }).catch(() => {});
      }
    }
    setEditing((v) => !v);
  };

  const locationOfSlot = (s: GridSlot) => locations.find((l) => l.id === s.slot.locationId);

  return (
    <div className="fixed inset-0 bg-[#0A0807] text-[#F0E8DC] flex flex-col" data-theme="dark">
      {/* ── Barre du haut ── */}
      <div className="relative z-20 flex items-center gap-3 px-4 py-3 bg-black/60 backdrop-blur border-b border-white/10">
        <button
          onClick={() => navigate('/cellar')}
          className="flex items-center gap-1 text-white/60 hover:text-white cursor-pointer"
          aria-label="Retour"
        >
          <ChevronLeft size={20} />
        </button>
        <h1 className="font-display text-lg font-semibold">Mur de la cave</h1>
        <span className="text-xs text-white/40 font-mono hidden sm:inline">
          {locations.length} rack{locations.length > 1 ? 's' : ''}
        </span>

        <div className="flex-1" />

        {searchOpen ? (
          <div className="flex items-center gap-2 bg-white/10 rounded-full pl-3 pr-1.5 py-1">
            <Search size={14} className="text-white/40" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Trouver un vin…"
              className="bg-transparent outline-none text-sm placeholder:text-white/30 w-36"
            />
            <button onClick={() => { setSearch(''); setSearchOpen(false); }} className="p-1 text-white/50 hover:text-white cursor-pointer" aria-label="Fermer la recherche">
              <X size={14} />
            </button>
          </div>
        ) : (
          <button onClick={() => setSearchOpen(true)} className="p-2 text-white/60 hover:text-white cursor-pointer" aria-label="Rechercher">
            <Search size={18} />
          </button>
        )}

        <button onClick={() => setBgOpen(true)} className="p-2 text-white/60 hover:text-white cursor-pointer" aria-label="Changer le fond du mur"><ImageIcon size={18} /></button>

        <div className="flex items-center">
          <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} className="p-2 text-white/60 hover:text-white cursor-pointer" aria-label="Dézoomer"><ZoomOut size={18} /></button>
          <button onClick={() => setZoom(1)} className="p-2 text-white/60 hover:text-white cursor-pointer" aria-label="Ajuster à l'écran"><Maximize size={18} /></button>
          <button onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} className="p-2 text-white/60 hover:text-white cursor-pointer" aria-label="Zoomer"><ZoomIn size={18} /></button>
        </div>

        <button
          onClick={toggleEditing}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border cursor-pointer transition-colors ${
            editing ? 'bg-accent border-accent-bright text-white' : 'border-white/20 text-white/70 hover:text-white'
          }`}
        >
          {editing ? <><Check size={15} /> Terminé</> : <><Move size={15} /> Organiser</>}
        </button>
      </div>

      {editing && (
        <p className="relative z-20 text-center text-xs text-white/60 bg-black/40 py-1.5">
          Glissez chaque rack à son emplacement réel sur le mur — la position est enregistrée automatiquement.
        </p>
      )}

      {portrait && (
        <p className="relative z-20 flex items-center justify-center gap-2 text-xs text-white/70 bg-black/50 py-1.5">
          <RotateCw size={13} /> Tournez l'appareil en mode paysage pour voir le mur en grand
        </p>
      )}

      {/* ── Mur ── */}
      <div ref={viewportRef} className="flex-1 overflow-auto">
        <div style={{ width: wallSize.w * scale, height: wallSize.h * scale, position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: wallSize.w,
              height: wallSize.h,
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
              backgroundImage: `url(${bg.src})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            {/* Éclairage / vignette */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(255,210,150,0.10), transparent 65%), radial-gradient(ellipse 100% 100% at 50% 50%, transparent 55%, rgba(0,0,0,0.55))',
              }}
            />
            {locations.map((loc) => {
              const p = positions[loc.id];
              if (!p) return null;
              return (
                <Rack
                  key={loc.id}
                  loc={loc}
                  slots={grids[loc.id] ?? []}
                  x={p.x}
                  y={p.y}
                  editing={editing}
                  dragging={draggingId === loc.id}
                  query={query}
                  onSlotTap={setSelected}
                  onOpen={() => navigate(`/cellar/${loc.id}`)}
                  onDragStart={startDrag(loc)}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Choix du fond ── */}
      <BottomSheet open={bgOpen} onClose={() => setBgOpen(false)} title="Fond du mur">
        <div className="grid grid-cols-2 gap-3">
          {WALL_BACKGROUNDS.map((b) => {
            return (
              <button
                key={b.id}
                onClick={() => pickBg(b.id)}
                className={`rounded-[var(--radius-md)] overflow-hidden border-2 text-left cursor-pointer ${bgId === b.id ? 'border-accent-bright' : 'border-border'}`}
              >
                <div style={{ height: 80, backgroundImage: `url(${b.src})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                <p className="text-xs px-2 py-1.5 text-text">{b.label}</p>
              </button>
            );
          })}
        </div>
      </BottomSheet>

      {/* ── Détail d'une bouteille ── */}
      <BottomSheet open={!!selected} onClose={() => setSelected(null)} title={selected?.wine?.name || ''}>
        {selected?.wine && (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">
              {[selected.wine.domain, selected.wine.vintage || 'NV', selected.wine.type].filter(Boolean).join(' · ')}
            </p>
            <p className="text-xs text-text-muted">
              Rack : <span className="text-text">{locationOfSlot(selected)?.name ?? '—'}</span>
              {' · '}
              <span className="font-mono">{selected.slot.id}</span>
            </p>
            <Button variant="primary" className="w-full" onClick={() => navigate(`/cave/${selected.wine!.id}`)}>
              Voir la fiche
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => navigate(`/cellar/${selected.slot.locationId}`)}>
              Ouvrir le rack
            </Button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
