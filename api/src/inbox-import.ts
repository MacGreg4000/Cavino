import path from 'path';
import fs from 'fs/promises';
import { importWinePair } from './importer.js';
import { broadcast } from './websocket.js';

export const INBOX_PATH = process.env.INBOX_PATH || '/inbox';
export const PROCESSED_PATH = process.env.PROCESSED_PATH || '/processed';
export const ERRORS_PATH = process.env.ERRORS_PATH || '/errors';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.heic', '.webp']);

async function moveFile(src: string, destDir: string) {
  const filename = path.basename(src);
  const dest = path.join(destDir, filename);
  await fs.rename(src, dest).catch(async () => {
    await fs.copyFile(src, dest);
    await fs.unlink(src);
  });
}

function isImportableJson(filename: string): boolean {
  if (filename.startsWith('._')) return false;
  return filename.toLowerCase().endsWith('.json');
}

/** Trouve une photo dans l’inbox avec le même nom de base (casse des extensions gérée, ex. .HEIC) */
export async function findPhotoInInbox(inbox: string, baseName: string): Promise<string | null> {
  const entries = await fs.readdir(inbox).catch(() => [] as string[]);
  const bn = baseName.toLowerCase();
  for (const f of entries) {
    if (f.startsWith('._')) continue;
    const { name, ext } = path.parse(f);
    if (name.toLowerCase() !== bn) continue;
    if (IMAGE_EXT.has(ext.toLowerCase())) {
      return path.join(inbox, f);
    }
  }
  return null;
}

const processing = new Set<string>();

export type ProcessInboxResult = 'imported' | 'error' | 'skipped';

export async function processInboxJsonFile(jsonPath: string): Promise<ProcessInboxResult> {
  const base = path.basename(jsonPath);
  if (!isImportableJson(base)) return 'skipped';

  try {
    await fs.access(jsonPath);
  } catch {
    return 'skipped';
  }

  if (processing.has(jsonPath)) return 'skipped';
  processing.add(jsonPath);

  try {
    const baseName = path.basename(base, path.extname(base));
    const jsonDir = path.dirname(jsonPath);

    // Chercher la photo dans le même dossier que le JSON, puis à la racine inbox
    let photoPath = await findPhotoInInbox(jsonDir, baseName);
    if (!photoPath && jsonDir !== INBOX_PATH) {
      photoPath = await findPhotoInInbox(INBOX_PATH, baseName);
    }
    if (!photoPath) {
      await new Promise((r) => setTimeout(r, 2000));
      photoPath = await findPhotoInInbox(jsonDir, baseName);
      if (!photoPath && jsonDir !== INBOX_PATH) {
        photoPath = await findPhotoInInbox(INBOX_PATH, baseName);
      }
    }

    const result = await importWinePair({ jsonPath, photoPath });

    if (result.success) {
      await moveFile(jsonPath, PROCESSED_PATH);
      if (photoPath) await moveFile(photoPath, PROCESSED_PATH);
      broadcast({ type: 'WINE_PENDING', wine: result.wine });
      console.log(`✅ Importé: ${result.wine.name}`);
      return 'imported';
    }

    await moveFile(jsonPath, ERRORS_PATH);
    if (photoPath) await moveFile(photoPath, ERRORS_PATH);
    broadcast({ type: 'IMPORT_ERROR', error: result.error, file: baseName });
    console.error(`❌ Erreur import ${baseName}: ${result.error}`);
    return 'error';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`❌ Exception import ${base}:`, e);
    try {
      await moveFile(jsonPath, ERRORS_PATH);
    } catch {}
    return 'error';
  } finally {
    processing.delete(jsonPath);
  }
}

export async function scanInboxFolder(): Promise<{
  imported: number;
  errors: string[];
  message?: string;
}> {
  const scanReadyDir = path.join(INBOX_PATH, 'Prêt à être importé');

  const [rootEntries, subEntries] = await Promise.all([
    fs.readdir(INBOX_PATH).catch(() => [] as string[]),
    fs.readdir(scanReadyDir).catch(() => [] as string[]),
  ]);

  const jsonFiles = [
    ...rootEntries.filter(isImportableJson).map((f) => path.join(INBOX_PATH, f)),
    ...subEntries.filter(isImportableJson).map((f) => path.join(scanReadyDir, f)),
  ];

  if (jsonFiles.length === 0) {
    return { imported: 0, errors: [], message: 'Aucun fichier JSON dans le dossier inbox' };
  }

  let imported = 0;
  const errors: string[] = [];

  for (const jsonPath of jsonFiles) {
    const baseName = path.basename(jsonPath, path.extname(jsonPath));
    const r = await processInboxJsonFile(jsonPath);
    if (r === 'imported') imported++;
    else if (r === 'error') errors.push(`${baseName}: import impossible (voir data/errors)`);
  }

  return { imported, errors };
}
