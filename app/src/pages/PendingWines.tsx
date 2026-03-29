import { useEffect, useState } from 'react';
import { Wine, Check, X, RefreshCw } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Stepper } from '../components/ui/Stepper';
import { Input } from '../components/ui/Input';
import { BottomSheet } from '../components/ui/BottomSheet';
import { EmptyState } from '../components/ui/EmptyState';
import { useWineStore, type Wine as WineType } from '../stores/wine';
import { useToast } from '../components/ui/Toast';
import { SlotPicker } from '../components/cellar/SlotPicker';
import { apiFetch } from '../lib/api';

function ValidationForm({ wine, onClose }: { wine: WineType; onClose: () => void }) {
  const { toast } = useToast();
  const validateWine = useWineStore((s) => s.validateWine);
  const deleteWine = useWineStore((s) => s.deleteWine);
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState('');
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [locationId, setLocationId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleValidate = async () => {
    setLoading(true);
    try {
      await validateWine(wine.id, {
        quantity,
        slotIds: selectedSlots,
        locationId: locationId || undefined,
        purchasePrice: price ? parseFloat(price) : undefined,
      });
      toast('success', `${wine.name} ajoutée à la cave !`);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur de validation';
      toast('error', msg);
    }
    setLoading(false);
  };

  const handleReject = async () => {
    await deleteWine(wine.id);
    toast('info', 'Bouteille rejetée');
    onClose();
  };

  return (
    <div className="space-y-4">
      {/* Wine info */}
      <div className="flex gap-3">
        {wine.photoUrl ? (
          <img src={wine.photoUrl} alt="" className="w-20 h-20 rounded-[var(--radius-md)] object-cover" />
        ) : (
          <div className="w-20 h-20 rounded-[var(--radius-md)] bg-surface-hover flex items-center justify-center">
            <Wine size={24} className="text-text-muted" />
          </div>
        )}
        <div className="flex-1">
          <h3 className="font-display font-semibold text-text">{wine.name}</h3>
          <p className="text-xs text-text-secondary mt-0.5">
            {wine.domain && `${wine.domain} · `}{wine.vintage || 'NV'}
          </p>
          <p className="text-xs text-text-secondary">{wine.appellation}</p>
          {wine.type && <Badge variant="default" className="mt-1">{wine.type}</Badge>}
        </div>
      </div>

      {/* Quantity */}
      <Stepper value={quantity} onChange={setQuantity} min={1} label="Quantité" />

      {/* Slot picker */}
      <div>
        <label className="text-sm text-text-secondary font-medium mb-1.5 block">Emplacement (optionnel)</label>
        <SlotPicker
          selectedSlots={selectedSlots}
          onSelect={(slots, locId) => { setSelectedSlots(slots); setLocationId(locId); }}
          maxSlots={quantity}
        />
      </div>

      {/* Price */}
      <Input
        label="Prix d'achat (€)"
        type="number"
        placeholder="Optionnel"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button variant="ghost" onClick={handleReject} className="flex-shrink-0">
          <X size={16} /> Rejeter
        </Button>
        <Button variant="primary" className="flex-1" loading={loading} onClick={handleValidate}>
          <Check size={16} /> Valider
        </Button>
      </div>
    </div>
  );
}

export function PendingWines() {
  const { pending, fetchPending } = useWineStore();
  const [selected, setSelected] = useState<WineType | null>(null);
  const [scanning, setScanning] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await apiFetch('/api/import/scan', { method: 'POST', body: '{}' });
      const data = await res.json();
      if (data.imported > 0) {
        toast('success', `${data.imported} bouteille(s) importée(s)`);
        fetchPending();
      } else if (data.errors?.length > 0) {
        toast('error', `Erreur : ${data.errors[0]}`);
      } else {
        toast('info', data.message || 'Aucun fichier à importer');
      }
    } catch {
      toast('error', 'Erreur lors du scan');
    }
    setScanning(false);
  };

  return (
    <div>
      <PageHeader title="À valider" subtitle={`${pending.length} bouteille${pending.length > 1 ? 's' : ''}`} back />

      <div className="px-4 pt-4 max-w-lg mx-auto">
        <div className="mb-4 flex justify-end">
          <Button variant="secondary" size="sm" loading={scanning} onClick={handleScan}>
            <RefreshCw size={14} /> Scanner l'inbox
          </Button>
        </div>

        {pending.length === 0 ? (
          <EmptyState
            icon={<Check size={48} />}
            title="Tout est validé"
            description="Aucune bouteille en attente"
          />
        ) : (
          <div className="flex flex-col gap-2">
            {pending.map((wine) => (
              <Card key={wine.id} hover className="!p-3" onClick={() => setSelected(wine)}>
                <div className="flex items-center gap-3">
                  {wine.photoUrl ? (
                    <img src={wine.photoUrl} alt="" className="w-14 h-14 rounded-[var(--radius-md)] object-cover" />
                  ) : (
                    <div className="w-14 h-14 rounded-[var(--radius-md)] bg-surface-hover flex items-center justify-center">
                      <Wine size={20} className="text-text-muted" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text truncate">{wine.name}</p>
                    <p className="text-xs text-text-secondary">
                      {wine.domain && `${wine.domain} · `}{wine.vintage || 'NV'}
                    </p>
                    {wine.type && <Badge variant="default" className="mt-1">{wine.type}</Badge>}
                  </div>
                  <Badge variant="warning" dot>Pending</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <BottomSheet
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Valider l'import"
      >
        {selected && <ValidationForm wine={selected} onClose={() => setSelected(null)} />}
      </BottomSheet>
    </div>
  );
}
