"use client";

import { db } from "./db";
import type { CachedClient, CachedProduct, JobCard, PendingSync } from "./types";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body as T;
}

/** Pull the latest clients and products from Invoice Ninja into IndexedDB. */
export async function refreshCache(): Promise<{ clients: number; products: number }> {
  const [clients, products] = await Promise.allSettled([
    api<{ data: CachedClient[] }>("/api/clients"),
    api<{ data: CachedProduct[] }>("/api/products"),
  ]);
  // Apply whatever came back; a failed list keeps its previous cache.
  await db.transaction("rw", db.clients, db.products, async () => {
    if (clients.status === "fulfilled") {
      // Keep clients created on this device that have not synced yet.
      const localOnly = await db.clients.filter((c) => c.pending === true).toArray();
      await db.clients.clear();
      await db.clients.bulkPut([...clients.value.data, ...localOnly]);
    }
    if (products.status === "fulfilled") {
      await db.products.clear();
      await db.products.bulkPut(products.value.data);
    }
  });
  if (clients.status === "rejected") throw clients.reason;
  if (products.status === "rejected") throw products.reason;
  try {
    localStorage.setItem("job-card:last-refresh", new Date().toISOString());
  } catch {
    // storage blocked; the timestamp is only informational
  }
  return { clients: clients.value.data.length, products: products.value.data.length };
}

export async function queueJob(job: JobCard): Promise<number> {
  const id = await db.pending_syncs.add({
    createdAt: Date.now(),
    status: "pending",
    job,
    progress: { uploaded: [] },
  });
  void requestBackgroundSync();
  return id as number;
}

/** Signature first, then photos. The index is what progress.uploaded tracks. */
function documentsFor(job: JobCard): { dataUrl: string; filename: string }[] {
  const stamp = job.timeIn.slice(0, 10);
  const docs: { dataUrl: string; filename: string }[] = [];
  if (job.signature) docs.push({ dataUrl: job.signature, filename: `signature-${stamp}.png` });
  job.photos.forEach((p, i) => docs.push({ dataUrl: p, filename: `site-photo-${stamp}-${i + 1}.jpg` }));
  return docs;
}

async function saveProgress(id: number, patch: Partial<PendingSync>) {
  await db.pending_syncs.update(id, patch);
}

async function syncOne(entry: PendingSync): Promise<void> {
  const id = entry.id!;
  const progress = { ...entry.progress, uploaded: [...entry.progress.uploaded] };
  const { job } = entry;
  await saveProgress(id, { status: "syncing", error: undefined });

  // 1. New client first, so the invoice has a real client id.
  let clientId = progress.clientId || job.clientId;
  if (!clientId && job.newClient) {
    const res = await api<{ clientId: string; client: CachedClient }>("/api/sync", {
      method: "POST",
      body: JSON.stringify({ action: "client", client: job.newClient }),
    });
    clientId = res.clientId;
    progress.clientId = clientId;
    await saveProgress(id, { progress });

    // Swap the local placeholder client for the real one, and point any other
    // queued jobs for the same new client at it so it isn't created twice.
    if (job.localClientId) {
      const localId = job.localClientId;
      await db.transaction("rw", db.clients, db.pending_syncs, async () => {
        await db.clients.delete(localId);
        await db.clients.put(res.client);
        const siblings = await db.pending_syncs
          .filter((p) => p.id !== id && p.job.localClientId === localId && !p.progress.clientId)
          .toArray();
        for (const s of siblings) {
          await db.pending_syncs.update(s.id!, { progress: { ...s.progress, clientId } });
        }
      });
    }
  }
  if (!clientId) throw new Error("Job card has no client");

  // 2. Draft invoice.
  if (!progress.invoiceId) {
    const res = await api<{ invoiceId: string; invoiceNumber: string; warnings: string[] }>("/api/sync", {
      method: "POST",
      body: JSON.stringify({ action: "invoice", clientId, job }),
    });
    progress.invoiceId = res.invoiceId;
    progress.invoiceNumber = res.invoiceNumber;
    await saveProgress(id, {
      progress,
      error: res.warnings?.length ? res.warnings.join("; ") : undefined,
    });
  }

  // 3. Signature and photos, one request each.
  const docs = documentsFor(job);
  for (let i = 0; i < docs.length; i++) {
    if (progress.uploaded.includes(i)) continue;
    await api("/api/sync", {
      method: "POST",
      body: JSON.stringify({ action: "document", invoiceId: progress.invoiceId, ...docs[i] }),
    });
    progress.uploaded.push(i);
    await saveProgress(id, { progress });
  }

  // Done: drop the heavy Base64 payload but keep a small receipt.
  await saveProgress(id, {
    status: "done",
    job: { ...job, signature: job.signature ? "uploaded" : undefined, photos: [] },
  });
}

let running: Promise<{ synced: number; failed: number }> | null = null;

/** Push every queued job card to Invoice Ninja. Safe to call repeatedly. */
export function processQueue(): Promise<{ synced: number; failed: number }> {
  if (running) return running;
  running = (async () => {
    let synced = 0;
    let failed = 0;
    if (typeof navigator !== "undefined" && !navigator.onLine) return { synced, failed };
    const queue = await db.pending_syncs
      .where("status")
      .anyOf("pending", "error", "syncing")
      .sortBy("createdAt");
    for (const entry of queue) {
      try {
        await syncOne(entry);
        synced++;
      } catch (err) {
        failed++;
        await saveProgress(entry.id!, {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { synced, failed };
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Ask the service worker to wake us when connectivity returns (Chrome/Android). */
export async function requestBackgroundSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    const sync = (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } })?.sync;
    await sync?.register("job-card-sync");
  } catch {
    // Not supported or not permitted; the "online" listener still covers it.
  }
}
