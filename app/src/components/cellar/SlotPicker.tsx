import { useEffect, useMemo, useState } from 'react';
import { CellarGrid } from './CellarGrid';
import { useLocationStore, type Location, type GridSlot } from '../../stores/location';
import { Select } from '../ui/Select';

interface SlotPickerProps {
  selectedSlots: string[];
  /** Cave / emplacement dont la grille est affichée (contrôlé par le parent) */
  selectedLocationId: string;
  onSelect: (slotIds: string[], locationId: string) => void;
  maxSlots?: number;
  /** Si défini, les cases occupées par ce vin restent cliquables (déplacement / désélection) */
  wineIdBeingMoved?: string;
}

export function SlotPicker({
  selectedSlots,
  selectedLocationId,
  onSelect,
  maxSlots,
  wineIdBeingMoved,
}: SlotPickerProps) {
  const { locations, fetchLocations, fetchGrid } = useLocationStore();
  const [gridData, setGridData] = useState<{ location: Location; slots: GridSlot[] } | null>(null);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const effectiveLocationId = useMemo(() => {
    if (!locations.length) return '';
    if (selectedLocationId && locations.some((l) => l.id === selectedLocationId)) {
      return selectedLocationId;
    }
    return locations[0].id;
  }, [locations, selectedLocationId]);

  /**
   * Corrige un locationId obsolète ou vide une fois les emplacements chargés.
   * On conserve selectedSlots si déjà choisis (ex. vin avec cases mais sans locationId en base).
   */
  useEffect(() => {
    if (!locations.length) return;
    const valid =
      selectedLocationId && locations.some((l) => l.id === selectedLocationId);
    if (!valid) {
      onSelect(selectedSlots, effectiveLocationId);
    }
    // onSelect : fonction inline côté parent, ne pas mettre dans les deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, selectedLocationId, effectiveLocationId]);

  useEffect(() => {
    if (!effectiveLocationId) {
      setGridData(null);
      return;
    }
    fetchGrid(effectiveLocationId).then(setGridData);
  }, [effectiveLocationId, fetchGrid]);

  const handleSlotClick = (slot: GridSlot) => {
    if (slot.slot.isBlocked) return;

    const occupiedByOther =
      slot.wine && (!wineIdBeingMoved || slot.wine.id !== wineIdBeingMoved);
    if (occupiedByOther) return;

    const slotId = slot.slot.id;
    const isDeselecting = selectedSlots.includes(slotId);

    if (!isDeselecting && maxSlots !== undefined && selectedSlots.length >= maxSlots) return;

    const newSelection = isDeselecting
      ? selectedSlots.filter((s) => s !== slotId)
      : [...selectedSlots, slotId];

    onSelect(newSelection, effectiveLocationId);
  };

  const handleLocationChange = (newLoc: string) => {
    onSelect([], newLoc);
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
        value={effectiveLocationId}
        onChange={(e) => handleLocationChange(e.target.value)}
        options={locations.map((l) => ({ value: l.id, label: `${l.name} (${l.type})` }))}
      />

      {gridData && (
        <CellarGrid
          location={gridData.location}
          slots={gridData.slots}
          onSlotClick={handleSlotClick}
          highlightSlots={selectedSlots}
          compact
        />
      )}
    </div>
  );
}
