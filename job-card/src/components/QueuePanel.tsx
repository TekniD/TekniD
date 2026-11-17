"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { processQueue, returnToSaved } from "@/lib/sync";
import type { PendingSync } from "@/lib/types";
import { Card } from "./ui";

const STATUS_LABEL: Record<string, string> = {
  pending: "waiting",
  syncing: "sending",
  error: "failed",
  done: "invoiced",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  syncing: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
  error: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
};

/** Shows queued job cards and what happened to each. */
export function QueuePanel({ onEdit }: { onEdit: (entry: PendingSync) => void }) {
  const entries = useLiveQuery(
    () =>
      db.pending_syncs
        .orderBy("createdAt")
        .reverse()
        .filter((e) => e.status !== "saved")
        .limit(50)
        .toArray(),
    [],
    [],
  );
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
        Nothing submitted yet.
      </div>
    );
  }
  const waiting = entries.filter((e) => e.status !== "done").length;

  return (
    <Card
      title={waiting ? `Submitted (${waiting} still sending)` : "Submitted job cards"}
      right={
        <div className="flex gap-1">
          {waiting ? (
            <button type="button" className="rounded-lg px-3 py-2 text-sm font-medium text-blue-700 dark:text-blue-300" onClick={() => void processQueue()}>
              Retry
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500"
            onClick={() => void db.pending_syncs.where("status").equals("done").delete()}
          >
            Clear invoiced
          </button>
        </div>
      }
    >
      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {entries.map((e) => (
          <li key={e.id} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="truncate font-medium text-slate-900 dark:text-slate-100">{e.job.clientName}</div>
              <div className="text-xs text-slate-500">
                {e.job.timeIn.replace("T", " ")} · {e.job.hours.toFixed(2)} h
                {e.job.tarana?.mtnRef ? ` · ${e.job.tarana.mtnRef}` : ""}
                {e.progress.invoiceNumber ? ` · Invoice ${e.progress.invoiceNumber}` : ""}
              </div>
              {e.error ? <div className="mt-1 break-words text-xs text-red-600 dark:text-red-400">{e.error}</div> : null}
              {e.status === "error" && !e.progress.invoiceId ? (
                <button
                  type="button"
                  className="mt-1 text-xs font-semibold text-blue-700 dark:text-blue-300"
                  onClick={async () => {
                    if (await returnToSaved(e.id!)) onEdit({ ...e, status: "saved" });
                  }}
                >
                  Move back to Saved and edit
                </button>
              ) : null}
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[e.status]}`}>{STATUS_LABEL[e.status] ?? e.status}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
