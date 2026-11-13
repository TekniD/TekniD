import { NextResponse, type NextRequest } from "next/server";

/**
 * The app is served same-origin behind Traefik on the WireGuard network, so the
 * API routes never need CORS. We make sure no Access-Control-* header ever
 * leaves these routes (even if one was set upstream) and refuse cross-origin
 * browser calls, so another site open on the phone can't drive the proxy.
 */
export function json(body: unknown, status = 200): NextResponse {
  const res = NextResponse.json(body, { status });
  for (const key of [...res.headers.keys()]) {
    if (key.toLowerCase().startsWith("access-control-")) res.headers.delete(key);
  }
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Vary", "Origin");
  return res;
}

/** Returns a 403 response for cross-origin browser requests, otherwise null. */
export function rejectCrossOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin) return null; // same-origin GETs, curl, server-to-server
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (host && new URL(origin).host === host.split(",")[0].trim()) return null;
  } catch {
    // malformed Origin falls through to rejection
  }
  return json({ error: "Cross-origin requests are not allowed" }, 403);
}

/** Preflight requests are refused without any CORS headers. */
export function optionsNotAllowed(): NextResponse {
  const res = new NextResponse(null, { status: 405 });
  res.headers.set("Allow", "GET, POST");
  return res;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
