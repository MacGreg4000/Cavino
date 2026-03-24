import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db/index.js';
import { wines } from './db/schema.js';
import { wineImportSchema } from './schemas/wine-import.js';

const PHOTOS_PATH = process.env.PHOTOS_PATH || '/photos';

interface ImportInput {
  jsonPath: string;
  photoPath: string | null;
}

type ImportResult =
  | { success: true; wine: { id: string; name: string } }
  | { success: false; error: string };

export async function importWinePair({ jsonPath, photoPath }: ImportInput): Promise<ImportResult> {
  try {
    const raw = await fs.readFile(jsonPath, 'utf-8');
    const json = JSON.parse(raw);

    const parsed = wineImportSchema.safeParse(json);
    if (!parsed.success) {
      return { success: false, error: `Validation: ${parsed.error.message}` };
    }

    const data = parsed.data;
    const wineId = uuidv4();

    // Copier la photo si elle existe
    let photoUrl: string | null = null;
    if (photoPath) {
      const ext = path.extname(photoPath);
      const photoFilename = `${wineId}${ext}`;
      await fs.mkdir(PHOTOS_PATH, { recursive: true });
      await fs.copyFile(photoPath, path.join(PHOTOS_PATH, photoFilename));
      photoUrl = `/photos/${photoFilename}`;
    }

    const [inserted] = await db.insert(wines).values({
      id: wineId,

      // Identité
      name: data.identity.name,
      domain: data.identity.domain,
      appellation: data.identity.appellation,
      vintage: data.identity.vintage,
      nonVintage: data.identity.non_vintage,
      type: data.identity.type,
      grapes: data.identity.grapes,
      country: data.identity.country,
      region: data.identity.region,
      subRegion: data.identity.sub_region,
      classification: data.identity.classification,
      mentions: data.identity.mentions,
      alcohol: data.identity.alcohol?.toString(),
      bottleSize: data.identity.bottle_size?.toString(),

      // Service
      servingTempMin: data.service.serving_temp_min,
      servingTempMax: data.service.serving_temp_max,
      decanting: data.service.decanting,
      decantingTime: data.service.decanting_time,
      glassType: data.service.glass_type,

      // Garde
      drinkFrom: data.garde.drink_from,
      drinkUntil: data.garde.drink_until,
      peakFrom: data.garde.peak_from,
      peakUntil: data.garde.peak_until,
      currentPhase: data.garde.current_phase,
      agingNotes: data.garde.aging_notes,

      // Analyse IA
      description: data.analysis.description,
      vintageNotes: data.analysis.vintage_notes,
      aromaPrimary: data.analysis.aroma_primary,
      aromaSecondary: data.analysis.aroma_secondary,
      aromaTertiary: data.analysis.aroma_tertiary,
      palate: data.analysis.palate,
      style: data.analysis.style,

      // Accords
      pairingsIdeal: data.pairings.ideal,
      pairingsGood: data.pairings.good,
      pairingsAvoid: data.pairings.avoid,
      occasions: data.pairings.occasions,
      cheesePairings: data.pairings.cheese,

      // Valeur
      estimatedValue: data.estimated_value?.toString(),

      // Médias
      photoUrl,
      awards: data.awards,

      // Import
      importStatus: 'pending',
      sourceFile: path.basename(jsonPath),
      scanDate: new Date().toISOString().split('T')[0],
      scanConfidence: data.scan_confidence,
    }).returning({ id: wines.id, name: wines.name });

    return { success: true, wine: { id: inserted.id, name: inserted.name } };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}
