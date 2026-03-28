import type { FastifyPluginAsync } from 'fastify';
import fs from 'fs/promises';
import path from 'path';
import { importWinePair } from '../importer.js';
import { broadcast } from '../websocket.js';

const INBOX = process.env.INBOX_PATH || '/inbox';
const PROCESSED = process.env.PROCESSED_PATH || '/processed';
const ERRORS = process.env.ERRORS_PATH || '/errors';
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic', '.webp'];

async function moveFile(src: string, destDir: string) {
  const filename = path.basename(src);
  const dest = path.join(destDir, filename);
  await fs.rename(src, dest).catch(async () => {
    await fs.copyFile(src, dest);
    await fs.unlink(src);
  });
}

export const importRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/import/scan', async () => {
    const entries = await fs.readdir(INBOX).catch(() => [] as string[]);
    const jsonFiles = entries.filter((f) => f.endsWith('.json'));

    if (jsonFiles.length === 0) {
      return { imported: 0, errors: [], message: 'Aucun fichier JSON dans le dossier inbox' };
    }

    let imported = 0;
    const errors: string[] = [];

    for (const jsonFile of jsonFiles) {
      const jsonPath = path.join(INBOX, jsonFile);
      const baseName = path.basename(jsonFile, '.json');

      let photoPath: string | null = null;
      for (const ext of IMAGE_EXTENSIONS) {
        const candidate = path.join(INBOX, baseName + ext);
        try {
          await fs.access(candidate);
          photoPath = candidate;
          break;
        } catch {}
      }

      const result = await importWinePair({ jsonPath, photoPath });

      if (result.success) {
        await moveFile(jsonPath, PROCESSED);
        if (photoPath) await moveFile(photoPath, PROCESSED);
        broadcast({ type: 'WINE_PENDING', wine: result.wine });
        imported++;
      } else {
        await moveFile(jsonPath, ERRORS);
        if (photoPath) await moveFile(photoPath, ERRORS);
        errors.push(`${baseName}: ${result.error}`);
      }
    }

    return { imported, errors };
  });
};
