import { Wine } from 'lucide-react';
import { GridCell } from './GridCell';
import type { GridSlot, Location } from '../../stores/location';

interface CellarGridProps {
  location: Location;
  slots: GridSlot[];
  onSlotClick?: (slot: GridSlot) => void;
  highlightSlots?: string[];
}

export function CellarGrid({ location, slots, onSlotClick, highlightSlots = [] }: CellarGridProps) {
  const config = location.gridConfig;
  if (!config) return null;

  const { rows, cols, labelRows, labelCols } = config;

  // Build a slot lookup map by "rowIndex-colIndex"
  const slotMap = new Map<string, GridSlot>();
  for (const s of slots) {
    slotMap.set(`${s.slot.rowIndex}-${s.slot.colIndex}`, s);
  }

  return (
    <div className="space-y-2">
      {/* Column headers */}
      <div
        className="grid gap-1 pl-7"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {labelCols.map((label, c) => (
          <div key={c} className="text-center text-[10px] font-mono text-text-muted">
            {label}
          </div>
        ))}
      </div>

      {/* Grid rows */}
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-1 items-center">
          {/* Row label */}
          <div className="w-6 text-right text-[10px] font-mono text-text-muted shrink-0">
            {labelRows[r]}
          </div>

          {/* Row cells */}
          <div
            className="grid gap-1 flex-1"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: cols }, (_, c) => {
              const key = `${r}-${c}`;
              const slot = slotMap.get(key);
              if (!slot) return <div key={c} />;

              const label = `${labelRows[r]}${labelCols[c]}`;
              return (
                <GridCell
                  key={slot.slot.id}
                  slot={slot}
                  label={label}
                  onClick={onSlotClick}
                  highlight={highlightSlots.includes(slot.slot.id)}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* Legend */}
      <div className="flex items-center gap-4 pt-2 px-7 text-[10px] text-text-muted">
        <span className="flex items-center gap-1">
          <Wine size={10} className="text-wine-red" /> Rouge
        </span>
        <span className="flex items-center gap-1">
          <Wine size={10} className="text-wine-white" /> Blanc
        </span>
        <span className="flex items-center gap-1">
          <Wine size={10} className="text-wine-rose" /> Rosé
        </span>
        <span className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-border-subtle" /> Vide
        </span>
      </div>
    </div>
  );
}
