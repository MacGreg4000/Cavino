import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Thermometer, Clock, GlassWater, Grape, MapPin, Award,
  ChevronLeft, UtensilsCrossed, Star, XCircle
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { WinePhoto } from '../../components/ui/WinePhoto';
import type { Wine } from '../../stores/wine';

function typeAccent(type?: string): string {
  const t = type?.toLowerCase() ?? '';
  if (t.includes('rouge') || t.includes('red')) return 'border-wine-red';
  if (t.includes('blanc') || t.includes('white')) return 'border-wine-white';
  if (t.includes('rosé') || t.includes('rose')) return 'border-wine-rose';
  if (t.includes('champagne') || t.includes('mousseux') || t.includes('crémant')) return 'border-champagne';
  return 'border-accent';
}

function typeHeroBg(type?: string): string {
  const t = type?.toLowerCase() ?? '';
  if (t.includes('rouge') || t.includes('red')) return 'from-wine-red/30 to-bg';
  if (t.includes('blanc') || t.includes('white')) return 'from-wine-white/10 to-bg';
  if (t.includes('rosé') || t.includes('rose')) return 'from-wine-rose/20 to-bg';
  if (t.includes('champagne') || t.includes('mousseux')) return 'from-champagne/15 to-bg';
  return 'from-accent/20 to-bg';
}

function PhaseLabel({ phase }: { phase?: string | null }) {
  if (!phase) return null;
  const p = phase.toLowerCase();
  const variant = p.includes('apogée') || p.includes('apogee') ? 'gold'
    : p.includes('jeune') ? 'default'
    : p.includes('déclin') || p.includes('declin') ? 'danger'
    : 'default';
  return <Badge variant={variant} className="capitalize">{phase}</Badge>;
}

