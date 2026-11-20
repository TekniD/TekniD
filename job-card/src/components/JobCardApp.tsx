"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { db } from "@/lib/db";
import { processQueue, refreshCache, requestPersistentStorage } from "@/lib/sync";
import type { PendingSync } from "@/lib/types";
import { JobCardForm } from "./JobCardForm";
import { QueuePanel } from "./QueuePanel";
import { SavedJobs } from "./SavedJobs";

type Tab = "new" | "saved" | "submitted";

const LAST_REFRESH_KEY = "job-card:last-refresh";

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function subscribeLastRefresh(cb: () => void) {
  window.addEventListener("job-card:refreshed", cb);
  return () => window.removeEventListener("job-card:refreshed", cb);
}

function readLastRefresh(): string | null {
  try {
    return localStorage.getItem(LAST_REFRESH_KEY);
  } catch {
    return null;
  }
}

export function JobCardApp() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const lastRefresh = useSyncExternalStore(subscribeLastRefresh, readLastRefresh, () => null);
  const [toast, setToast] = useState("");
  const [tab, setTab] = useState<Tab>("new");
  const [editing, setEditing] = useState<PendingSync | undefined>();
  const savedCount = useLiveQuery(() => db.pending_syncs.where("status").equals("saved").count(), [], 0);
  const failedCount = useLiveQuery(() => db.pending_syncs.where("status").equals("error").count(), [], 0);

  const edit = (entry: PendingSync) => {
    setEditing(entry);
    setTab("new");
    window.scrollTo({ top: 0 });
  };
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (manual = false) => {
    if (!navigator.onLine) return;
    setRefreshing(true);
    try {
      const r = await refreshCache();
      window.dispatchEvent(new Event("job-card:refreshed"));
      if (manual) setToast(`Updated ${r.clients} clients and ${r.products} products`);
    } catch (err) {
      setToast(`Couldn't reach Invoice Ninja: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRefreshing(false);
    }
    await processQueue();
  }, []);

  useEffect(() => {
    // Refresh the cache once after first paint, then whenever we come back online.
    const first = setTimeout(() => void refresh(), 0);
    void requestPersistentStorage();

    const goOnline = () => void refresh();
    // The service worker posts SYNC when Background Sync fires.
    const onSwMessage = (e: MessageEvent) => {
      if (e.data?.type === "SYNC") void processQueue();
    };
    window.addEventListener("online", goOnline);
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    return () => {
      clearTimeout(first);
      window.removeEventListener("online", goOnline);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-6">
      <header className="sticky top-0 z-40 -mx-4 mb-4 flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/95 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Job Card</h1>
          <p className="text-xs text-slate-500">
            <span className={`mr-1 inline-block h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-amber-500"}`} />
            {online ? "Online" : "Offline, saving locally"}
            {lastRefresh ? ` · cache ${new Date(lastRefresh).toLocaleString("en-ZA", { dateStyle: "short", timeStyle: "short" })}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Lock app"
          title="Lock"
          onClick={async () => {
            await fetch("/api/logout", { method: "POST" }).catch(() => undefined);
            // Full reload on purpose: the session cookie changed.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.assign("/login");
          }}
          className="min-h-11 rounded-xl px-3 text-lg"
        >
          🔒
        </button>
        <button
          type="button"
          disabled={!online || refreshing}
          onClick={() => void refresh(true)}
          className="min-h-11 rounded-xl bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 disabled:opacity-50 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700"
        >
          {refreshing ? "Syncing…" : "Sync"}
        </button>
        </div>
      </header>

      {toast ? (
        <div role="status" className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-xl rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
          {toast}
        </div>
      ) : null}

      <nav className="mb-4 grid grid-cols-3 gap-1 rounded-2xl bg-slate-200/70 p-1 dark:bg-slate-800/70" aria-label="Sections">
        {(
          [
            ["new", editing ? "Editing" : "New job"],
            ["saved", `Saved${savedCount ? ` (${savedCount})` : ""}`],
            ["submitted", `Submitted${failedCount ? ` (${failedCount}⚠)` : ""}`],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-current={tab === key ? "page" : undefined}
            onClick={() => setTab(key)}
            className={`min-h-11 rounded-xl text-sm font-semibold transition ${
              tab === key
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "new" ? (
        <JobCardForm
          key={editing?.id ?? "new"}
          editing={editing}
          onCancel={() => {
            setEditing(undefined);
            setTab("saved");
          }}
          onSaved={(msg) => {
            setToast(msg);
            setEditing(undefined);
            setTab("saved");
          }}
        />
      ) : tab === "saved" ? (
        <SavedJobs onEdit={edit} onSubmitted={(msg) => { setToast(msg); }} />
      ) : (
        <QueuePanel onEdit={edit} />
      )}
    </div>
  );
}
