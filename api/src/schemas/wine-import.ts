import { z } from 'zod';

const nullishString = z.string().nullish().transform((v) => v ?? undefined);
const nullishNumber = z.number().nullish().transform((v) => v ?? undefined);
const nullishBool = z.boolean().nullish().transform((v) => v ?? undefined);
const nullishStringArray = z.array(z.string()).nullish().transform((v) => v ?? []);

// Schema zod pour valider les JSON générés par le skill cave-scan (format camelCase v1.0)
export const wineImportSchema = z.object({
  schemaVersion: nullishString,

  identity: z.object({
    name: z.string().min(1),
    domain: nullishString,
    appellation: nullishString,
    vintage: z.number().int().min(1900).max(2100).nullish().transform((v) => v ?? undefined),
    nonVintage: nullishBool.default(false),
    type: nullishString,
    grapes: nullishStringArray.default([]),
    country: nullishString,
    region: nullishString,
    subRegion: nullishString,
    classification: nullishString,
    mentions: nullishStringArray.default([]),
    alcohol: z.number().min(0).max(100).nullish().transform((v) => v ?? undefined),
    bottleSize: nullishNumber.default(75),
    producer: nullishString,
  }),

  service: z.object({
    servingTempMin: z.number().int().nullish().transform((v) => v ?? undefined),
    servingTempMax: z.number().int().nullish().transform((v) => v ?? undefined),
    decanting: nullishBool,
    decantingTime: z.number().int().nullish().transform((v) => v ?? undefined),
    glassType: nullishString,
  }).optional().default({}),

  aging: z.object({
    drinkFrom: z.number().int().nullish().transform((v) => v ?? undefined),
    drinkUntil: z.number().int().nullish().transform((v) => v ?? undefined),
    peakFrom: z.number().int().nullish().transform((v) => v ?? undefined),
    peakUntil: z.number().int().nullish().transform((v) => v ?? undefined),
    currentPhase: nullishString,
    agingNotes: nullishString,
  }).optional().default({}),

  analysis: z.object({
    description: nullishString,
    vintageNotes: nullishString,
    aromaProfile: z.object({
      primary: nullishStringArray.default([]),
      secondary: nullishStringArray.default([]),
      tertiary: nullishStringArray.default([]),
    }).optional().default({ primary: [], secondary: [], tertiary: [] }),
    palate: nullishString,
    style: nullishString,
  }).optional().default({ aromaProfile: { primary: [], secondary: [], tertiary: [] } }),

  pairings: z.object({
    ideal: nullishStringArray.default([]),
    good: nullishStringArray.default([]),
    avoid: nullishStringArray.default([]),
    occasions: nullishStringArray.default([]),
    cheese: nullishStringArray.default([]),
  }).optional().default({ ideal: [], good: [], avoid: [], occasions: [], cheese: [] }),

  awards: z.array(z.object({
    year: z.number().int(),
    label: nullishString,
    name: nullishString,
    score: nullishString,
    medal: nullishString,
  })).optional().default([]),

  purchase: z.object({
    purchasePrice: nullishNumber,
    estimatedValue: nullishNumber,
    source: nullishString,
    bottleSize: nullishNumber,
  }).optional().default({}),

  // Ancien format — champs racine, conservés pour compat
  estimated_value: nullishNumber,
  scan_confidence: nullishString,

  meta: z.object({
    scanDate: nullishString,
    confidence: nullishString,
    notes: nullishString,
    photoQuality: nullishString,
    importStatus: nullishString,
    photoFilename: nullishString,
  }).optional().default({}),
});

export type WineImport = z.infer<typeof wineImportSchema>;
