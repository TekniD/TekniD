import type { NextRequest } from "next/server";
import { haversineKm } from "@/lib/geo";
import { errorMessage, json, optionsNotAllowed, rejectCrossOrigin } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/distance?lat=..&lng=..  ->  { roundTripKm, oneWayKm, method }
 *
 * Round-trip road distance from the base (TRAVEL_BASE_LATLNG, or
 * TRAVEL_BASE_ADDRESS geocoded once with OpenStreetMap Nominatim) to the site.
 * Driving distance comes from the public OSRM router; if that is unreachable
 * it falls back to straight-line distance x 1.3 and says so.
 */
type Point = { lat: number; lng: number };

const UA = "job-card-pwa/1.0 (self-hosted)";
let baseCache: Point | null = null;

async function base(): Promise<Point | null> {
  if (baseCache) return baseCache;
  const fixed = process.env.TRAVEL_BASE_LATLNG?.split(",").map((v) => Number(v.trim()));
  if (fixed && fixed.length === 2 && fixed.every(Number.isFinite)) {
    return (baseCache = { lat: fixed[0], lng: fixed[1] });
  }
  const address = process.env.TRAVEL_BASE_ADDRESS?.trim();
  if (!address) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=za&q=${encodeURIComponent(address)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Address lookup failed (HTTP ${res.status}); set TRAVEL_BASE_LATLNG instead`);
  const rows = (await res.json()) as { lat: string; lon: string }[];
  if (!rows[0]) throw new Error(`Couldn't find TRAVEL_BASE_ADDRESS on the map; set TRAVEL_BASE_LATLNG instead`);
  return (baseCache = { lat: Number(rows[0].lat), lng: Number(rows[0].lon) });
}

async function drivingKm(a: Point, b: Point): Promise<number | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`;
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
    const body = (await res.json()) as { code: string; routes?: { distance: number }[] };
    return body.code === "Ok" && body.routes?.[0] ? body.routes[0].distance / 1000 : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return json({ error: "lat and lng are required" }, 400);
  }
  try {
    const home = await base();
    if (!home) return json({ error: "Travel base isn't set (TRAVEL_BASE_ADDRESS or TRAVEL_BASE_LATLNG)" }, 501);
    const site = { lat, lng };
    const road = await drivingKm(home, site);
    const oneWay = road ?? haversineKm(home, site) * 1.3;
    const round1 = (n: number) => Math.round(n * 10) / 10;
    return json({ oneWayKm: round1(oneWay), roundTripKm: round1(oneWay * 2), method: road ? "road" : "estimate" });
  } catch (err) {
    return json({ error: errorMessage(err) }, 502);
  }
}

export const OPTIONS = optionsNotAllowed;
