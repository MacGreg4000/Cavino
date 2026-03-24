import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { MapPin, Plus, Settings, Wine } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { BottomSheet } from '../components/ui/BottomSheet';
import { EmptyState } from '../components/ui/EmptyState';
import { CellarGrid } from '../components/cellar/CellarGrid';
import { useLocationStore, type Location, type GridSlot } from '../stores/location';

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
  const { fetchGrid } = useLocationStore();
  const [data, setData] = useState<{ location: Location; slots: GridSlot[] } | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<GridSlot | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchGrid(locationId).then(setData);
  }, [locationId, fetchGrid]);

  if (!data) return <div className="text-center text-text-muted py-8">Chargement...</div>;

  const occupiedCount = data.slots.filter((s) => s.wine).length;
  const totalSlots = data.slots.filter((s) => !s.slot.isBlocked).length;

  return (
    <div>
      <PageHeader
        title={data.location.name}
        subtitle={`${occupiedCount}/${totalSlots} occupés`}
        back
        action={
          <Link to={`/cellar/${locationId}/edit`} className="p-2 text-text-secondary hover:text-text">
            <Settings size={18} />
          </Link>
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
          </div>
        )}
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
