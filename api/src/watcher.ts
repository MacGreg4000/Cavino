import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs/promises';
import { INBOX_PATH, processInboxJsonFile, scanInboxFolder } from './inbox-import.js';

function isJsonPath(filePath: string): boolean {
  const b = path.basename(filePath);
  if (b.startsWith('._')) return false;
  return b.toLowerCase().endsWith('.json');
}

export function startWatcher() {
  Promise.all([
    fs.mkdir(INBOX_PATH, { recursive: true }),
    fs.mkdir(process.env.PROCESSED_PATH || '/processed', { recursive: true }),
    fs.mkdir(process.env.ERRORS_PATH || '/errors', { recursive: true }),
  ]).catch(() => {});

  const usePolling = process.env.CHOKIDAR_USEPOLLING !== 'false';
  const pollInterval = parseInt(process.env.CHOKIDAR_INTERVAL_MS || '5000', 10);

  const watcher = chokidar.watch(path.join(INBOX_PATH, '*.json'), {
    persistent: true,
    ignoreInitial: false,
    usePolling,
    interval: pollInterval,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 500,
    },
  });

  const debouncers = new Map<string, ReturnType<typeof setTimeout>>();

  const scheduleProcess = (jsonPath: string, delayMs: number) => {
    if (!isJsonPath(jsonPath)) return;
    const prev = debouncers.get(jsonPath);
    if (prev) clearTimeout(prev);
    debouncers.set(
      jsonPath,
      setTimeout(() => {
        debouncers.delete(jsonPath);
        processInboxJsonFile(jsonPath).catch((e) => console.error('Watcher process error:', e));
      }, delayMs)
    );
  };

  watcher.on('add', (jsonPath) => {
    console.log(`📥 JSON add: ${path.basename(jsonPath)}`);
    scheduleProcess(jsonPath, 400);
  });

  watcher.on('change', (jsonPath) => {
    console.log(`📥 JSON change: ${path.basename(jsonPath)}`);
    scheduleProcess(jsonPath, 2500);
  });

  console.log(`👀 Watcher actif sur ${INBOX_PATH} (polling=${usePolling}, interval=${pollInterval}ms)`);

  // Fichiers déjà présents + montages NAS : rescan périodique de secours
  const periodicMs = parseInt(process.env.INBOX_PERIODIC_SCAN_MS || '60000', 10);
  if (periodicMs > 0) {
    setInterval(() => {
      scanInboxFolder()
        .then((r) => {
          if (r.imported > 0) console.log(`📂 Scan périodique: ${r.imported} import(s)`);
        })
        .catch((e) => console.error('Periodic inbox scan:', e));
    }, periodicMs);
  }

  // Premier passage après démarrage (laisse le temps au volume d’être prêt)
  setTimeout(() => {
    scanInboxFolder()
      .then((r) => {
        if (r.imported > 0 || r.errors.length > 0) {
          console.log(`📂 Scan démarrage: ${r.imported} OK, ${r.errors.length} erreur(s)`);
        }
      })
      .catch((e) => console.error('Initial inbox scan:', e));
  }, 8000);

  return watcher;
}
