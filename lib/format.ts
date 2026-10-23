// Display formatting. Stored values: timestamps UTC, money integer paise, durations integer minutes.
// Everything is shown in Indian conventions and the Asia/Kolkata time zone.

import { TIME_ZONE, type IsoDate } from "./dates";

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const shortDateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const weekdayFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: TIME_ZONE,
});
const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: TIME_ZONE });
const rupeeFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const rupeePaiseFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const countFmt = new Intl.NumberFormat("en-IN");

const isoToUtc = (date: IsoDate) => new Date(`${date}T00:00:00Z`);

/** "14 Oct 2026" */
export const formatDate = (date: IsoDate): string => dateFmt.format(isoToUtc(date));
/** "October 2026", from "2026-10" or any date in the month. */
export const formatMonth = (month: string): string => monthFmt.format(isoToUtc(`${month.slice(0, 7)}-01`));
/** "14 Oct" */
export const formatShortDate = (date: IsoDate): string => shortDateFmt.format(isoToUtc(date));
/** "Wed, 14 Oct" */
export const formatWeekdayDate = (date: IsoDate): string => weekdayFmt.format(isoToUtc(date));
/** "14 Oct, 3:45 pm" in India time. */
export const formatDateTime = (instant: Date): string => dateTimeFmt.format(instant);
/** "9:42 am", in India. */
export const formatTime = (instant: Date): string => timeFmt.format(instant);

/** "₹1,25,000" — paise shown only when not a whole rupee. */
export function formatRupees(paise: number): string {
  if (!Number.isInteger(paise)) throw new Error("Money must be integer paise");
  return paise % 100 === 0 ? rupeeFmt.format(paise / 100) : rupeePaiseFmt.format(paise / 100);
}

/** Money in any currency from its smallest unit (paise, cents), e.g. ad spend in the ad account's currency. */
export function formatMoneyMinor(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);
  } catch {
    return `${currency} ${countFmt.format(minor / 100)}`;
  }
}

/** "2.4%" for a share; "—" when there is nothing to divide by. */
export const formatPercent = (part: number, whole: number): string => (whole > 0 ? `${((part / whole) * 100).toFixed(part / whole < 0.1 ? 2 : 1)}%` : "—");

/** "12,40,000" (Indian grouping), for counts like tokens. */
export const formatCount = (n: number): string => countFmt.format(n);

/** Paise as plain rupees for a form field: 200000 → "2000", 12345 → "123.45". */
export const paiseToRupeesInput = (paise: number): string => (paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2));

/**
 * Parse a rupee amount typed by a person ("1,25,000.50", "₹ 500") into integer paise without
 * floating-point maths. Returns null when it is not a valid non-negative amount.
 */
export function parseRupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const rupees = Number(match[1]);
  const paise = Number((match[2] ?? "").padEnd(2, "0"));
  const total = rupees * 100 + paise;
  return Number.isSafeInteger(total) ? total : null;
}

/** "2h 30m", "45m", "0m". */
export function formatMinutes(minutes: number): string {
  const sign = minutes < 0 ? "−" : "";
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}m`;
  return m === 0 ? `${sign}${h}h` : `${sign}${h}h ${m}m`;
}

/** "12.5 h" — hours with at most one decimal, for budgets and capacity. */
export function formatHours(minutes: number): string {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours.toLocaleString("en-IN")} h`;
}

/** "1 lead", "2 leads", "12,400 leads": a count with its word in the right number (QA S9-15). */
export function countOf(n: number, one: string, many = `${one}s`): string {
  return `${countFmt.format(n)} ${n === 1 ? one : many}`;
}

/** "1 day", "2.5 days". */
export function formatDays(days: number): string {
  return `${days.toLocaleString("en-IN")} ${days === 1 ? "day" : "days"}`;
}

/** "820 KB", "2.4 MB" (decimal units, as phones and laptops show file sizes). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000)).toLocaleString("en-IN")} KB`;
  return `${(Math.round(bytes / 100_000) / 10).toLocaleString("en-IN")} MB`;
}

/** Hours as people type them: "1.5", ".5", "1:30", "1h30", "1h 30m", "2h", "90m" → minutes; null when it isn't one. */
export function parseHoursToMinutes(input: string): number | null {
  const t = input.trim().toLowerCase().replace(/\s+/g, " ");
  let m = /^(\d{1,3})?(?:\.(\d{1,2}))?$/.exec(t);
  if (m && (m[1] || m[2])) return Math.round((Number(m[1] ?? 0) + Number(`0.${m[2] ?? 0}`)) * 60);
  m = /^(\d{1,3}):([0-5]\d)$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(?:(\d{1,3}(?:\.\d{1,2})?) ?(?:h|hr|hrs|hours?))? ?(?:(\d{1,3}) ?(?:m|min|mins|minutes?)?)?$/.exec(t);
  if (m && (m[1] || m[2]) && (m[1] || /[a-z]$/.test(t))) return Math.round(Number(m[1] ?? 0) * 60) + Number(m[2] ?? 0);
  return null;
}

/** "1:05" for a moment in a video. */
export function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(seconds % 60).padStart(2, "0")}`;
}

/** "1:05", "65" or "0:05" → seconds; null when it isn't a time. */
export function parseTimecode(input: string): number | null {
  const t = input.trim();
  const m = /^(?:(\d{1,2}):)?(\d{1,3})$/.exec(t);
  if (!m) return null;
  const [mins, secs] = [Number(m[1] ?? 0), Number(m[2])];
  if (m[1] !== undefined && secs >= 60) return null;
  return mins * 60 + secs;
}

/** First names for a list of people, but the full name for anyone whose first name another shares (QA S9-09). */
export function shortNames(names: readonly string[]): string[] {
  const first = (n: string) => n.trim().split(/\s+/)[0] ?? n;
  const count = new Map<string, number>();
  for (const n of names) count.set(first(n).toLowerCase(), (count.get(first(n).toLowerCase()) ?? 0) + 1);
  return names.map((n) => ((count.get(first(n).toLowerCase()) ?? 0) > 1 ? n.trim() : first(n)));
}

export function initials(name: string): string {
  // Letters and digits only, so "TEST <b>bold</b>" gives "TB", not "T<" (QA S9-13).
  const parts = name
    .replace(/<[^>]*>/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}
