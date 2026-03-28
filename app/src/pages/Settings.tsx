import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings as SettingsIcon, MapPin, Plus, Wine, RefreshCw } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useLocationStore } from '../stores/location';
import { useWineStore } from '../stores/wine';
import { apiFetch } from '../lib/api';
import { useToast } from '../components/ui/Toast';

export function Settings() {
  const { locations, fetchLocations } = useLocationStore();
  const wines = useWineStore((s) => s.wines);
  const pendingCount = useWineStore((s) => s.pendingCount);
  const { fetchPending } = useWineStore();
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await apiFetch('/api/import/scan', { method: 'POST' });
      const data = await res.json();
      if (data.imported > 0) {
        toast({ title: `${data.imported} bouteille(s) importée(s)`, variant: 'success' });
        fetchPending();
      } else if (data.errors?.length > 0) {
        toast({ title: `Erreurs : ${data.errors[0]}`, variant: 'error' });
      } else {
        toast({ title: data.message || 'Aucun fichier à importer', variant: 'default' });
      }
    } catch {
      toast({ title: 'Erreur lors du scan', variant: 'error' });
    }
    setScanning(false);
  };

  return (
    <div>
      <PageHeader title="Réglages" />

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-4 pb-8">
        {/* Locations */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={16} className="text-accent" />
            <h3 className="text-sm font-semibold">Emplacements</h3>
            <span className="ml-auto text-xs text-text-secondary font-mono">{locations.length}</span>
          </div>
          {locations.length > 0 ? (
            <div className="space-y-2 mb-3">
              {locations.map((loc) => (
                <Link key={loc.id} to={`/cellar/${loc.id}`} className="flex items-center gap-2 text-sm text-text-secondary hover:text-text transition-colors">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: loc.color || '#8B1A1A' }} />
                  <span className="flex-1">{loc.name}</span>
                  <Badge variant="default">{loc.type}</Badge>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted mb-3">Aucun emplacement configuré</p>
          )}
          <Link to="/cellar/new">
            <Button variant="secondary" size="sm">
              <Plus size={14} /> Ajouter un emplacement
            </Button>
          </Link>
        </Card>

        {/* Import */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <RefreshCw size={16} className="text-accent" />
            <h3 className="text-sm font-semibold">Import inbox</h3>
          </div>
          <p className="text-xs text-text-muted mb-3">Scanne le dossier <span className="font-mono">data/inbox</span> et importe les fichiers JSON + photo présents.</p>
          <Button variant="secondary" size="sm" loading={scanning} onClick={handleScan}>
            <RefreshCw size={14} /> Lancer le scan
          </Button>
        </Card>

        {/* Data summary */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Wine size={16} className="text-champagne" />
            <h3 className="text-sm font-semibold">Données</h3>
          </div>
          <div className="space-y-1.5 text-sm text-text-secondary">
            <div className="flex justify-between">
              <span>Bouteilles en cave</span>
              <span className="font-mono">{wines.length}</span>
            </div>
            <div className="flex justify-between">
              <span>En attente de validation</span>
              <span className="font-mono">{pendingCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Emplacements</span>
              <span className="font-mono">{locations.length}</span>
            </div>
          </div>
        </Card>

        {/* About */}
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <SettingsIcon size={16} className="text-text-muted" />
            <h3 className="text-sm font-semibold">À propos</h3>
          </div>
          <div className="space-y-1 text-sm text-text-secondary">
            <p>Caveau v4.0</p>
            <p>Cave Noire — Luxury Dark</p>
            <p className="text-text-muted text-xs mt-2">Architecture offline-first, zéro IA en production</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
