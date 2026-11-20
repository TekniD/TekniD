"use client";

import { useState } from "react";
import { db } from "@/lib/db";
import type { CachedClient, NewClientInput } from "@/lib/types";
import { Field, buttonClass, inputClass } from "./ui";

// crypto.randomUUID only exists in secure contexts (HTTPS / localhost).
function localId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Adds a client on the device. It is stored in the Dexie cache as "pending" and
 * created in Invoice Ninja during sync, before the invoice that uses it.
 */
export function NewClientModal({
  open,
  initialName,
  onClose,
  onCreated,
}: {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onCreated: (client: CachedClient, input: NewClientInput) => void;
}) {
  const [form, setForm] = useState<NewClientInput>({ name: initialName ?? "" });
  const [error, setError] = useState("");

  if (!open) return null;
  const set = (k: keyof NewClientInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    const name = form.name.trim();
    if (!name) return setError("Client name is required");
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) return setError("Email looks invalid");
    const client: CachedClient = {
      id: `local-${localId()}`,
      name,
      email: form.email || undefined,
      phone: form.phone || undefined,
      pending: true,
    };
    await db.clients.put(client);
    onCreated(client, { ...form, name });
    setForm({ name: "" });
    setError("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-client-title"
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] dark:bg-slate-900 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="new-client-title" className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Add new client
        </h2>
        <div className="space-y-3">
          <Field label="Client / company name *">
            <input className={inputClass} value={form.name} onChange={set("name")} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact first name">
              <input className={inputClass} value={form.first_name ?? ""} onChange={set("first_name")} />
            </Field>
            <Field label="Contact last name">
              <input className={inputClass} value={form.last_name ?? ""} onChange={set("last_name")} />
            </Field>
          </div>
          <Field label="Email">
            <input className={inputClass} type="email" inputMode="email" value={form.email ?? ""} onChange={set("email")} />
          </Field>
          <Field label="Phone">
            <input className={inputClass} type="tel" inputMode="tel" value={form.phone ?? ""} onChange={set("phone")} />
          </Field>
          <Field label="Street address">
            <input className={inputClass} value={form.address1 ?? ""} onChange={set("address1")} />
          </Field>
          <Field label="Town / city">
            <input className={inputClass} value={form.city ?? ""} onChange={set("city")} />
          </Field>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className={`${buttonClass} bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100`}>
            Cancel
          </button>
          <button type="button" onClick={save} className={`${buttonClass} bg-blue-600 text-white`}>
            Save client
          </button>
        </div>
      </div>
    </div>
  );
}
