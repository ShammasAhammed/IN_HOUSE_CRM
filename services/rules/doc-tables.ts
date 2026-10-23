// Database tables inside pages (Stage 13.4): typed columns, checked cells, and the table, board and calendar views.
// Pure, unit-tested. Rows live in their own table (not in the page text), so search and tools can read them.
import { safeHref } from "@/lib/markdown";
import { DOC_COLUMN_TYPES, type DocColumnType, type DocTableColumn, type DocTableView } from "@/lib/types";

export const MAX_COLUMNS = 20;
export const MAX_ROWS = 500;
export const STATUS_OPTIONS = ["Not started", "In progress", "Done"];

export const defaultColumns = (makeId: () => string): DocTableColumn[] => [
  { id: makeId(), name: "Name", type: "text" },
  { id: makeId(), name: "Status", type: "status", options: [...STATUS_OPTIONS] },
  { id: makeId(), name: "Owner", type: "person" },
  { id: makeId(), name: "Date", type: "date" },
];
export const defaultView = (cols: DocTableColumn[]): DocTableView => ({ kind: "table", groupBy: cols.find((c) => c.type === "status" || c.type === "select")?.id, dateColumn: cols.find((c) => c.type === "date")?.id, sort: null, filter: null });

export const isColumnType = (t: string): t is DocColumnType => (DOC_COLUMN_TYPES as readonly string[]).includes(t);

/** A cell's value checked against its column: the value to store, or why not. Empty clears the cell. */
export function checkCell(col: DocTableColumn, raw: unknown): { ok: true; value: string | number | boolean | null } | { ok: false; reason: string } {
  if (raw === null || raw === undefined || raw === "") return { ok: true, value: col.type === "checkbox" ? false : null };
  const s = String(raw).trim();
  switch (col.type) {
    case "text":
      return s.length <= 2000 ? { ok: true, value: s } : { ok: false, reason: "Keep it under 2,000 characters." };
    case "person":
      return /^[0-9a-f-]{36}$/.test(s) ? { ok: true, value: s } : { ok: false, reason: "Pick someone on the team." };
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? { ok: true, value: s } : { ok: false, reason: "Pick a date." };
    case "status":
    case "select":
      return (col.options ?? []).includes(s) ? { ok: true, value: s } : { ok: false, reason: "Pick one of the options." };
    case "number": {
      const n = Number(s.replace(/,/g, ""));
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, reason: "Type a number." };
    }
    case "checkbox":
      return { ok: true, value: raw === true || s === "true" || s === "on" };
    case "link":
      return safeHref(s) ? { ok: true, value: safeHref(s)! } : { ok: false, reason: "Links start with https://, mailto: or / (a page here)." };
  }
}

export type Row = { id: string; position: number; cells: Record<string, unknown> };

const cmp = (a: unknown, b: unknown) => {
  const empty = (v: unknown) => v === null || v === undefined || v === "";
  if (empty(a) && empty(b)) return 0;
  if (empty(a)) return 1; // empty cells last, whichever way
  if (empty(b)) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" });
};

/** The rows a view shows: filtered (a column contains or equals a value), then sorted (empties last). */
export function viewRows(rows: readonly Row[], cols: readonly DocTableColumn[], view: DocTableView, names: ReadonlyMap<string, string> = new Map()): Row[] {
  let out = [...rows];
  const f = view.filter;
  const fc = f ? cols.find((c) => c.id === f.column) : null;
  if (f && fc && f.value !== "") {
    const want = f.value.toLowerCase();
    out = out.filter((r) => {
      const v = r.cells[fc.id];
      if (fc.type === "checkbox") return Boolean(v) === (want === "true" || want === "yes");
      if (fc.type === "person") return v === f.value || (typeof v === "string" && (names.get(v) ?? "").toLowerCase().includes(want));
      if (fc.type === "status" || fc.type === "select") return String(v ?? "").toLowerCase() === want;
      return String(v ?? "").toLowerCase().includes(want);
    });
  }
  const s = view.sort;
  if (s && cols.some((c) => c.id === s.column)) {
    const col = cols.find((c) => c.id === s.column)!;
    const val = (r: Row) => (col.type === "person" && typeof r.cells[col.id] === "string" ? (names.get(r.cells[col.id] as string) ?? "") : r.cells[col.id]);
    out.sort((a, b) => {
      const c = cmp(val(a), val(b));
      const emptyA = val(a) === null || val(a) === undefined || val(a) === "";
      const emptyB = val(b) === null || val(b) === undefined || val(b) === "";
      if (emptyA !== emptyB) return c; // empties stay last in both directions
      return (s.dir === "desc" ? -c : c) || a.position - b.position;
    });
  } else out.sort((a, b) => a.position - b.position);
  return out;
}

/** Board view: a column per option (and "None" for empty), in the options' order. */
export function boardGroups(rows: readonly Row[], col: DocTableColumn): Array<{ key: string; label: string; rows: Row[] }> {
  const keys = [...(col.options ?? []), ""];
  return keys.map((k) => ({ key: k, label: k || "None", rows: rows.filter((r) => (String(r.cells[col.id] ?? "") || "") === k) })).filter((g) => g.key !== "" || g.rows.length);
}

/** Calendar view: a month's weeks (Monday first) with the rows on each day. */
export function calendarMonth(rows: readonly Row[], col: DocTableColumn, month: string): Array<Array<{ date: string; inMonth: boolean; rows: Row[] }>> {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const start = new Date(first);
  start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  const weeks: Array<Array<{ date: string; inMonth: boolean; rows: Row[] }>> = [];
  const d = new Date(start);
  do {
    const week: Array<{ date: string; inMonth: boolean; rows: Row[] }> = [];
    for (let i = 0; i < 7; i++) {
      const iso = d.toISOString().slice(0, 10);
      week.push({ date: iso, inMonth: d.getUTCMonth() === m - 1, rows: rows.filter((r) => r.cells[col.id] === iso) });
      d.setUTCDate(d.getUTCDate() + 1);
    }
    weeks.push(week);
  } while (d.getUTCMonth() === m - 1);
  return weeks;
}

/** Every cell's words, for the page's search text (people by name). */
export function tableText(title: string, cols: readonly DocTableColumn[], rows: readonly Row[], names: ReadonlyMap<string, string> = new Map()): string {
  const lines = [title, cols.map((c) => c.name).join(" ")];
  for (const r of rows)
    lines.push(
      cols
        .map((c) => {
          const v = r.cells[c.id];
          if (v === null || v === undefined || v === "" || typeof v === "boolean") return "";
          return c.type === "person" && typeof v === "string" ? (names.get(v) ?? "") : String(v);
        })
        .filter(Boolean)
        .join(" "),
    );
  return lines.filter(Boolean).join("\n");
}
