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
  /** Pour désactiver « Enregistrer » tant que l'étape départ n'est pas terminée */
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

  // Mode move flow : grille unique + dropdown (flux départ → arrivée en 2 étapes)
  const [gridData, setGridData] = useState<{ location: Location; slots: GridSlot[] } | null>(null);

  // Mode normal : toutes les grilles affichées en même temps
  const [allGrids, setAllGrids] = useState<Map<string, { location: Location; slots: GridSlot[] }>>(new Map());

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

  // ── Move flow : grille unique basée sur effectiveLocationId ──────────────────
  const effectiveLocationId = useMemo(() => {
    if (!locations.length) return '';
    if (selectedLocationId && locations.some((l) => l.id === selectedLocationId)) {
      return selectedLocationId;
    }
    return locations[0].id;
  }, [locations, selectedLocationId]);

  useEffect(() => {
    if (!useMoveFlow) return;
    if (!effectiveLocationId) { setGridData(null); return; }
    fetchGrid(effectiveLocationId).then(setGridData);
  }, [useMoveFlow, effectiveLocationId, fetchGrid]);

  // ── Mode normal : toutes les grilles en parallèle ────────────────────────────
  useEffect(() => {
    if (useMoveFlow || !locations.length) return;
    Promise.all(
      locations.map((loc) => fetchGrid(loc.id).then((data) => [loc.id, data] as const))
    ).then((entries) => setAllGrids(new Map(entries)));
  }, [useMoveFlow, locations, fetchGrid]);

  // ── Move flow helpers ─────────────────────────────────────────────────────────
  const goToDestPhase = () => {
    onSelect([], effectiveLocationId);
    setMovePhase('dest');
    setSourceConfirmedSlotId(null);
  };

  const handleMoveFlowSlotClick = (slot: GridSlot) => {
    if (slot.slot.isBlocked) return;
    if (movePhase === 'source') {
      const isOurBottle =
        wineIdBeingMoved &&
        slot.wine?.id === wineIdBeingMoved &&
        sourceSlotIds.includes(slot.slot.id);
      if (!isOurBottle) return;
      setSourceConfirmedSlotId((prev) => prev === slot.slot.id ? null : slot.slot.id);
      return;
    }
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
    if (movePhase === 'source') return;
    onSelect(selectedSlots, newLoc);
  };

  // ── Mode normal : clic dans n'importe quelle grille ──────────────────────────
  const handleNormalSlotClick = (slot: GridSlot, locationId: string) => {
    if (slot.slot.isBlocked) return;
    const slotId = slot.slot.id;
    const isDeselecting = selectedSlots.includes(slotId);

    // Bloquer uniquement les cases d'UN AUTRE vin (pas les propres cases de ce vin)
    if (slot.wine && !isDeselecting) return;

    let newSelection: string[];
    if (isDeselecting) {
      // Désélectionner cette case
      newSelection = selectedSlots.filter((s) => s !== slotId);
    } else if (maxSlots === 1 && selectedSlots.length >= 1) {
      // Vin à 1 bouteille : clic direct sur une case vide = déplacement en 1 clic
      newSelection = [slotId];
    } else if (maxSlots === undefined || selectedSlots.length < maxSlots) {
      // Vin multi-bouteilles : ajouter la case (l'utilisateur désélectionne d'abord l'ancienne)
      newSelection = [...selectedSlots, slotId];
    } else {
      // maxSlots atteint et multi-bouteilles → ignorer (l'utilisateur doit d'abord libérer une case)
      return;
    }
    onSelect(newSelection, locationId);
  };

  if (locations.length === 0) {
    return (
      <div className="text-sm text-text-muted text-center py-4">
        Aucun emplacement configuré. Créez-en un dans les réglages.
      </div>
    );
  }

  // ── Mode move flow : dropdown + grille unique ─────────────────────────────────
  if (useMoveFlow) {
    const highlightPrimary = movePhase === 'source'
      ? (sourceConfirmedSlotId ? [sourceConfirmedSlotId] : [])
      : selectedSlots;
    const highlightSecondary = movePhase === 'source'
      ? sourceSlotIds.filter((id) => id !== sourceConfirmedSlotId)
      : [];

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <span className={`font-mono px-2 py-0.5 rounded ${movePhase === 'source' ? 'bg-wine-red/25 text-wine-red border border-wine-red/40' : 'bg-surface-hover border border-border'}`}>
            1 · Départ
          </span>
          <ArrowRight size={14} className="text-text-muted flex-shrink-0" />
          <span className={`font-mono px-2 py-0.5 rounded ${movePhase === 'dest' ? 'bg-wine-red/25 text-wine-red border border-wine-red/40' : 'bg-surface-hover border border-border'}`}>
            2 · Arrivée
          </span>
        </div>
        {movePhase === 'source' && (
          <p className="text-xs text-text-secondary leading-relaxed">
            Touchez <strong className="text-text">la case où se trouve encore cette bouteille</strong> (cadre rouge).
            Puis appuyez sur <strong className="text-text">Continuer</strong>.
          </p>
        )}
        {movePhase === 'dest' && (
          <p className="text-xs text-text-secondary leading-relaxed">
            Touchez les <strong className="text-text">cases vides</strong> de destination —{' '}
            <strong className="text-wine-red">cadre rouge</strong> = sélectionnée.
          </p>
        )}
        <Select
          label="Emplacement"
          value={effectiveLocationId}
          onChange={(e) => handleLocationChange(e.target.value)}
          options={locations.map((l) => ({ value: l.id, label: `${l.name} (${l.type})` }))}
          disabled={movePhase === 'source'}
        />
        {gridData && (
          <CellarGrid
            location={gridData.location}
            slots={gridData.slots}
            onSlotClick={handleMoveFlowSlotClick}
            highlightPrimaryIds={highlightPrimary}
            highlightSecondaryIds={highlightSecondary}
            highlightSlots={[]}
            compact
          />
        )}
        {movePhase === 'source' && (
          <Button type="button" variant="primary" className="w-full" disabled={!sourceConfirmedSlotId} onClick={goToDestPhase}>
            Continuer : choisir la nouvelle place
          </Button>
        )}
      </div>
    );
  }

  // ── Mode normal : toutes les grilles empilées ─────────────────────────────────
  const selectedCount = selectedSlots.length;
  const remaining = maxSlots !== undefined ? maxSlots - selectedCount : null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-secondary leading-relaxed">
        {maxSlots === 1 ? (
          <>
            Touchez une case vide pour <strong className="text-text">déplacer directement</strong> la bouteille{' '}
            <strong className="text-gold">(cadre doré)</strong>.
          </>
        ) : (
          <>
            Touchez une case <strong className="text-gold">dorée</strong> pour la désélectionner,
            puis une case vide pour la remplacer.{' '}
            {remaining !== null && remaining > 0 && (
              <span className="text-text-muted">{remaining} case{remaining !== 1 ? 's' : ''} encore à choisir.</span>
            )}
          </>
        )}
      </p>

      {locations.map((loc) => {
        const grid = allGrids.get(loc.id);
        return (
          <div key={loc.id}>
            <p className="text-xs font-semibold text-text-secondary mb-1.5 flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: loc.color ?? '#8B1A1A' }}
              />
              {loc.name}
            </p>
            {grid ? (
              <CellarGrid
                location={grid.location}
                slots={grid.slots}
                onSlotClick={(slot) => handleNormalSlotClick(slot, loc.id)}
                highlightPrimaryIds={selectedSlots}
                highlightSecondaryIds={[]}
                highlightSlots={[]}
                compact
              />
            ) : (
              <div className="h-10 flex items-center justify-center text-xs text-text-muted animate-pulse">
                Chargement…
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
