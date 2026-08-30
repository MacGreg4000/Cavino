import type { WineImportFile } from '../types/wineImport';
import type { Wine } from '../stores/wine';

/**
 * Aplati un `WineImportFile` (structure imbriquée produite par le skill
 * Claude) vers le format plat attendu par `createWine` / `POST /api/wines`
 * (== `wineUpdateSchema` côté serveur == colonnes de la table `wines`).
 *
 * Voir le tableau de correspondance dans le plan d'implémentation pour le
 * détail des renommages (aromaProfile.* → aroma*, pairings.ideal/good/avoid
 * → pairings*, etc.).
 */
export function flattenWineImport(data: WineImportFile): Partial<Wine> {
  const { identity, service, aging, analysis, pairings, awards, purchase } = data;

  const domain = identity.domain?.trim() || identity.producer?.trim() || undefined;

  const bottleSizeRaw = identity.bottleSize ?? purchase?.bottleSize ?? undefined;

  return {
    // identity.* → racine
    name: identity.name.trim(),
    domain,
    appellation: identity.appellation ?? undefined,
    vintage: identity.vintage ?? undefined,
    nonVintage: identity.nonVintage ?? undefined,
    type: identity.type ?? undefined,
    grapes: identity.grapes ?? undefined,
    country: identity.country ?? undefined,
    region: identity.region ?? undefined,
    subRegion: identity.subRegion ?? undefined,
    classification: identity.classification ?? undefined,
    mentions: identity.mentions ?? undefined,
    alcohol: identity.alcohol != null ? String(identity.alcohol) : undefined,
    bottleSize: bottleSizeRaw != null ? String(bottleSizeRaw) : undefined,

    // service.* → racine (mêmes noms)
    servingTempMin: service?.servingTempMin ?? undefined,
    servingTempMax: service?.servingTempMax ?? undefined,
    decanting: service?.decanting ?? undefined,
    decantingTime: service?.decantingTime ?? undefined,
    glassType: service?.glassType ?? undefined,

    // aging.* → racine (mêmes noms)
    drinkFrom: aging?.drinkFrom ?? undefined,
    drinkUntil: aging?.drinkUntil ?? undefined,
    peakFrom: aging?.peakFrom ?? undefined,
    peakUntil: aging?.peakUntil ?? undefined,
    currentPhase: aging?.currentPhase ?? undefined,
    agingNotes: aging?.agingNotes ?? undefined,

    // analysis.* → racine
    description: analysis?.description ?? undefined,
    vintageNotes: analysis?.vintageNotes ?? undefined,
    aromaPrimary: analysis?.aromaProfile?.primary ?? undefined,
    aromaSecondary: analysis?.aromaProfile?.secondary ?? undefined,
    aromaTertiary: analysis?.aromaProfile?.tertiary ?? undefined,
    palate: analysis?.palate ?? undefined,
    style: analysis?.style ?? undefined,

    // pairings.* → racine (renommé)
    pairingsIdeal: pairings?.ideal ?? undefined,
    pairingsGood: pairings?.good ?? undefined,
    pairingsAvoid: pairings?.avoid ?? undefined,
    occasions: pairings?.occasions ?? undefined,
    cheesePairings: pairings?.cheese ?? undefined,

    // awards : mapping explicite (shapes différentes, pas un pass-through)
    awards: awards?.map((a) => ({
      year: a.year,
      name: a.name ?? a.label ?? (a.score ? `Score: ${a.score}` : ''),
      medal: a.medal ?? undefined,
    })),

    // purchase.* → racine
    purchasePrice: purchase?.purchasePrice != null ? String(purchase.purchasePrice) : undefined,
    estimatedValue: purchase?.estimatedValue != null ? String(purchase.estimatedValue) : undefined,

    // meta.* volontairement non mappé (provenance du pipeline scan/pending,
    // sans usage pour un vin créé directement "available").
  };
}
