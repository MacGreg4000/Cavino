import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { MapPin, Plus, Settings, ArrowRightLeft, Trash2, AlertTriangle } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { BottomSheet } from '../components/ui/BottomSheet';
import { EmptyState } from '../components/ui/EmptyState';
import { CellarGrid } from '../components/cellar/CellarGrid';
import { useLocationStore, type Location, type GridSlot } from '../stores/location';
import { useToast } from '../components/ui/Toast';

function LocationCard({ location }: { location: Location }) {
  const config = location.gridConfig;
  const totalSlots = config ? config.rows * config.cols - (config.blockedSlots?.length || 0) : 0;

  return (
    <Link to={`/cellar/${location.id}`}>
      <Card hover className="!p-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center"
            style={{ backgroundColor: (location.color || '#8B1A1A') + '20' }}
          >
            <MapPin size={18} style={{ color: location.color || '#8B1A1A' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text truncate">{location.name}</p>
            <p className="text-xs text-text-secondary capitalize">
              {location.type} · {config ? `${config.rows}×${config.cols}` : '—'} · {totalSlots} slots
            </p>
          </div>
          <Badge variant="default">{location.type}</Badge>
        </div>
      </Card>
    </Link>
  );
}

// Detail view for a single location's grid
function LocationGrid({ locationId }: { locationId: string }) {
  const { fetchGrid, deleteLocation } = useLocationStore();
  const [data, setData] = useState<{ location: Location; slots: GridSlot[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<GridSlot | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    setData(null);
    setLoadError(null);
    fetchGrid(locationId)
      .then(setData)
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Grille indisponible'));
  }, [locationId, fetchGrid]);

  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-3 text-center py-12 px-4">
        <AlertTriangle size={32} className="text-text-muted" />
        <p className="text-sm text-text-secondary">{loadError}</p>
        <Link to="/cellar" className="text-sm text-accent-bright underline underline-offset-2">
          Retour aux emplacements
        </Link>
      </div>
    );
  }

  if (!data) return <div className="text-center text-text-muted py-8">Chargement...</div>;

  const occupiedCount = data.slots.filter((s) => s.wine).length;
  const totalSlots = data.slots.filter((s) => !s.slot.isBlocked).length;

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteLocation(locationId);
      toast('success', `${data.location.name} supprimé`);
      navigate('/cellar');
    } catch (err: unknown) {
      const e = err as { status?: number; data?: { message?: string } };
      if (e.status === 409) {
        setDeleteError(e.data?.message || 'Ce casier contient des bouteilles. Déplacez-les avant de supprimer.');
      } else {
        setDeleteError('Erreur lors de la suppression.');
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={data.location.name}
        subtitle={`${occupiedCount}/${totalSlots} occupés`}
        back
        action={
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setShowDelete(true); setDeleteError(null); }}
              className="p-2 text-text-secondary hover:text-danger transition-colors"
              title="Supprimer le casier"
            >
              <Trash2 size={18} />
            </button>
            <Link to={`/cellar/${locationId}/edit`} className="p-2 text-text-secondary hover:text-text">
              <Settings size={18} />
            </Link>
          </div>
        }
      />

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-4 pb-8">
        {/* Occupancy bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-surface-hover rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all"
              style={{ width: `${totalSlots > 0 ? (occupiedCount / totalSlots) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs text-text-secondary font-mono">
            {totalSlots > 0 ? Math.round((occupiedCount / totalSlots) * 100) : 0}%
          </span>
        </div>

        {/* Grid */}
        <Card padding={false} className="!p-3">
          <CellarGrid
            location={data.location}
            slots={data.slots}
            onSlotClick={(slot) => {
              if (slot.wine) {
                setSelectedSlot(slot);
              }
            }}
          />
        </Card>
      </div>

      {/* Wine info bottom sheet */}
      <BottomSheet
        open={!!selectedSlot}
        onClose={() => setSelectedSlot(null)}
        title={selectedSlot?.wine?.name || ''}
      >
        {selectedSlot?.wine && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant={selectedSlot.wine.type?.toLowerCase() === 'rouge' ? 'red' : 'white'}>
                {selectedSlot.wine.type}
              </Badge>
              <span className="text-sm text-text-secondary">
                {selectedSlot.wine.vintage || 'NV'}
              </span>
              {selectedSlot.wine.domain && (
                <span className="text-sm text-text-secondary">{selectedSlot.wine.domain}</span>
              )}
            </div>
            {selectedSlot.wine.currentPhase && (
              <p className="text-xs text-text-secondary">Phase : {selectedSlot.wine.currentPhase}</p>
            )}
            <p className="text-xs text-text-muted font-mono">Slot : {selectedSlot.slot.id}</p>
            <Button
              variant="primary"
              className="w-full"
              onClick={() => {
                navigate(`/cave/${selectedSlot.wine!.id}`);
                setSelectedSlot(null);
              }}
            >
              Voir la fiche
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                navigate(`/cave/${selectedSlot.wine!.id}`, { state: { openSlotPicker: true } });
                setSelectedSlot(null);
              }}
            >
              <ArrowRightLeft size={16} /> Déplacer ailleurs
            </Button>
            <p className="text-[11px] text-text-muted text-center leading-relaxed">
              « Déplacer ailleurs » ouvre tout de suite le choix de cave et de cases sur la fiche.
            </p>
          </div>
        )}
      </BottomSheet>

      {/* Delete confirmation bottom sheet */}
      <BottomSheet
        open={showDelete}
        onClose={() => { setShowDelete(false); setDeleteError(null); }}
        title="Supprimer le casier"
      >
        <div className="space-y-4">
          {deleteError ? (
            <div className="flex items-start gap-2.5 bg-danger/10 border border-danger/30 rounded-[var(--radius-md)] px-3 py-3">
              <AlertTriangle size={16} className="text-danger flex-shrink-0 mt-0.5" />
              <p className="text-sm text-danger">{deleteError}</p>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 bg-warning/10 border border-warning/30 rounded-[var(--radius-md)] px-3 py-3">
              <AlertTriangle size={16} className="text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-warning">Action irréversible</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  Le casier <span className="font-semibold">{data.location.name}</span> et toutes ses cases vides seront supprimés définitivement.
                </p>
              </div>
            </div>
          )}

          {!deleteError && (
            <Button
              variant="danger"
              className="w-full"
              loading={deleting}
              onClick={handleDelete}
            >
              <Trash2 size={16} /> Supprimer définitivement
            </Button>
          )}
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => { setShowDelete(false); setDeleteError(null); }}
          >
            Annuler
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

// Main cellar view: either list of locations or a single grid
export function CellarView() {
  const { id } = useParams<{ id: string }>();
  const { locations, fetchLocations } = useLocationStore();

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  // If an ID is given, show that location's grid
  if (id) return <LocationGrid locationId={id} />;

  // Otherwise show list of all locations
  return (
    <div>
      <PageHeader
        title="Casiers"
        subtitle={`${locations.length} emplacement${locations.length > 1 ? 's' : ''}`}
        back
        action={
          <Link to="/cellar/new">
            <Button variant="secondary" size="sm">
              <Plus size={14} /> Ajouter
            </Button>
          </Link>
        }
      />

      <div className="px-4 pt-4 max-w-lg mx-auto">
        {locations.length === 0 ? (
          <EmptyState
            icon={<MapPin size={48} />}
            title="Aucun emplacement"
            description="Créez votre premier casier pour organiser votre cave"
            action={
              <Link to="/cellar/new">
                <Button variant="primary">
                  <Plus size={16} /> Créer un emplacement
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {locations.map((loc) => (
              <LocationCard key={loc.id} location={loc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
