"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db } from "@/lib/db";
import type { CachedClient } from "@/lib/types";
import { inputClass } from "./ui";

/** Searchable client dropdown, fed from the Dexie cache so it works offline. */
export function ClientPicker({
  value,
  onChange,
  onAddNew,
}: {
  value: CachedClient | null;
  onChange: (c: CachedClient | null) => void;
  onAddNew: (typedName: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const clients = useLiveQuery(() => db.clients.orderBy("name").toArray(), [], []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? clients.filter((c) => [c.name, c.email, c.phone].some((v) => v?.toLowerCase().includes(q)))
      : clients;
    return list.slice(0, 50);
  }, [clients, query]);

  if (value) {
    return (
      <div className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-blue-500 bg-blue-50 px-3 py-2 dark:bg-blue-950/40">
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-900 dark:text-slate-100">{value.name}</div>
          <div className="truncate text-xs text-slate-500">
            {value.pending ? "New client, created on sync" : value.email || value.phone || ""}
          </div>
        </div>
        <button type="button" onClick={() => onChange(null)} className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-blue-700 dark:text-blue-300">
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        className={inputClass}
        placeholder={clients.length ? `Search ${clients.length} clients…` : "No clients cached yet"}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
      />
      {open ? (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {matches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="block w-full px-3 py-3 text-left active:bg-slate-100 dark:active:bg-slate-800"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(c);
                  setQuery("");
                  setOpen(false);
                }}
              >
                <span className="block font-medium text-slate-900 dark:text-slate-100">{c.name}</span>
                {c.email || c.phone ? <span className="block text-xs text-slate-500">{c.email || c.phone}</span> : null}
              </button>
            </li>
          ))}
          {matches.length === 0 ? <li className="px-3 py-3 text-sm text-slate-500">No matching clients</li> : null}
          <li className="border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              className="block w-full px-3 py-3 text-left font-semibold text-blue-700 active:bg-slate-100 dark:text-blue-300"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false);
                onAddNew(query.trim());
              }}
            >
              + Add new client{query.trim() ? ` “${query.trim()}”` : ""}
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
