import { useEffect, useState } from 'react';
import { CellarGrid } from './CellarGrid';
import { useLocationStore, type Location, type GridSlot } from '../../stores/location';
import { Select } from '../ui/Select';

interface SlotPickerProps {
  selectedSlots: string[];
  onSelect: (slotIds: string[], locationId: string) => void;
  maxSlots?: number;
}

export function SlotPicker({ selectedSlots, onSelect, maxSlots }: SlotPickerProps) {
  const { locations, fetchLocations, fetchGrid } = useLocationStore();
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [gridData, setGridData] = useState<{ location: Location; slots: GridSlot[] } | null>(null);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  useEffect(() => {
    if (locations.length > 0 && !selectedLocation) {
      setSelectedLocation(locations[0].id);
    }
  }, [locations, selectedLocation]);

  useEffect(() => {
    if (selectedLocation) {
      fetchGrid(selectedLocation).then(setGridData);
    }
  }, [selectedLocation, fetchGrid]);

  const handleSlotClick = (slot: GridSlot) => {
    if (slot.slot.isBlocked || slot.wine) return; // Can't pick occupied or blocked

    const slotId = slot.slot.id;
    const isDeselecting = selectedSlots.includes(slotId);

    if (!isDeselecting && maxSlots !== undefined && selectedSlots.length >= maxSlots) return;

    const newSelection = isDeselecting
      ? selectedSlots.filter((s) => s !== slotId)
      : [...selectedSlots, slotId];

    onSelect(newSelection, selectedLocation);
  };

  if (locations.length === 0) {
    return (
      <div className="text-sm text-text-muted text-center py-4">
        Aucun emplacement configuré. Créez-en un dans les réglages.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Select
        label="Emplacement"
        value={selectedLocation}
        onChange={(e) => setSelectedLocation(e.target.value)}
        options={locations.map((l) => ({ value: l.id, label: `${l.name} (${l.type})` }))}
      />

      {gridData && (
        <CellarGrid
          location={gridData.location}
          slots={gridData.slots}
          onSlotClick={handleSlotClick}
          highlightSlots={selectedSlots}
        />
      )}
    </div>
  );
}
