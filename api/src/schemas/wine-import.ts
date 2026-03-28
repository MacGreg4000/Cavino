import { z } from 'zod';

const ns = z.string().nullable().optional();
const nn = z.number().nullable().optional();
const nb = z.boolean().nullable().optional();
const nsa = z.array(z.string()).nullable().optional();

// Schema zod pour valider les JSON générés par le skill cave-scan (format camelCase v1.0)
export const wineImportSchema = z.object({
  schemaVersion: ns,

  identity: z.object({
    name: z.string().min(1),
    domain: ns,
    appellation: ns,
    vintage: z.number().int().min(1900).max(2100).nullable().optional(),
    nonVintage: nb,
    type: ns,
    grapes: nsa,
    country: ns,
    region: ns,
    subRegion: ns,
    classification: ns,
    mentions: nsa,
    alcohol: z.number().min(0).max(100).nullable().optional(),
    bottleSize: nn,
    producer: ns,
  }),

  service: z.object({
    servingTempMin: z.number().int().nullable().optional(),
    servingTempMax: z.number().int().nullable().optional(),
    decanting: nb,
    decantingTime: z.number().int().nullable().optional(),
    glassType: ns,
  }).optional(),

  aging: z.object({
    drinkFrom: z.number().int().nullable().optional(),
    drinkUntil: z.number().int().nullable().optional(),
    peakFrom: z.number().int().nullable().optional(),
    peakUntil: z.number().int().nullable().optional(),
    currentPhase: ns,
    agingNotes: ns,
  }).optional(),

  analysis: z.object({
    description: ns,
    vintageNotes: ns,
    aromaProfile: z.object({
      primary: nsa,
      secondary: nsa,
      tertiary: nsa,
    }).optional(),
    palate: ns,
    style: ns,
  }).optional(),

  pairings: z.object({
    ideal: nsa,
    good: nsa,
    avoid: nsa,
    occasions: nsa,
    cheese: nsa,
  }).optional(),

  awards: z.array(z.object({
    year: z.number().int(),
    label: ns,
    name: ns,
    score: ns,
    medal: ns,
  })).nullable().optional(),

  purchase: z.object({
    purchasePrice: nn,
    estimatedValue: nn,
    source: ns,
    bottleSize: nn,
  }).optional(),

  // Ancien format — champs racine, conservés pour compat
  estimated_value: nn,
  scan_confidence: ns,

  meta: z.object({
    scanDate: ns,
    confidence: ns,
    notes: ns,
    photoQuality: ns,
    importStatus: ns,
    photoFilename: ns,
  }).optional(),
});

export type WineImport = z.infer<typeof wineImportSchema>;
