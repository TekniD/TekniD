"use client";

import { useState } from "react";
import { compressToDataUrl, dataUrlSizeKb } from "@/lib/images";

export interface LabelledPhoto {
  label: string;
  src: string;
}

export const OTHER_LABEL = "Site photo";

/**
 * Site photos. Optional named slots (e.g. "Cable entry") take one photo each;
 * "Other photos" takes any number. Photos are compressed in a web worker
 * (max 1.5 MB, 1920 px) straight after capture, and only the compressed
 * Base64 is kept.
 */
export function PhotoCapture({
  photos,
  onChange,
  slots = [],
  required = false,
}: {
  photos: LabelledPhoto[];
  onChange: (p: LabelledPhoto[]) => void;
  slots?: string[];
  required?: boolean;
}) {
  const [busy, setBusy] = useState<Record<string, number>>({});
  const [error, setError] = useState("");

  async function handleFiles(label: string, files: FileList | null, replace: boolean) {
    if (!files?.length) return;
    setError("");
    const list = Array.from(files);
    setBusy((b) => ({ ...b, [label]: (b[label] ?? 0) + list.length }));
    const results = await Promise.allSettled(list.map((f) => compressToDataUrl(f)));
    setBusy((b) => ({ ...b, [label]: Math.max(0, (b[label] ?? 0) - list.length) }));
    const ok = results.flatMap((r) => (r.status === "fulfilled" ? [{ label, src: r.value }] : []));
    if (ok.length < results.length) setError(`${results.length - ok.length} photo(s) could not be processed`);
    const kept = replace ? photos.filter((p) => p.label !== label) : photos;
    onChange([...kept, ...ok]);
  }

  const remove = (target: LabelledPhoto) => onChange(photos.filter((p) => p !== target));
  const others = photos.filter((p) => !slots.includes(p.label));

  return (
    <div className="space-y-3">
      {slots.map((slot) => {
        const photo = photos.find((p) => p.label === slot);
        return (
          <div key={slot} className="flex items-center gap-3 rounded-xl border border-slate-200 p-2 dark:border-slate-800">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo.src} alt={slot} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center text-xl text-slate-400">📷</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {slot}
                {required && !photo ? <span className="text-red-600"> *</span> : null}
              </div>
              <div className="text-xs text-slate-500">
                {busy[slot] ? "Compressing…" : photo ? `${dataUrlSizeKb(photo.src)} KB` : required ? "Required" : "Optional"}
              </div>
            </div>
            {photo ? (
              <button type="button" aria-label={`Remove ${slot} photo`} className="h-10 w-10 rounded-lg text-lg text-red-600" onClick={() => remove(photo)}>
                ×
              </button>
            ) : null}
            <label className="flex h-10 cursor-pointer items-center rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white active:scale-[0.98]">
              {photo ? "Retake" : "Take"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                aria-label={`${slot} photo`}
                onChange={(e) => {
                  void handleFiles(slot, e.target.files, true);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        );
      })}

      <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blue-400 bg-blue-50 px-4 text-base font-semibold text-blue-700 active:scale-[0.98] dark:bg-blue-950/40 dark:text-blue-300">
        <span aria-hidden>📷</span> {slots.length ? "Add other photos" : "Take / add site photos"}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          aria-label="Other site photos"
          onChange={(e) => {
            void handleFiles(OTHER_LABEL, e.target.files, false);
            e.target.value = "";
          }}
        />
      </label>
      {busy[OTHER_LABEL] ? <p className="text-sm text-slate-500">Compressing {busy[OTHER_LABEL]} photo(s)…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {others.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2">
          {others.map((p, i) => (
            <li key={i} className="relative aspect-square overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src} alt={`Site photo ${i + 1}`} className="h-full w-full object-cover" />
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">{dataUrlSizeKb(p.src)} KB</span>
              <button
                type="button"
                aria-label={`Remove photo ${i + 1}`}
                className="absolute right-1 top-1 h-8 w-8 rounded-full bg-black/60 text-white"
                onClick={() => remove(p)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
