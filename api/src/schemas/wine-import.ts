import { z } from 'zod';

// Schema zod pour valider les JSON générés par le skill cave-scan
export const wineImportSchema = z.object({
  identity: z.object({
    name: z.string().min(1),
    domain: z.string().optional(),
    appellation: z.string().optional(),
    vintage: z.number().int().min(1900).max(2100).optional(),
    non_vintage: z.boolean().optional().default(false),
    type: z.string().optional(),
    grapes: z.array(z.string()).optional().default([]),
    country: z.string().optional(),
    region: z.string().optional(),
    sub_region: z.string().optional(),
    classification: z.string().optional(),
    mentions: z.array(z.string()).optional().default([]),
    alcohol: z.number().min(0).max(100).optional(),
    bottle_size: z.number().optional().default(75),
  }),

  service: z.object({
    serving_temp_min: z.number().int().optional(),
    serving_temp_max: z.number().int().optional(),
    decanting: z.boolean().optional(),
    decanting_time: z.number().int().optional(),
    glass_type: z.string().optional(),
  }).optional().default({}),

  garde: z.object({
    drink_from: z.number().int().optional(),
    drink_until: z.number().int().optional(),
    peak_from: z.number().int().optional(),
    peak_until: z.number().int().optional(),
    current_phase: z.string().optional(),
    aging_notes: z.string().optional(),
  }).optional().default({}),

  analysis: z.object({
    description: z.string().optional(),
    vintage_notes: z.string().optional(),
    aroma_primary: z.array(z.string()).optional().default([]),
    aroma_secondary: z.array(z.string()).optional().default([]),
    aroma_tertiary: z.array(z.string()).optional().default([]),
    palate: z.string().optional(),
    style: z.string().optional(),
  }).optional().default({
    aroma_primary: [],
    aroma_secondary: [],
    aroma_tertiary: [],
  }),

  pairings: z.object({
    ideal: z.array(z.string()).optional().default([]),
    good: z.array(z.string()).optional().default([]),
    avoid: z.array(z.string()).optional().default([]),
    occasions: z.array(z.string()).optional().default([]),
    cheese: z.array(z.string()).optional().default([]),
  }).optional().default({
    ideal: [],
    good: [],
    avoid: [],
    occasions: [],
    cheese: [],
  }),

  awards: z.array(z.object({
    year: z.number().int(),
    name: z.string(),
    medal: z.string().optional(),
  })).optional().default([]),

  estimated_value: z.number().optional(),
  scan_confidence: z.string().optional(),
});

export type WineImport = z.infer<typeof wineImportSchema>;
