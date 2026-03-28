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

    // Résoudre la valeur estimée (nouveau format: purchase.estimatedValue, ancien: estimated_value)
    const estimatedValue = data.purchase?.estimatedValue ?? data.estimated_value;

    // Résoudre la confiance du scan (nouveau: meta.confidence, ancien: scan_confidence)
    const scanConfidence = data.meta?.confidence ?? data.scan_confidence;

    // Résoudre la date du scan (nouveau: meta.scanDate, sinon date courante)
    const scanDate = data.meta?.scanDate ?? new Date().toISOString().split('T')[0];

    // Résoudre la taille de la bouteille
    const bottleSize = data.identity.bottleSize ?? data.purchase?.bottleSize;

    // Dériver le boolean decanting depuis decantingTime si pas fourni explicitement
    const decanting = data.service?.decanting ?? (
      data.service?.decantingTime != null && data.service.decantingTime > 0
    );

    // Normaliser les awards : nouveau format { label, score } → DB { name, medal }
    const awards = (data.awards ?? []).map((a) => ({
      year: a.year,
      name: a.label ?? a.name ?? '',
      medal: a.score ?? a.medal ?? undefined,
    }));

    const [inserted] = await db.insert(wines).values({
      id: wineId,

      // Identité
      name: data.identity.name,
      domain: data.identity.domain ?? undefined,
      appellation: data.identity.appellation ?? undefined,
      vintage: data.identity.vintage ?? undefined,
      nonVintage: data.identity.nonVintage ?? undefined,
      type: data.identity.type ?? undefined,
      grapes: data.identity.grapes?.filter(Boolean) ?? [],
      country: data.identity.country ?? undefined,
      region: data.identity.region ?? undefined,
      subRegion: data.identity.subRegion ?? undefined,
      classification: data.identity.classification ?? undefined,
      mentions: data.identity.mentions?.filter(Boolean) ?? [],
      alcohol: data.identity.alcohol != null ? data.identity.alcohol.toString() : undefined,
      bottleSize: bottleSize != null ? bottleSize.toString() : undefined,

      // Service
      servingTempMin: data.service?.servingTempMin,
      servingTempMax: data.service?.servingTempMax,
      decanting,
      decantingTime: data.service?.decantingTime,
      glassType: data.service?.glassType,

      // Garde / Aging
      drinkFrom: data.aging?.drinkFrom,
      drinkUntil: data.aging?.drinkUntil,
      peakFrom: data.aging?.peakFrom,
      peakUntil: data.aging?.peakUntil,
      currentPhase: data.aging?.currentPhase,
      agingNotes: data.aging?.agingNotes,

      // Analyse IA
      description: data.analysis?.description ?? undefined,
      vintageNotes: data.analysis?.vintageNotes ?? undefined,
      aromaPrimary: data.analysis?.aromaProfile?.primary?.filter(Boolean) ?? [],
      aromaSecondary: data.analysis?.aromaProfile?.secondary?.filter(Boolean) ?? [],
      aromaTertiary: data.analysis?.aromaProfile?.tertiary?.filter(Boolean) ?? [],
      palate: data.analysis?.palate ?? undefined,
      style: data.analysis?.style ?? undefined,

      // Accords
      pairingsIdeal: data.pairings?.ideal?.filter(Boolean) ?? [],
      pairingsGood: data.pairings?.good?.filter(Boolean) ?? [],
      pairingsAvoid: data.pairings?.avoid?.filter(Boolean) ?? [],
      occasions: data.pairings?.occasions?.filter(Boolean) ?? [],
      cheesePairings: data.pairings?.cheese?.filter(Boolean) ?? [],

      // Valeur
      estimatedValue: estimatedValue?.toString(),

      // Médias
      photoUrl,
      awards,

      // Import
      importStatus: 'pending',
      sourceFile: path.basename(jsonPath),
      scanDate,
      scanConfidence,
    }).returning({ id: wines.id, name: wines.name });

    return { success: true, wine: { id: inserted.id, name: inserted.name } };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}
