// Date helpers working on plain "YYYY-MM-DD" strings (no time zone surprises).

export const ALMATY_OFFSET_MIN = 5 * 60; // Asia/Almaty, UTC+5

/** Today's date in Kazakhstan as YYYY-MM-DD. */
export function todayKz(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + ALMATY_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: string, b: string): number {
  const ms = Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z");
  return Math.round(ms / 86_400_000);
}

export function formatDate(date: string, lang: "ru" | "en" | "zh" = "ru"): string {
  if (!isIsoDate(date)) return date || "—";
  const [y, m, d] = date.split("-");
  if (lang === "zh") return `${y}年${Number(m)}月${Number(d)}日`;
  return `${d}.${m}.${y}`;
}
