import Dexie, { type Table } from 'dexie';
import type { Wine } from '../stores/wine';
import type { Location } from '../stores/location';

export class CavinoDB extends Dexie {
  wines!: Table<Wine, string>;
  locations!: Table<Location, string>;

  constructor() {
    super('caveau');
    this.version(1).stores({
      wines: 'id, name, type, region, importStatus, locationId, vintage',
      locations: 'id, name, type',
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