function GardeTimeline({ wine }: { wine: Wine }) {
  const year = new Date().getFullYear();
  const from = wine.drinkFrom || wine.vintage || year;
  const until = wine.drinkUntil || year + 20;
  const range = until - from;
  if (range <= 0) return null;

  const position = Math.max(0, Math.min(100, ((year - from) / range) * 100));
  const peakStart = wine.peakFrom ? ((wine.peakFrom - from) / range) * 100 : 0;
  const peakEnd = wine.peakUntil ? ((wine.peakUntil - from) / range) * 100 : 100;

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-gold" />
          <h3 className="text-sm font-semibold">Garde</h3>
        </div>
        <PhaseLabel phase={wine.currentPhase} />
      </div>
      <div className="relative h-5 bg-surface-hover rounded-full overflow-hidden mb-2">
        <div
          className="absolute top-0 h-full bg-gold/25 rounded-full"
          style={{ left: `${peakStart}%`, width: `${peakEnd - peakStart}%` }}
        />
        <div
          className="absolute top-0 w-1 h-full bg-accent-bright rounded-full shadow-[0_0_8px_rgba(212,74,58,0.7)]"
          style={{ left: `${position}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-text-muted font-mono">
        <span>{from}</span>
        {wine.peakFrom && (
          <span className="text-gold">Apogée {wine.peakFrom}–{wine.peakUntil}</span>
        )}
        <span>{until}</span>
      </div>
      {wine.agingNotes && (
        <p className="text-xs text-text-secondary mt-3 leading-relaxed">{wine.agingNotes}</p>
      )}
    </Card>
  );
}

function AromaProfile({ wine }: { wine: Wine }) {
  const primary = wine.aromaPrimary ?? [];
  const secondary = wine.aromaSecondary ?? [];
  const tertiary = wine.aromaTertiary ?? [];
  if (!primary.length && !secondary.length && !tertiary.length) return null;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <Grape size={16} className="text-wine-rose" />
        <h3 className="text-sm font-semibold">Arômes</h3>
      </div>
      {primary.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wider text-text-muted mb-2">Primaires</p>
          <div className="flex flex-wrap gap-1.5">
            {primary.map((a, i) => <Badge key={i} variant="red">{a}</Badge>)}
          </div>
        </div>
      )}
      {secondary.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wider text-text-muted mb-2">Secondaires</p>
          <div className="flex flex-wrap gap-1.5">
            {secondary.map((a, i) => <Badge key={i} variant="gold">{a}</Badge>)}
          </div>
        </div>
      )}
      {tertiary.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-muted mb-2">Tertiaires</p>
          <div className="flex flex-wrap gap-1.5">
            {tertiary.map((a, i) => <Badge key={i} variant="champagne">{a}</Badge>)}
          </div>
        </div>
      )}
    </Card>
  );
}

function Pairings({ wine }: { wine: Wine }) {
  const hasAny = wine.pairingsIdeal?.length || wine.pairingsGood?.length || wine.cheesePairings?.length || wine.pairingsAvoid?.length;
  if (!hasAny) return null;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <UtensilsCrossed size={16} className="text-gold" />
        <h3 className="text-sm font-semibold">Accords mets-vins</h3>
      </div>
      {!!wine.pairingsIdeal?.length && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wider text-gold mb-2">Idéal</p>
          <div className="flex flex-wrap gap-1">{wine.pairingsIdeal.map((p, i) => <Badge key={i} variant="gold">{p}</Badge>)}</div>
        </div>
      )}
      {!!wine.pairingsGood?.length && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wider text-text-muted mb-2">Bon accord</p>
          <div className="flex flex-wrap gap-1">{wine.pairingsGood.map((p, i) => <Badge key={i}>{p}</Badge>)}</div>
        </div>
      )}
      {!!wine.cheesePairings?.length && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wider text-champagne mb-2">Fromages</p>
          <div className="flex flex-wrap gap-1">{wine.cheesePairings.map((p, i) => <Badge key={i} variant="champagne">{p}</Badge>)}</div>
        </div>
      )}
      {!!wine.pairingsAvoid?.length && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-danger mb-2">À éviter</p>
          <div className="flex flex-wrap gap-1">{wine.pairingsAvoid.map((p, i) => <Badge key={i} variant="danger">{p}</Badge>)}</div>
        </div>
      )}
    </Card>
  );
}

export function PublicWineDetail() {
  const { id } = useParams<{ id: string }>();
  const [wine, setWine] = useState<Wine | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/public/wines/${id}`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((data) => {
        if (data) setWine(data);
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !wine) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-text-muted px-4">
        <XCircle size={40} />
        <p className="text-sm text-center">Bouteille introuvable ou non disponible</p>
        <Link to="/public" className="text-accent-bright text-sm underline">Retour à la cave</Link>
      </div>
    );
  }

  return (
    <div className="pb-10">
      {/* Back */}
      <Link
        to="/public"
        className="flex items-center gap-1.5 text-text-muted hover:text-text text-sm px-4 pt-4 pb-2 transition-colors"
      >
        <ChevronLeft size={16} />
        La cave
      </Link>

      {/* Hero */}
      {wine.photoUrl ? (
        <div className="relative h-72">
          <WinePhoto src={wine.photoUrl} alt={wine.name} className="h-full w-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/50 to-transparent" />
        </div>
      ) : (
        <div className={`h-40 bg-gradient-to-b ${typeHeroBg(wine.type)}`} />
      )}

      <div className="px-4 space-y-3 max-w-lg mx-auto">
        {/* Identity */}
        <div className={wine.photoUrl ? '-mt-16 relative z-10' : 'pt-4'}>
          <div className={`pl-4 border-l-4 ${typeAccent(wine.type)}`}>
            <h2 className="font-display text-2xl font-bold text-text leading-tight">{wine.name}</h2>
            {wine.domain && <p className="text-text-secondary text-sm mt-0.5">{wine.domain}</p>}
            <p className="text-text-muted text-xs mt-0.5">
              {wine.vintage || 'Non millésimé'}
              {wine.appellation ? ` · ${wine.appellation}` : ''}
              {wine.classification ? ` · ${wine.classification}` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap pl-4">
            {wine.type && (
              <Badge variant={wine.type.toLowerCase().includes('rouge') ? 'red' : wine.type.toLowerCase().includes('blanc') ? 'white' : 'champagne'}>
                {wine.type}
              </Badge>
            )}
            {wine.classification && <Badge variant="gold">{wine.classification}</Badge>}
            {wine.slotIds?.[0] && (
              <div className="flex items-center gap-1 bg-surface border border-border rounded-[var(--radius-sm)] px-2 py-0.5">
                <MapPin size={10} className="text-text-muted" />
                <span className="font-mono text-[12px] text-text-secondary">{wine.slotIds[0]}</span>
              </div>
            )}
            <span className="font-mono text-sm text-text-muted">×{wine.quantity ?? 0}</span>
          </div>
        </div>

        {/* Description */}
        {wine.description && (
          <Card>
            <p className="text-sm text-text-secondary leading-relaxed">{wine.description}</p>
            {wine.style && <p className="text-xs text-gold mt-2 italic">{wine.style}</p>}
          </Card>
        )}

        {/* Palate */}
        {wine.palate && (
          <Card>
            <h3 className="text-xs uppercase tracking-wider text-text-muted mb-2">En bouche</h3>
            <p className="text-sm text-text-secondary leading-relaxed">{wine.palate}</p>
          </Card>
        )}

        {/* Vintage notes */}
        {wine.vintageNotes && (
          <Card>
            <h3 className="text-xs uppercase tracking-wider text-text-muted mb-2">Millésime {wine.vintage}</h3>
            <p className="text-sm text-text-secondary leading-relaxed">{wine.vintageNotes}</p>
          </Card>
        )}

        {/* Service */}
        {(wine.servingTempMin || wine.glassType || wine.decanting) && (
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <GlassWater size={16} className="text-champagne" />
              <h3 className="text-sm font-semibold">Service</h3>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              {wine.servingTempMin && (
                <div className="flex flex-col gap-1 items-center text-center">
                  <Thermometer size={16} className="text-text-muted" />
                  <span className="text-xs text-text-secondary">{wine.servingTempMin}–{wine.servingTempMax}°C</span>
                </div>
              )}
              {wine.glassType && (
                <div className="flex flex-col gap-1 items-center text-center col-span-2">
                  <GlassWater size={16} className="text-text-muted" />
                  <span className="text-xs text-text-secondary">{wine.glassType}</span>
                </div>
              )}
              {wine.decanting && (
                <div className="col-span-3 text-xs text-text-secondary text-center mt-1">
                  Carafage recommandé{wine.decantingTime ? ` — ${wine.decantingTime} min` : ''}
                </div>
              )}
            </div>
          </Card>
        )}

        <GardeTimeline wine={wine} />
        <AromaProfile wine={wine} />
        <Pairings wine={wine} />

        {/* Awards */}
        {!!wine.awards?.length && (
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Award size={16} className="text-gold" />
              <h3 className="text-sm font-semibold">Récompenses</h3>
            </div>
            <div className="space-y-1.5">
              {wine.awards.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-text-secondary">
                  <Badge variant="gold">{a.medal || 'Récompense'}</Badge>
                  <span>{a.name} {a.year && `(${a.year})`}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Rating perso */}
        {wine.personalRating != null && wine.personalRating > 0 && (
          <Card>
            <div className="flex items-center gap-2">
              <Star size={16} className="text-gold" />
              <h3 className="text-sm font-semibold">Note personnelle</h3>
              <span className="ml-auto font-display text-2xl font-bold text-gold">{wine.personalRating}<span className="text-xs text-text-muted">/100</span></span>
            </div>
            {wine.tastingNotes && (
              <p className="text-xs text-text-secondary mt-2 leading-relaxed italic">{wine.tastingNotes}</p>
            )}
          </Card>
        )}

        {/* Valeur */}
        {wine.estimatedValue && (
          <Card>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Valeur estimée</span>
              <span className="font-display text-xl font-bold text-gold">{parseFloat(wine.estimatedValue).toFixed(0)} €</span>
            </div>
          </Card>
        )}

        {/* Mentions */}
        {!!wine.mentions?.length && (
          <Card>
            <h3 className="text-xs uppercase tracking-wider text-text-muted mb-2">Mentions</h3>
            <div className="flex flex-wrap gap-1.5">
              {wine.mentions.map((m, i) => <Badge key={i}>{m}</Badge>)}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
