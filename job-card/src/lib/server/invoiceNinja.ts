/**
 * Minimal Invoice Ninja v5 client. Server-side only: it reads the API token
 * from the environment, which must never reach the browser.
 *
 * API notes (checked against invoiceninja v5-stable source):
 *  - Auth headers: X-API-TOKEN + X-Requested-With: XMLHttpRequest.
 *  - Lists are paginated: ?per_page=&page=, with meta.pagination.total_pages.
 *  - New invoices are created as drafts (status_id 1) by default.
 *  - POST /api/v1/documents is an empty stub in v5 and does NOT attach files.
 *    Files are attached through the entity's upload route:
 *      PUT /api/v1/invoices/{id}/upload   (multipart: documents[]=<file>)
 *    PHP can't parse multipart bodies on a real PUT, so we send a POST with
 *    the Laravel method-spoofing field _method=PUT.
 */
import type { CachedClient, CachedProduct, NewClientInput } from "../types";

export class InvoiceNinjaError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
  }
}

function config() {
  const url = process.env.INVOICE_NINJA_URL?.replace(/\/+$/, "");
  const token = process.env.INVOICE_NINJA_TOKEN;
  if (!url || !token) {
    throw new InvoiceNinjaError(
      "INVOICE_NINJA_URL and INVOICE_NINJA_TOKEN must be set in .env.local",
      500,
    );
  }
  return { url, token };
}

async function inFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, token } = config();
  const headers = new Headers(init.headers);
  headers.set("X-API-TOKEN", token);
  headers.set("X-Requested-With", "XMLHttpRequest");
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${url}/api/v1${path}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(60_000),
  });

  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // leave as text
  }
  if (!res.ok) {
    const msg =
      (body as { message?: string } | null)?.message ??
      `Invoice Ninja returned HTTP ${res.status}`;
    throw new InvoiceNinjaError(`${msg} (${init.method ?? "GET"} ${path})`, res.status, body);
  }
  return body as T;
}

interface ListResponse<T> {
  data: T[];
  meta?: { pagination?: { total_pages?: number } };
}

async function fetchAll<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  const sep = path.includes("?") ? "&" : "?";
  for (let page = 1; page < 100; page++) {
    const res = await inFetch<ListResponse<T>>(`${path}${sep}per_page=500&page=${page}`);
    out.push(...res.data);
    const totalPages = res.meta?.pagination?.total_pages ?? 1;
    if (page >= totalPages || res.data.length === 0) break;
  }
  return out;
}

interface INClient {
  id: string;
  name: string;
  display_name?: string;
  phone?: string;
  is_deleted?: boolean;
  archived_at?: number;
  contacts?: { first_name?: string; last_name?: string; email?: string; phone?: string }[];
}

interface INProduct {
  id: string;
  product_key: string;
  notes: string;
  price: number | string;
  is_deleted?: boolean;
  archived_at?: number;
}

function mapClient(c: INClient): CachedClient {
  const contact = c.contacts?.[0];
  const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ");
  return {
    id: c.id,
    name: c.display_name || c.name || contactName || contact?.email || "(unnamed client)",
    email: contact?.email || undefined,
    phone: c.phone || contact?.phone || undefined,
  };
}

function mapProduct(p: INProduct): CachedProduct {
  return {
    id: p.id,
    product_key: p.product_key,
    notes: p.notes ?? "",
    price: Number(p.price) || 0,
  };
}

/** Active clients only (status defaults to active, filtered again defensively). */
export async function listClients(): Promise<CachedClient[]> {
  const rows = await fetchAll<INClient>("/clients?status=active");
  return rows.filter((c) => !c.is_deleted && !c.archived_at).map(mapClient);
}

export async function listProducts(): Promise<CachedProduct[]> {
  const rows = await fetchAll<INProduct>("/products?status=active");
  return rows.filter((p) => !p.is_deleted && !p.archived_at).map(mapProduct);
}

export async function createClient(input: NewClientInput): Promise<CachedClient> {
  const [first, ...rest] = input.name.trim().split(/\s+/);
  const body = {
    name: input.name.trim(),
    phone: input.phone ?? "",
    address1: input.address1 ?? "",
    city: input.city ?? "",
    // Invoice Ninja requires the contacts array on create.
    contacts: [
      {
        first_name: input.first_name ?? first ?? "",
        last_name: input.last_name ?? rest.join(" "),
        email: input.email ?? "",
        phone: input.phone ?? "",
        send_email: true,
      },
    ],
  };
  const res = await inFetch<{ data: INClient }>("/clients", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return mapClient(res.data);
}

let productCache: { at: number; byKey: Map<string, CachedProduct> } | null = null;

/** Look up a product by its product_key (cached for 5 minutes). */
export async function findProductByKey(key: string): Promise<CachedProduct | undefined> {
  if (!productCache || Date.now() - productCache.at > 5 * 60_000) {
    const all = await listProducts();
    productCache = {
      at: Date.now(),
      byKey: new Map(all.map((p) => [p.product_key.toLowerCase(), p])),
    };
  }
  return productCache.byKey.get(key.toLowerCase());
}

export interface InvoiceLineItem {
  product_key: string;
  notes: string;
  cost: number;
  quantity: number;
  /** "1" = product, "2" = service */
  type_id: "1" | "2";
}

export async function createDraftInvoice(input: {
  client_id: string;
  date: string; // YYYY-MM-DD
  line_items: InvoiceLineItem[];
  public_notes: string;
  private_notes?: string;
}): Promise<{ id: string; number: string }> {
  const res = await inFetch<{ data: { id: string; number: string } }>("/invoices", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return { id: res.data.id, number: res.data.number };
}

/** Attach one file (from a Base64 data URL) to an invoice. */
export async function uploadInvoiceDocument(
  invoiceId: string,
  dataUrl: string,
  filename: string,
): Promise<void> {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!match || !match[2]) throw new InvoiceNinjaError("Document is not a Base64 data URL", 400);
  const mime = match[1] || "application/octet-stream";
  const bytes = Buffer.from(match[3], "base64");

  const form = new FormData();
  form.append("_method", "PUT");
  form.append("documents[]", new Blob([bytes], { type: mime }), filename);

  await inFetch(`/invoices/${encodeURIComponent(invoiceId)}/upload`, {
    method: "POST",
    body: form,
  });
}
