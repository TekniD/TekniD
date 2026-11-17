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
  | { action: "client"; client: NewClientInput }
  | { action: "invoice"; clientId: string; job: JobCard }
  | { action: "document"; invoiceId: string; dataUrl: string; filename: string };

export async function POST(req: NextRequest) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;

  let body: SyncRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  try {
    switch (body.action) {
      case "client": {
        if (!body.client?.name?.trim()) return json({ error: "Client name is required" }, 400);
        const client = await createClient(body.client);
        return json({ clientId: client.id, client });
      }
      case "invoice": {
        if (!body.clientId) return json({ error: "clientId is required" }, 400);
        const { lineItems, warnings } = await buildLineItems(body.job);
        if (lineItems.length === 0) return json({ error: "Job card has no billable lines" }, 400);
        const invoice = await createDraftInvoice(invoiceFields(body.clientId, body.job, lineItems));
        return json({ invoiceId: invoice.id, invoiceNumber: invoice.number, warnings });
      }
      case "document": {
        if (!body.invoiceId || !body.dataUrl) return json({ error: "invoiceId and dataUrl are required" }, 400);
        const filename = (body.filename || "document").replace(/[^\w.\-]+/g, "_");
        await uploadInvoiceDocument(body.invoiceId, body.dataUrl, filename);
        return json({ ok: true });
      }
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    const status = err instanceof InvoiceNinjaError && err.status < 500 ? 422 : 502;
    return json(
      { error: errorMessage(err), details: err instanceof InvoiceNinjaError ? err.body : undefined },
      status,
    );
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
