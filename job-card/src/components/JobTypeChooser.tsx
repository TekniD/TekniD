"use client";

import type { JobType } from "@/lib/types";

const OPTIONS: { type: JobType; title: string; body: string; icon: string }[] = [
  { type: "normal", title: "Normal job", body: "IT, networking or WISP call-out for your own client.", icon: "🛠️" },
  { type: "tarana", title: "Tarana call-out", body: "Sub-contracted Tarana job. Paste the call-out details.", icon: "📡" },
];

export function JobTypeChooser({ onChoose }: { onChoose: (t: JobType) => void }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">New job card</h2>
      {OPTIONS.map((o) => (
        <button
          key={o.type}
          type="button"
          onClick={() => onChoose(o.type)}
          className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm active:scale-[0.99] dark:border-slate-800 dark:bg-slate-900"
        >
          <span aria-hidden className="text-3xl">{o.icon}</span>
          <span>
            <span className="block text-lg font-semibold text-slate-900 dark:text-slate-100">{o.title}</span>
            <span className="block text-sm text-slate-500 dark:text-slate-400">{o.body}</span>
          </span>
        </button>
      ))}
    </section>
  );
}
