import Dexie, { type Table } from 'dexie';
import type { Wine, QueuedScan } from '../stores/wine';
import type { Location, GridSlot } from '../stores/location';

export interface PendingOp {
  id: string;
  createdAt: number;
  method: 'POST' | 'PATCH' | 'DELETE';
  url: string;
  body?: string;
}

export interface GridCache {
  id: string; // locationId
  location: Location;
  slots: GridSlot[];
  cachedAt: number;
}

export class CavinoDB extends Dexie {
  wines!: Table<Wine, string>;
  locations!: Table<Location, string>;
  scanQueue!: Table<QueuedScan, string>;
  pendingOps!: Table<PendingOp, string>;
  gridCache!: Table<GridCache, string>;

  constructor() {
    super('caveau');
    this.version(1).stores({
      wines: 'id, name, type, region, importStatus, locationId, vintage',
      locations: 'id, name, type',
    });
    this.version(2).stores({
      wines: 'id, name, type, region, importStatus, locationId, vintage',
      locations: 'id, name, type',
      scanQueue: 'scanId, status, startedAt',
    });
    this.version(3).stores({
      wines: 'id, name, type, region, importStatus, locationId, vintage',
      locations: 'id, name, type',
      scanQueue: 'scanId, status, startedAt',
      pendingOps: 'id, createdAt',
      gridCache: 'id, cachedAt',
    });
  }
}

export const offlineDb = new CavinoDB();

// ── Wines ────────────────────────────────────────────────────────────────────

export async function cacheWines(wines: Wine[]) {
  await offlineDb.wines.clear();
  await offlineDb.wines.bulkPut(wines);
}

export async function getCachedWines(): Promise<Wine[]> {
  return offlineDb.wines.toArray();
}

export async function upsertCachedWine(wine: Wine) {
  await offlineDb.wines.put(wine);
}

export async function removeCachedWine(id: string) {
  await offlineDb.wines.delete(id);
}

// ── Locations ────────────────────────────────────────────────────────────────

export async function cacheLocations(locations: Location[]) {
  await offlineDb.locations.clear();
  await offlineDb.locations.bulkPut(locations);
}

export async function getCachedLocations(): Promise<Location[]> {
  return offlineDb.locations.toArray();
}

// ── Grid cache ───────────────────────────────────────────────────────────────

export async function cacheGrid(
  locationId: string,
  data: { location: Location; slots: GridSlot[] },
) {
  await offlineDb.gridCache.put({ id: locationId, ...data, cachedAt: Date.now() });
}

export async function getCachedGrid(
  locationId: string,
): Promise<{ location: Location; slots: GridSlot[] } | null> {
  const cached = await offlineDb.gridCache.get(locationId);
  return cached ? { location: cached.location, slots: cached.slots } : null;
}

// ── Pending ops ──────────────────────────────────────────────────────────────

export async function queueOp(
  method: 'POST' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
): Promise<void> {
  await offlineDb.pendingOps.add({
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    method,
    url,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function getPendingOpsCount(): Promise<number> {
  return offlineDb.pendingOps.count();
}

export async function clearAllPendingOps(): Promise<void> {
  await offlineDb.pendingOps.clear();
}

// ── Scan queue persistence ──────────────────────────────────────────────────

const SCAN_QUEUE_TTL_MS = 24 * 60 * 60 * 1000;

export async function cacheScanQueue(queue: QueuedScan[]) {
  await offlineDb.scanQueue.clear();
  if (queue.length > 0) await offlineDb.scanQueue.bulkPut(queue);
}

export async function getCachedScanQueue(): Promise<QueuedScan[]> {
  const all = await offlineDb.scanQueue.toArray();
  const now = Date.now();
  return all.filter((s) => now - s.startedAt < SCAN_QUEUE_TTL_MS);
}
