import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hover?: boolean;
  padding?: boolean;
}

export function Card({ children, hover = false, padding = true, className = '', ...props }: CardProps) {
  return (
    <div
      className={`bg-surface rounded-[var(--radius-lg)] border border-border-subtle surface-noise overflow-hidden
        ${padding ? 'p-4' : ''}
        ${hover ? 'hover:bg-surface-hover hover:border-border transition-colors cursor-pointer' : ''}
        ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
