import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings as SettingsIcon, MapPin, Plus, Wine, FileDown, Loader2 } from 'lucide-react';
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
  const [pdfLoading, setPdfLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      const resp = await apiFetch('/api/pdf/wine-list');
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Erreur inconnue' }));
        toast('error', err.error || 'Impossible de générer le PDF');
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'carte-des-vins.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast('error', 'Erreur lors de la génération du PDF');
    } finally {
      setPdfLoading(false);
    }
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

        {/* PDF export */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <FileDown size={16} className="text-accent" />
            <h3 className="text-sm font-semibold">Exporter</h3>
          </div>
          <p className="text-xs text-text-muted mb-3">
            Génère la carte des vins en PDF — mise en page luxe avec photo et description pour chaque bouteille.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
          >
            {pdfLoading
              ? <><Loader2 size={14} className="animate-spin" /> Génération…</>
              : <><FileDown size={14} /> Télécharger la carte des vins</>
            }
          </Button>
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
