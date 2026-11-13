import imageCompression from "browser-image-compression";

const OPTIONS = {
  maxSizeMB: 1.5,
  maxWidthOrHeight: 1920,
  useWebWorker: true, // keeps the UI responsive while compressing
  // The library loads its worker script from a CDN by default, which fails on
  // the VPN-only network. Serve our own copy (copied from node_modules by the
  // postinstall script) so compression works fully offline.
  libURL: "/vendor/browser-image-compression.js",
  fileType: "image/jpeg",
  initialQuality: 0.85,
} as const;

/** Compress one photo off the main thread and return it as a Base64 data URL. */
export async function compressToDataUrl(file: File): Promise<string> {
  const compressed = await imageCompression(file, OPTIONS);
  return imageCompression.getDataUrlFromFile(compressed);
}

/** Approximate decoded size of a data URL in KB, for display. */
export function dataUrlSizeKb(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.round((base64.length * 3) / 4 / 1024);
}
