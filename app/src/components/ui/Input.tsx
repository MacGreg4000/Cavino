import { type InputHTMLAttributes, forwardRef } from 'react';
import { Search } from 'lucide-react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm text-text-secondary font-medium">{label}</label>}
      <input
        ref={ref}
        className={`w-full bg-surface-hover border border-border rounded-[var(--radius-md)] px-3 py-2.5 text-sm text-text placeholder:text-text-muted outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/30 ${error ? 'border-danger' : ''} ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  )
);

Input.displayName = 'Input';

// SearchBar variant
export function SearchBar({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`relative ${className}`}>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
      <input
        type="search"
        className="w-full bg-surface-hover border border-border-subtle rounded-[var(--radius-full)] pl-9 pr-4 py-2 text-sm text-text placeholder:text-text-muted outline-none transition-colors focus:border-border focus:bg-surface-active"
        {...props}
      />
    </div>
  );
}
