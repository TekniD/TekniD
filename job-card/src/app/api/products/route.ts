import type { NextRequest } from "next/server";
import { listProducts } from "@/lib/server/invoiceNinja";
import { errorMessage, json, optionsNotAllowed, rejectCrossOrigin } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Product keys used for auto-generated lines are hidden from the item picker. */
function autoKeys(): Set<string> {
  return new Set(
    [process.env.STANDARD_LABOR_KEY, process.env.AFTER_HOURS_LABOR_KEY, process.env.TRAVEL_MILEAGE_KEY]
      .filter((k): k is string => Boolean(k))
      .map((k) => k.toLowerCase()),
  );
}

/** GET /api/products -> active Invoice Ninja products for the device cache. */
export async function GET(req: NextRequest) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;
  try {
    const hidden = autoKeys();
    const products = (await listProducts()).filter((p) => !hidden.has(p.product_key.toLowerCase()));
    return json({ data: products });
  } catch (err) {
    return json({ error: errorMessage(err) }, 502);
  }
}

export const OPTIONS = optionsNotAllowed;
