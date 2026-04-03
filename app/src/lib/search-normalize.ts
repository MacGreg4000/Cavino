/**
 * Normalise une chaîne pour la recherche : minuscules, sans accents ni signes diacritiques
 * (ex. « zefiro » matche « Zèfiro », « coeur » matche « Cœur » après NFKD).
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

export function matchesNormalizedSearch(haystack: string | undefined | null, needleNormalized: string): boolean {
  if (!haystack || !needleNormalized) return false;
  return normalizeForSearch(haystack).includes(needleNormalized);
}
