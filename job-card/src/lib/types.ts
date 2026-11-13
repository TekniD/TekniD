// Shapes shared between the browser (Dexie) and the API routes.

export interface CachedClient {
  /** Invoice Ninja hashed id, or a local id ("local-<uuid>") for clients not yet synced. */
  id: string;
  name: string;
  email?: string;
  phone?: string;
  /** true while the client only exists on this device. */
  pending?: boolean;
}

export interface CachedProduct {
  id: string;
  product_key: string;
  notes: string;
  price: number;
}

export interface NewClientInput {
  name: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  address1?: string;
  city?: string;
}

export interface JobLineItem {
  product_key: string;
  notes: string;
  cost: number;
  quantity: number;
}

/** What the form produces. Everything the server needs to build the invoice. */
export interface JobCard {
  /** Existing Invoice Ninja client id. Empty when newClient is set. */
  clientId: string;
  /** Set when the client was added on-device and must be created first. */
  newClient?: NewClientInput;
  /** Local id of the pending client, so the cache can be fixed up after sync. */
  localClientId?: string;
  clientName: string;
  /** Local wall-clock time from <input type="datetime-local">, e.g. 2026-11-13T09:00 */
  timeIn: string;
  timeOut: string;
  hours: number; // decimal hours, already calculated
  afterHours: boolean;
  travelDistance: number;
  items: JobLineItem[];
  notes: string;
  signature?: string; // data:image/png;base64,...
  photos: string[]; // data:image/jpeg;base64,... (already compressed)
}

export type SyncStatus = "pending" | "syncing" | "error" | "done";

export interface PendingSync {
  id?: number;
  createdAt: number;
  status: SyncStatus;
  error?: string;
  job: JobCard;
  /** Progress, saved after every step so a retry never duplicates work. */
  progress: {
    clientId?: string;
    invoiceId?: string;
    invoiceNumber?: string;
    /** Indexes into the documents list (0 = signature if present, then photos). */
    uploaded: number[];
  };
}
