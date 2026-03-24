import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Wine as WineIcon, Thermometer, Clock, GlassWater, Grape, MapPin, Award, Heart, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { BottomSheet } from '../components/ui/BottomSheet';
import { useWineStore, type Wine } from '../stores/wine';
import { useToast } from '../components/ui/Toast';

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
      <div className="flex items-center gap-2 mb-3">
        <Clock size={16} className="text-gold" />
        <h3 className="text-sm font-semibold">Garde</h3>
      </div>
      <div className="relative h-3 bg-surface-hover rounded-full overflow-hidden mb-2">
        {/* Peak zone */}
        <div
          className="absolute top-0 h-full bg-gold/30 rounded-full"
          style={{ left: `${peakStart}%`, width: `${peakEnd - peakStart}%` }}
        />
        {/* Current position */}
        <div
          className="absolute top-0 w-1 h-full bg-accent-bright rounded-full"
          style={{ left: `${position}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-text-muted font-mono">
        <span>{from}</span>
        {wine.peakFrom && <span className="text-gold">Apogée {wine.peakFrom}-{wine.peakUntil}</span>}
        <span>{until}</span>
      </div>
      {wine.agingNotes && <p className="text-xs text-text-secondary mt-2">{wine.agingNotes}</p>}
    </Card>
  );
}

function AromaProfile({ wine }: { wine: Wine }) {
  const all = [
    ...(wine.aromaPrimary || []).map((a) => ({ label: a, tier: 'Primaire' })),
    ...(wine.aromaSecondary || []).map((a) => ({ label: a, tier: 'Secondaire' })),
    ...(wine.aromaTertiary || []).map((a) => ({ label: a, tier: 'Tertiaire' })),
  ];
  if (all.length === 0) return null;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Grape size={16} className="text-wine-rose" />
        <h3 className="text-sm font-semibold">Arômes</h3>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {all.map(({ label, tier }, i) => (
          <Badge
            key={i}
            variant={tier === 'Primaire' ? 'red' : tier === 'Secondaire' ? 'gold' : 'champagne'}
          >
            {label}
          </Badge>
        ))}
      </div>
    </Card>
  );
}

function Pairings({ wine }: { wine: Wine }) {
  const hasAny = wine.pairingsIdeal?.length || wine.pairingsGood?.length || wine.cheesePairings?.length;
  if (!hasAny) return null;

  return (
    <Card>
      <h3 className="text-sm font-semibold mb-3">Accords mets-vins</h3>
      {wine.pairingsIdeal && wine.pairingsIdeal.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-gold font-medium mb-1">Idéal</p>
          <div className="flex flex-wrap gap-1">{wine.pairingsIdeal.map((p, i) => <Badge key={i} variant="gold">{p}</Badge>)}</div>
        </div>
      )}
      {wine.pairingsGood && wine.pairingsGood.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-text-secondary font-medium mb-1">Bon accord</p>
          <div className="flex flex-wrap gap-1">{wine.pairingsGood.map((p, i) => <Badge key={i}>{p}</Badge>)}</div>
        </div>
      )}
      {wine.cheesePairings && wine.cheesePairings.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-champagne font-medium mb-1">Fromages</p>
          <div className="flex flex-wrap gap-1">{wine.cheesePairings.map((p, i) => <Badge key={i} variant="champagne">{p}</Badge>)}</div>
        </div>
      )}
      {wine.pairingsAvoid && wine.pairingsAvoid.length > 0 && (
        <div>
          <p className="text-xs text-danger font-medium mb-1">À éviter</p>
          <div className="flex flex-wrap gap-1">{wine.pairingsAvoid.map((p, i) => <Badge key={i} variant="danger">{p}</Badge>)}</div>
        </div>
      )}
    </Card>
  );
}

export function WineDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { wines, pending, drinkWine, deleteWine } = useWineStore();
  const [wine, setWine] = useState<Wine | null>(null);
  const [showDrink, setShowDrink] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const found = [...wines, ...pending].find((w) => w.id === id);
    if (found) {
      setWine(found);
    } else if (id) {
      fetch(`/api/wines/${id}`).then((r) => r.json()).then(setWine).catch(() => navigate('/cave'));
    }
  }, [id, wines, pending, navigate]);

  if (!wine) return null;

  const handleDrink = async () => {
    setLoading(true);
    try {
      await drinkWine(wine.id);
      toast('success', `${wine.name} débouchée !`);
      setShowDrink(false);
      if ((wine.quantity || 1) <= 1) navigate('/cave');
    } catch {
      toast('error', 'Erreur lors du débouchage');
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    await deleteWine(wine.id);
    toast('success', 'Bouteille supprimée');
    navigate('/cave');
  };

  return (
    <div>
      <PageHeader title={wine.name} back />

      {/* Hero photo */}
      {wine.photoUrl && (
        <div className="relative h-56 overflow-hidden">
          <img src={wine.photoUrl} alt={wine.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-transparent" />
        </div>
      )}

      <div className="px-4 max-w-lg mx-auto space-y-3 pb-8">
        {/* Identity */}
        <div className={wine.photoUrl ? '-mt-12 relative z-10' : 'pt-4'}>
          <h2 className="font-display text-2xl font-bold">{wine.name}</h2>
          <p className="text-text-secondary text-sm mt-1">
            {wine.domain && `${wine.domain} · `}
            {wine.vintage || 'Non millésimé'}
            {wine.appellation && ` · ${wine.appellation}`}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant={wine.type?.toLowerCase() === 'rouge' ? 'red' : wine.type?.toLowerCase() === 'blanc' ? 'white' : 'champagne'}>
              {wine.type}
            </Badge>
            {wine.classification && <Badge variant="gold">{wine.classification}</Badge>}
            {wine.slotIds?.[0] && (
              <Badge variant="default" className="font-mono text-[11px]">
                <MapPin size={10} /> {wine.slotIds[0]}
              </Badge>
            )}
            <span className="font-mono text-sm text-text-secondary">×{wine.quantity || 0}</span>
          </div>
        </div>

        {/* Description */}
        {wine.description && (
          <Card>
            <p className="text-sm text-text-secondary leading-relaxed">{wine.description}</p>
          </Card>
        )}

        {/* Service */}
        {(wine.servingTempMin || wine.glassType || wine.decanting) && (
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <GlassWater size={16} className="text-champagne" />
              <h3 className="text-sm font-semibold">Service</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {wine.servingTempMin && (
                <div className="flex items-center gap-2 text-text-secondary">
                  <Thermometer size={14} />
                  <span>{wine.servingTempMin}–{wine.servingTempMax}°C</span>
                </div>
              )}
              {wine.glassType && (
                <div className="flex items-center gap-2 text-text-secondary">
                  <GlassWater size={14} />
                  <span>{wine.glassType}</span>
                </div>
              )}
              {wine.decanting && (
                <div className="text-text-secondary">
                  Carafage {wine.decantingTime && `${wine.decantingTime} min`}
                </div>
              )}
            </div>
          </Card>
        )}

        <GardeTimeline wine={wine} />
        <AromaProfile wine={wine} />
        <Pairings wine={wine} />

        {/* Awards */}
        {wine.awards && wine.awards.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Award size={16} className="text-gold" />
              <h3 className="text-sm font-semibold">Récompenses</h3>
            </div>
            <div className="space-y-1">
              {wine.awards.map((a, i) => (
                <div key={i} className="text-sm text-text-secondary">
                  {a.year} · {a.name} {a.medal && `(${a.medal})`}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button variant="primary" className="flex-1" onClick={() => setShowDrink(true)}>
            Déboucher
          </Button>
          <Button variant="ghost" onClick={handleDelete}>
            <Trash2 size={16} />
          </Button>
        </div>
      </div>

      {/* Drink confirmation */}
      <BottomSheet open={showDrink} onClose={() => setShowDrink(false)} title="Déboucher cette bouteille ?">
        <p className="text-sm text-text-secondary mb-4">
          {wine.name} {wine.vintage && `(${wine.vintage})`} — il vous en restera {Math.max(0, (wine.quantity || 1) - 1)}.
        </p>
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={() => setShowDrink(false)}>Annuler</Button>
          <Button variant="primary" className="flex-1" loading={loading} onClick={handleDrink}>Confirmer</Button>
        </div>
      </BottomSheet>
    </div>
  );
}
