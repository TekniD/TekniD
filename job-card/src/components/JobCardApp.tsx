"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { processQueue, refreshCache } from "@/lib/sync";
import { JobCardForm } from "./JobCardForm";
import { QueuePanel } from "./QueuePanel";

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
        <button
          type="button"
          disabled={!online || refreshing}
          onClick={() => void refresh(true)}
          className="min-h-11 rounded-xl bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 disabled:opacity-50 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700"
        >
          {refreshing ? "Syncing…" : "Sync"}
        </button>
      </header>

      {toast ? (
        <div role="status" className="fixed inset-x-4 top-20 z-50 mx-auto max-w-xl rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
          {toast}
        </div>
      ) : null}

      <div className="space-y-4">
        <JobCardForm onQueued={setToast} />
        <QueuePanel />
      </div>
    </div>
  );
}
