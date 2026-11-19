import type { NextRequest } from "next/server";
import {
  InvoiceNinjaError,
  createClient,
  createDraftInvoice,
  findProductByKey,
  uploadInvoiceDocument,
  type InvoiceLineItem,
} from "@/lib/server/invoiceNinja";
import { errorMessage, json, optionsNotAllowed, rejectCrossOrigin } from "@/lib/server/http";
import { remember, remembered } from "@/lib/server/idempotency";
import { mapsLink } from "@/lib/geo";
import { installSummary } from "@/lib/install";
import { calloutSummary } from "@/lib/tarana";
import type { JobCard, NewClientInput } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/sync
 *
 * The device drives a queued job card through three steps, saving progress in
 * IndexedDB after each one so a dropped connection never creates duplicates:
 *
 *   { action: "client",   client: NewClientInput }              -> { clientId }
 *   { action: "invoice",  clientId, job: JobCard }               -> { invoiceId, invoiceNumber, warnings }
 *   { action: "document", invoiceId, dataUrl, filename }         -> { ok: true }
 *
 * Documents go one per request so no single request body gets large.
 */
type SyncRequest =
  | { action: "client"; client: NewClientInput; uid?: string }
  | { action: "invoice"; clientId: string; job: JobCard; uid?: string }
  | { action: "document"; invoiceId: string; dataUrl: string; filename: string };

/** Largest request we accept (one compressed photo as Base64 is ~2 MB). */
const MAX_BODY_BYTES = 12 * 1024 * 1024;
/** Largest decoded document we forward to Invoice Ninja. */
const MAX_DOC_BYTES = 8 * 1024 * 1024;
const ALLOWED_DOC_TYPES = /^data:image\/(png|jpeg|webp);base64,/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Basic sanity limits so a bad or tampered payload can't create a silly invoice. */
function jobProblems(job: JobCard | undefined): string | null {
  if (!job || typeof job !== "object") return "job is required";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(job.timeIn ?? "") || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(job.timeOut ?? "")) {
    return "timeIn / timeOut are invalid";
  }
  const hours = Number(job.hours);
  if (!(hours >= 0 && hours <= 72)) return "hours must be between 0 and 72";
  const km = Number(job.travelDistance);
  if (!(km >= 0 && km <= 5000)) return "travel distance must be between 0 and 5000";
  if (!Array.isArray(job.items) || job.items.length > 100) return "too many items";
  for (const i of job.items) {
    if (typeof i.product_key !== "string" || i.product_key.length > 200) return "invalid product";
    if (!(Number(i.quantity) >= 0 && Number(i.quantity) <= 100000)) return `invalid quantity for ${i.product_key}`;
    if (!(Number(i.cost) >= 0 && Number(i.cost) <= 10_000_000)) return `invalid price for ${i.product_key}`;
  }
  if (String(job.notes ?? "").length > 20000) return "notes are too long";
  return null;
}

