"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { decimalHours, durationLabel, looksAfterHours, needsSitePhotos, toLocalInputValue } from "@/lib/calc";
import { processQueue, queueJob } from "@/lib/sync";
import type { CachedClient, JobCard, JobLineItem, NewClientInput } from "@/lib/types";
import { ClientPicker } from "./ClientPicker";
import { NewClientModal } from "./NewClientModal";
import { PhotoCapture } from "./PhotoCapture";
import { ProductPicker } from "./ProductPicker";
import { Card, Field, Toggle, buttonClass, inputClass } from "./ui";

// The signature pad touches the canvas/window, so load it on the client only.
const SignatureField = dynamic(() => import("./SignatureField").then((m) => m.SignatureField), {
  ssr: false,
  loading: () => <div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />,
});

const DISTANCE_UNIT = process.env.NEXT_PUBLIC_DISTANCE_UNIT === "mi" ? "mi" : "km";

function nowRounded(): string {
  const d = new Date();
  d.setMinutes(Math.round(d.getMinutes() / 5) * 5, 0, 0);
  return toLocalInputValue(d);
}

export function JobCardForm({ onQueued }: { onQueued: (message: string) => void }) {
  const [client, setClient] = useState<CachedClient | null>(null);
  // New clients typed in on-device, keyed by their local id.
  const [newClients, setNewClients] = useState<Record<string, NewClientInput>>({});
  const [modal, setModal] = useState<{ name: string } | null>(null);
  const [timeIn, setTimeIn] = useState(nowRounded);
  const [timeOut, setTimeOut] = useState("");
  const [travel, setTravel] = useState("");
  const [afterHours, setAfterHours] = useState(false);
  const [items, setItems] = useState<JobLineItem[]>([]);
  const [notes, setNotes] = useState("");
  const [wantSignature, setWantSignature] = useState(false);
  const [signature, setSignature] = useState<string | undefined>();
  const [photos, setPhotos] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const hours = useMemo(() => decimalHours(timeIn, timeOut), [timeIn, timeOut]);
  const showPhotos = useMemo(() => needsSitePhotos(items.map((i) => i.product_key)), [items]);
  const distance = Number(travel) || 0;
  const afterHoursHint = !afterHours && looksAfterHours(timeIn);

  function reset() {
    setClient(null);
    setTimeIn(nowRounded());
    setTimeOut("");
    setTravel("");
    setAfterHours(false);
    setItems([]);
    setNotes("");
    setWantSignature(false);
    setSignature(undefined);
    setPhotos([]);
    setErrors([]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problems: string[] = [];
    if (!client) problems.push("Choose a client");
    if (!timeIn || !timeOut) problems.push("Enter both time in and time out");
    else if (hours <= 0) problems.push("Time out must be after time in");
    if (distance < 0) problems.push("Travel distance can't be negative");
    if (wantSignature && !signature) problems.push("Capture the client's signature or switch it off");
    if (hours <= 0 && distance <= 0 && items.length === 0) problems.push("Nothing to bill yet");
    setErrors(problems);
    if (problems.length || !client) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const job: JobCard = {
      clientId: client.pending ? "" : client.id,
      newClient: client.pending ? newClients[client.id] ?? { name: client.name } : undefined,
      localClientId: client.pending ? client.id : undefined,
      clientName: client.name,
      timeIn,
      timeOut,
      hours,
      afterHours,
      travelDistance: distance,
      items: items.filter((i) => i.quantity > 0),
      notes: notes.trim(),
      signature: wantSignature ? signature : undefined,
      // Photos are only sent while a TAR- product is on the job.
      photos: showPhotos ? photos : [],
    };

    setSaving(true);
    try {
      await queueJob(job);
      reset();
      if (navigator.onLine) {
        onQueued("Job card saved. Syncing to Invoice Ninja…");
        const r = await processQueue();
        onQueued(r.failed ? "Saved, but sync failed. See the queue below." : "Draft invoice created in Invoice Ninja.");
      } else {
        onQueued("Saved offline. It will sync when you're back on the VPN.");
      }
    } catch (err) {
      setErrors([`Could not save: ${err instanceof Error ? err.message : String(err)}`]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {errors.length > 0 ? (
        <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          <ul className="list-inside list-disc space-y-1">
            {errors.map((er) => (
              <li key={er}>{er}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Card title="Client">
        <ClientPicker value={client} onChange={setClient} onAddNew={(name) => setModal({ name })} />
      </Card>

      <Card
        title="Time on site"
        right={
          hours > 0 ? (
            <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold tabular-nums text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
              {hours.toFixed(2)} h · {durationLabel(hours)}
            </span>
          ) : null
        }
      >
        <Field label="Date & time in">
          <div className="flex gap-2">
            <input className={inputClass} type="datetime-local" value={timeIn} onChange={(e) => setTimeIn(e.target.value)} />
            <button type="button" className={`${buttonClass} bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100`} onClick={() => setTimeIn(nowRounded())}>
              Now
            </button>
          </div>
        </Field>
        <Field label="Date & time out">
          <div className="flex gap-2">
            <input className={inputClass} type="datetime-local" value={timeOut} min={timeIn} onChange={(e) => setTimeOut(e.target.value)} />
            <button type="button" className={`${buttonClass} bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100`} onClick={() => setTimeOut(nowRounded())}>
              Now
            </button>
          </div>
        </Field>
        <Toggle
          checked={afterHours}
          onChange={setAfterHours}
          label="After-Hours / Weekend Rate"
          description={afterHoursHint ? "Time in looks like after-hours or a weekend" : "Bills labour at the after-hours rate"}
        />
      </Card>

      <Card title="Travel">
        <Field label={`Round trip travel distance (${DISTANCE_UNIT})`}>
          <input
            className={inputClass}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            placeholder="0"
            value={travel}
            onChange={(e) => setTravel(e.target.value)}
          />
        </Field>
      </Card>

      <Card title="Products & items">
        <ProductPicker items={items} onChange={setItems} />
        {showPhotos ? (
          <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Tarana site photos</h3>
            <PhotoCapture photos={photos} onChange={setPhotos} />
          </div>
        ) : null}
      </Card>

      <Card title="Work notes">
        <textarea
          className={`${inputClass} min-h-36 py-3`}
          placeholder="What was done, faults found, follow-ups…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Card>

      <Card title="Sign-off">
        <Toggle checked={wantSignature} onChange={setWantSignature} label="Capture Client Signature" />
        {wantSignature ? <SignatureField onChange={setSignature} /> : null}
      </Card>

      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-slate-50/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <button type="submit" disabled={saving} className={`${buttonClass} w-full bg-blue-600 text-white`}>
          {saving ? "Saving…" : "Save job card"}
        </button>
      </div>

      {modal ? (
        <NewClientModal
          open
          initialName={modal.name}
          onClose={() => setModal(null)}
          onCreated={(c, input) => {
            setNewClients((m) => ({ ...m, [c.id]: input }));
            setClient(c);
            setModal(null);
          }}
        />
      ) : null}
    </form>
  );
}
