// Database tables in pages (Stage 13.4): cell checks, sort and filter, board and calendar views, search text.
import { describe, expect, it } from "vitest";
import { boardGroups, calendarMonth, checkCell, defaultColumns, tableText, viewRows, type Row } from "@/services/rules/doc-tables";
import type { DocTableColumn } from "@/lib/types";

let n = 0;
const cols = defaultColumns(() => `c${++n}`);
const [name, status, owner, date] = cols as [DocTableColumn, DocTableColumn, DocTableColumn, DocTableColumn];
const anu = "01a15900-3bca-7097-b8f9-d0d2d4c7e3e8";
const raj = "01a15900-3bca-7097-b8f9-d0d2d4c7e3e9";
const names = new Map([
  [anu, "Anu Thomas"],
  [raj, "Raj Kumar"],
]);
const rows: Row[] = [
  { id: "r1", position: 0, cells: { [name.id]: "Open day poster", [status.id]: "Done", [owner.id]: anu, [date.id]: "2026-10-22" } },
  { id: "r2", position: 1, cells: { [name.id]: "Parent webinar", [status.id]: "In progress", [owner.id]: raj, [date.id]: "2026-10-05" } },
  { id: "r3", position: 2, cells: { [name.id]: "Alumni reel", [status.id]: "Not started" } },
];

describe("cells", () => {
  it("checks each type", () => {
    expect(checkCell(status, "Done")).toEqual({ ok: true, value: "Done" });
    expect(checkCell(status, "Maybe").ok).toBe(false);
    expect(checkCell(date, "2026-13-40").ok).toBe(false);
    expect(checkCell({ id: "x", name: "Budget", type: "number" }, "1,20,000")).toEqual({ ok: true, value: 120000 });
    expect(checkCell({ id: "x", name: "Done", type: "checkbox" }, "on")).toEqual({ ok: true, value: true });
    expect(checkCell({ id: "x", name: "Link", type: "link" }, "javascript:alert(1)").ok).toBe(false);
    expect(checkCell({ id: "x", name: "Link", type: "link" }, "//evil.example").ok).toBe(false);
    expect(checkCell(owner, "")).toEqual({ ok: true, value: null });
  });
});

describe("views", () => {
  it("sorts with empties last both ways, by person name for people", () => {
    const by = (column: string, dir: "asc" | "desc") => viewRows(rows, cols, { kind: "table", sort: { column, dir }, filter: null }, names).map((r) => r.id);
    expect(by(date.id, "asc")).toEqual(["r2", "r1", "r3"]);
    expect(by(date.id, "desc")).toEqual(["r1", "r2", "r3"]);
    expect(by(owner.id, "desc")).toEqual(["r2", "r1", "r3"]);
  });
  it("filters by text, option, person name and checkbox", () => {
    const f = (column: string, value: string) => viewRows(rows, cols, { kind: "table", sort: null, filter: { column, value } }, names).map((r) => r.id);
    expect(f(name.id, "WEBINAR")).toEqual(["r2"]);
    expect(f(status.id, "done")).toEqual(["r1"]);
    expect(f(owner.id, "anu")).toEqual(["r1"]);
    expect(f(name.id, "")).toEqual(["r1", "r2", "r3"]);
  });
  it("board groups by status; calendar puts rows on their days", () => {
    expect(boardGroups(rows, status).map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([
      ["Not started", ["r3"]],
      ["In progress", ["r2"]],
      ["Done", ["r1"]],
    ]);
    const weeks = calendarMonth(rows, date, "2026-10");
    expect(weeks[0]![0]!.date).toBe("2026-09-28"); // Monday first
    const days = weeks.flat().filter((d) => d.rows.length);
    expect(days.map((d) => [d.date, d.rows[0]!.id])).toEqual([
      ["2026-10-05", "r2"],
      ["2026-10-22", "r1"],
    ]);
  });
  it("search text has every cell, people by name", () => {
    const t = tableText("Campaign tasks", cols, rows, names);
    expect(t).toContain("Parent webinar In progress Raj Kumar 2026-10-05");
    expect(t).toContain("Campaign tasks");
  });
});
