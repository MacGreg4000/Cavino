import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, Save } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { apiFetch } from '../lib/api';
import { useWineStore, type Wine } from '../stores/wine';

// ─── Shared field components ──────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-text-muted uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-surface-hover border border-border rounded-[var(--radius-sm)] px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent/50 transition-colors"
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="bg-surface-hover border border-border rounded-[var(--radius-sm)] px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent/50 transition-colors resize-none"
    />
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
  step = 1,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      step={step}
      className="bg-surface-hover border border-border rounded-[var(--radius-sm)] px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent/50 transition-colors"
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-surface-hover border border-border rounded-[var(--radius-sm)] px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50 transition-colors"
    >
      <option value="">— Non renseigné</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`flex items-center gap-3 py-2 px-3 rounded-[var(--radius-sm)] border transition-colors ${
        value ? 'border-accent/50 bg-accent/10' : 'border-border bg-surface-hover'
      }`}
    >
      <div className={`w-8 h-4 rounded-full relative transition-colors ${value ? 'bg-accent' : 'bg-text-muted'}`}>
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${value ? 'left-4.5 translate-x-0' : 'left-0.5'}`} />
      </div>
      <span className="text-sm text-text">{label}</span>
    </button>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-widest text-text-muted pt-1">{title}</h3>
  );
}

// ─── Wine type options ────────────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: 'rouge', label: 'Rouge' },
  { value: 'blanc', label: 'Blanc' },
  { value: 'rosé', label: 'Rosé' },
  { value: 'champagne', label: 'Champagne' },
  { value: 'crémant', label: 'Crémant' },
  { value: 'effervescent', label: 'Effervescent' },
  { value: 'moelleux', label: 'Moelleux' },
  { value: 'liquoreux', label: 'Liquoreux' },
];

// ─── WineEdit page ────────────────────────────────────────────────────────────

type FormState = {
  // Identité
  name: string;
  domain: string;
  appellation: string;
  vintage: string;
  nonVintage: boolean;
  type: string;
  grapes: string;
  country: string;
  region: string;
  subRegion: string;
  classification: string;
  alcohol: string;
  // Achat
  purchasePrice: string;
  estimatedValue: string;
  source: string;
  // Service
  servingTempMin: string;
  servingTempMax: string;
  decanting: boolean;
  decantingTime: string;
  glassType: string;
  // Garde
  drinkFrom: string;
  drinkUntil: string;
  peakFrom: string;
  peakUntil: string;
  agingNotes: string;
  // Description
  description: string;
  palate: string;
  style: string;
  // Notes perso
  personalComment: string;
};

function wineToForm(wine: Wine): FormState {
  return {
    name: wine.name ?? '',
    domain: wine.domain ?? '',
    appellation: wine.appellation ?? '',
    vintage: wine.vintage ? String(wine.vintage) : '',
    nonVintage: wine.nonVintage ?? false,
    type: wine.type ?? '',
    grapes: wine.grapes?.join(', ') ?? '',
    country: wine.country ?? '',
    region: wine.region ?? '',
    subRegion: wine.subRegion ?? '',
    classification: wine.classification ?? '',
    alcohol: wine.alcohol ?? '',
    purchasePrice: wine.purchasePrice ?? '',
    estimatedValue: wine.estimatedValue ?? '',
    source: (wine as Wine & { source?: string }).source ?? '',
    servingTempMin: wine.servingTempMin != null ? String(wine.servingTempMin) : '',
    servingTempMax: wine.servingTempMax != null ? String(wine.servingTempMax) : '',
    decanting: wine.decanting ?? false,
    decantingTime: wine.decantingTime != null ? String(wine.decantingTime) : '',
    glassType: wine.glassType ?? '',
    drinkFrom: wine.drinkFrom != null ? String(wine.drinkFrom) : '',
    drinkUntil: wine.drinkUntil != null ? String(wine.drinkUntil) : '',
    peakFrom: wine.peakFrom != null ? String(wine.peakFrom) : '',
    peakUntil: wine.peakUntil != null ? String(wine.peakUntil) : '',
    agingNotes: wine.agingNotes ?? '',
    description: wine.description ?? '',
    palate: wine.palate ?? '',
    style: wine.style ?? '',
    personalComment: wine.personalComment ?? '',
  };
}

function formToPayload(form: FormState): Record<string, unknown> {
  const num = (v: string) => v.trim() !== '' ? parseFloat(v) : null;
  const int = (v: string) => v.trim() !== '' ? parseInt(v, 10) : null;
  const arr = (v: string) => v.trim() ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const str = (v: string) => v.trim() || null;

  return {
    name: form.name.trim(),
    domain: str(form.domain),
    appellation: str(form.appellation),
    vintage: int(form.vintage),
    nonVintage: form.nonVintage,
    type: str(form.type),
    grapes: arr(form.grapes),
    country: str(form.country),
    region: str(form.region),
    subRegion: str(form.subRegion),
    classification: str(form.classification),
    alcohol: str(form.alcohol),
    purchasePrice: num(form.purchasePrice),
    estimatedValue: num(form.estimatedValue),
    source: str(form.source),
    servingTempMin: int(form.servingTempMin),
    servingTempMax: int(form.servingTempMax),
    decanting: form.decanting,
    decantingTime: form.decanting ? int(form.decantingTime) : null,
    glassType: str(form.glassType),
    drinkFrom: int(form.drinkFrom),
    drinkUntil: int(form.drinkUntil),
    peakFrom: int(form.peakFrom),
    peakUntil: int(form.peakUntil),
    agingNotes: str(form.agingNotes),
    description: str(form.description),
    palate: str(form.palate),
    style: str(form.style),
    personalComment: str(form.personalComment),
  };
}

export function WineEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { wines, pending } = useWineStore();

  const [wine, setWine] = useState<Wine | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const found = [...wines, ...pending].find((w) => w.id === id);
    if (found) {
      setWine(found);
      setForm(wineToForm(found));
    } else if (id) {
      apiFetch(`/api/wines/${id}`).then((r) => r.json()).then((w: Wine) => {
        setWine(w);
        setForm(wineToForm(w));
      }).catch(() => navigate('/cave'));
    }
  }, [id, wines, pending, navigate]);

  if (!wine || !form) return null;

  const set = (key: keyof FormState) => (value: string | boolean) =>
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast('error', 'Le nom est requis');
      return;
    }
    setSaving(true);
    try {
      const payload = formToPayload(form);
      const res = await apiFetch(`/api/wines/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      toast('success', 'Fiche mise à jour');
      setSaved(true);
      setTimeout(() => navigate(`/cave/${id}`), 600);
    } catch {
      toast('error', 'Erreur lors de la sauvegarde');
    }
    setSaving(false);
  };

  return (
    <div>
      <PageHeader title="Modifier la fiche" back />

      <div className="px-4 pt-4 max-w-lg mx-auto pb-36 space-y-4">

        {/* Identité */}
        <Card className="space-y-3">
          <SectionTitle title="Identité" />
          <Field label="Nom de la cuvée *">
            <TextInput value={form.name} onChange={set('name')} placeholder="ex : Grande Réserve" />
          </Field>
          <Field label="Domaine / Château / Producteur">
            <TextInput value={form.domain} onChange={set('domain')} placeholder="ex : Château Margaux" />
          </Field>
          <Field label="Appellation">
            <TextInput value={form.appellation} onChange={set('appellation')} placeholder="ex : Bordeaux AOC" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Millésime">
              <NumberInput value={form.vintage} onChange={set('vintage')} placeholder="ex : 2019" />
            </Field>
            <Field label="Type">
              <SelectInput value={form.type} onChange={set('type')} options={TYPE_OPTIONS} />
            </Field>
          </div>
          <Toggle value={form.nonVintage} onChange={set('nonVintage')} label="Non millésimé (NV)" />
          <Field label="Cépages (séparés par des virgules)">
            <TextInput value={form.grapes} onChange={set('grapes')} placeholder="ex : Cabernet Sauvignon, Merlot" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pays">
              <TextInput value={form.country} onChange={set('country')} placeholder="ex : France" />
            </Field>
            <Field label="Région">
              <TextInput value={form.region} onChange={set('region')} placeholder="ex : Bordeaux" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sous-région">
              <TextInput value={form.subRegion} onChange={set('subRegion')} placeholder="ex : Médoc" />
            </Field>
            <Field label="Classification">
              <TextInput value={form.classification} onChange={set('classification')} placeholder="ex : Grand Cru Classé" />
            </Field>
          </div>
          <Field label="Alcool (%)">
            <NumberInput value={form.alcohol} onChange={set('alcohol')} placeholder="ex : 13.5" step={0.1} />
          </Field>
        </Card>

        {/* Achat */}
        <Card className="space-y-3">
          <SectionTitle title="Achat & valeur" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prix d'achat (€)">
              <NumberInput value={form.purchasePrice} onChange={set('purchasePrice')} placeholder="ex : 12.50" step={0.01} />
            </Field>
            <Field label="Valeur estimée (€)">
              <NumberInput value={form.estimatedValue} onChange={set('estimatedValue')} placeholder="ex : 18.00" step={0.01} />
            </Field>
          </div>
          <Field label="Source d'achat">
            <TextInput value={form.source} onChange={set('source')} placeholder="ex : Nicolas, Vivino, Cave locale…" />
          </Field>
        </Card>

        {/* Service */}
        <Card className="space-y-3">
          <SectionTitle title="Service" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Temp. min (°C)">
              <NumberInput value={form.servingTempMin} onChange={set('servingTempMin')} placeholder="ex : 16" />
            </Field>
            <Field label="Temp. max (°C)">
              <NumberInput value={form.servingTempMax} onChange={set('servingTempMax')} placeholder="ex : 18" />
            </Field>
          </div>
          <Field label="Type de verre">
            <TextInput value={form.glassType} onChange={set('glassType')} placeholder="ex : Verre Bordeaux" />
          </Field>
          <Toggle value={form.decanting} onChange={set('decanting')} label="Décantation recommandée" />
          {form.decanting && (
            <Field label="Durée de décantation (min)">
              <NumberInput value={form.decantingTime} onChange={set('decantingTime')} placeholder="ex : 60" />
            </Field>
          )}
        </Card>

        {/* Garde */}
        <Card className="space-y-3">
          <SectionTitle title="Garde" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Boire à partir de">
              <NumberInput value={form.drinkFrom} onChange={set('drinkFrom')} placeholder="ex : 2024" />
            </Field>
            <Field label="Boire avant">
              <NumberInput value={form.drinkUntil} onChange={set('drinkUntil')} placeholder="ex : 2035" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Apogée début">
              <NumberInput value={form.peakFrom} onChange={set('peakFrom')} placeholder="ex : 2026" />
            </Field>
            <Field label="Apogée fin">
              <NumberInput value={form.peakUntil} onChange={set('peakUntil')} placeholder="ex : 2032" />
            </Field>
          </div>
          <Field label="Notes de garde">
            <TextArea value={form.agingNotes} onChange={set('agingNotes')} placeholder="Évolution attendue…" rows={2} />
          </Field>
        </Card>

        {/* Description */}
        <Card className="space-y-3">
          <SectionTitle title="Description" />
          <Field label="Description générale">
            <TextArea value={form.description} onChange={set('description')} rows={4} placeholder="Profil aromatique et gustatif général…" />
          </Field>
          <Field label="Palate (bouche)">
            <TextArea value={form.palate} onChange={set('palate')} rows={3} placeholder="Attaque, milieu de bouche, finale…" />
          </Field>
          <Field label="Style">
            <TextInput value={form.style} onChange={set('style')} placeholder="ex : Élégant, structuré, tanins soyeux…" />
          </Field>
        </Card>

        {/* Notes perso */}
        <Card className="space-y-3">
          <SectionTitle title="Note personnelle" />
          <Field label="Commentaire libre (privé)">
            <TextArea value={form.personalComment} onChange={set('personalComment')} rows={3} placeholder="Cadeau, occasion, souvenir…" />
          </Field>
        </Card>

      </div>

      {/* Sticky save bar — sits above the BottomNav (h-16 = 4rem) */}
      <div className="fixed bottom-16 left-0 right-0 z-30 bg-bg/95 backdrop-blur border-t border-border px-4 py-3 flex gap-3">
        <Button variant="ghost" className="flex-1" onClick={() => navigate(`/cave/${id}`)}>
          Annuler
        </Button>
        <Button variant="primary" className="flex-1" loading={saving} onClick={handleSave}>
          {saved ? <Check size={16} /> : <Save size={16} />}
          {saved ? 'Enregistré' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}
