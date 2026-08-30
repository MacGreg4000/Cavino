/**
 * Contrat du fichier JSON produit par le skill Claude externe (exécuté sur
 * claude.ai/mobile) à partir de 2 photos d'une bouteille (recto/verso) :
 * le skill fait sa propre recherche web (indépendante du pipeline
 * Ollama/Gemini + SearXNG interne) et génère un unique fichier JSON,
 * conforme à ce type, avec la photo encodée en base64.
 *
 * La structure imbriquée (identity/service/aging/analysis/pairings/awards/
 * purchase) reprend celle du schéma serveur `api/src/schemas/wine-import.ts`
 * (utilisé par le pipeline de scan automatique) pour rester cohérent —
 * mais ce type n'est validé/consommé que côté client (voir
 * `lib/flattenWineImport.ts`), aucun schéma serveur équivalent n'existe.
 */

export interface WineImportAward {
  year: number;
  label?: string | null;
  name?: string | null;
  score?: string | null;
  medal?: string | null;
}

export interface WineImportFile {
  schemaVersion?: string | null;

  identity: {
    /** Seul champ strictement requis. */
    name: string;
    domain?: string | null;
    appellation?: string | null;
    vintage?: number | null;
    nonVintage?: boolean | null;
    type?: string | null;
    grapes?: string[] | null;
    country?: string | null;
    region?: string | null;
    subRegion?: string | null;
    classification?: string | null;
    mentions?: string[] | null;
    alcohol?: number | null;
    bottleSize?: number | null;
    /** Pas de colonne DB dédiée — repli sur `domain` au flattening si celui-ci est vide. */
    producer?: string | null;
  };

  service?: {
    servingTempMin?: number | null;
    servingTempMax?: number | null;
    decanting?: boolean | null;
    decantingTime?: number | null;
    glassType?: string | null;
  } | null;

  aging?: {
    drinkFrom?: number | null;
    drinkUntil?: number | null;
    peakFrom?: number | null;
    peakUntil?: number | null;
    currentPhase?: string | null;
    agingNotes?: string | null;
  } | null;

  analysis?: {
    description?: string | null;
    vintageNotes?: string | null;
    aromaProfile?: {
      primary?: string[] | null;
      secondary?: string[] | null;
      tertiary?: string[] | null;
    } | null;
    palate?: string | null;
    style?: string | null;
  } | null;

  pairings?: {
    ideal?: string[] | null;
    good?: string[] | null;
    avoid?: string[] | null;
    occasions?: string[] | null;
    cheese?: string[] | null;
  } | null;

  awards?: WineImportAward[] | null;

  purchase?: {
    purchasePrice?: number | null;
    estimatedValue?: number | null;
    source?: string | null;
    bottleSize?: number | null;
  } | null;

  /** Champs de provenance du pipeline de scan — non exploités par l'import
   *  fichier (le vin est créé "available" directement, pas de suivi pending). */
  meta?: {
    scanDate?: string | null;
    confidence?: string | null;
    notes?: string | null;
    photoQuality?: string | null;
    scanId?: string | null;
  } | null;

  /** Photo officielle de la bouteille, encodée en data URI base64. */
  photo?: {
    dataUrl: string;
    filename: string;
  } | null;
}

/**
 * Type-guard minimal écrit à la main (pas de zod côté frontend).
 * Retourne la liste des erreurs lisibles ; tableau vide = fichier valide.
 */
export function validateWineImportFile(data: unknown): string[] {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null) {
    return ['Le fichier ne contient pas un objet JSON valide.'];
  }

  const d = data as Record<string, unknown>;

  if (typeof d.identity !== 'object' || d.identity === null) {
    errors.push('Champ "identity" manquant.');
  } else {
    const identity = d.identity as Record<string, unknown>;
    if (typeof identity.name !== 'string' || identity.name.trim().length === 0) {
      errors.push('Champ "identity.name" requis (nom du vin).');
    }
  }

  if (d.photo !== undefined && d.photo !== null) {
    if (typeof d.photo !== 'object') {
      errors.push('Champ "photo" invalide.');
    } else {
      const photo = d.photo as Record<string, unknown>;
      if (typeof photo.dataUrl !== 'string' || !photo.dataUrl.startsWith('data:image/')) {
        errors.push('Champ "photo.dataUrl" invalide (attendu une data URI image).');
      }
      if (typeof photo.filename !== 'string' || photo.filename.trim().length === 0) {
        errors.push('Champ "photo.filename" manquant.');
      }
    }
  }

  return errors;
}
