import { useEffect, useState } from 'react';
import { BarChart3, Wine, TrendingUp, MapPin } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';

interface StatsData {
  totalBottles: number;
  totalWines: number;
  totalValue: number;
  pendingCount: number;
  drinkThisYear: number;
  totalTastings: number;
  byType: Array<{ type: string; count: number; totalQuantity: string }>;
  byRegion: Array<{ region: string; count: number; totalQuantity: string }>;
}

const TYPE_FR: Record<string, string> = {
  red: 'rouge', rouge: 'rouge',
  white: 'blanc', blanc: 'blanc',
  rosé: 'rosé', rose: 'rosé',
  sparkling: 'effervescent', effervescent: 'effervescent',
  champagne: 'champagne',
  sweet: 'moelleux', moelleux: 'moelleux',
  fortified: 'liquoreux', liquoreux: 'liquoreux',
};

const toFr = (type: string) => TYPE_FR[type?.toLowerCase()] ?? type?.toLowerCase() ?? 'autre';

const TYPE_COLORS: Record<string, string> = {
  rouge: '#A52828',
  blanc: '#F0DDB0',
  rosé: '#D4727A',
  champagne: '#F8ECD0',
  effervescent: '#F8ECD0',
  moelleux: '#D4B65C',
  liquoreux: '#D4B65C',
};

const BAR_TYPE_COLORS: Record<string, string> = {
  rouge: 'bg-wine-red',
  blanc: 'bg-wine-white',
  rosé: 'bg-wine-rose',
  champagne: 'bg-wine-champagne',
  effervescent: 'bg-wine-champagne',
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0];
  return (
    <div className="bg-surface border border-border rounded-[var(--radius-md)] px-3 py-2 shadow-lg">
      <p className="text-xs text-text font-medium">{data.name || data.payload?.name}</p>
      <p className="text-xs text-text-secondary font-mono">{data.value} bouteilles</p>
    </div>
  );
};

export function Stats() {
  const [stats, setStats] = useState<StatsData | null>(null);

  useEffect(() => {
    apiFetch('/api/stats').then((r) => r.ok ? r.json() : null).then((d) => d?.byType ? setStats(d) : null).catch(() => {});
  }, []);

  if (!stats) {
    return (
      <div>
        <PageHeader title="Statistiques" />
        <div className="flex items-center justify-center h-64 text-text-muted">Chargement...</div>
      </div>
    );
  }

  const pieData = stats.byType
    .filter((t) => t.type)
    .map((t) => ({
      name: toFr(t.type),
      value: parseInt(t.totalQuantity) || t.count,
      color: TYPE_COLORS[toFr(t.type)] || '#5C4F44',
    }));

  const regionData = stats.byRegion
    .filter((r) => r.region)
    .slice(0, 8)
    .map((r) => ({
      name: r.region?.length > 12 ? r.region.substring(0, 12) + '…' : r.region,
      fullName: r.region,
      value: parseInt(r.totalQuantity) || r.count,
    }));

  return (
    <div>
      <PageHeader title="Statistiques" />

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-4 pb-8">
        {/* Overview */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="text-center">
            <p className="text-2xl font-display font-bold text-text">{stats.totalBottles}</p>
            <p className="text-[10px] text-text-secondary mt-0.5">Bouteilles</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-display font-bold text-gold">
              {stats.totalValue > 0 ? `${Math.round(stats.totalValue)}€` : '—'}
            </p>
            <p className="text-[10px] text-text-secondary mt-0.5">Valeur</p>
          </Card>
          <Card className="text-center">
            <p className="text-2xl font-display font-bold text-warning">{stats.drinkThisYear}</p>
            <p className="text-[10px] text-text-secondary mt-0.5">À boire</p>
          </Card>
        </div>

        {/* Pie chart by type */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Wine size={16} className="text-accent" />
            <h3 className="text-sm font-semibold">Répartition par type</h3>
          </div>
          {pieData.length === 0 ? (
            <p className="text-sm text-text-muted">Aucune donnée</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={65}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {pieData.map((t) => {
                  const total = stats.totalBottles || 1;
                  const pct = Math.round((t.value / total) * 100);
                  return (
                    <div key={t.name} className="flex items-center gap-2 text-sm">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                      <span className="text-text capitalize flex-1">{t.name}</span>
                      <span className="text-text-secondary font-mono text-xs">{t.value} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        {/* Bar chart by region */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <MapPin size={16} className="text-gold" />
            <h3 className="text-sm font-semibold">Top régions</h3>
          </div>
          {regionData.length === 0 ? (
            <p className="text-sm text-text-muted">Aucune donnée</p>
          ) : (
            <ResponsiveContainer width="100%" height={regionData.length * 36 + 20}>
              <BarChart data={regionData} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={90}
                  tick={{ fill: '#8A7A6A', fontSize: 11, fontFamily: 'DM Sans' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="value" fill="#8B1A1A" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Type progress bars (compact) */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-champagne" />
            <h3 className="text-sm font-semibold">Stock par type</h3>
          </div>
          {stats.byType.length === 0 ? (
            <p className="text-sm text-text-muted">Aucune donnée</p>
          ) : (
            <div className="space-y-3">
              {stats.byType.map((t) => {
                const total = stats.totalBottles || 1;
                const qty = parseInt(t.totalQuantity) || t.count;
                const pct = Math.round((qty / total) * 100);
                const fr = toFr(t.type);
                return (
                  <div key={t.type}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-text capitalize">{fr || 'Autre'}</span>
                      <span className="text-text-secondary font-mono text-xs">{qty} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${BAR_TYPE_COLORS[fr] || 'bg-text-muted'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Tastings */}
        <Card>
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-info" />
            <h3 className="text-sm font-semibold">Dégustations</h3>
            <span className="ml-auto font-mono text-sm text-text-secondary">{stats.totalTastings}</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
