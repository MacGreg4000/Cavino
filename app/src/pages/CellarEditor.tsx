import { useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, RotateCcw, Lock, Unlock } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Stepper } from '../components/ui/Stepper';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { useLocationStore } from '../stores/location';

function generateLabels(count: number, type: 'alpha' | 'numeric'): string[] {
  if (type === 'alpha') {
    return Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));
  }
  return Array.from({ length: count }, (_, i) => String(i + 1));
}

export function CellarEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const createLocation = useLocationStore((s) => s.createLocation);

  const isNew = !id || id === 'new';

  const [name, setName] = useState('');
  const [type, setType] = useState<'cellar' | 'fridge' | 'rack' | 'other'>('cellar');
  const [color, setColor] = useState('#8B1A1A');
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(6);
  const [rowLabelType, setRowLabelType] = useState<'alpha' | 'numeric'>('alpha');
  const [colLabelType, setColLabelType] = useState<'alpha' | 'numeric'>('numeric');
  const [blockedSlots, setBlockedSlots] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const labelRows = generateLabels(rows, rowLabelType);
  const labelCols = generateLabels(cols, colLabelType);
  const prefix = name.substring(0, 2).toUpperCase() || 'XX';

  const toggleBlocked = useCallback((r: number, c: number) => {
    const slotId = `${prefix}-${labelRows[r]}${labelCols[c]}`;
    setBlockedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  }, [prefix, labelRows, labelCols]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast('warning', 'Donnez un nom à l\'emplacement');
      return;
    }
    setSaving(true);
    try {
      await createLocation({
        name: name.trim(),
        type,
        color,
        gridConfig: {
          rows,
          cols,
          labelRows,
          labelCols,
          blockedSlots: Array.from(blockedSlots),
        },
      });
      toast('success', `${name} créé avec ${rows * cols - blockedSlots.size} slots`);
      navigate('/cellar');
    } catch {
      toast('error', 'Erreur lors de la création');
    }
    setSaving(false);
  };

  const totalActive = rows * cols - blockedSlots.size;

  return (
    <div>
      <PageHeader
        title={isNew ? 'Nouvel emplacement' : 'Modifier'}
        back
        action={
          <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
            <Save size={14} /> Enregistrer
          </Button>
        }
      />

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-4 pb-8">
        {/* Info */}
        <Card>
          <div className="space-y-3">
            <Input label="Nom" placeholder="Cave A, Frigo, Rack..." value={name} onChange={(e) => setName(e.target.value)} />
            <Select
              label="Type"
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              options={[
                { value: 'cellar', label: 'Cave / Étagère' },
                { value: 'fridge', label: 'Réfrigérateur' },
                { value: 'rack', label: 'Rack' },
                { value: 'other', label: 'Autre' },
              ]}
            />
            <div className="flex items-center gap-3">
              <label className="text-sm text-text-secondary font-medium">Couleur</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 rounded-[var(--radius-sm)] border border-border cursor-pointer bg-transparent"
              />
            </div>
          </div>
        </Card>

        {/* Dimensions */}
        <Card>
          <h3 className="text-sm font-semibold mb-3">Dimensions</h3>
          <div className="space-y-3">
            <Stepper value={rows} onChange={setRows} min={1} max={26} label="Rangées" />
            <Stepper value={cols} onChange={setCols} min={1} max={26} label="Colonnes" />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Labels rangées"
                value={rowLabelType}
                onChange={(e) => setRowLabelType(e.target.value as 'alpha' | 'numeric')}
                options={[
                  { value: 'alpha', label: 'Lettres (A,B,C…)' },
                  { value: 'numeric', label: 'Chiffres (1,2,3…)' },
                ]}
              />
              <Select
                label="Labels colonnes"
                value={colLabelType}
                onChange={(e) => setColLabelType(e.target.value as 'alpha' | 'numeric')}
                options={[
                  { value: 'alpha', label: 'Lettres (A,B,C…)' },
                  { value: 'numeric', label: 'Chiffres (1,2,3…)' },
                ]}
              />
            </div>
          </div>
        </Card>

        {/* Grid preview + block slots */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">
              Grille <span className="text-text-secondary font-normal">({totalActive} slots actifs)</span>
            </h3>
            {blockedSlots.size > 0 && (
              <button
                onClick={() => setBlockedSlots(new Set())}
                className="text-xs text-text-secondary hover:text-text flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw size={12} /> Reset
              </button>
            )}
          </div>
          <p className="text-xs text-text-muted mb-3">Tapez une cellule pour la bloquer/débloquer</p>

          {/* Column headers */}
          <div
            className="grid gap-1 pl-7 mb-1"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {labelCols.map((label, c) => (
              <div key={c} className="text-center text-[10px] font-mono text-text-muted">
                {label}
              </div>
            ))}
          </div>

          {/* Grid rows */}
          {Array.from({ length: rows }, (_, r) => (
            <div key={r} className="flex gap-1 items-center mb-1">
              <div className="w-6 text-right text-[10px] font-mono text-text-muted shrink-0">
                {labelRows[r]}
              </div>
              <div
                className="grid gap-1 flex-1"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: cols }, (_, c) => {
                  const slotId = `${prefix}-${labelRows[r]}${labelCols[c]}`;
                  const isBlocked = blockedSlots.has(slotId);
                  return (
                    <button
                      key={slotId}
                      type="button"
                      onClick={() => toggleBlocked(r, c)}
                      className={`
                        aspect-square rounded-[var(--radius-sm)] border flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer
                        ${isBlocked
                          ? 'bg-danger/10 border-danger/30 opacity-60'
                          : 'bg-surface-hover/50 border-border-subtle hover:border-border'
                        }
                      `}
                    >
                      {isBlocked ? (
                        <Lock size={10} className="text-danger" />
                      ) : (
                        <Unlock size={8} className="text-text-muted opacity-30" />
                      )}
                      <span className="font-mono text-[7px] text-text-muted leading-none">
                        {labelRows[r]}{labelCols[c]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </Card>

        {/* Clip codes preview */}
        <Card>
          <h3 className="text-sm font-semibold mb-2">Codes clips 3D</h3>
          <p className="text-xs text-text-secondary mb-3">
            Format : {prefix}-[rangée][colonne] — ex: {prefix}-{labelRows[0]}{labelCols[0]}
          </p>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: Math.min(rows * cols, 12) }, (_, i) => {
              const r = Math.floor(i / cols);
              const c = i % cols;
              const slotId = `${prefix}-${labelRows[r]}${labelCols[c]}`;
              if (blockedSlots.has(slotId)) return null;
              return (
                <span key={slotId} className="px-2 py-1 bg-surface-hover rounded-[var(--radius-sm)] font-mono text-[11px] text-gold">
                  {slotId}
                </span>
              );
            })}
            {rows * cols > 12 && (
              <span className="px-2 py-1 text-[11px] text-text-muted">+{totalActive - 12} de plus</span>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
