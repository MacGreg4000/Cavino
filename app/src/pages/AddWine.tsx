import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Plus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Stepper } from '../components/ui/Stepper';
import { SlotPicker } from '../components/cellar/SlotPicker';
import { useWineStore } from '../stores/wine';
import { useToast } from '../components/ui/Toast';
import { BOTTLE_FORMATS, type BottleFormat } from '../lib/bottle-formats';
import { apiFetch } from '../lib/api';

const WINE_TYPES = ['Rouge', 'Blanc', 'Rosé', 'Champagne', 'Effervescent'];

export function AddWine() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const createWine = useWineStore((s) => s.createWine);

  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [type, setType] = useState('');
  const [vintage, setVintage] = useState('');
  const [appellation, setAppellation] = useState('');
  const [region, setRegion] = useState('');
  const [country, setCountry] = useState('France');
  const [quantity, setQuantity] = useState(1);
  const [bottleSize, setBottleSize] = useState<string>('75');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [locationId, setLocationId] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [personalComment, setPersonalComment] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast('error', 'Le nom du vin est requis');
      return;
    }

    setLoading(true);
    try {
      const wine = await createWine({
        name: name.trim(),
        domain: domain.trim() || undefined,
        type: type || undefined,
        vintage: vintage ? parseInt(vintage) : undefined,
        appellation: appellation.trim() || undefined,
        region: region.trim() || undefined,
        country: country.trim() || undefined,
        quantity,
        bottleSize,
        purchasePrice: purchasePrice || undefined,
        personalComment: personalComment.trim() || undefined,
        slotIds: selectedSlots.length > 0 ? selectedSlots : undefined,
        locationId: locationId || undefined,
      });

      // Upload photo if selected
      if (photoFile && wine.id) {
        const formData = new FormData();
        formData.append('file', photoFile);
        await apiFetch(`/api/wines/${wine.id}/photo`, {
          method: 'POST',
          body: formData,
          rawBody: true,
        });
      }

      // Assign slots
      if (selectedSlots.length > 0) {
        await useWineStore.getState().updateWine(wine.id, {
          slotIds: selectedSlots,
          locationId: locationId || undefined,
        });
      }

      toast('success', `${name} ajoutée à la cave !`);
      navigate(`/cave/${wine.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur lors de la création';
      toast('error', msg);
    }
    setLoading(false);
  };

  return (
    <div>
      <PageHeader title="Ajouter un vin" back />

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-4 pb-8">
        {/* Photo */}
        <Card>
          <label className="cursor-pointer block">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoChange}
            />
            {photoPreview ? (
              <div className="relative rounded-[var(--radius-md)] overflow-hidden aspect-[4/3]">
                <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <Camera size={32} className="text-white" />
                </div>
              </div>
            ) : (
              <div className="aspect-[4/3] bg-surface-hover rounded-[var(--radius-md)] flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border hover:border-accent transition-colors">
                <Camera size={32} className="text-text-muted" />
                <span className="text-sm text-text-muted">Prendre une photo</span>
              </div>
            )}
          </label>
        </Card>

        {/* Identity */}
        <Card>
          <div className="space-y-3">
            <Input
              label="Nom du vin *"
              placeholder="Ex: Château Margaux"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Domaine"
              placeholder="Ex: Château Margaux"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />

            {/* Wine type */}
            <div>
              <label className="text-sm text-text-secondary font-medium mb-1.5 block">Type</label>
              <div className="flex flex-wrap gap-2">
                {WINE_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(type === t ? '' : t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                      type === t
                        ? 'bg-accent text-white'
                        : 'bg-surface-hover border border-border text-text-secondary hover:bg-surface-active'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <Input
              label="Millésime"
              type="number"
              placeholder="Ex: 2020"
              value={vintage}
              onChange={(e) => setVintage(e.target.value)}
            />

            <Input
              label="Appellation"
              placeholder="Ex: Margaux AOC"
              value={appellation}
              onChange={(e) => setAppellation(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Région"
                placeholder="Ex: Bordeaux"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              />
              <Input
                label="Pays"
                placeholder="Ex: France"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </div>
          </div>
        </Card>

        {/* Format */}
        <Card>
          <label className="text-sm text-text-secondary font-medium mb-2 block">Format de bouteille</label>
          <div className="grid grid-cols-3 gap-2">
            {BOTTLE_FORMATS.filter((f: BottleFormat) => ['37.5', '75', '150', '300'].includes(f.value)).map((f: BottleFormat) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setBottleSize(f.value)}
                className={`p-2 rounded-[var(--radius-md)] border text-center transition-colors cursor-pointer ${
                  bottleSize === f.value
                    ? 'border-accent bg-accent/10 text-accent-bright'
                    : 'border-border bg-surface-hover text-text-secondary hover:border-accent/50'
                }`}
              >
                <span className="text-xs font-medium block">{f.short}</span>
                <span className="text-[10px] text-text-muted">{f.liters}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* Quantity & Price */}
        <Card>
          <div className="space-y-4">
            <Stepper value={quantity} onChange={setQuantity} min={1} label="Quantité" />
            <Input
              label="Prix d'achat (€)"
              type="number"
              placeholder="Optionnel"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
            />
            <div>
              <label className="text-sm text-text-secondary font-medium mb-1.5 block">
                Mes notes (optionnel)
              </label>
              <textarea
                value={personalComment}
                onChange={(e) => setPersonalComment(e.target.value)}
                placeholder="Cadeau, occasion, commentaire personnel…"
                rows={3}
                maxLength={10000}
                className="w-full rounded-[var(--radius-md)] border border-border bg-surface-hover/40 px-3 py-2 text-sm text-text placeholder:text-text-muted outline-none focus:border-accent/40 resize-y min-h-[72px]"
              />
            </div>
          </div>
        </Card>

        {/* Slot picker */}
        <Card>
          <label className="text-sm text-text-secondary font-medium mb-1.5 block">
            Emplacement (optionnel)
          </label>
          <SlotPicker
            selectedSlots={selectedSlots}
            selectedLocationId={locationId}
            onSelect={(slots, locId) => { setSelectedSlots(slots); setLocationId(locId); }}
            maxSlots={quantity}
          />
        </Card>

        {/* Submit */}
        <Button
          variant="primary"
          className="w-full"
          loading={loading}
          onClick={handleSubmit}
        >
          <Plus size={16} /> Ajouter à la cave
        </Button>
      </div>
    </div>
  );
}
