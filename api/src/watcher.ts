import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs/promises';
import { importWinePair } from './importer.js';
import { broadcast } from './websocket.js';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic', '.webp'];

const INBOX = process.env.INBOX_PATH || '/inbox';
const PROCESSED = process.env.PROCESSED_PATH || '/processed';
const ERRORS = process.env.ERRORS_PATH || '/errors';

async function moveFile(src: string, destDir: string) {
  const filename = path.basename(src);
  const dest = path.join(destDir, filename);
  await fs.rename(src, dest).catch(async () => {
    // rename fails across filesystems, fallback to copy+delete
    await fs.copyFile(src, dest);
    await fs.unlink(src);
  });
}

export function startWatcher() {
  // Ensure directories exist
  Promise.all([
    fs.mkdir(INBOX, { recursive: true }),
    fs.mkdir(PROCESSED, { recursive: true }),
    fs.mkdir(ERRORS, { recursive: true }),
  ]).catch(() => {});

  const usePolling = process.env.CHOKIDAR_USEPOLLING !== 'false';
  const watcher = chokidar.watch(path.join(INBOX, '*.json'), {
    persistent: true,
    ignoreInitial: false,
    usePolling,
    interval: 5000,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 500,
    },
  });

  watcher.on('add', async (jsonPath) => {
    const baseName = path.basename(jsonPath, '.json');
    console.log(`📥 JSON détecté: ${baseName}`);

    // Chercher la photo avec le même nom de base
    let photoPath: string | null = null;
    for (const ext of IMAGE_EXTENSIONS) {
      const candidate = path.join(INBOX, baseName + ext);
      try {
        await fs.access(candidate);
        photoPath = candidate;
        break;
      } catch {}
    }

    if (!photoPath) {
      // Attendre 2s au cas où la photo arrive juste après
      await new Promise((r) => setTimeout(r, 2000));
      for (const ext of IMAGE_EXTENSIONS) {
        const candidate = path.join(INBOX, baseName + ext);
        try {
          await fs.access(candidate);
          photoPath = candidate;
          break;
        } catch {}
      }
    }

    console.log(
      photoPath
        ? `📸 Photo associée: ${path.basename(photoPath)}`
        : `⚠️  Aucune photo trouvée pour ${baseName} — import sans photo`
    );

    const result = await importWinePair({ jsonPath, photoPath });

    if (result.success) {
      await moveFile(jsonPath, PROCESSED);
      if (photoPath) await moveFile(photoPath, PROCESSED);
      broadcast({ type: 'WINE_PENDING', wine: result.wine });
      console.log(`✅ Importé: ${result.wine.name}`);
    } else {
      await moveFile(jsonPath, ERRORS);
      if (photoPath) await moveFile(photoPath, ERRORS);
      broadcast({ type: 'IMPORT_ERROR', error: result.error, file: baseName });
      console.error(`❌ Erreur: ${result.error}`);
    }
  });

  console.log(`👀 Watcher actif sur ${INBOX}`);
  return watcher;
}
