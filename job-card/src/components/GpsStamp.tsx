"use client";

import { useState } from "react";
import { getFix, locationAvailable, mapsLink, type GpsFix } from "@/lib/geo";

/** Shows / captures the arrival GPS fix. */
export function GpsStamp({ value, onChange }: { value?: GpsFix; onChange: (f: GpsFix | undefined) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function stamp() {
    setBusy(true);
    setError("");
    try {
      onChange(await getFix());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-950">
      <div className="min-w-0">
        <div className="font-medium text-slate-800 dark:text-slate-200">📍 Arrival location</div>
        <div className="truncate text-xs text-slate-500">
          {value ? (
            <a href={mapsLink(value)} target="_blank" rel="noreferrer" className="text-blue-700 dark:text-blue-300">
              {value.lat.toFixed(5)}, {value.lng.toFixed(5)} (±{value.acc} m)
            </a>
          ) : error ? (
            <span className="text-red-600">{error}</span>
          ) : locationAvailable() ? (
            "Stamped automatically when you tap Now"
          ) : (
            "Needs the HTTPS address"
          )}
        </div>
      </div>
      <button
        type="button"
        disabled={busy || !locationAvailable()}
        onClick={() => void stamp()}
        className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 disabled:opacity-40 dark:text-blue-300"
      >
        {busy ? "Locating…" : value ? "Update" : "Stamp"}
      </button>
    </div>
  );
}
