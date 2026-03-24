import type { Wine } from '../stores/wine';

interface RecommendationResult {
  wine: Wine;
  score: number;
  reason: string;
}

// Mapping de tags repas → catégories d'accords
const TAG_MAPPINGS: Record<string, string[]> = {
  'viande rouge': ['boeuf', 'agneau', 'steak', 'côte', 'entrecôte', 'gigot', 'viande rouge'],
  'poisson': ['poisson', 'bar', 'dorade', 'sole', 'cabillaud', 'saumon', 'fruits de mer'],
  'fromage': ['fromage', 'comté', 'brie', 'roquefort', 'chèvre', 'camembert'],
  'volaille': ['poulet', 'dinde', 'canard', 'pintade', 'volaille'],
  'pâtes': ['pâtes', 'pasta', 'risotto', 'lasagne', 'pizza'],
  'fruits de mer': ['huîtres', 'crevettes', 'homard', 'langoustine', 'crabe', 'moules', 'fruits de mer'],
  'gibier': ['gibier', 'cerf', 'sanglier', 'chevreuil', 'lièvre', 'faisan'],
  'dessert': ['dessert', 'chocolat', 'tarte', 'gâteau', 'fruits', 'crème'],
  'apéritif': ['apéritif', 'tapas', 'charcuterie', 'toast', 'canapé'],
  'barbecue': ['barbecue', 'grillades', 'brochettes', 'côtelettes', 'merguez'],
};

function normalizeText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function matchesTerms(terms: string[], text: string): number {
  const normalized = normalizeText(text);
  return terms.filter((t) => normalized.includes(normalizeText(t))).length;
}

/**
 * Moteur de recommandation offline basé sur les pairings stockés en DB.
 * Fonctionne sans Ollama — utilise les données d'accords générées par Claude lors du scan.
 */
export function recommendWines(
  wines: Wine[],
  meal: string,
  tags: string[]
): RecommendationResult[] {
  if (wines.length === 0) return [];

  // Expand tags to search terms
  const searchTerms: string[] = [];
  for (const tag of tags) {
    const mapped = TAG_MAPPINGS[tag.toLowerCase()];
    if (mapped) searchTerms.push(...mapped);
    else searchTerms.push(tag);
  }

  // Add meal words as search terms
  if (meal) {
    searchTerms.push(...meal.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  }

  if (searchTerms.length === 0) return [];

  const scored: RecommendationResult[] = [];

  for (const wine of wines) {
    if (wine.importStatus !== 'available' || (wine.quantity || 0) <= 0) continue;

    let score = 0;
    const reasons: string[] = [];

    // Check ideal pairings (weight: 3)
    const idealText = (wine.pairingsIdeal || []).join(' ');
    const idealMatches = matchesTerms(searchTerms, idealText);
    if (idealMatches > 0) {
      score += idealMatches * 3;
      reasons.push('Accord idéal');
    }

    // Check good pairings (weight: 2)
    const goodText = (wine.pairingsGood || []).join(' ');
    const goodMatches = matchesTerms(searchTerms, goodText);
    if (goodMatches > 0) {
      score += goodMatches * 2;
      reasons.push('Bon accord');
    }

    // Check cheese pairings (weight: 2)
    const cheeseText = (wine.cheesePairings || []).join(' ');
    const cheeseMatches = matchesTerms(searchTerms, cheeseText);
    if (cheeseMatches > 0) {
      score += cheeseMatches * 2;
      reasons.push('Accord fromage');
    }

    // Check occasions (weight: 1)
    const occasionText = (wine.occasions || []).join(' ');
    const occasionMatches = matchesTerms(searchTerms, occasionText);
    if (occasionMatches > 0) {
      score += occasionMatches;
    }

    // Penalty for avoid pairings
    const avoidText = (wine.pairingsAvoid || []).join(' ');
    const avoidMatches = matchesTerms(searchTerms, avoidText);
    if (avoidMatches > 0) {
      score -= avoidMatches * 5;
    }

    // Bonus for peak/ready wines
    const year = new Date().getFullYear();
    if (wine.peakFrom && wine.peakUntil && year >= wine.peakFrom && year <= wine.peakUntil) {
      score += 1;
      reasons.push('À son apogée');
    }

    if (score > 0) {
      scored.push({
        wine,
        score,
        reason: reasons.join(' · '),
      });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
