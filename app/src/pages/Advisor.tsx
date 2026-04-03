import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UtensilsCrossed, Send, Wine } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { WinePhoto } from '../components/ui/WinePhoto';
import { useWineStore, type Wine as WineType } from '../stores/wine';
import { recommendWines } from '../services/recommendation';

const TAGS = ['Viande rouge', 'Poisson', 'Fromage', 'Volaille', 'Pâtes', 'Fruits de mer', 'Gibier', 'Dessert', 'Apéritif', 'Barbecue'];

interface Recommendation {
  wine: WineType;
  score: number;
  reason: string;
}

export function Advisor() {
  const wines = useWineStore((s) => s.wines);
  const [meal, setMeal] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [results, setResults] = useState<Recommendation[] | null>(null);
  const [loading, setLoading] = useState(false);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = () => {
    if (!meal && selectedTags.length === 0) return;
    setLoading(true);
    setResults(null);
    setTimeout(() => {
      setResults(recommendWines(wines, meal, selectedTags));
      setLoading(false);
    }, 0);
  };

  return (
    <div>
      <PageHeader title="Conseiller" subtitle="Quel repas préparez-vous ?" />

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-4 pb-8">
        {/* Meal input */}
        <Card>
          <textarea
            value={meal}
            onChange={(e) => setMeal(e.target.value)}
            placeholder="Décrivez votre repas..."
            rows={3}
            className="w-full bg-transparent text-sm text-text placeholder:text-text-muted outline-none resize-none"
          />
        </Card>

        {/* Tags */}
        <div className="flex flex-wrap gap-2">
          {TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`px-3 py-1.5 text-xs font-medium rounded-[var(--radius-full)] border transition-colors cursor-pointer ${
                selectedTags.includes(tag)
                  ? 'bg-accent/20 border-accent/40 text-accent-bright'
                  : 'bg-surface border-border-subtle text-text-secondary hover:border-border'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        {/* Submit */}
        <Button
          variant="primary"
          className="w-full"
          disabled={!meal && selectedTags.length === 0}
          loading={loading}
          onClick={handleSubmit}
        >
          <Send size={16} /> Recommander
        </Button>

        {/* Results */}
        {results && (
          <div className="space-y-3 animate-fade-in">
            {results.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-text mb-2 flex items-center gap-2">
                  <Wine size={14} className="text-accent" />
                  Dans votre cave
                </h3>
                <div className="flex flex-col gap-2">
                  {results.map(({ wine, score, reason }) => (
                    <Link key={wine.id} to={`/cave/${wine.id}`}>
                      <Card hover className="!p-3">
                        <div className="flex items-center gap-3">
                          {wine.photoUrl ? (
                            <WinePhoto src={wine.photoUrl} alt="" className="w-11 h-11 rounded-[var(--radius-sm)] flex-shrink-0" />
                          ) : (
                            <div className="w-11 h-11 rounded-[var(--radius-sm)] bg-surface-hover flex items-center justify-center flex-shrink-0">
                              <Wine size={16} className="text-text-muted" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text truncate">{wine.name}</p>
                            <p className="text-xs text-text-secondary">
                              {wine.vintage || 'NV'} · {wine.type}
                            </p>
                            <p className="text-[10px] text-gold mt-0.5">{reason}</p>
                          </div>
                          {score > 0 && (
                            <Badge variant="gold">{score}</Badge>
                          )}
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {results.length === 0 && (
              <Card>
                <div className="flex items-start gap-3">
                  <UtensilsCrossed size={18} className="text-text-muted mt-0.5" />
                  <div>
                    <p className="text-sm text-text-secondary">
                      Aucun accord trouvé pour ce repas.
                    </p>
                    <p className="text-xs text-text-muted mt-1">
                      Ajoutez plus de bouteilles avec des accords détaillés via le scan.
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}

        {!results && !loading && (
          <EmptyState
            icon={<UtensilsCrossed size={48} />}
            title="Que mangez-vous ?"
            description="Décrivez votre repas ou sélectionnez des tags pour obtenir des suggestions depuis votre cave"
          />
        )}
      </div>
    </div>
  );
}
