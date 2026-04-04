import { Wine } from 'lucide-react';
import type { GridSlot } from '../../stores/location';
import { WinePhoto } from '../ui/WinePhoto';

export type CellHighlight = 'none' | 'candidate' | 'selected-red';

interface GridCellProps {
  slot: GridSlot;
  label: string;
  onClick?: (slot: GridSlot) => void;
  /** @deprecated utiliser highlightKind */
  highlight?: boolean;
  /** candidate = cases actuelles (or); selected-red = sélection explicite (rouge cave) */
  highlightKind?: CellHighlight;
}

const wineTypeColor: Record<string, string> = {
  rouge: 'text-wine-red',
  blanc: 'text-wine-white',
  rosé: 'text-wine-rose',
  champagne: 'text-wine-champagne',
  effervescent: 'text-wine-champagne',
  moelleux: 'text-wine-sweet',
  liquoreux: 'text-wine-sweet',
};

const wineTypeBg: Record<string, string> = {
  rouge: 'bg-wine-red/15',
  blanc: 'bg-wine-white/10',
  rosé: 'bg-wine-rose/15',
  champagne: 'bg-champagne/10',
  effervescent: 'bg-champagne/10',
};

const highlightClasses: Record<Exclude<CellHighlight, 'none'>, string> = {
  candidate:
    'ring-2 ring-gold/50 ring-offset-1 ring-offset-bg border-gold/40 bg-gold/15 z-[3]',
  'selected-red':
    'ring-2 ring-wine-red border-wine-red/90 bg-wine-red/30 shadow-[0_0_12px_rgba(139,26,26,0.45)] z-[3]',
};

export function GridCell({ slot, label, onClick, highlight, highlightKind = 'none' }: GridCellProps) {
  const isBlocked = slot.slot.isBlocked;
  const isOccupied = !!slot.wine;
  const isEmpty = !isBlocked && !isOccupied;

  const wineType = slot.wine?.type?.toLowerCase() || '';
  const colorClass = wineTypeColor[wineType] || 'text-text-muted';
  const bgClass = wineTypeBg[wineType] || 'bg-surface-hover';

  const effectiveKind: CellHighlight =
    highlightKind !== 'none'
      ? highlightKind
      : highlight
        ? 'candidate'
        : 'none';

  return (
    <button
      type="button"
      disabled={isBlocked}
      onClick={() => onClick?.(slot)}
      className={`
        relative flex flex-col items-center justify-center gap-0.5
        aspect-square rounded-[var(--radius-sm)] border transition-all duration-150 cursor-pointer
        ${isBlocked
          ? 'bg-bg border-border-subtle opacity-30 cursor-not-allowed'
          : isOccupied
            ? `${bgClass} border-border hover:brightness-110 active:scale-95`
            : 'bg-surface-hover/50 border-border-subtle hover:border-border hover:bg-surface-hover active:scale-95'
        }
        ${effectiveKind !== 'none' ? highlightClasses[effectiveKind] : ''}
      `}
    >
      {isOccupied && slot.wine?.photoUrl ? (
        <>
          <div className="absolute inset-0 rounded-[var(--radius-sm)] overflow-hidden">
            <WinePhoto src={slot.wine.photoUrl} alt="" className="h-full w-full" />
          </div>
          <div className="absolute inset-0 bg-black/10 rounded-[var(--radius-sm)] pointer-events-none z-[1]" />
          <span className="relative z-[2] font-mono text-[9px] leading-none text-white drop-shadow-md">
            {label}
          </span>
        </>
      ) : (
        <>
          {isOccupied && (
            <Wine size={16} className={colorClass} strokeWidth={2} />
          )}
          {isEmpty && (
            <div className="w-2 h-2 rounded-full bg-border-subtle" />
          )}
          <span className="font-mono text-[9px] leading-none text-text-muted">
            {label}
          </span>
        </>
      )}
    </button>
  );
}
