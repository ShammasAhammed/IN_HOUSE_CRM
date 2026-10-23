// Calendar-day maths on ISO dates ("2026-10-14"). A calendar day always means a day in Asia/Kolkata.
// All arithmetic runs in UTC on the date alone, so it never drifts with the server's time zone.

export type IsoDate = string;

export const TIME_ZONE = "Asia/Kolkata";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const d = parse(value);
  return toIso(d) === value;
}

function parse(date: IsoDate): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

function toIso(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

/** The calendar date in India for an instant (default: now). */
export function istDate(instant: Date = new Date()): IsoDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

export function addMonths(date: IsoDate, months: number): IsoDate {
  const d = parse(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(Math.min(day, daysInMonth(toIso(d))));
  return toIso(d);
}

/** Whole days from `from` to `to` (to − from). */
export function diffDays(from: IsoDate, to: IsoDate): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: IsoDate): number {
  return parse(date).getUTCDay();
}

export function startOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-${String(daysInMonth(date)).padStart(2, "0")}`;
}

export function daysInMonth(date: IsoDate): number {
  const d = parse(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/** Monday of the week containing `date` (weeks run Monday–Sunday). */
export function startOfWeek(date: IsoDate): IsoDate {
  const dow = dayOfWeek(date);
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

/** Every date from `from` to `to`, inclusive. Empty when `to` is before `from`. */
export function eachDay(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function yearOf(date: IsoDate): number {
  return Number(date.slice(0, 4));
}

export const minDate = (a: IsoDate, b: IsoDate): IsoDate => (a < b ? a : b);
export const maxDate = (a: IsoDate, b: IsoDate): IsoDate => (a > b ? a : b);

/** India has no daylight saving: always UTC+5:30. */
const IST_OFFSET_MINUTES = 330;

/** Minutes since midnight in India for an instant (9:30 am = 570). */
export function istMinutesOfDay(instant: Date): number {
  return (((Math.floor(instant.getTime() / 60_000) + IST_OFFSET_MINUTES) % 1440) + 1440) % 1440;
}

/** The instant of a wall-clock time ("09:30") on a calendar day in India. */
export function istInstant(date: IsoDate, time: string): Date {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return new Date(parse(date).getTime() + (h * 60 + m - IST_OFFSET_MINUTES) * 60_000);
}

/** "09:30" for an instant, in India. */
export function istTime(instant: Date): string {
  const m = istMinutesOfDay(instant);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
