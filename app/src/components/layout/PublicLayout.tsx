import { Outlet, Link } from 'react-router-dom';
import { Wine } from 'lucide-react';

export function PublicLayout() {
  return (
    <div className="min-h-screen bg-bg">
      {/* Header minimal */}
      <header className="sticky top-0 z-50 bg-bg/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/public" className="flex items-center gap-2.5 text-text hover:text-text-secondary transition-colors">
            <Wine size={20} className="text-accent-bright" />
            <span className="font-display text-lg font-bold tracking-tight">Caveau</span>
          </Link>
          <div className="flex-1" />
          <span className="text-xs text-text-muted border border-border rounded-full px-2.5 py-0.5">Lecture seule</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
