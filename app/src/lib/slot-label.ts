/**
 * Extrait la partie lisible d'un slot ID.
 * Exemples :
 *   "RA-A1"       → "A1"     (anciens IDs préfixe nom)
 *   "1A2B3C4D-A1" → "A1"     (nouveaux IDs préfixe UUID)
 */
export function slotLabel(slotId: string): string {
  const idx = slotId.indexOf('-');
  return idx >= 0 ? slotId.slice(idx + 1) : slotId;
}
