import { useEffect, useMemo, useState } from 'react';
import { CellarGrid } from './CellarGrid';
import { useLocationStore, type Location, type GridSlot } from '../../stores/location';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { ArrowRight } from 'lucide-react';

interface SlotPickerProps {
  selectedSlots: string[];
  selectedLocationId: string;
  onSelect: (slotIds: string[], locationId: string) => void;
  maxSlots?: number;
  wineIdBeingMoved?: string;
  /** Cases actuelles du vin — active le flux départ → arrivée (cadre or puis rouge) */
  sourceSlotIds?: string[];
  /** Pour désactiver « Enregistrer » tant que l’étape départ n’est pas terminée */
  onFlowPhaseChange?: (phase: 'source' | 'dest' | null) => void;
}

export function SlotPicker({
  selectedSlots,
  selectedLocationId,
  onSelect,
  maxSlots,
  wineIdBeingMoved,
  sourceSlotIds = [],
  onFlowPhaseChange,
}: SlotPickerProps) {
  const { locations, fetchLocations, fetchGrid } = useLocationStore();
  const [gridData, setGridData] = useState<{ location: Location; slots: GridSlot[] } | null>(null);

  const useMoveFlow = Boolean(wineIdBeingMoved && sourceSlotIds.length > 0);
  const sourceSlotsKey = useMemo(
    () => [...sourceSlotIds].sort().join('|'),
    [sourceSlotIds]
  );
  const [movePhase, setMovePhase] = useState<'source' | 'dest'>(() =>
    useMoveFlow ? 'source' : 'dest'
  );
  const [sourceConfirmedSlotId, setSourceConfirmedSlotId] = useState<string | null>(null);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  useEffect(() => {
    if (useMoveFlow) {
      setMovePhase('source');
      setSourceConfirmedSlotId(null);
    } else {
      setMovePhase('dest');
      setSourceConfirmedSlotId(null);
    }
  }, [useMoveFlow, wineIdBeingMoved, sourceSlotsKey]);

  useEffect(() => {
    if (!onFlowPhaseChange) return;
    if (!useMoveFlow) onFlowPhaseChange('dest');
    else onFlowPhaseChange(movePhase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useMoveFlow, movePhase]);

  const effectiveLocationId = useMemo(() => {
    if (!locations.length) return '';
    if (selectedLocationId && locations.some((l) => l.id === selectedLocationId)) {
      return selectedLocationId;
    }
    return locations[0].id;
  }, [locations, selectedLocationId]);

  useEffect(() => {
    if (!locations.length) return;
    const valid =
      selectedLocationId && locations.some((l) => l.id === selectedLocationId);
    if (!valid) {
      onSelect(selectedSlots, effectiveLocationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, selectedLocationId, effectiveLocationId]);

  useEffect(() => {
    if (!effectiveLocationId) {
      setGridData(null);
      return;
    }
    fetchGrid(effectiveLocationId).then(setGridData);
  }, [effectiveLocationId, fetchGrid]);

  const goToDestPhase = () => {
    onSelect([], effectiveLocationId);
    setMovePhase('dest');
    setSourceConfirmedSlotId(null);
  };

  const handleSlotClick = (slot: GridSlot) => {
    if (slot.slot.isBlocked) return;

    if (useMoveFlow && movePhase === 'source') {
      const isOurBottle =
        wineIdBeingMoved &&
        slot.wine?.id === wineIdBeingMoved &&
        sourceSlotIds.includes(slot.slot.id);
      if (!isOurBottle) return;
      setSourceConfirmedSlotId((prev) =>
        prev === slot.slot.id ? null : slot.slot.id
      );
      return;
    }

    // Phase destination ou ajout classique : cases vides uniquement
    if (slot.wine) return;

    const slotId = slot.slot.id;
    const isDeselecting = selectedSlots.includes(slotId);

    if (!isDeselecting && maxSlots !== undefined && selectedSlots.length >= maxSlots) return;

    const newSelection = isDeselecting
      ? selectedSlots.filter((s) => s !== slotId)
      : [...selectedSlots, slotId];

    onSelect(newSelection, effectiveLocationId);
  };

  const handleLocationChange = (newLoc: string) => {
    if (useMoveFlow && movePhase === 'source') return;
    onSelect([], newLoc);
  };

  const highlightPrimary =
    useMoveFlow && movePhase === 'source'
      ? sourceConfirmedSlotId
        ? [sourceConfirmedSlotId]
        : []
      : selectedSlots;

  const highlightSecondary =
    useMoveFlow && movePhase === 'source'
      ? sourceSlotIds.filter((id) => id !== sourceConfirmedSlotId)
      : [];

  if (locations.length === 0) {
    return (
      <div className="text-sm text-text-muted text-center py-4">
        Aucun emplacement configuré. Créez-en un dans les réglages.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {useMoveFlow && (
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <span
            className={`font-mono px-2 py-0.5 rounded ${movePhase === 'source' ? 'bg-wine-red/25 text-wine-red border border-wine-red/40' : 'bg-surface-hover border border-border'}`}
          >
            1 · Départ
          </span>
          <ArrowRight size={14} className="text-text-muted flex-shrink-0" />
          <span
            className={`font-mono px-2 py-0.5 rounded ${movePhase === 'dest' ? 'bg-wine-red/25 text-wine-red border border-wine-red/40' : 'bg-surface-hover border border-border'}`}
          >
            2 · Arrivée
          </span>
        </div>
      )}

      {useMoveFlow && movePhase === 'source' && (
        <p className="text-xs text-text-secondary leading-relaxed">
          Touchez <strong className="text-text">une case où se trouve encore cette bouteille</strong> (cadre rouge).
          Puis appuyez sur <strong className="text-text">Continuer</strong> pour choisir la ou les cases de destination.
        </p>
      )}

      {useMoveFlow && movePhase === 'dest' && (
        <p className="text-xs text-text-secondary leading-relaxed">
          Touchez les <strong className="text-text">cases vides</strong> où ranger la bouteille — jusqu’à{' '}
          {maxSlots ?? 1} case{maxSlots !== 1 ? 's' : ''}. Les cases sélectionnées ont un{' '}
          <strong className="text-wine-red">cadre rouge</strong>.
        </p>
      )}

      {!useMoveFlow && wineIdBeingMoved && (
        <p className="text-xs text-text-secondary leading-relaxed">
          Touchez les cases vides à assigner — <strong className="text-wine-red">cadre rouge</strong> = sélectionnée.
        </p>
      )}

      {!wineIdBeingMoved && (
        <p className="text-xs text-text-secondary leading-relaxed">
          Cases sélectionnées : <strong className="text-wine-red">cadre rouge</strong>.
        </p>
      )}

      <Select
        label="Emplacement"
        value={effectiveLocationId}
        onChange={(e) => handleLocationChange(e.target.value)}
        options={locations.map((l) => ({ value: l.id, label: `${l.name} (${l.type})` }))}
        disabled={useMoveFlow && movePhase === 'source'}
      />

      {gridData && (
        <CellarGrid
          location={gridData.location}
          slots={gridData.slots}
          onSlotClick={handleSlotClick}
          highlightPrimaryIds={highlightPrimary}
          highlightSecondaryIds={highlightSecondary}
          highlightSlots={[]}
          compact
        />
      )}

      {useMoveFlow && movePhase === 'source' && (
        <Button
          type="button"
          variant="primary"
          className="w-full"
          disabled={!sourceConfirmedSlotId}
          onClick={goToDestPhase}
        >
          Continuer : choisir la nouvelle place
        </Button>
      )}
    </div>
  );
}
