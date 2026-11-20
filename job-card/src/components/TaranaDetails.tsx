"use client";

import { useState } from "react";
import { formatZaPhone, parseTaranaCallout, type TaranaCallout } from "@/lib/tarana";
import { Field, inputClass } from "./ui";

/**
 * Paste box for a Tarana call-out. Reading happens as soon as text is pasted;
 * the fields stay editable in case the call-out was incomplete.
 */
export function TaranaDetails({
  value,
  onChange,
}: {
  value: TaranaCallout;
  onChange: (c: TaranaCallout) => void;
}) {
  const [raw, setRaw] = useState("");
  const [status, setStatus] = useState("");

  function read(text: string) {
    setRaw(text);
    if (!text.trim()) return setStatus("");
    const { callout, found } = parseTaranaCallout(text);
    if (found === 0) return setStatus("Couldn't find any call-out fields in that text.");
    onChange(callout);
    setStatus(`Read ${found} field${found === 1 ? "" : "s"} from the call-out.`);
  }

  async function pasteFromClipboard() {
    try {
      read(await navigator.clipboard.readText());
    } catch {
      setStatus("Clipboard blocked. Long-press the box below and paste instead.");
    }
  }

  const set = (k: keyof TaranaCallout) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value });
  const phone = value.contactNumber ? formatZaPhone(value.contactNumber) : "";
  const canReadClipboard = typeof navigator !== "undefined" && Boolean(navigator.clipboard?.readText);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Paste the call-out</span>
          {canReadClipboard ? (
            <button
              type="button"
              onClick={() => void pasteFromClipboard()}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 dark:text-blue-300"
            >
              Paste from clipboard
            </button>
          ) : null}
        </div>
        <textarea
          aria-label="Tarana call-out text"
          className={`${inputClass} min-h-28 py-3 font-mono text-sm`}
          placeholder={"Company Name : …\nType of Call : …\nCustomer Site: …\nMTN Business Ref# : …"}
          value={raw}
          onChange={(e) => read(e.target.value)}
        />
        {status ? <p className="text-xs text-slate-500 dark:text-slate-400">{status}</p> : null}
      </div>

      <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <Field label="MTN Business Ref *">
          <input className={`${inputClass} font-mono`} value={value.mtnRef} onChange={set("mtnRef")} placeholder="MTNB…" />
        </Field>
        <Field label="Type of call (fault reported)">
          <input className={inputClass} value={value.typeOfCall} onChange={set("typeOfCall")} />
        </Field>
        <Field label="Customer site">
          <input className={inputClass} value={value.customerSite} onChange={set("customerSite")} />
        </Field>
        <Field label="Customer name">
          <input className={inputClass} value={value.customerName} onChange={set("customerName")} />
        </Field>
        <Field
          label="Contact number"
          hint={
            phone ? (
              <a href={`tel:${phone.replace(/\s/g, "")}`} className="font-semibold text-blue-700 dark:text-blue-300">
                Call {phone}
              </a>
            ) : undefined
          }
        >
          <input className={inputClass} type="tel" inputMode="tel" value={value.contactNumber} onChange={set("contactNumber")} />
        </Field>
        {value.companyName || value.officeHours ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {value.companyName ? `From ${value.companyName}` : ""}
            {value.companyName && value.officeHours ? " · " : ""}
            {value.officeHours ? `Site hours ${value.officeHours}` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}
