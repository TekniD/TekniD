import type { NextRequest } from "next/server";
import { json, optionsNotAllowed, rejectCrossOrigin } from "@/lib/server/http";
import {
  SESSION_COOKIE,
  SESSION_DAYS,
  authConfigured,
  clearFailures,
  createSessionValue,
  lockedFor,
  pinMatches,
  recordFailure,
} from "@/lib/server/session";

export const dynamic = "force-dynamic";

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

/** POST /api/login { pin } -> sets the session cookie. 5 wrong PINs lock that IP out for 15 minutes. */
export async function POST(req: NextRequest) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;
  if (!authConfigured()) return json({ error: "APP_PIN is not set on the server" }, 503);

  const ip = clientIp(req);
  const wait = lockedFor(ip);
  if (wait) return json({ error: `Too many wrong PINs. Try again in ${Math.ceil(wait / 60)} min.` }, 429);

  const body = await req.json().catch(() => ({}));
  const pin = typeof body?.pin === "string" ? body.pin.slice(0, 64) : "";
  if (!pinMatches(pin)) {
    recordFailure(ip);
    await new Promise((r) => setTimeout(r, 500)); // slow down guessing
    return json({ error: "Wrong PIN" }, 401);
  }

  clearFailures(ip);
  const res = json({ ok: true });
  res.cookies.set(SESSION_COOKIE, createSessionValue()!, {
    httpOnly: true,
    sameSite: "strict",
    secure: req.headers.get("x-forwarded-proto") === "https" || req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  return res;
}

export const OPTIONS = optionsNotAllowed;
