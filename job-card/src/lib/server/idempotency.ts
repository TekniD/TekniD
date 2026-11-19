/**
 * Remembers which job card (by uid) already created which client / invoice, so
 * a submit retried after a dropped response doesn't create a duplicate.
 * Kept in memory and mirrored to DATA_DIR (default: the OS temp folder).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Entry = { value: Record<string, unknown>; at: number };
const MAX_AGE = 30 * 86_400_000;
const file = join(process.env.DATA_DIR || join(tmpdir(), "job-card"), "submitted.json");
let store: Map<string, Entry> | null = null;

function load(): Map<string, Entry> {
  if (store) return store;
  try {
    store = new Map(Object.entries(JSON.parse(readFileSync(file, "utf8")) as Record<string, Entry>));
  } catch {
    store = new Map();
  }
  return store;
}

function persist() {
  const now = Date.now();
  for (const [k, v] of load()) if (now - v.at > MAX_AGE) store!.delete(k);
  try {
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, JSON.stringify(Object.fromEntries(store!)));
  } catch {
    // Read-only filesystem: memory still covers retries while the server runs.
  }
}

export function remembered<T extends Record<string, unknown>>(key: string): T | undefined {
  return load().get(key)?.value as T | undefined;
}

export function remember(key: string, value: Record<string, unknown>) {
  load().set(key, { value, at: Date.now() });
  persist();
}
