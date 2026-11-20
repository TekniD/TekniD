import Dexie, { type EntityTable } from "dexie";
import type { CachedClient, CachedProduct, PendingSync } from "./types";

/**
 * Local IndexedDB cache. The app works fully offline from these three tables:
 *  - clients / products: refreshed from Invoice Ninja whenever the app is online
 *  - pending_syncs: job cards waiting to be pushed to Invoice Ninja
 */
export class JobCardDB extends Dexie {
  clients!: EntityTable<CachedClient, "id">;
  products!: EntityTable<CachedProduct, "id">;
  pending_syncs!: EntityTable<PendingSync, "id">;

  constructor() {
    super("job-card");
    this.version(1).stores({
      clients: "id, name, pending",
      products: "id, product_key",
      pending_syncs: "++id, status, createdAt",
    });
  }
}

export const db = new JobCardDB();
