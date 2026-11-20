/**
 * Tarana install / fault checklist. Installs must record the key readings and
 * every required photo before they can be saved; fault visits record what they can.
 */

export type TaranaWork = "install" | "fault";

export interface TaranaInstall {
  rnSerial: string;
  rnMac: string;
  bnSector: string;
  rssi: string; // dBm
  sinr: string; // dB
  mountType: string;
  cableLength: string; // m
  routerModel: string;
  speedDown: string; // Mbps
  speedUp: string; // Mbps
  latency: string; // ms
  aligned: boolean;
}

export const EMPTY_INSTALL: TaranaInstall = {
  rnSerial: "",
  rnMac: "",
  bnSector: "",
  rssi: "",
  sinr: "",
  mountType: "",
  cableLength: "",
  routerModel: "",
  speedDown: "",
  speedUp: "",
  latency: "",
  aligned: false,
};

export const MOUNT_TYPES = ["Wall bracket", "Pole / mast", "Roof tripod", "Chimney mount", "Tower", "Other"];

/** Photo slots shown on Tarana jobs. All are required on installs. */
export const TARANA_PHOTO_SLOTS = ["Mast / mount", "RN unit & label", "Cable entry", "Router / PoE", "Speed test"];

const REQUIRED_INSTALL_FIELDS: [keyof TaranaInstall, string][] = [
  ["rnSerial", "RN serial"],
  ["bnSector", "BN / sector"],
  ["rssi", "RSSI"],
  ["sinr", "SINR"],
  ["speedDown", "speed test download"],
  ["speedUp", "speed test upload"],
];

/** Problems that block saving a Tarana install. Faults are never blocked. */
export function installProblems(work: TaranaWork, d: TaranaInstall, photoLabels: string[]): string[] {
  if (work !== "install") return [];
  const problems: string[] = [];
  const missing = REQUIRED_INSTALL_FIELDS.filter(([k]) => !String(d[k]).trim()).map(([, label]) => label);
  if (missing.length) problems.push(`Install checklist: add ${missing.join(", ")}`);
  if (!d.aligned) problems.push("Install checklist: confirm the RN is aligned");
  const missingPhotos = TARANA_PHOTO_SLOTS.filter((slot) => !photoLabels.includes(slot));
  if (missingPhotos.length) problems.push(`Photos still needed: ${missingPhotos.join(", ")}`);
  return problems;
}

/** Lines for the invoice notes. Empty values are skipped. */
export function installSummary(work: TaranaWork, d: TaranaInstall): string[] {
  const lines = [
    d.rnSerial && `RN serial: ${d.rnSerial}${d.rnMac ? ` (MAC ${d.rnMac})` : ""}`,
    d.bnSector && `BN / sector: ${d.bnSector}`,
    (d.rssi || d.sinr) && `Signal: ${[d.rssi && `RSSI ${d.rssi} dBm`, d.sinr && `SINR ${d.sinr} dB`].filter(Boolean).join(", ")}`,
    (d.speedDown || d.speedUp) &&
      `Speed test: ${d.speedDown || "?"} / ${d.speedUp || "?"} Mbps${d.latency ? `, ${d.latency} ms` : ""}`,
    d.mountType && `Mount: ${d.mountType}${d.cableLength ? `, ${d.cableLength} m cable` : ""}`,
    !d.mountType && d.cableLength && `Cable: ${d.cableLength} m`,
    d.routerModel && `Router: ${d.routerModel}`,
    work === "install" && d.aligned && "RN aligned: yes",
  ].filter((l): l is string => Boolean(l));
  return lines.length ? [work === "install" ? "Install details:" : "Readings:", ...lines] : [];
}
