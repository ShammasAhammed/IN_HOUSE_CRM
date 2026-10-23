// Reads a ClickUp CSV export into the compact rows the import needs. Pure; runs in the browser so only what's kept is
// sent to the server. Column names are matched loosely because exports differ by workspace and version.

import { csvRecords } from "./csv";
import { istDate, isIsoDate, type IsoDate } from "./dates";
import type { ImportedTask } from "./validation/import";

const COLUMNS = {
  ref: ["task id", "id", "task custom id"],
  name: ["task name", "name", "title"],
  description: ["task content", "content", "description"],
  status: ["status"],
  due: ["due date", "due date text", "due"],
  start: ["start date", "start date text", "start"],
  parent: ["parent id", "parent task id", "parent"],
  assignees: ["assignees", "assignee"],
  priority: ["priority"],
  space: ["space name", "space"],
  folder: ["folder name", "folder"],
  list: ["list name", "list"],
  estimate: ["time estimated", "time estimate"],
} as const;

/** Epoch milliseconds, YYYY-MM-DD…, or MM/DD/YYYY → an India date. Anything else → null. */
export function readDate(value: string): IsoDate | null {
  const v = value.trim();
  if (!v) return null;
  if (/^\d{11,14}$/.test(v)) return istDate(new Date(Number(v)));
  if (isIsoDate(v.slice(0, 10))) return v.slice(0, 10);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v);
  if (us) {
    const d = `${us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`;
    return isIsoDate(d) ? d : null;
  }
  return null;
}

/** "[Anjali Nair, Rahul]" or "Anjali Nair, Rahul" → names. */
export const readAssignees = (value: string): string[] =>
  value
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export type ClickUpRead = { tasks: ImportedTask[]; found: string[]; missing: string[]; badDates: number; skippedRows: number };

export function readClickUpCsv(text: string): ClickUpRead {
  const { headers, records } = csvRecords(text);
  const lower = new Map(headers.map((h) => [h.toLowerCase(), h]));
  const pick = (names: readonly string[]) => names.map((n) => lower.get(n)).find(Boolean);
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([k, names]) => [k, pick(names)])) as Record<keyof typeof COLUMNS, string | undefined>;
  const get = (r: Record<string, string>, k: keyof typeof COLUMNS) => (col[k] ? (r[col[k]!] ?? "").trim() : "");

  let badDates = 0;
  let skippedRows = 0;
  const tasks: ImportedTask[] = [];
  // Refs must be unique: a repeated one (two "Monthly report" rows in one list, with no Task ID) gets "#2", "#3".
  const seen = new Map<string, number>();
  const unique = (ref: string) => {
    const n = (seen.get(ref) ?? 0) + 1;
    seen.set(ref, n);
    return n === 1 ? ref : `${ref.slice(0, 110)}#${n}`;
  };
  records.forEach((r) => {
    const name = get(r, "name").slice(0, 200);
    if (!name) {
      skippedRows++;
      return;
    }
    const dates = (["due", "start"] as const).map((k) => {
      const raw = get(r, k);
      const d = readDate(raw);
      if (raw && !d) badDates++;
      return d;
    });
    const estimate = Number(get(r, "estimate"));
    const list = get(r, "list") || null;
    tasks.push({
      // Without an id, the list and name stand in, so importing the same file twice doesn't double up.
      ref: unique((get(r, "ref") || `${list ?? ""}/${name}`).slice(0, 120)),
      name,
      description: get(r, "description").slice(0, 5000) || null,
      status: get(r, "status").toLowerCase().slice(0, 60),
      dueDate: dates[0]!,
      startDate: dates[1]!,
      parentRef: get(r, "parent") || null,
      assignees: readAssignees(get(r, "assignees")).slice(0, 20),
      priority: get(r, "priority").toLowerCase() || null,
      space: get(r, "space") || null,
      folder: get(r, "folder") || null,
      list,
      // ClickUp exports estimates in milliseconds.
      estimateMinutes: Number.isFinite(estimate) && estimate > 0 ? Math.min(100_000, Math.round(estimate / 60_000)) : null,
    });
  });
  return {
    tasks,
    found: Object.entries(col).filter(([, v]) => v).map(([k]) => k),
    missing: Object.entries(col).filter(([, v]) => !v).map(([k]) => k),
    badDates,
    skippedRows,
  };
}
