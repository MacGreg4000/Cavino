import { z } from 'zod';

// Schema zod pour valider les JSON générés par le skill cave-scan (format camelCase v1.0)
export const wineImportSchema = z.object({
  schemaVersion: z.string().optional(),

  identity: z.object({
    name: z.string().min(1),
    domain: z.string().optional(),
    appellation: z.string().optional(),
    vintage: z.number().int().min(1900).max(2100).optional(),
    nonVintage: z.boolean().optional().default(false),
    type: z.string().optional(),
    grapes: z.array(z.string()).optional().default([]),
    country: z.string().optional(),
    region: z.string().optional(),
    subRegion: z.string().optional(),
    classification: z.string().optional(),
    mentions: z.array(z.string()).optional().default([]),
    alcohol: z.number().min(0).max(100).optional(),
    bottleSize: z.number().optional().default(75),
    producer: z.string().optional(),
  }),

  service: z.object({
    servingTempMin: z.number().int().optional(),
    servingTempMax: z.number().int().optional(),
    decanting: z.boolean().optional(),
    decantingTime: z.number().int().optional(),
    glassType: z.string().optional(),
  }).optional().default({}),

  aging: z.object({
    drinkFrom: z.number().int().optional(),
    drinkUntil: z.number().int().optional(),
    peakFrom: z.number().int().optional(),
    peakUntil: z.number().int().optional(),
    currentPhase: z.string().optional(),
    agingNotes: z.string().optional(),
  }).optional().default({}),

  analysis: z.object({
    description: z.string().optional(),
    vintageNotes: z.string().optional(),
    aromaProfile: z.object({
      primary: z.array(z.string()).optional().default([]),
      secondary: z.array(z.string()).optional().default([]),
      tertiary: z.array(z.string()).optional().default([]),
    }).optional().default({ primary: [], secondary: [], tertiary: [] }),
    palate: z.string().optional(),
    style: z.string().optional(),
  }).optional().default({ aromaProfile: { primary: [], secondary: [], tertiary: [] } }),

  pairings: z.object({
    ideal: z.array(z.string()).optional().default([]),
    good: z.array(z.string()).optional().default([]),
    avoid: z.array(z.string()).optional().default([]),
    occasions: z.array(z.string()).optional().default([]),
    cheese: z.array(z.string()).optional().default([]),
  }).optional().default({ ideal: [], good: [], avoid: [], occasions: [], cheese: [] }),

  awards: z.array(z.object({
    year: z.number().int(),
    label: z.string().optional(),
    name: z.string().optional(),   // ancien format, conservé pour compat
    score: z.string().optional(),
    medal: z.string().optional(),  // ancien format, conservé pour compat
  })).optional().default([]),

  purchase: z.object({
    purchasePrice: z.number().nullable().optional(),
    estimatedValue: z.number().optional(),
    source: z.string().nullable().optional(),
    bottleSize: z.number().optional(),
  }).optional().default({}),

  // Ancien format — champ racine, conservé pour compat
  estimated_value: z.number().optional(),
  scan_confidence: z.string().optional(),

  meta: z.object({
    scanDate: z.string().optional(),
    confidence: z.string().optional(),
    notes: z.string().optional(),
    photoQuality: z.string().optional(),
    importStatus: z.string().optional(),
    photoFilename: z.string().optional(),
  }).optional().default({}),
});

export type WineImport = z.infer<typeof wineImportSchema>;
