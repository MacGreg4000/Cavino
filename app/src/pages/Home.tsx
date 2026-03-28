import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Wine, Clock, TrendingUp, AlertCircle, Settings, Sparkles } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { useWineStore } from '../stores/wine';

export function Home() {
  const { wines, pendingCount, fetchWines, fetchPending } = useWineStore();

  useEffect(() => {
    fetchWines();
    fetchPending();
  }, [fetchWines, fetchPending]);

  const totalBottles = wines.reduce((sum, w) => sum + (w.quantity || 0), 0);
  const totalValue = wines.reduce((sum, w) => sum + (parseFloat(w.estimatedValue || '0') || 0), 0);

  const currentYear = new Date().getFullYear();
  const drinkSoon = wines.filter((w) => w.drinkUntil && w.drinkUntil <= currentYear);
  const readyNow = wines.filter(
    (w) => w.drinkFrom && w.drinkUntil && currentYear >= w.drinkFrom && currentYear <= w.drinkUntil
  );

  return (
    <div className="px-4 pt-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Caveau</h1>
          <p className="text-text-muted text-sm mt-1">Votre cave personnelle</p>
        </div>
        <Link to="/settings" className="p-2 text-text-muted hover:text-text transition-colors mt-1">
          <Settings size={20} />
        </Link>
      </div>

      {/* Pending alert */}
      {pendingCount > 0 && (
        <Link to="/cave?tab=pending">
          <div className="mb-4 bg-accent/10 border border-accent/30 rounded-[var(--radius-lg)] p-4 shadow-[var(--shadow-glow-accent)] hover:bg-accent/15 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                <AlertCircle size={20} className="text-accent-bright" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-text">
                  {pendingCount} bouteille{pendingCount > 1 ? 's' : ''} à valider
                </p>
                <p className="text-xs text-text-secondary">Importées par le scan</p>
              </div>
              <Badge variant="danger" dot>{pendingCount}</Badge>
            </div>
          </div>
        </Link>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-2.5 mb-6">
        <Card className="!bg-wine-red/10 !border-wine-red/20">
          <div className="flex flex-col gap-1">
            <Wine size={18} className="text-accent" />
            <p className="text-2xl font-display font-bold text-text">{totalBottles}</p>
            <p className="text-[10px] text-text-muted leading-tight">Bouteilles en cave</p>
          </div>
        </Card>
        <Card className="!bg-gold/10 !border-gold/20">
          <div className="flex flex-col gap-1">
            <TrendingUp size={18} className="text-gold" />
            <p className="text-2xl font-display font-bold text-gold">
              {totalValue > 0 ? `${totalValue.toFixed(0)}€` : '—'}
            </p>
            <p className="text-[10px] text-text-muted leading-tight">Valeur estimée</p>
          </div>
        </Card>
        <Card className="!bg-success/10 !border-success/20">
          <div className="flex flex-col gap-1">
            <Sparkles size={18} className="text-success" />
            <p className="text-2xl font-display font-bold text-success">{readyNow.length}</p>
            <p className="text-[10px] text-text-muted leading-tight">Prêts à boire</p>
          </div>
        </Card>
      </div>

      {/* Drink soon */}
      {drinkSoon.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-warning" />
            <h2 className="text-sm font-semibold text-text">À boire maintenant</h2>
          </div>
          <div className="flex flex-col gap-2">
            {drinkSoon.slice(0, 3).map((wine) => (
              <Link key={wine.id} to={`/cave/${wine.id}`}>
                <div className="flex items-center gap-3 bg-surface rounded-[var(--radius-md)] p-3 border border-border border-l-4 border-l-warning/70 hover:bg-surface-hover transition-colors">
                  {wine.photoUrl ? (
                    <img src={wine.photoUrl} alt="" className="w-12 h-12 rounded-[var(--radius-sm)] object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-[var(--radius-sm)] bg-surface-hover flex items-center justify-center">
                      <Wine size={16} className="text-text-muted" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{wine.name}</p>
                    <p className="text-xs text-text-secondary">
                      {wine.vintage || 'NV'} · {wine.appellation || wine.region}
                    </p>
                    {wine.peakFrom && (
                      <p className="text-[10px] text-gold mt-0.5">Apogée {wine.peakFrom}–{wine.peakUntil}</p>
                    )}
                  </div>
                  <Badge variant="warning">À boire</Badge>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent additions */}
      {wines.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-text mb-3">Ajouts récents</h2>
          <div className="flex flex-col gap-2">
            {wines.slice(0, 5).map((wine) => (
              <Link key={wine.id} to={`/cave/${wine.id}`}>
                <div className="flex items-center gap-3 bg-surface rounded-[var(--radius-md)] p-3 border border-border hover:bg-surface-hover transition-colors">
                  {wine.photoUrl ? (
                    <img src={wine.photoUrl} alt="" className="w-10 h-10 rounded-[var(--radius-sm)] object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-surface-hover flex items-center justify-center">
                      <Wine size={16} className="text-text-muted" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{wine.name}</p>
                    <p className="text-xs text-text-secondary">
                      {wine.vintage || 'NV'} · {wine.type}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-text-muted font-mono">×{wine.quantity || 0}</span>
                    {wine.estimatedValue && parseFloat(wine.estimatedValue) > 0 && (
                      <span className="text-[10px] text-gold">{parseFloat(wine.estimatedValue).toFixed(0)}€</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
