import { NavLink } from 'react-router-dom';
import { Home, Wine, PlusCircle, UtensilsCrossed, BarChart3 } from 'lucide-react';
import { CountBadge } from '../ui/Badge';

interface BottomNavProps {
  pendingCount: number;
}

const navItems = [
  { to: '/', icon: Home, label: 'Accueil' },
  { to: '/cave', icon: Wine, label: 'Cave', hasBadge: true },
  { to: '/add', icon: PlusCircle, label: 'Ajouter' },
  { to: '/advisor', icon: UtensilsCrossed, label: 'Conseiller' },
  { to: '/stats', icon: BarChart3, label: 'Stats' },
];

export function BottomNav({ pendingCount }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-surface/90 backdrop-blur-xl border-t border-border-subtle">
      <div className="flex items-center justify-around h-16 px-2 pb-[env(safe-area-inset-bottom,0px)] max-w-lg mx-auto">
        {navItems.map(({ to, icon: Icon, label, hasBadge }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-[var(--radius-md)] transition-colors ${
                isActive
                  ? 'text-accent-bright'
                  : 'text-text-muted hover:text-text-secondary'
              }`
            }
          >
            <span className="relative">
              <Icon size={22} strokeWidth={1.8} />
              {hasBadge && <CountBadge count={pendingCount} />}
            </span>
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
