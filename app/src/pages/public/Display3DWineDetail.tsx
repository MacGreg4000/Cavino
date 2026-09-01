import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Thermometer, Clock, GlassWater, Grape, Award,
  UtensilsCrossed, Star, Wine, MapPin, XCircle,
} from 'lucide-react';
import { animate } from 'motion';
import { Badge } from '../../components/ui/Badge';
import type { Wine as WineType } from '../../stores/wine';

/**
 * Fiche vin en mode paysage, dans l'esthétique de la vue Cover Flow (Display3D).
 * Accessible depuis /public/display3d/wine/:id — pas de PublicLayout, fond sombre
 * fixe, mise en page deux colonnes (photo | détails).
 */

// ── Helpers couleur (reprises de Display3D) ─────────────────────────────────

function typeGlow(type?: string): string {
  const t = type?.toLowerCase() ?? '';
  if (t.includes('rouge') || t.includes('red')) return 'rgba(224, 64, 96, 0.4)';
  if (t.includes('blanc') || t.includes('white')) return 'rgba(224, 170, 64, 0.35)';
  if (t.includes('rosé') || t.includes('rose')) return 'rgba(224, 96, 130, 0.4)';
  if (t.includes('champagne') || t.includes('mousseux') || t.includes('crémant')) return 'rgba(204, 144, 64, 0.35)';
  return 'rgba(192, 56, 79, 0.30)';
}

function typeLabelColor(type?: string): string {
  const t = type?.toLowerCase() ?? '';
  if (t.includes('rouge') || t.includes('red')) return '#E04060';
  if (t.includes('blanc') || t.includes('white')) return '#D4AA40';
  if (t.includes('rosé') || t.includes('rose')) return '#E06082';
  if (t.includes('champagne') || t.includes('mousseux') || t.includes('crémant')) return '#CC9040';
  return '#C0384F';
}

function typeBorderColor(type?: string): string {
  const t = type?.toLowerCase() ?? '';
  if (t.includes('rouge') || t.includes('red')) return '#E04060';
  if (t.includes('blanc') || t.includes('white')) return '#D4AA40';
  if (t.includes('rosé') || t.includes('rose')) return '#E06082';
  if (t.includes('champagne') || t.includes('mousseux') || t.includes('crémant')) return '#CC9040';
  return '#C0384F';
}

// ── Sous-composants ──────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-white/35 mb-2">
      {children}
    </p>
  );
}

