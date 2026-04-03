import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Thermometer, Clock, GlassWater, Grape, MapPin, Award, Trash2,
  QrCode, Copy, Check, UtensilsCrossed, ExternalLink, Maximize2, X, PencilLine, Wine as WineIcon,
  StickyNote,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Stepper } from '../components/ui/Stepper';
import { WinePhoto } from '../components/ui/WinePhoto';
import { SlotPicker } from '../components/cellar/SlotPicker';
import { useWineStore, type Wine } from '../stores/wine';
import { useLocationStore, type GridSlot } from '../stores/location';
import { useToast } from '../components/ui/Toast';
import { BOTTLE_FORMATS, getBottleFormat, isStandardBottle } from '../lib/bottle-formats';

const PUBLIC_BASE = import.meta.env.VITE_PUBLIC_BASE_URL || '';

function typeAccent(type?: string): string {
  const t = type?.toLowerCase() ?? '';
  if (t.includes('rouge') || t.includes('red')) return 'border-wine-red';
  if (t.includes('blanc') || t.includes('white')) return 'border-wine-white';
  if (t.includes('rosé') || t.includes('rose')) return 'border-wine-rose';
  if (t.includes('champagne') || t.includes('mousseux')) return 'border-champagne';
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

function GardeTimeline({ wine }: { wine: Wine }) {
  const year = new Date().getFullYear();
  const from = wine.drinkFrom || wine.vintage || year;
  const until = wine.drinkUntil || year + 20;
  const range = until - from;
  if (range <= 0) return null;

  const position = Math.max(0, Math.min(100, ((year - from) / range) * 100));
  const peakStart = wine.peakFrom ? ((wine.peakFrom - from) / range) * 100 : 0;
  const peakEnd = wine.peakUntil ? ((wine.peakUntil - from) / range) * 100 : 100;

  const phase = wine.currentPhase;
  const phaseVariant = phase?.toLowerCase().includes('apogée') ? 'gold'
    : phase?.toLowerCase().includes('jeune') ? 'default'
    : phase?.toLowerCase().includes('déclin') ? 'danger'
    : 'default';

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-gold" />
          <h3 className="text-sm font-semibold">Garde</h3>
        </div>
        {phase && <Badge variant={phaseVariant} className="capitalize">{phase}</Badge>}
      </div>
      <div className="relative h-5 bg-surface-hover rounded-full overflow-hidden mb-2">
        {/* Peak zone */}
        <div
          className="absolute top-0 h-full bg-gold/25 rounded-full"
          style={{ left: `${peakStart}%`, width: `${peakEnd - peakStart}%` }}
        />
        {/* Current position */}
        <div
          className="absolute top-0 w-1 h-full bg-accent-bright rounded-full shadow-[0_0_8px_rgba(212,74,58,0.7)]"
          style={{ left: `${position}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-text-muted font-mono">
        <span>{from}</span>
        {wine.peakFrom && <span className="text-gold">Apogée {wine.peakFrom}–{wine.peakUntil}</span>}
        <span>{until}</span>
      </div>
      {wine.agingNotes && <p className="text-xs text-text-secondary mt-3 leading-relaxed">{wine.agingNotes}</p>}
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
  const hasAny = wine.pairingsIdeal?.length || wine.pairingsGood?.length || wine.cheesePairings?.length;
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
        <div className="mb-2">
          <p className="text-[10px] uppercase tracking-wider text-text-muted mb-2">Bon accord</p>
          <div className="flex flex-wrap gap-1">{wine.pairingsGood.map((p, i) => <Badge key={i}>{p}</Badge>)}</div>
        </div>
      )}
      {!!wine.cheesePairings?.length && (
        <div className="mb-2">
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

function ShelfMinimap({ wine }: { wine: Wine }) {
  const { locations, fetchLocations } = useLocationStore();
  const fetchGrid = useLocationStore((s) => s.fetchGrid);
  const [gridData, setGridData] = useState<{ rows: number; cols: number; slots: GridSlot[] } | null>(null);

  useEffect(() => {
    if (!wine.locationId) return;
    fetchLocations();
    fetchGrid(wine.locationId).then((data) => {
      const config = data.location.gridConfig;
      if (config) {
        setGridData({ rows: config.rows, cols: config.cols, slots: data.slots });
      }
    }).catch(() => {});
  }, [wine.locationId, fetchGrid, fetchLocations]);

  if (!wine.locationId || !wine.slotIds?.length || !gridData) return null;

  const location = locations.find((l) => l.id === wine.locationId);
  const wineSlotIds = new Set(wine.slotIds);

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <MapPin size={16} className="text-accent-bright" />
        <h3 className="text-sm font-semibold">Emplacement</h3>
        {location && <span className="text-xs text-text-muted ml-auto">{location.name}</span>}
      </div>
      <div
        className="grid gap-[3px] mx-auto w-fit"
        style={{
          gridTemplateColumns: `repeat(${gridData.cols}, 10px)`,
          gridTemplateRows: `repeat(${gridData.rows}, 10px)`,
        }}
      >
        {Array.from({ length: gridData.rows }).map((_, row) =>
          Array.from({ length: gridData.cols }).map((_, col) => {
            const slot = gridData.slots.find((s) => s.slot.rowIndex === row && s.slot.colIndex === col);
            const isBlocked = slot?.slot.isBlocked;
            const isWineSlot = slot && wineSlotIds.has(slot.slot.id);
            const isOccupied = slot?.slot.wineId && !isWineSlot;

            return (
              <div
                key={`${row}-${col}`}
                className={`w-[10px] h-[10px] rounded-full transition-colors ${
                  isBlocked
                    ? 'bg-transparent'
                    : isWineSlot
                    ? 'bg-accent-bright shadow-[0_0_4px_rgba(212,74,58,0.6)]'
                    : isOccupied
                    ? 'bg-text-muted/40'
                    : 'bg-surface-hover border border-border-subtle'
                }`}
                title={slot?.slot.id || ''}
              />
            );
          })
        )}
      </div>
      <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-text-muted">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-accent-bright" />
          <span>Cette bouteille</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-text-muted/40" />
          <span>Occupé</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-surface-hover border border-border-subtle" />
          <span>Libre</span>
        </div>
      </div>
      {wine.slotIds && (
        <p className="text-center text-xs text-text-secondary mt-2 font-mono">
          {wine.slotIds.join(', ')}
        </p>
      )}
    </Card>
  );
}

function QRSection({ wine }: { wine: Wine }) {
  const [copied, setCopied] = useState(false);
  const base = PUBLIC_BASE || window.location.origin;
  const publicUrl = `${base}/public/wine/${wine.id}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <QrCode size={16} className="text-text-secondary" />
        <h3 className="text-sm font-semibold">QR Code / NFC</h3>
      </div>
      <div className="flex gap-4 items-start">
        <div className="bg-surface-hover rounded-[var(--radius-md)] p-3 flex-shrink-0">
          <QRCodeSVG
            value={publicUrl}
            size={120}
            bgColor="transparent"
            fgColor="#1A1310"
            level="M"
          />
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <p className="text-xs text-text-muted leading-relaxed">
            Scanne ce QR ou programme un tag NFC avec l'URL ci-dessous pour accéder directement à la fiche.
          </p>
          <div className="bg-surface-hover rounded-[var(--radius-sm)] px-3 py-2 break-all">
            <p className="font-mono text-[10px] text-text-secondary">{publicUrl}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleCopy} className="flex-1 gap-1.5">
              {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
              {copied ? 'Copié !' : 'Copier'}
            </Button>
            <a href={publicUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <ExternalLink size={13} />
                Voir
              </Button>
            </a>
          </div>
        </div>
      </div>
      {wine.nfcTagId && (
        <p className="text-xs text-text-muted mt-3 font-mono">NFC ID: {wine.nfcTagId}</p>
      )}
    </Card>
  );
}

export function WineDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { wines, pending, drinkWine, deleteWine, updateWine } = useWineStore();
  const [wine, setWine] = useState<Wine | null>(null);
  const [showDrink, setShowDrink] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const [showSlotPicker, setShowSlotPicker] = useState(false);
  const [showQuantity, setShowQuantity] = useState(false);
  const [showFormat, setShowFormat] = useState(false);
  const [editQuantity, setEditQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [slotLoading, setSlotLoading] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [personalCommentDraft, setPersonalCommentDraft] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);

  useEffect(() => {
    const found = [...wines, ...pending].find((w) => w.id === id);
    if (found) {
      setWine(found);
    } else if (id) {
      import('../lib/api').then(({ apiFetch }) =>
        apiFetch(`/api/wines/${id}`).then((r) => r.json()).then(setWine).catch(() => navigate('/cave'))
      );
    }
  }, [id, wines, pending, navigate]);

  useEffect(() => {
    if (wine) setPersonalCommentDraft(wine.personalComment ?? '');
  }, [wine?.id]);

  if (!wine) return null;

  const handleOpenSlotPicker = () => {
    setSelectedSlots(wine.slotIds ?? []);
    setSelectedLocationId(wine.locationId ?? '');
    setShowSlotPicker(true);
  };

  const handleSaveSlots = async () => {
    setSlotLoading(true);
    try {
      const updated = await updateWine(wine.id, {
        slotIds: selectedSlots,
        locationId: selectedLocationId || undefined,
      });
      setWine(updated);
      toast('success', 'Emplacement mis à jour');
      setShowSlotPicker(false);
    } catch {
      toast('error', 'Erreur lors de la mise à jour');
    }
    setSlotLoading(false);
  };

  const handleOpenQuantity = () => {
    setEditQuantity(wine.quantity || 1);
    setShowQuantity(true);
  };

  const handleSaveQuantity = async () => {
    setLoading(true);
    try {
      const updated = await updateWine(wine.id, { quantity: editQuantity });
      setWine(updated);
      toast('success', 'Quantité mise à jour');
      setShowQuantity(false);
    } catch {
      toast('error', 'Erreur lors de la mise à jour');
    }
    setLoading(false);
  };

  const handleSaveFormat = async (size: string) => {
    try {
      const updated = await updateWine(wine.id, { bottleSize: size } as Parameters<typeof updateWine>[1]);
      setWine(updated);
      toast('success', 'Format mis à jour');
      setShowFormat(false);
    } catch {
      toast('error', 'Erreur lors de la mise à jour');
    }
  };

  const handleSavePersonalComment = async () => {
    setCommentSaving(true);
    try {
      const trimmed = personalCommentDraft.trim();
      const updated = await updateWine(wine.id, {
        personalComment: trimmed.length > 0 ? trimmed : null,
      });
      setWine(updated);
      setPersonalCommentDraft(updated.personalComment ?? '');
      toast('success', 'Notes enregistrées');
    } catch {
      toast('error', 'Erreur lors de l’enregistrement');
    }
    setCommentSaving(false);
  };

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
    setLoading(true);
    try {
      await deleteWine(wine.id);
      toast('success', 'Bouteille supprimée');
      setShowDelete(false);
      navigate('/cave');
    } catch {
      toast('error', 'Erreur lors de la suppression');
    }
    setLoading(false);
  };

  return (
    <div>
      <PageHeader title={wine.name} back />

      {/* Hero photo */}
      {wine.photoUrl ? (
        <div className="relative h-72 cursor-pointer group" onClick={() => setShowPhoto(true)}>
          <WinePhoto src={wine.photoUrl} alt={wine.name} className="h-full w-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/50 to-transparent" />
          <div className="absolute top-3 right-3 bg-black/50 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Maximize2 size={16} className="text-white" />
          </div>
        </div>
      ) : (
        <div className={`h-40 bg-gradient-to-b ${typeHeroBg(wine.type)}`} />
      )}

      <div className="px-4 max-w-lg mx-auto space-y-3 pb-8">
        {/* Identity */}
        <div className={wine.photoUrl ? '-mt-16 relative z-10' : 'pt-4'}>
          <div className={`pl-4 border-l-4 ${typeAccent(wine.type)}`}>
            <h2 className="font-display text-2xl font-bold leading-tight">{wine.name}</h2>
            {wine.domain && <p className="text-text-secondary text-sm mt-0.5">{wine.domain}</p>}
            <p className="text-text-muted text-xs mt-0.5">
              {wine.vintage || 'Non millésimé'}
              {wine.appellation ? ` · ${wine.appellation}` : ''}
              {wine.classification ? ` · ${wine.classification}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-3 pl-4 flex-wrap">
            <Badge variant={wine.type?.toLowerCase() === 'rouge' ? 'red' : wine.type?.toLowerCase() === 'blanc' ? 'white' : 'champagne'}>
              {wine.type}
            </Badge>
            {wine.classification && <Badge variant="gold">{wine.classification}</Badge>}
            {wine.slotIds?.[0] ? (
              <button
                type="button"
                onClick={handleOpenSlotPicker}
                className="flex items-center gap-1 bg-surface border border-border rounded-[var(--radius-sm)] px-2 py-0.5 hover:border-accent transition-colors"
              >
                <MapPin size={10} className="text-text-muted" />
                <span className="font-mono text-[13px] text-text-secondary">
                  {wine.slotIds.join(', ')}
                </span>
                <PencilLine size={10} className="text-text-muted ml-0.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenSlotPicker}
                className="flex items-center gap-1 border border-dashed border-border rounded-[var(--radius-sm)] px-2 py-0.5 hover:border-accent transition-colors"
              >
                <MapPin size={10} className="text-text-muted" />
                <span className="text-[11px] text-text-muted">Assigner un emplacement</span>
              </button>
            )}
            {!isStandardBottle(wine.bottleSize) && (
              <button
                type="button"
                onClick={() => setShowFormat(true)}
                className="cursor-pointer"
              >
                <Badge variant="champagne">{getBottleFormat(wine.bottleSize).short}</Badge>
              </button>
            )}
            {isStandardBottle(wine.bottleSize) && (
              <button
                type="button"
                onClick={() => setShowFormat(true)}
                className="flex items-center gap-1 border border-dashed border-border rounded-[var(--radius-sm)] px-2 py-0.5 hover:border-accent transition-colors cursor-pointer"
              >
                <WineIcon size={10} className="text-text-muted" />
                <span className="text-[11px] text-text-muted">75cl</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleOpenQuantity}
              className="font-mono text-sm text-text-secondary hover:text-accent-bright transition-colors cursor-pointer"
            >
              ×{wine.quantity || 0}
            </button>
          </div>
        </div>

        {/* Description */}
        {wine.description && (
          <Card>
            <p className="text-sm text-text-secondary leading-relaxed">{wine.description}</p>
            {wine.style && <p className="text-xs text-gold mt-2 italic">{wine.style}</p>}
          </Card>
        )}

        <Card>
          <div className="flex items-center gap-2 mb-1">
            <StickyNote size={16} className="text-accent" />
            <h3 className="text-sm font-semibold text-text">Mes notes</h3>
          </div>
          <p className="text-[10px] text-text-muted mb-3 leading-relaxed">
            Commentaire libre : cadeau, occasion, souvenir… Réservé à votre cave, non affiché sur la fiche publique.
          </p>
          <textarea
            value={personalCommentDraft}
            onChange={(e) => setPersonalCommentDraft(e.target.value)}
            placeholder="Ex. : Offerte par Paul — super bouteille à offrir à son tour…"
            rows={4}
            maxLength={10000}
            className="w-full rounded-[var(--radius-md)] border border-border bg-surface-hover/40 px-3 py-2.5 text-sm text-text placeholder:text-text-muted outline-none focus:border-accent/40 resize-y min-h-[96px]"
          />
          <Button
            type="button"
            variant="secondary"
            className="w-full mt-3"
            loading={commentSaving}
            disabled={
              commentSaving ||
              personalCommentDraft.trim() === (wine.personalComment ?? '').trim()
            }
            onClick={handleSavePersonalComment}
          >
            Enregistrer les notes
          </Button>
        </Card>

        {/* Palate */}
        {wine.palate && (
          <Card>
            <h3 className="text-xs uppercase tracking-wider text-text-muted mb-2">En bouche</h3>
            <p className="text-sm text-text-secondary leading-relaxed">{wine.palate}</p>
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

        {/* Shelf minimap */}
        <ShelfMinimap wine={wine} />

        {/* QR Code */}
        {wine.importStatus !== 'consumed' && <QRSection wine={wine} />}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button variant="primary" className="flex-1" onClick={() => setShowDrink(true)}>
            Déboucher
          </Button>
          <Button variant="ghost" onClick={() => setShowDelete(true)}>
            <Trash2 size={16} />
          </Button>
        </div>
      </div>

      {/* Delete confirmation */}
      <BottomSheet open={showDelete} onClose={() => setShowDelete(false)} title="Supprimer cette bouteille ?">
        <p className="text-sm text-text-secondary mb-4">
          {wine.name} {wine.vintage && `(${wine.vintage})`} sera définitivement supprimée de votre cave.
        </p>
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={() => setShowDelete(false)}>Annuler</Button>
          <Button variant="primary" className="flex-1 !bg-danger" loading={loading} onClick={handleDelete}>Supprimer</Button>
        </div>
      </BottomSheet>

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

      {/* Slot picker */}
      <BottomSheet open={showSlotPicker} onClose={() => setShowSlotPicker(false)} title="Changer l'emplacement">
        <div className="space-y-4">
          <SlotPicker
            selectedSlots={selectedSlots}
            onSelect={(slots, locId) => { setSelectedSlots(slots); setSelectedLocationId(locId); }}
            maxSlots={wine.quantity || 1}
          />
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" className="flex-1" onClick={() => setShowSlotPicker(false)}>Annuler</Button>
            <Button variant="primary" className="flex-1" loading={slotLoading} onClick={handleSaveSlots}>
              <Check size={14} /> Enregistrer
            </Button>
          </div>
        </div>
      </BottomSheet>

      {/* Quantity editor */}
      <BottomSheet open={showQuantity} onClose={() => setShowQuantity(false)} title="Modifier la quantité">
        <div className="space-y-4">
          <Stepper value={editQuantity} onChange={setEditQuantity} min={0} label="Bouteilles" />
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setShowQuantity(false)}>Annuler</Button>
            <Button variant="primary" className="flex-1" loading={loading} onClick={handleSaveQuantity}>
              <Check size={14} /> Enregistrer
            </Button>
          </div>
        </div>
      </BottomSheet>

      {/* Format editor */}
      <BottomSheet open={showFormat} onClose={() => setShowFormat(false)} title="Format de bouteille">
        <div className="grid grid-cols-2 gap-2">
          {BOTTLE_FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => handleSaveFormat(f.value)}
              className={`p-3 rounded-[var(--radius-md)] border text-center transition-colors cursor-pointer ${
                wine.bottleSize === f.value || (!wine.bottleSize && f.value === '75')
                  ? 'border-accent bg-accent/10 text-accent-bright'
                  : 'border-border bg-surface-hover text-text-secondary hover:border-accent/50'
              }`}
            >
              <span className="text-sm font-medium block">{f.label}</span>
              <span className="text-xs text-text-muted">{f.liters}</span>
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* Photo lightbox */}
      {showPhoto && wine.photoUrl && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={() => setShowPhoto(false)}>
          <button className="absolute top-4 right-4 bg-white/20 rounded-full p-2 hover:bg-white/30 transition-colors" onClick={() => setShowPhoto(false)}>
            <X size={24} className="text-white" />
          </button>
          <img src={wine.photoUrl} alt={wine.name} className="max-w-full max-h-full object-contain p-4" />
        </div>
      )}
    </div>
  );
}
