"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db } from "@/lib/db";
import type { JobLineItem } from "@/lib/types";
import { inputClass } from "./ui";

const money = new Intl.NumberFormat("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Searchable multi-select of cached products, each with a quantity. */
export function ProductPicker({
  items,
  onChange,
}: {
  items: JobLineItem[];
  onChange: (items: JobLineItem[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const products = useLiveQuery(() => db.products.orderBy("product_key").toArray(), [], []);

  const selectedKeys = useMemo(() => new Set(items.map((i) => i.product_key)), [items]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => !selectedKeys.has(p.product_key))
      .filter((p) => !q || p.product_key.toLowerCase().includes(q) || p.notes.toLowerCase().includes(q))
      .slice(0, 50);
  }, [products, query, selectedKeys]);

  const setQty = (key: string, quantity: number) =>
    onChange(items.map((i) => (i.product_key === key ? { ...i, quantity: Math.max(0, quantity) } : i)));

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          className={inputClass}
          placeholder={products.length ? `Search ${products.length} products…` : "No products cached yet"}
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
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left active:bg-slate-100 dark:active:bg-slate-800"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange([...items, { product_key: p.product_key, notes: p.notes, cost: p.price, quantity: 1 }]);
                    setQuery("");
                  }}
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{p.product_key}</span>
                    <span className="line-clamp-2 block text-xs text-slate-500">{p.notes}</span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-slate-600 dark:text-slate-300">{money.format(p.price)}</span>
                </button>
              </li>
            ))}
            {matches.length === 0 ? <li className="px-3 py-3 text-sm text-slate-500">No matching products</li> : null}
          </ul>
        ) : null}
      </div>

      {items.length > 0 ? (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {items.map((item) => (
            <li key={item.product_key} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{item.product_key}</div>
                <div className="truncate text-xs text-slate-500">
                  {money.format(item.cost)} × {item.quantity} = {money.format(item.cost * item.quantity)}
                </div>
              </div>
              <div className="flex items-center rounded-xl border border-slate-300 dark:border-slate-700">
                <button type="button" aria-label="Decrease" className="h-11 w-11 text-xl" onClick={() => setQty(item.product_key, item.quantity - 1)}>
                  −
                </button>
                <input
                  aria-label={`Quantity for ${item.product_key}`}
                  className="h-11 w-14 bg-transparent text-center text-base tabular-nums focus:outline-none"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={item.quantity}
                  onChange={(e) => setQty(item.product_key, Number(e.target.value))}
                />
                <button type="button" aria-label="Increase" className="h-11 w-11 text-xl" onClick={() => setQty(item.product_key, item.quantity + 1)}>
                  +
                </button>
              </div>
              <button
                type="button"
                aria-label={`Remove ${item.product_key}`}
                className="h-11 w-11 rounded-xl text-xl text-red-600"
                onClick={() => onChange(items.filter((i) => i.product_key !== item.product_key))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
