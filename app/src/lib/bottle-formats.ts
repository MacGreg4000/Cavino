export interface BottleFormat {
  value: string;   // stored value in cl (as string for numeric field)
  label: string;   // display name
  short: string;   // short label for badges
  liters: string;  // volume display
}

export const BOTTLE_FORMATS: BottleFormat[] = [
  { value: '37.5', label: 'Demi-bouteille', short: 'Demi', liters: '37,5 cl' },
  { value: '50', label: 'Pot (50 cl)', short: '50cl', liters: '50 cl' },
  { value: '75', label: 'Bouteille', short: '75cl', liters: '75 cl' },
  { value: '150', label: 'Magnum', short: 'Magnum', liters: '1,5 L' },
  { value: '300', label: 'Jéroboam', short: 'Jéroboam', liters: '3 L' },
  { value: '450', label: 'Réhoboam', short: 'Réhoboam', liters: '4,5 L' },
  { value: '600', label: 'Mathusalem', short: 'Mathusalem', liters: '6 L' },
  { value: '900', label: 'Salmanazar', short: 'Salmanazar', liters: '9 L' },
  { value: '1200', label: 'Balthazar', short: 'Balthazar', liters: '12 L' },
  { value: '1500', label: 'Nabuchodonosor', short: 'Nabu.', liters: '15 L' },
];

export function getBottleFormat(sizeValue?: string | null): BottleFormat {
  if (!sizeValue) return BOTTLE_FORMATS[2]; // default 75cl
  const f = BOTTLE_FORMATS.find((b) => b.value === sizeValue || parseFloat(b.value) === parseFloat(sizeValue));
  if (f) return f;
  // Unknown size — build a custom format
  const cl = parseFloat(sizeValue);
  if (cl >= 100) {
    return { value: sizeValue, label: `${(cl / 100).toFixed(1).replace('.0', '')} L`, short: `${(cl / 100).toFixed(1).replace('.0', '')}L`, liters: `${(cl / 100).toFixed(1).replace('.0', '')} L` };
  }
  return { value: sizeValue, label: `${cl} cl`, short: `${cl}cl`, liters: `${cl} cl` };
}

export function isStandardBottle(sizeValue?: string | null): boolean {
  return !sizeValue || sizeValue === '75' || parseFloat(sizeValue || '75') === 75;
}
