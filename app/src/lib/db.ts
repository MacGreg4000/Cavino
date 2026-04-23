import Dexie, { type Table } from 'dexie';
import type { Wine, QueuedScan } from '../stores/wine';
import type { Location } from '../stores/location';

export class CavinoDB extends Dexie {
  wines!: Table<Wine, string>;
  locations!: Table<Location, string>;
  scanQueue!: Table<QueuedScan, string>;

  constructor() {
    super('caveau');
    this.version(1).stores({
      wines: 'id, name, type, region, importStatus, locationId, vintage',
      locations: 'id, name, type',
    });
    // v2 : ajout de la table scanQueue pour survivre à la fermeture de l'app
    this.version(2).stores({
      wines: 'id, name, type, region, importStatus, locationId, vintage',
      locations: 'id, name, type',
      scanQueue: 'scanId, status, startedAt',
    });
  }
}

export const offlineDb = new CavinoDB();

// Sync helpers: cache API responses in IndexedDB
export async function cacheWines(wines: Wine[]) {
  await offlineDb.wines.clear();
  await offlineDb.wines.bulkPut(wines);
}

export async function getCachedWines(): Promise<Wine[]> {
  return offlineDb.wines.toArray();
}

export async function cacheLocations(locations: Location[]) {
  await offlineDb.locations.clear();
  await offlineDb.locations.bulkPut(locations);
}

export async function getCachedLocations(): Promise<Location[]> {
  return offlineDb.locations.toArray();
}

// ── Scan queue persistence ──────────────────────────────────────────────────
// Évite la perte de l'état de la file quand l'utilisateur ferme la PWA
// pendant un scan en cours. Le scan-service continue de toute façon ; on
// veut juste que l'UI retrouve la bonne queue au retour.
const SCAN_QUEUE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

export async function cacheScanQueue(queue: QueuedScan[]) {
  await offlineDb.scanQueue.clear();
  if (queue.length > 0) {
    await offlineDb.scanQueue.bulkPut(queue);
  }
}

export async function getCachedScanQueue(): Promise<QueuedScan[]> {
  const all = await offlineDb.scanQueue.toArray();
  const now = Date.now();
  // Filtre les scans trop vieux pour éviter d'encombrer la queue avec des
  // vestiges de sessions anciennes.
  return all.filter((s) => now - s.startedAt < SCAN_QUEUE_TTL_MS);
}
