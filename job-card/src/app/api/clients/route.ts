import type { NextRequest } from "next/server";
import { listClients } from "@/lib/server/invoiceNinja";
import { errorMessage, json, optionsNotAllowed, rejectCrossOrigin } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** GET /api/clients -> active Invoice Ninja clients, trimmed for the device cache. */
export async function GET(req: NextRequest) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;
  try {
    return json({ data: await listClients() });
  } catch (err) {
    return json({ error: errorMessage(err) }, 502);
  }
}

export const OPTIONS = optionsNotAllowed;
