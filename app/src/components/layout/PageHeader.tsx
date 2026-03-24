import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  back?: boolean;
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, back, action }: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 bg-bg/80 backdrop-blur-xl border-b border-border-subtle">
      <div className="flex items-center gap-3 px-4 h-14 max-w-lg mx-auto">
        {back && (
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 -ml-1.5 text-text-secondary hover:text-text transition-colors cursor-pointer"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-lg font-semibold truncate">{title}</h1>
          {subtitle && <p className="text-xs text-text-secondary truncate">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}
