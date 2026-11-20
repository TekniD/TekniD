"use client";

import { MOUNT_TYPES, type TaranaInstall, type TaranaWork } from "@/lib/install";
import { Field, Toggle, inputClass } from "./ui";

/** Readings for a Tarana job. Starred fields are required on installs. */
export function TaranaChecklist({
  work,
  value,
  onChange,
}: {
  work: TaranaWork;
  value: TaranaInstall;
  onChange: (v: TaranaInstall) => void;
}) {
  const req = work === "install" ? " *" : "";
  const set = (k: keyof TaranaInstall) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [k]: e.target.value });
  const num = { type: "text", inputMode: "decimal" as const, autoComplete: "off" };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={`RN serial${req}`}>
          <input className={`${inputClass} font-mono`} value={value.rnSerial} onChange={set("rnSerial")} autoCapitalize="characters" />
        </Field>
        <Field label="RN MAC">
          <input className={`${inputClass} font-mono`} value={value.rnMac} onChange={set("rnMac")} autoCapitalize="characters" placeholder="AA:BB:CC…" />
        </Field>
      </div>
      <Field label={`BN / sector${req}`}>
        <input className={inputClass} value={value.bnSector} onChange={set("bnSector")} placeholder="e.g. BN-3 sector 2" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`RSSI (dBm)${req}`}>
          <input className={inputClass} {...num} value={value.rssi} onChange={set("rssi")} placeholder="-62" />
        </Field>
        <Field label={`SINR (dB)${req}`}>
          <input className={inputClass} {...num} value={value.sinr} onChange={set("sinr")} placeholder="25" />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label={`Down Mbps${req}`}>
          <input className={inputClass} {...num} value={value.speedDown} onChange={set("speedDown")} />
        </Field>
        <Field label={`Up Mbps${req}`}>
          <input className={inputClass} {...num} value={value.speedUp} onChange={set("speedUp")} />
        </Field>
        <Field label="Ping ms">
          <input className={inputClass} {...num} value={value.latency} onChange={set("latency")} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mount">
          <select className={inputClass} value={value.mountType} onChange={set("mountType")}>
            <option value="">Choose…</option>
            {MOUNT_TYPES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Cable (m)">
          <input className={inputClass} {...num} value={value.cableLength} onChange={set("cableLength")} />
        </Field>
      </div>
      <Field label="Router / CPE model">
        <input className={inputClass} value={value.routerModel} onChange={set("routerModel")} />
      </Field>
      {work === "install" ? (
        <Toggle
          checked={value.aligned}
          onChange={(aligned) => onChange({ ...value, aligned })}
          label="RN aligned and link stable *"
          description="Confirm before leaving site"
        />
      ) : null}
    </div>
  );
}
