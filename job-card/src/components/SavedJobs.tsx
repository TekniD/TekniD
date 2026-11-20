"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db } from "@/lib/db";
import { submitJobs } from "@/lib/sync";
import type { PendingSync } from "@/lib/types";
import { buttonClass } from "./ui";

/** Job cards saved on the phone that have not been sent to Invoice Ninja yet. */
export function SavedJobs({
  onEdit,
  onSubmitted,
}: {
  onEdit: (entry: PendingSync) => void;
  onSubmitted: (message: string) => void;
}) {
  const saved = useLiveQuery(
    () => db.pending_syncs.where("status").equals("saved").reverse().sortBy("createdAt"),
    [],
    [],
  );
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(ids: number[]) {
    setBusy(true);
    try {
      const r = await submitJobs(ids);
      if (!navigator.onLine) onSubmitted("Submitted. They'll go to Invoice Ninja when you're back online.");
      else if (r.failed) onSubmitted(`${r.synced} sent, ${r.failed} failed. See the Submitted tab.`);
      else onSubmitted(`${r.synced} draft invoice${r.synced === 1 ? "" : "s"} created in Invoice Ninja.`);
    } finally {
      setBusy(false);
    }
  }

  if (saved.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
        No saved job cards. Cards you save appear here until you submit them to Invoice Ninja.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {saved.length} saved, not yet invoiced
        </p>
        {saved.length > 1 ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit(saved.map((s) => s.id!))}
            className={`${buttonClass} min-h-10 bg-blue-600 px-3 text-sm text-white`}
          >
            Submit all ({saved.length})
          </button>
        ) : null}
      </div>

      {saved.map((e) => {
        const j = e.job;
        return (
          <article key={e.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <button type="button" className="block w-full text-left" onClick={() => onEdit(e)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-900 dark:text-slate-100">{j.clientName}</div>
                  <div className="text-xs text-slate-500">
                    {j.timeIn.replace("T", " ")} → {j.timeOut.slice(11, 16)} · {j.hours.toFixed(2)} h
                    {j.afterHours ? " (AH)" : ""}
                    {j.travelDistance ? ` · ${j.travelDistance} km` : ""}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {j.jobType === "tarana" ? "Tarana" : "Normal"}
                </span>
              </div>
              {j.tarana?.mtnRef || j.tarana?.typeOfCall ? (
                <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                  {j.tarana.mtnRef ? <span className="font-mono">{j.tarana.mtnRef}</span> : null}
                  {j.tarana.mtnRef && j.tarana.typeOfCall ? " · " : ""}
                  {j.tarana.typeOfCall}
                </div>
              ) : null}
              {j.notes ? <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{j.notes}</p> : null}
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                {j.items.length ? <span>{j.items.length} item{j.items.length === 1 ? "" : "s"}</span> : null}
                {j.photos.length ? <span>📷 {j.photos.length}</span> : null}
                {j.signature ? <span>✍️ signed</span> : null}
                {j.newClient ? <span>new client</span> : null}
              </div>
            </button>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {confirmDelete === e.id ? (
                <>
                  <button
                    type="button"
                    className={`${buttonClass} min-h-11 bg-red-600 text-sm text-white`}
                    onClick={async () => {
                      setConfirmDelete(null);
                      const localId = e.job.localClientId;
                      await db.transaction("rw", db.pending_syncs, db.clients, async () => {
                        await db.pending_syncs.delete(e.id!);
                        // Drop a phone-only new client if no other card still uses it.
                        if (localId) {
                          const others = await db.pending_syncs.filter((p) => p.job.localClientId === localId).count();
                          if (others === 0) await db.clients.delete(localId);
                        }
                      });
                    }}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className={`${buttonClass} col-span-2 min-h-11 bg-slate-100 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-100`}
                    onClick={() => setConfirmDelete(null)}
                  >
                    Keep it
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={`${buttonClass} min-h-11 bg-slate-100 text-sm text-red-700 dark:bg-slate-800 dark:text-red-400`}
                    onClick={() => setConfirmDelete(e.id!)}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className={`${buttonClass} min-h-11 bg-slate-100 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-100`}
                    onClick={() => onEdit(e)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={`${buttonClass} min-h-11 bg-blue-600 text-sm text-white`}
                    onClick={() => void submit([e.id!])}
                  >
                    Submit
                  </button>
                </>
              )}
            </div>
          </article>
        );
      })}
      <p className="px-1 text-xs text-slate-500">Submit creates a draft invoice in Invoice Ninja with the signature and photos attached.</p>
    </div>
  );
}
