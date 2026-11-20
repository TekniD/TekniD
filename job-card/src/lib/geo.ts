/** A GPS reading taken on the phone. */
export interface GpsFix {
  lat: number;
  lng: number;
  /** Accuracy radius in metres. */
  acc: number;
  /** ISO timestamp. */
  at: string;
}

/** Geolocation only works on HTTPS (or localhost). */
export function locationAvailable(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && "geolocation" in navigator;
}

export function getFix(timeoutMs = 15_000): Promise<GpsFix> {
  return new Promise((resolve, reject) => {
    if (!locationAvailable()) {
      reject(new Error("Location needs the app to be opened over HTTPS"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: Math.round(p.coords.latitude * 1e6) / 1e6,
          lng: Math.round(p.coords.longitude * 1e6) / 1e6,
          acc: Math.round(p.coords.accuracy),
          at: new Date(p.timestamp).toISOString(),
        }),
      (err) =>
        reject(new Error(err.code === err.PERMISSION_DENIED ? "Location permission was denied" : "Couldn't get a GPS fix")),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

export function mapsLink(f: Pick<GpsFix, "lat" | "lng">): string {
  return `https://maps.google.com/?q=${f.lat},${f.lng}`;
}

/** Straight-line distance in km. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