function Chip({ children, color = 'default' }: { children: React.ReactNode; color?: 'default' | 'gold' | 'red' | 'rose' | 'champagne' | 'danger' }) {
  const colors = {
    default: 'bg-white/8 text-white/60 border-white/12',
    gold:    'bg-[#D4AA40]/15 text-[#D4AA40] border-[#D4AA40]/25',
    red:     'bg-[#E04060]/15 text-[#E04060] border-[#E04060]/25',
    rose:    'bg-[#E06082]/15 text-[#E06082] border-[#E06082]/25',
    champagne: 'bg-[#CC9040]/15 text-[#CC9040] border-[#CC9040]/25',
    danger:  'bg-red-500/15 text-red-400 border-red-500/25',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] border ${colors[color]}`}>
      {children}
    </span>
  );
}

function GardeBar({ wine }: { wine: WineType }) {
  const year = new Date().getFullYear();
  const from = wine.drinkFrom || wine.vintage || year;
  const until = wine.drinkUntil || year + 20;
  const range = until - from;
  if (range <= 0) return null;

  const position = Math.max(0, Math.min(100, ((year - from) / range) * 100));
  const peakStart = wine.peakFrom ? ((wine.peakFrom - from) / range) * 100 : 0;
  const peakEnd = wine.peakUntil ? ((wine.peakUntil - from) / range) * 100 : 100;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <SectionTitle>Garde</SectionTitle>
        {wine.currentPhase && (
          <span className="text-[10px] text-[#D4AA40] capitalize">{wine.currentPhase}</span>
        )}
      </div>
      <div className="relative h-3 bg-white/8 rounded-full overflow-hidden mb-1.5">
        <div
          className="absolute top-0 h-full bg-[#D4AA40]/20 rounded-full"
          style={{ left: `${peakStart}%`, width: `${peakEnd - peakStart}%` }}
        />
        <div
          className="absolute top-0 w-0.5 h-full bg-white/80 rounded-full"
          style={{ left: `${position}%`, boxShadow: '0 0 8px rgba(255,255,255,0.5)' }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-white/25 font-mono">
        <span>{from}</span>
        {wine.peakFrom && <span className="text-[#D4AA40]/70">Apogée {wine.peakFrom}–{wine.peakUntil}</span>}
        <span>{until}</span>
      </div>
    </div>
  );
}

// ── Page principale ──────────────────────────────────────────────────────────

export function Display3DWineDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [wine, setWine] = useState<WineType | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch('/api/public/categories')
      .then((r) => r.json())
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/public/wines/${id}`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((data) => {
        if (data) { setWine(data); document.title = `Cavino — ${data.name}`; }
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [id]);

  // Animation d'entrée sur le panneau droit
  useEffect(() => {
    if (!wine) return;
    const el = document.getElementById('d3d-detail-panel');
    if (!el) return;
    animate(el, { opacity: [0, 1], transform: ['translateX(18px)', 'translateX(0px)'] }, { duration: 0.45, ease: 'easeOut' });
  }, [wine]);

  // ── États de chargement / erreur ─────────────────────────────────────────

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#0A0807] flex items-center justify-center" data-theme="dark">
        <div className="w-8 h-8 border-2 border-white/25 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !wine) {
    return (
      <div className="fixed inset-0 bg-[#0A0807] flex flex-col items-center justify-center gap-4 text-white/40" data-theme="dark">
        <XCircle size={48} />
        <p className="text-sm">Bouteille introuvable</p>
        <button
          onClick={() => navigate('/public/display3d')}
          className="text-white/60 hover:text-white text-sm underline cursor-pointer transition-colors"
        >
          Retour à la cave
        </button>
      </div>
    );
  }

  const accentColor = typeLabelColor(wine.type);
  const borderColor = typeBorderColor(wine.type);
  const glowColor = typeGlow(wine.type);

  const hasPairings = !!(wine.pairingsIdeal?.length || wine.pairingsGood?.length || wine.cheesePairings?.length || wine.pairingsAvoid?.length);
  const hasAromas = !!(wine.aromaPrimary?.length || wine.aromaSecondary?.length || wine.aromaTertiary?.length);

  return (
    <div
      className="fixed inset-0 bg-[#0A0807] text-[#F0E8DC] overflow-hidden"
      data-theme="dark"
    >
      {/* Vignette ambiance (reprise de Display3D) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 38%, rgba(60,40,30,0.35), transparent 60%), radial-gradient(ellipse 120% 100% at 50% 100%, rgba(0,0,0,0.6), transparent)',
        }}
      />

      {/* Bouton retour */}
      <button
        onClick={() => navigate('/public/display3d')}
        className="absolute top-5 left-5 z-30 flex items-center gap-2 text-white/40 hover:text-white/90 transition-colors cursor-pointer"
        aria-label="Retour à la cave"
      >
        <ChevronLeft size={22} />
        <span className="text-sm">Cave</span>
      </button>

      {/* ── Mise en page deux colonnes ─────────────────────────────────── */}
      <div className="relative z-10 h-full flex">

        {/* Colonne gauche — photo */}
        <div className="relative flex-none w-[38%] h-full flex items-center justify-center">
          {/* Halo coloré derrière la photo */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse 70% 70% at 50% 50%, ${glowColor}, transparent 65%)`,
            }}
          />

          {wine.photoUrl ? (
            <div className="relative z-10 w-[55%] max-w-[280px]" style={{ filter: `drop-shadow(0 30px 60px ${glowColor})` }}>
              {/* Fond flouté */}
              <img
                src={wine.photoUrl}
                alt=""
                aria-hidden
                className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-30 scale-110"
              />
              {/* Photo nette */}
              <img
                src={wine.photoUrl}
                alt={wine.name}
                className="relative w-full object-contain"
                style={{ maxHeight: '72vh' }}
              />
            </div>
          ) : (
            <div className="relative z-10 flex items-center justify-center w-[55%] max-w-[280px] aspect-[1/3] rounded-xl bg-white/4 border border-white/8">
              <Wine size={64} className="text-white/15" />
            </div>
          )}

          {/* Reflet */}
          {wine.photoUrl && (
            <div
              className="absolute bottom-[12%] left-1/2 -translate-x-1/2 w-[55%] max-w-[280px] opacity-20 pointer-events-none"
              style={{
                height: '18vh',
                transform: 'translateX(-50%) scaleY(-1)',
                maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent 80%)',
                WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent 80%)',
              }}
            >
              <img src={wine.photoUrl} alt="" aria-hidden className="w-full h-full object-cover object-top" />
            </div>
          )}
        </div>

        {/* Séparateur vertical */}
        <div className="flex-none w-px bg-white/6 self-stretch my-8" />

        {/* Colonne droite — informations */}
        <div
          id="d3d-detail-panel"
          className="flex-1 min-w-0 overflow-y-auto py-12 px-10"
          style={{ scrollbarWidth: 'none' }}
        >
          {/* Identité */}
          <div className="mb-8">
            {wine.type && (
              <p
                className="text-xs font-semibold tracking-[0.22em] uppercase mb-2"
                style={{ color: accentColor }}
              >
                {wine.type}
              </p>
            )}
            <h1
              className="font-display text-4xl font-bold text-white leading-tight mb-1"
              style={{ borderLeft: `3px solid ${borderColor}`, paddingLeft: '1rem' }}
            >
              {wine.name}
            </h1>
            {wine.domain && (
              <p className="text-white/55 text-base mt-1 pl-5">{wine.domain}</p>
            )}
            <p className="text-white/35 text-sm mt-0.5 pl-5 font-mono">
              {[wine.vintage || 'Non millésimé', wine.appellation, wine.classification]
                .filter(Boolean)
                .join(' · ')}
            </p>

            {/* Badges */}
            <div className="flex flex-wrap gap-1.5 mt-4 pl-5">
              {wine.classification && <Chip color="gold">{wine.classification}</Chip>}
              {wine.categoryIds?.map((catId) => {
                const cat = categories.find((c) => c.id === catId);
                return cat ? <Chip key={catId}>{cat.name}</Chip> : null;
              })}
              {!!wine.slotIds?.length && wine.slotIds.map((slotId) => (
                <span key={slotId} className="inline-flex items-center gap-1 bg-white/6 border border-white/10 rounded px-2 py-0.5">
                  <MapPin size={10} className="text-white/30" />
                  <span className="font-mono text-[11px] text-white/50">{slotId}</span>
                </span>
              ))}
              {wine.quantity != null && (
                <span className="font-mono text-sm text-white/30 ml-1">×{wine.quantity}</span>
              )}
            </div>
          </div>

          {/* Grille 2 colonnes pour le contenu détaillé */}
          <div className="grid grid-cols-2 gap-x-10 gap-y-7">

            {/* Description */}
            {(wine.description || wine.style) && (
              <div className="col-span-2">
                <SectionTitle>Description</SectionTitle>
                <p className="text-white/65 text-sm leading-relaxed">{wine.description}</p>
                {wine.style && <p className="text-[#D4AA40]/70 text-xs italic mt-1.5">{wine.style}</p>}
              </div>
            )}

            {/* En bouche */}
            {wine.palate && (
              <div>
                <SectionTitle>En bouche</SectionTitle>
                <p className="text-white/65 text-sm leading-relaxed">{wine.palate}</p>
              </div>
            )}

            {/* Millésime */}
            {wine.vintageNotes && (
              <div>
                <SectionTitle>Millésime {wine.vintage}</SectionTitle>
                <p className="text-white/65 text-sm leading-relaxed">{wine.vintageNotes}</p>
              </div>
            )}

            {/* Service */}
            {(wine.servingTempMin || wine.glassType || wine.decanting) && (
              <div>
                <SectionTitle>
                  <span className="flex items-center gap-1.5">
                    <GlassWater size={10} />
                    Service
                  </span>
                </SectionTitle>
                <div className="flex flex-wrap gap-4 text-sm text-white/55">
                  {wine.servingTempMin && (
                    <span className="flex items-center gap-1.5">
                      <Thermometer size={13} className="text-white/30" />
                      {wine.servingTempMin}–{wine.servingTempMax}°C
                    </span>
                  )}
                  {wine.glassType && (
                    <span className="flex items-center gap-1.5">
                      <GlassWater size={13} className="text-white/30" />
                      {wine.glassType}
                    </span>
                  )}
                  {wine.decanting && (
                    <span className="text-xs text-white/40">
                      Carafage{wine.decantingTime ? ` ${wine.decantingTime} min` : ''}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Garde */}
            {(wine.drinkFrom || wine.drinkUntil || wine.vintage) && (
              <div>
                <GardeBar wine={wine} />
                {wine.agingNotes && (
                  <p className="text-white/40 text-xs mt-2 leading-relaxed">{wine.agingNotes}</p>
                )}
              </div>
            )}

            {/* Arômes */}
            {hasAromas && (
              <div className="col-span-2">
                <SectionTitle>
                  <span className="flex items-center gap-1.5">
                    <Grape size={10} />
                    Arômes
                  </span>
                </SectionTitle>
                <div className="space-y-2">
                  {!!wine.aromaPrimary?.length && (
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[10px] text-white/25 uppercase tracking-wider shrink-0">Primaires</span>
                      <div className="flex flex-wrap gap-1">{wine.aromaPrimary.map((a, i) => <Chip key={i} color="red">{a}</Chip>)}</div>
                    </div>
                  )}
                  {!!wine.aromaSecondary?.length && (
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[10px] text-white/25 uppercase tracking-wider shrink-0">Secondaires</span>
                      <div className="flex flex-wrap gap-1">{wine.aromaSecondary.map((a, i) => <Chip key={i} color="gold">{a}</Chip>)}</div>
                    </div>
                  )}
                  {!!wine.aromaTertiary?.length && (
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[10px] text-white/25 uppercase tracking-wider shrink-0">Tertiaires</span>
                      <div className="flex flex-wrap gap-1">{wine.aromaTertiary.map((a, i) => <Chip key={i} color="champagne">{a}</Chip>)}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Accords mets-vins */}
            {hasPairings && (
              <div className="col-span-2">
                <SectionTitle>
                  <span className="flex items-center gap-1.5">
                    <UtensilsCrossed size={10} />
                    Accords mets-vins
                  </span>
                </SectionTitle>
                <div className="space-y-2">
                  {!!wine.pairingsIdeal?.length && (
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[10px] text-[#D4AA40]/50 uppercase tracking-wider shrink-0">Idéal</span>
                      <div className="flex flex-wrap gap-1">{wine.pairingsIdeal.map((p, i) => <Chip key={i} color="gold">{p}</Chip>)}</div>
                    </div>
                  )}
                  {!!wine.pairingsGood?.length && (
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[10px] text-white/25 uppercase tracking-wider shrink-0">Bon accord</span>
                      <div className="flex flex-wrap gap-1">{wine.pairingsGood.map((p, i) => <Chip key={i}>{p}</Chip>)}</div>
                    </div>
                  )}
                  {!!wine.cheesePairings?.length && (
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[10px] text-[#CC9040]/50 uppercase tracking-wider shrink-0">Fromages</span>
                      <div className="flex flex-wrap gap-1">{wine.cheesePairings.map((p, i) => <Chip key={i} color="champagne">{p}</Chip>)}</div>
                    </div>
                  )}
                  {!!wine.pairingsAvoid?.length && (
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[10px] text-red-400/50 uppercase tracking-wider shrink-0">À éviter</span>
                      <div className="flex flex-wrap gap-1">{wine.pairingsAvoid.map((p, i) => <Chip key={i} color="danger">{p}</Chip>)}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Récompenses */}
            {!!wine.awards?.length && (
              <div>
                <SectionTitle>
                  <span className="flex items-center gap-1.5">
                    <Award size={10} />
                    Récompenses
                  </span>
                </SectionTitle>
                <div className="space-y-1.5">
                  {wine.awards.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-white/55">
                      <Chip color="gold">{a.medal || 'Récompense'}</Chip>
                      <span>{a.name}{a.year ? ` (${a.year})` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Note personnelle */}
            {wine.personalRating != null && wine.personalRating > 0 && (
              <div>
                <SectionTitle>
                  <span className="flex items-center gap-1.5">
                    <Star size={10} />
                    Note personnelle
                  </span>
                </SectionTitle>
                <div className="flex gap-1 mb-1.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={18}
                      className={star <= (wine.personalRating ?? 0) ? 'text-[#D4AA40] fill-[#D4AA40]' : 'text-white/15 fill-transparent'}
                    />
                  ))}
                </div>
                {wine.tastingNotes && (
                  <p className="text-xs text-white/40 leading-relaxed italic">{wine.tastingNotes}</p>
                )}
              </div>
            )}

            {/* Valeur estimée */}
            {wine.estimatedValue && (
              <div>
                <SectionTitle>Valeur estimée</SectionTitle>
                <p className="font-display text-3xl font-bold" style={{ color: '#D4AA40' }}>
                  {parseFloat(wine.estimatedValue).toFixed(0)} €
                </p>
              </div>
            )}

            {/* Mentions */}
            {!!wine.mentions?.length && (
              <div className="col-span-2">
                <SectionTitle>Mentions</SectionTitle>
                <div className="flex flex-wrap gap-1.5">
                  {wine.mentions.map((m, i) => <Chip key={i}>{m}</Chip>)}
                </div>
              </div>
            )}
          </div>

          {/* Espace respiratoire en bas */}
          <div className="h-8" />
        </div>
      </div>
    </div>
  );
}
