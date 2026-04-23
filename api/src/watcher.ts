import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs/promises';
import type { WebSocket } from 'ws';
import { eq } from 'drizzle-orm';
import { INBOX_PATH, processInboxJsonFile, scanInboxFolder } from './inbox-import.js';
import { broadcast } from './websocket.js';
import { db } from './db/index.js';
import { wines } from './db/schema.js';

function isJsonPath(filePath: string): boolean {
  const b = path.basename(filePath);
  if (b.startsWith('._')) return false;
  return b.toLowerCase().endsWith('.json');
}

const progressDir = () => path.join(INBOX_PATH, '.progress');

/**
 * Replay the last progress line of every active .jsonl file to a newly
 * connected WebSocket client so it catches up after a reconnection.
 */
export async function replayProgressForClient(ws: WebSocket): Promise<void> {
  if (ws.readyState !== 1) return;

  // 1. Replay ALL progress lines for each active scan.
  //    Le frontend déduplique par `ts` donc il est safe d'envoyer toutes les
  //    lignes — un client qui se reconnecte récupère le log complet sans créer
  //    de doublons visuels, même si certaines lignes avaient déjà été reçues.
  try {
    const dir = progressDir();
    const files = await fs.readdir(dir).catch(() => [] as string[]);
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const fp = path.join(dir, f);
      try {
        const content = await fs.readFile(fp, 'utf-8');
        const lines = content.split('\n').map((l: string) => l.trim()).filter(Boolean);
        if (lines.length === 0) continue;
        const scanId = path.basename(f, '.jsonl');
        for (const rawLine of lines) {
          try {
            const entry = JSON.parse(rawLine);
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'SCAN_PROGRESS', scanId, ...entry }));
            }
          } catch { /* ligne malformée */ }
        }
      } catch { /* malformed */ }
    }
  } catch { /* progressDir not ready yet */ }

  // 2. Replay WINE_PENDING for all wines currently in pending state
  // This catches scans that completed while the WS was disconnected
  try {
    const pendingWines = await db.select().from(wines).where(eq(wines.importStatus, 'pending'));
    for (const wine of pendingWines) {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'WINE_PENDING', wine }));
      }
    }
  } catch { /* db not ready */ }
}

export function startWatcher() {
  Promise.all([
    fs.mkdir(INBOX_PATH, { recursive: true }),
    fs.mkdir(process.env.PROCESSED_PATH || '/processed', { recursive: true }),
    fs.mkdir(process.env.ERRORS_PATH || '/errors', { recursive: true }),
  ]).catch(() => {});

  const usePolling = process.env.CHOKIDAR_USEPOLLING !== 'false';
  const pollInterval = parseInt(process.env.CHOKIDAR_INTERVAL_MS || '5000', 10);

  const scanReadyDir = path.join(INBOX_PATH, 'Prêt à être importé');
  fs.mkdir(scanReadyDir, { recursive: true }).catch(() => {});

  const watcher = chokidar.watch([
    path.join(INBOX_PATH, '*.json'),
    path.join(scanReadyDir, '*.json'),
  ], {
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

  // ── Progress watcher : lit les fichiers .progress/{scanId}.jsonl ──────────────
  const progressDir = path.join(INBOX_PATH, '.progress');
  fs.mkdir(progressDir, { recursive: true }).catch(() => {});

  // Offset de lecture par fichier pour ne broadcaster que les nouvelles lignes
  const progressOffsets = new Map<string, number>();

  const broadcastNewProgressLines = async (filePath: string) => {
    try {
      const stat = await fs.stat(filePath);
      const offset = progressOffsets.get(filePath) ?? 0;
      if (stat.size <= offset) return;

      const fh = await fs.open(filePath, 'r');
      const newBytes = stat.size - offset;
      const buf = Buffer.alloc(newBytes);
      await fh.read(buf, 0, newBytes, offset);
      await fh.close();
      progressOffsets.set(filePath, stat.size);

      const scanId = path.basename(filePath, '.jsonl');
      for (const rawLine of buf.toString('utf-8').split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        try {
          const entry = JSON.parse(line);
          console.log(`📡 SCAN_PROGRESS → ${scanId}: ${entry.message?.slice(0, 60) ?? ''}`);
          broadcast({ type: 'SCAN_PROGRESS', scanId, ...entry });
        } catch { /* ligne malformée */ }
      }
    } catch { /* fichier disparu */ }
  };

  // Watch the DIRECTORY (not a glob) — glob patterns don't work reliably
  // with polling mode on Docker volumes
  const progressWatcher = chokidar.watch(progressDir, {
    persistent: true,
    ignoreInitial: false,
    usePolling,
    interval: 1000,
    awaitWriteFinish: false,
    depth: 0,
  });

  progressWatcher.on('add', (filePath) => {
    if (!filePath.endsWith('.jsonl')) return;
    console.log(`📂 Progress file détecté: ${path.basename(filePath)}`);
    progressOffsets.set(filePath, 0);
    broadcastNewProgressLines(filePath);
  });
  progressWatcher.on('change', (filePath) => {
    if (!filePath.endsWith('.jsonl')) return;
    broadcastNewProgressLines(filePath);
  });

  // Polling de secours : relit tous les fichiers .jsonl actifs toutes les 3s
  // Garantit que les events chokidar ratés n'empêchent pas le broadcast
  setInterval(async () => {
    try {
      const files = await fs.readdir(progressDir);
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        const fp = path.join(progressDir, f);
        await broadcastNewProgressLines(fp);
      }
    } catch { /* dir not ready */ }
  }, 3000);

  // Nettoyage TTL : supprime les fichiers .jsonl de plus de 10 minutes
  setInterval(async () => {
    try {
      const files = await fs.readdir(progressDir);
      const now = Date.now();
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        const fp = path.join(progressDir, f);
        const stat = await fs.stat(fp).catch(() => null);
        if (stat && now - stat.mtimeMs > 10 * 60 * 1000) {
          await fs.unlink(fp).catch(() => {});
          progressOffsets.delete(fp);
        }
      }
    } catch {}
  }, 60_000);

  // ── Fichiers déjà présents + montages NAS : rescan périodique de secours ──────
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

  // Premier passage après démarrage (laisse le temps au volume d'être prêt)
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
