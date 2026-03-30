import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Wine, Clock, TrendingUp, AlertCircle, Settings, Sparkles, History, GlassWater, Plus, CheckCircle } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { useWineStore, type Wine as WineType } from '../stores/wine';

interface TimelineEvent {
  id: string;
  type: 'added' | 'consumed' | 'validated';
  wine: WineType;
  date: Date;
}

function buildTimeline(wines: WineType[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const wine of wines) {
    if (wine.createdAt) {
      events.push({
        id: `add-${wine.id}`,
        type: 'added',
        wine,
        date: new Date(wine.createdAt),
      });
    }
    if (wine.importStatus === 'consumed' && wine.updatedAt) {
      events.push({
        id: `consumed-${wine.id}`,
        type: 'consumed',
        wine,
        date: new Date(wine.updatedAt),
      });
    }
  }

  return events.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 8);
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  if (diffH < 24) return `Il y a ${diffH}h`;
  if (diffD === 1) return 'Hier';
  if (diffD < 7) return `Il y a ${diffD} jours`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function Home() {
  const { wines, pendingCount, fetchWines, fetchPending } = useWineStore();

  useEffect(() => {
    fetchWines();
    fetchPending();
  }, [fetchWines, fetchPending]);

  const totalBottles = wines.reduce((sum, w) => sum + (w.quantity || 0), 0);
  const totalValue = wines.reduce((sum, w) => sum + (parseFloat(w.estimatedValue || '0') || 0) * (w.quantity || 1), 0);

  const currentYear = new Date().getFullYear();
  const drinkSoon = wines.filter((w) => w.drinkUntil && w.drinkUntil <= currentYear);
  const readyNow = wines.filter(
    (w) => w.drinkFrom && w.drinkUntil && currentYear >= w.drinkFrom && currentYear <= w.drinkUntil
  );

  const timeline = buildTimeline(wines);

  return (
    <div className="px-4 pt-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Cavino</h1>
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

      {/* Activity timeline */}
      {timeline.length > 0 && (
        <div className="pb-6">
          <div className="flex items-center gap-2 mb-3">
            <History size={16} className="text-text-muted" />
            <h2 className="text-sm font-semibold text-text">Activité récente</h2>
          </div>
          <div className="relative pl-6">
            {/* Vertical line */}
            <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />

            <div className="flex flex-col gap-3">
              {timeline.map((event) => (
                <Link key={event.id} to={`/cave/${event.wine.id}`}>
                  <div className="relative flex items-center gap-3 hover:opacity-80 transition-opacity">
                    {/* Dot */}
                    <div className={`absolute -left-6 w-[18px] h-[18px] rounded-full border-2 border-bg flex items-center justify-center ${
                      event.type === 'added' ? 'bg-success' : event.type === 'consumed' ? 'bg-accent' : 'bg-gold'
                    }`}>
                      {event.type === 'added' && <Plus size={10} className="text-white" />}
                      {event.type === 'consumed' && <GlassWater size={10} className="text-white" />}
                      {event.type === 'validated' && <CheckCircle size={10} className="text-white" />}
                    </div>

                    {/* Content */}
                    <div className="flex items-center gap-3 flex-1 bg-surface rounded-[var(--radius-md)] p-2.5 border border-border">
                      {event.wine.photoUrl ? (
                        <img src={event.wine.photoUrl} alt="" className="w-9 h-9 rounded-[var(--radius-sm)] object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-[var(--radius-sm)] bg-surface-hover flex items-center justify-center flex-shrink-0">
                          <Wine size={14} className="text-text-muted" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-text truncate">{event.wine.name}</p>
                        <p className="text-[10px] text-text-muted">
                          {event.type === 'added' && 'Ajoutée à la cave'}
                          {event.type === 'consumed' && 'Débouchée'}
                          {event.type === 'validated' && 'Validée'}
                        </p>
                      </div>
                      <span className="text-[10px] text-text-muted flex-shrink-0">{formatRelativeDate(event.date)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
