/**
 * PIN login sessions. The cookie holds "<expiry>.<hmac>" signed with a secret
 * derived from SESSION_SECRET (or, if unset, from APP_PIN + the Invoice Ninja
 * token), so changing the PIN logs every device out.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "jc_session";
export const SESSION_DAYS = 90;

function secret(): string | null {
  const pin = process.env.APP_PIN;
  if (!pin) return null;
  const base = process.env.SESSION_SECRET || `${pin}:${process.env.INVOICE_NINJA_TOKEN ?? ""}`;
  return createHash("sha256").update(`job-card-session:${base}:${pin}`).digest("hex");
}

export function authConfigured(): boolean {
  return Boolean(process.env.APP_PIN);
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function createSessionValue(now = Date.now()): string | null {
  const key = secret();
  if (!key) return null;
  const expires = String(now + SESSION_DAYS * 86_400_000);
  return `${expires}.${sign(expires, key)}`;
}

export function validSession(value: string | undefined, now = Date.now()): boolean {
  const key = secret();
  if (!key || !value) return false;
  const [expires, mac] = value.split(".");
  if (!expires || !mac || !(Number(expires) > now)) return false;
  const expected = Buffer.from(sign(expires, key));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function pinMatches(candidate: string): boolean {
  const pin = process.env.APP_PIN ?? "";
  const a = createHash("sha256").update(pin).digest();
  const b = createHash("sha256").update(String(candidate)).digest();
  return pin.length > 0 && timingSafeEqual(a, b);
}

// --- brute-force protection (per client IP, in memory) ---
const failures = new Map<string, { count: number; until: number }>();
const MAX_TRIES = 5;
const LOCK_MS = 15 * 60_000;

export function lockedFor(ip: string, now = Date.now()): number {
  const f = failures.get(ip);
  return f && f.until > now ? Math.ceil((f.until - now) / 1000) : 0;
}

export function recordFailure(ip: string, now = Date.now()) {
  const count = (failures.get(ip)?.count ?? 0) + 1;
  // After MAX_TRIES wrong PINs, lock out and start counting again afterwards.
  failures.set(ip, count >= MAX_TRIES ? { count: 0, until: now + LOCK_MS } : { count, until: 0 });
  if (failures.size > 1000) failures.clear(); // bound memory
}

export function clearFailures(ip: string) {
  failures.delete(ip);
}
