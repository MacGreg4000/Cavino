import React from 'react';
import { Wine } from 'lucide-react';
import { GridCell } from './GridCell';
import type { GridSlot, Location } from '../../stores/location';

interface CellarGridProps {
  location: Location;
  slots: GridSlot[];
  onSlotClick?: (slot: GridSlot) => void;
  highlightSlots?: string[];
  compact?: boolean;
}

export function CellarGrid({ location, slots, onSlotClick, highlightSlots = [], compact = false }: CellarGridProps) {
  const config = location.gridConfig;
  if (!config) return null;

  const { rows, cols, labelRows, labelCols } = config;

  // Build a slot lookup map by "rowIndex-colIndex"
  const slotMap = new Map<string, GridSlot>();
  for (const s of slots) {
    slotMap.set(`${s.slot.rowIndex}-${s.slot.colIndex}`, s);
  }

  // Use a single CSS grid for the entire board (label column + data columns)
  // This guarantees perfect alignment between headers and cells
  const gridCols = compact
    ? `1.75rem repeat(${cols}, 1.75rem)`
    : `1.75rem repeat(${cols}, 1fr)`;

  return (
    <div className={`space-y-2 ${compact ? 'w-fit mx-auto' : ''}`}>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: gridCols }}
      >
        {/* Top-left corner (empty) */}
        <div />
        {/* Column headers */}
        {labelCols.map((label, c) => (
          <div key={c} className="text-center text-[10px] font-mono text-text-muted">
            {label}
          </div>
        ))}

        {/* Grid rows: row label + cells */}
        {Array.from({ length: rows }, (_, r) => (
          <React.Fragment key={r}>
            {/* Row label */}
            <div className="text-right text-[10px] font-mono text-text-muted flex items-center justify-end">
              {labelRows[r]}
            </div>

            {/* Row cells */}
            {Array.from({ length: cols }, (_, c) => {
              const key = `${r}-${c}`;
              const slot = slotMap.get(key);
              if (!slot) return <div key={`${r}-${c}`} />;

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
          </React.Fragment>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 pt-2 pl-8 text-[10px] text-text-muted">
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
