"use client";

import { useState } from "react";
import { compressToDataUrl, dataUrlSizeKb } from "@/lib/images";

/**
 * Site photo capture for Tarana (TAR-) installs. Photos are compressed in a web
 * worker (max 1.5 MB, 1920 px) straight after they are taken, and only the
 * compressed result is kept as Base64.
 */
export function PhotoCapture({ photos, onChange }: { photos: string[]; onChange: (p: string[]) => void }) {
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    const list = Array.from(files);
    setBusy((b) => b + list.length);
    const results = await Promise.allSettled(
      list.map(async (f) => {
        try {
          return await compressToDataUrl(f);
        } finally {
          setBusy((b) => b - 1);
        }
      }),
    );
    const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const failed = results.length - ok.length;
    if (failed) setError(`${failed} photo(s) could not be processed`);
    onChange([...photos, ...ok]);
  }

  return (
    <div className="space-y-3">
      <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blue-400 bg-blue-50 px-4 text-base font-semibold text-blue-700 active:scale-[0.98] dark:bg-blue-950/40 dark:text-blue-300">
        <span aria-hidden>📷</span> Take / add site photos
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = ""; // allow picking the same file again
          }}
        />
      </label>
      {busy > 0 ? <p className="text-sm text-slate-500">Compressing {busy} photo(s)…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {photos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((src, i) => (
            <li key={i} className="relative aspect-square overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Site photo ${i + 1}`} className="h-full w-full object-cover" />
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">{dataUrlSizeKb(src)} KB</span>
              <button
                type="button"
                aria-label={`Remove photo ${i + 1}`}
                className="absolute right-1 top-1 h-8 w-8 rounded-full bg-black/60 text-white"
                onClick={() => onChange(photos.filter((_, j) => j !== i))}
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
