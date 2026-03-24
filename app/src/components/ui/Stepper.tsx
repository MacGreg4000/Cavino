import { Minus, Plus } from 'lucide-react';

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
}

export function Stepper({ value, onChange, min = 0, max = 999, label }: StepperProps) {
  return (
    <div className="flex items-center gap-3">
      {label && <span className="text-sm text-text-secondary mr-auto">{label}</span>}
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)] bg-surface-hover border border-border text-text-secondary hover:text-text hover:bg-surface-active disabled:opacity-30 transition-colors cursor-pointer"
      >
        <Minus size={16} />
      </button>
      <span className="w-10 text-center font-mono text-lg font-semibold text-text">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)] bg-surface-hover border border-border text-text-secondary hover:text-text hover:bg-surface-active disabled:opacity-30 transition-colors cursor-pointer"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
