import type { ReactNode } from 'react';

type BadgeVariant = 'default' | 'red' | 'white' | 'rose' | 'champagne' | 'gold' | 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-surface-hover text-text-secondary border-border',
  red: 'bg-wine-red/20 text-[#E8A0A0] border-wine-red/30',
  white: 'bg-wine-white/15 text-wine-white border-wine-white/25',
  rose: 'bg-wine-rose/20 text-wine-rose border-wine-rose/30',
  champagne: 'bg-champagne/15 text-champagne border-champagne/25',
  gold: 'bg-gold/15 text-gold border-gold/30',
  success: 'bg-success/20 text-[#52B788] border-success/30',
  warning: 'bg-warning/20 text-warning border-warning/30',
  danger: 'bg-danger/20 text-danger border-danger/30',
  info: 'bg-info/20 text-info border-info/30',
};

export function Badge({ children, variant = 'default', dot, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-[var(--radius-full)] border ${variantStyles[variant]} ${className}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

// Badge numérique pour la navigation (notifications)
export function CountBadge({ count, className = '' }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold rounded-full bg-accent-bright text-text ${className}`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}
