import { Wine } from 'lucide-react';
import type { GridSlot } from '../../stores/location';
import { WinePhoto } from '../ui/WinePhoto';

interface GridCellProps {
  slot: GridSlot;
  label: string;
  onClick?: (slot: GridSlot) => void;
  highlight?: boolean;
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

export function GridCell({ slot, label, onClick, highlight }: GridCellProps) {
  const isBlocked = slot.slot.isBlocked;
  const isOccupied = !!slot.wine;
  const isEmpty = !isBlocked && !isOccupied;

  const wineType = slot.wine?.type?.toLowerCase() || '';
  const colorClass = wineTypeColor[wineType] || 'text-text-muted';
  const bgClass = wineTypeBg[wineType] || 'bg-surface-hover';

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
        ${highlight ? 'animate-pulse-gold ring-1 ring-gold/50' : ''}
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
