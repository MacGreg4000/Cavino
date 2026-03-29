import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Settings as SettingsIcon, MapPin, Plus, Wine } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useLocationStore } from '../stores/location';
import { useWineStore } from '../stores/wine';

export function Settings() {
  const { locations, fetchLocations } = useLocationStore();
  const wines = useWineStore((s) => s.wines);
  const pendingCount = useWineStore((s) => s.pendingCount);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

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
            <p>Cavino v4.0</p>
            <p>Cave Noire — Luxury Dark</p>
            <p className="text-text-muted text-xs mt-2">Architecture offline-first, zéro IA en production</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