export async function POST(req: NextRequest) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return json({ error: "Request too large" }, 413);
  }
  let body: SyncRequest;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return json({ error: "Request too large" }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const uid = "uid" in body && typeof body.uid === "string" && body.uid.length <= 100 ? body.uid : undefined;

  try {
    switch (body.action) {
      case "client": {
        if (!body.client?.name?.trim()) return json({ error: "Client name is required" }, 400);
        if (JSON.stringify(body.client).length > 5000) return json({ error: "Client details are too long" }, 400);
        const done = uid && remembered<{ clientId: string; client: unknown }>(`client:${uid}`);
        if (done) return json(done);
        const client = await createClient(body.client);
        const result = { clientId: client.id, client };
        if (uid) remember(`client:${uid}`, result);
        return json(result);
      }
      case "invoice": {
        if (!body.clientId || !ID_RE.test(body.clientId)) return json({ error: "clientId is invalid" }, 400);
        const problem = jobProblems(body.job);
        if (problem) return json({ error: problem }, 400);
        // A retry of a submit whose response was lost: return the invoice we already made.
        const done = uid && remembered<{ invoiceId: string; invoiceNumber: string; warnings: string[] }>(`invoice:${uid}`);
        if (done) return json(done);
        const { lineItems, warnings } = await buildLineItems(body.job);
        if (lineItems.length === 0) return json({ error: "Job card has no billable lines" }, 400);
        const invoice = await createDraftInvoice(invoiceFields(body.clientId, body.job, lineItems));
        const result = { invoiceId: invoice.id, invoiceNumber: invoice.number, warnings };
        if (uid) remember(`invoice:${uid}`, result);
        return json(result);
      }
      case "document": {
        if (!body.invoiceId || !ID_RE.test(body.invoiceId)) return json({ error: "invoiceId is invalid" }, 400);
        if (typeof body.dataUrl !== "string" || !ALLOWED_DOC_TYPES.test(body.dataUrl)) {
          return json({ error: "Only PNG, JPEG or WebP images can be attached" }, 400);
        }
        if (((body.dataUrl.length - body.dataUrl.indexOf(",")) * 3) / 4 > MAX_DOC_BYTES) {
          return json({ error: "Image is too large" }, 413);
        }
        const filename = String(body.filename || "document").replace(/[^\w.\-]+/g, "_").slice(0, 100);
        await uploadInvoiceDocument(body.invoiceId, body.dataUrl, filename);
        return json({ ok: true });
      }
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    const status = err instanceof InvoiceNinjaError && err.status < 500 ? 422 : 502;
    // Log Invoice Ninja's full error server-side; the phone only gets the message.
    console.error("[sync]", errorMessage(err), err instanceof InvoiceNinjaError ? JSON.stringify(err.body)?.slice(0, 2000) : "");
    return json({ error: errorMessage(err) }, status);
  }
}

export const OPTIONS = optionsNotAllowed;

/** Notes, PO number and dates for the invoice, including Tarana call-out details. */
function invoiceFields(clientId: string, job: JobCard, lineItems: InvoiceLineItem[]) {
  const t = job.jobType === "tarana" ? job.tarana : undefined;
  const header = t ? calloutSummary(t) : [];
  const readings = t && job.install ? installSummary(job.taranaWork ?? "fault", job.install) : [];
  const publicNotes = [header.join("\n"), readings.join("\n"), job.notes ?? ""].filter(Boolean).join("\n\n");

  const privateLines = [
    `Job card${t ? " (Tarana call-out)" : ""}: in ${fmt(job.timeIn)}, out ${fmt(job.timeOut)}${
      job.afterHours ? " (after-hours rate)" : ""
    }.`,
  ];
  if (t) {
    const extra = [
      t.companyName && `From: ${t.companyName}`,
      t.region && `Region: ${t.region}`,
      t.technicalEngineer && `Technical engineer: ${t.technicalEngineer}`,
      t.asNumber && `AS number: ${t.asNumber}`,
      t.requisitionDate && `Requisition date: ${t.requisitionDate}`,
      t.officeHours && `Site hours: ${t.officeHours}`,
    ].filter(Boolean);
    privateLines.push(...(extra as string[]));
  }
  const gpsLine = (label: string, f?: { lat: number; lng: number; acc: number; at: string }) =>
    f &&
    `${label}: ${f.lat}, ${f.lng} (±${f.acc} m) at ${new Date(f.at).toLocaleTimeString("en-ZA", {
      timeZone: "Africa/Johannesburg",
      hour: "2-digit",
      minute: "2-digit",
    })} ${mapsLink(f)}`;
  const gps = [gpsLine("Arrived", job.gps?.arrive), gpsLine("Saved", job.gps?.save)].filter(Boolean) as string[];
  privateLines.push(...gps, "Captured on the Job Card app.");

  return {
    client_id: clientId,
    date: job.timeIn.slice(0, 10),
    // The MTN ref goes in the PO number so it shows on the invoice and is searchable.
    po_number: t?.mtnRef?.trim() || undefined,
    line_items: lineItems,
    public_notes: publicNotes,
    private_notes: privateLines.join("\n"),
  };
}

/** "2026-11-13T09:05" -> "2026-11-13 09:05" (device local time, kept as-is). */
function fmt(local: string): string {
  return local.replace("T", " ").slice(0, 16);
}

async function buildLineItems(job: JobCard) {
  const warnings: string[] = [];
  const lineItems: InvoiceLineItem[] = [];

  // 1. Physical products / items picked on the form.
  for (const item of job.items ?? []) {
    const qty = Number(item.quantity);
    if (!item.product_key || !(qty > 0)) continue;
    lineItems.push({
      product_key: item.product_key,
      notes: item.notes ?? "",
      cost: Number(item.cost) || 0,
      quantity: qty,
      type_id: "1",
    });
  }

  // 2. Labour, from the calculated decimal hours.
  const hours = Math.round(Number(job.hours) * 100) / 100;
  if (hours > 0) {
    const key = job.afterHours ? process.env.AFTER_HOURS_LABOR_KEY : process.env.STANDARD_LABOR_KEY;
    const envName = job.afterHours ? "AFTER_HOURS_LABOR_KEY" : "STANDARD_LABOR_KEY";
    if (!key) throw new InvoiceNinjaError(`${envName} is not set`, 500);
    const product = await findProductByKey(key);
    if (!product) warnings.push(`No Invoice Ninja product with key "${key}"; labour line added at 0.00`);
    lineItems.push({
      product_key: key,
      notes: [product?.notes || (job.afterHours ? "After-hours labour" : "Labour"), `${fmt(job.timeIn)} to ${fmt(job.timeOut)}`]
        .filter(Boolean)
        .join("\n"),
      cost: product?.price ?? 0,
      quantity: hours,
      type_id: "2",
    });
  }

  // 3. Round-trip travel.
  const distance = Number(job.travelDistance);
  if (distance > 0) {
    const key = process.env.TRAVEL_MILEAGE_KEY;
    if (!key) throw new InvoiceNinjaError("TRAVEL_MILEAGE_KEY is not set", 500);
    const product = await findProductByKey(key);
    if (!product) warnings.push(`No Invoice Ninja product with key "${key}"; travel line added at 0.00`);
    lineItems.push({
      product_key: key,
      notes: product?.notes || "Round-trip travel",
      cost: product?.price ?? 0,
      quantity: distance,
      type_id: "2",
    });
  }

  return { lineItems, warnings };
}
