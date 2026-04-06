import { pgTable, uuid, text, integer, numeric, boolean, date, timestamp, jsonb } from 'drizzle-orm/pg-core';

// ── Emplacements ──────────────────────────────────────────
export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: text('type', { enum: ['cellar', 'fridge', 'rack', 'other'] }).notNull().default('cellar'),
  color: text('color'),
  gridConfig: jsonb('grid_config').$type<{
    rows: number;
    cols: number;
    labelRows: string[];
    labelCols: string[];
    blockedSlots: string[];
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── Slots de grille ───────────────────────────────────────
export const gridSlots = pgTable('grid_slots', {
  id: text('id').primaryKey(), // ex: "CA-A3"
  locationId: uuid('location_id').references(() => locations.id, { onDelete: 'cascade' }).notNull(),
  rowIndex: integer('row_index').notNull(),
  colIndex: integer('col_index').notNull(),
  wineId: uuid('wine_id').references(() => wines.id, { onDelete: 'set null' }),
  nfcTagId: text('nfc_tag_id'),
  isBlocked: boolean('is_blocked').default(false),
});

// ── Bouteilles ────────────────────────────────────────────
export const wines = pgTable('wines', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Identité
  name: text('name').notNull(),
  domain: text('domain'),
  appellation: text('appellation'),
  vintage: integer('vintage'),
  nonVintage: boolean('non_vintage').default(false),
  type: text('type'), // rouge, blanc, rosé, champagne, etc.
  grapes: text('grapes').array(),
  country: text('country'),
  region: text('region'),
  subRegion: text('sub_region'),
  classification: text('classification'),
  mentions: text('mentions').array(),
  alcohol: numeric('alcohol', { precision: 4, scale: 1 }),
  bottleSize: numeric('bottle_size', { precision: 5, scale: 1 }).default('75'),

  // Service
  servingTempMin: integer('serving_temp_min'),
  servingTempMax: integer('serving_temp_max'),
  decanting: boolean('decanting'),
  decantingTime: integer('decanting_time'),
  glassType: text('glass_type'),

  // Garde
  drinkFrom: integer('drink_from'),
  drinkUntil: integer('drink_until'),
  peakFrom: integer('peak_from'),
  peakUntil: integer('peak_until'),
  currentPhase: text('current_phase'),
  agingNotes: text('aging_notes'),

  // Analyse IA
  description: text('description'),
  vintageNotes: text('vintage_notes'),
  aromaPrimary: text('aroma_primary').array(),
  aromaSecondary: text('aroma_secondary').array(),
  aromaTertiary: text('aroma_tertiary').array(),
  palate: text('palate'),
  style: text('style'),

  // Accords
  pairingsIdeal: text('pairings_ideal').array(),
  pairingsGood: text('pairings_good').array(),
  pairingsAvoid: text('pairings_avoid').array(),
  occasions: text('occasions').array(),
  cheesePairings: text('cheese_pairings').array(),

  // Stock
  quantity: integer('quantity').default(1),
  locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
  slotIds: text('slot_ids').array(),
  purchasePrice: numeric('purchase_price', { precision: 10, scale: 2 }),
  estimatedValue: numeric('estimated_value', { precision: 10, scale: 2 }),
  purchaseDate: date('purchase_date'),
  source: text('source'),

  // Médias & meta
  photoUrl: text('photo_url'),
  awards: jsonb('awards').$type<Array<{ year: number; name: string; medal?: string }>>(),
  personalRating: integer('personal_rating'),
  tastingNotes: text('tasting_notes'),
  /** Commentaire libre (cadeau, occasion, etc.) — non exposé sur la page publique */
  personalComment: text('personal_comment'),
  isFavorite: boolean('is_favorite').default(false),
  status: text('status').default('available'),
  nfcTagId: text('nfc_tag_id'),
  physicalCode: text('physical_code'),

  // Import
  importStatus: text('import_status', { enum: ['pending', 'available', 'consumed'] }).default('pending'),
  sourceFile: text('source_file'),
  scanDate: date('scan_date'),
  scanConfidence: text('scan_confidence'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── Log dégustations ──────────────────────────────────────
export const tastingLogs = pgTable('tasting_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  wineId: uuid('wine_id').references(() => wines.id, { onDelete: 'cascade' }).notNull(),
  tastedAt: timestamp('tasted_at', { withTimezone: true }).defaultNow(),
  rating: integer('rating'),
  aromaTags: text('aroma_tags').array(),
  notes: text('notes'),
  occasion: text('occasion'),
  guests: text('guests').array(),
});
