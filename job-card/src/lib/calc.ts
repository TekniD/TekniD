/** Decimal hours between two datetime values, rounded to 2 dp (90 min -> 1.5). */
export function decimalHours(timeIn: string, timeOut: string): number {
  if (!timeIn || !timeOut) return 0;
  const start = new Date(timeIn).getTime();
  const end = new Date(timeOut).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return Math.round(((end - start) / 3_600_000) * 100) / 100;
}

/** "HH:MM" duration label for display. */
export function durationLabel(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Value for <input type="datetime-local"> in the device's local time zone. */
export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Products whose key starts with TAR- (Tarana installs) need site photos. */
export function needsSitePhotos(productKeys: string[]): boolean {
  return productKeys.some((k) => k.trim().toUpperCase().startsWith("TAR-"));
}

/** True on Saturday/Sunday or outside 07:00-17:00, used only as a hint. */
export function looksAfterHours(timeIn: string): boolean {
  if (!timeIn) return false;
  const d = new Date(timeIn);
  const day = d.getDay();
  const hour = d.getHours();
  return day === 0 || day === 6 || hour < 7 || hour >= 17;
}
