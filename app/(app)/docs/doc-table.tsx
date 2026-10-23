"use client";

// A database table inside a page (Stage 13.4): typed columns; table, board (by status or select) and calendar (by
// date) views; sort and filter, saved for everyone. Phones scroll the table sideways inside its box.
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Columns3, Plus, Table2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { DOC_COLUMN_TYPES, type DocColumnType, type DocTableColumn, type DocTableView } from "@/lib/types";
import { cn } from "@/lib/utils";
import { boardGroups, calendarMonth, viewRows, type Row } from "@/services/rules/doc-tables";
import type { DocTableData } from "@/services/doc-tables";
import { addColumnAction, addRowAction, getTableAction, removeColumnAction, removeRowAction, renameTableAction, setCellAction, setViewAction } from "./table-actions";

const TYPE_LABELS: Record<DocColumnType, string> = { text: "Text", person: "Person", date: "Date", status: "Status", select: "Select", number: "Number", checkbox: "Checkbox", link: "Link" };

function Cell({ col, value, people, canEdit, onSave }: { col: DocTableColumn; value: unknown; people: Array<{ id: string; name: string }>; canEdit: boolean; onSave: (v: unknown) => void }) {
  const [draft, setDraft] = useState(value === null || value === undefined ? "" : String(value));
  const shown = col.type === "person" ? (people.find((p) => p.id === value)?.name ?? "") : value === null || value === undefined ? "" : String(value);
  if (!canEdit) {
    if (col.type === "checkbox") return <input type="checkbox" checked={Boolean(value)} readOnly disabled aria-label={col.name} />;
    if (col.type === "link" && shown) return <a href={shown} target={shown.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer" className="text-primary hover:underline">{shown}</a>;
    return <span>{shown}</span>;
  }
  const commit = (v: unknown) => {
    if (String(v ?? "") !== String(value ?? "")) onSave(v);
  };
  switch (col.type) {
    case "checkbox":
      return <input type="checkbox" checked={Boolean(value)} onChange={(e) => onSave(e.target.checked)} aria-label={col.name} className="size-4 accent-primary" />;
    case "person":
      return (
        <Select value={String(value ?? "")} onChange={(e) => commit(e.target.value)} aria-label={col.name} className="h-8 min-w-32 text-xs">
          <option value="">—</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      );
    case "status":
    case "select":
      return (
        <Select value={String(value ?? "")} onChange={(e) => commit(e.target.value)} aria-label={col.name} className="h-8 min-w-28 text-xs">
          <option value="">—</option>
          {(col.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      );
    default:
      return (
        <Input
          type={col.type === "date" ? "date" : col.type === "number" ? "number" : "text"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          aria-label={col.name}
          className="h-8 min-w-28 text-xs"
        />
      );
  }
}

export function DocTableBlock({ tableId }: { tableId: string }) {
  const [data, setData] = useState<DocTableData | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [colName, setColName] = useState("");
  const [colType, setColType] = useState<DocColumnType>("text");
  const [colOptions, setColOptions] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    void getTableAction(tableId).then((r) => {
      if (!live) return;
      if (r.ok) setData(r.value);
      else setProblem(r.message);
    });
    return () => {
      live = false;
    };
  }, [tableId, tick]);
  const act = async (p: Promise<{ ok: boolean; message?: string }>) => {
    const r = await p;
    if (!r.ok) setProblem(r.message ?? "Not saved.");
    setTick((t) => t + 1);
  };
  const names = useMemo(() => new Map((data?.people ?? []).map((p) => [p.id, p.name])), [data]);
  if (!data) return <p className="rounded-md border px-3 py-4 text-sm text-muted-foreground">{problem ?? "Loading the table…"}</p>;
  const { table, canEdit, people } = data;
  const view = table.view;
  const rows = viewRows(data.rows as Row[], table.columns, view, names);
  const setView = (patch: Partial<DocTableView>) => act(setViewAction(table.id, { ...view, ...patch }));
  const groupCol = table.columns.find((c) => c.id === view.groupBy && (c.type === "status" || c.type === "select")) ?? table.columns.find((c) => c.type === "status" || c.type === "select");
  const dateCol = table.columns.find((c) => c.id === view.dateColumn && c.type === "date") ?? table.columns.find((c) => c.type === "date");
  const nameCol = table.columns.find((c) => c.type === "text") ?? table.columns[0]!;
  return (
    <section className="space-y-2 rounded-lg border p-3" aria-label={`Table ${table.title}`}>
      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <Input defaultValue={table.title} onBlur={(e) => e.target.value !== table.title && act(renameTableAction(table.id, e.target.value))} aria-label="Table name" className="h-8 w-48 text-sm font-semibold" />
        ) : (
          <h3 className="text-sm font-semibold">{table.title}</h3>
        )}
        <div className="flex rounded-md border" role="group" aria-label="View">
          {(
            [
              ["table", Table2, "Table"],
              ["board", Columns3, "Board"],
              ["calendar", CalendarDays, "Calendar"],
            ] as const
          ).map(([k, Icon, label]) => (
            <button key={k} type="button" aria-pressed={view.kind === k} disabled={!canEdit && view.kind !== k} onClick={() => setView({ kind: k })} className={cn("inline-flex items-center gap-1 px-2 py-1 text-xs", view.kind === k ? "bg-accent text-primary" : "hover:bg-hover")}>
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
        <Select value={view.sort ? `${view.sort.column}:${view.sort.dir}` : ""} onChange={(e) => setView({ sort: e.target.value ? { column: e.target.value.split(":")[0]!, dir: e.target.value.split(":")[1] as "asc" | "desc" } : null })} aria-label="Sort" className="h-8 w-40 text-xs" disabled={!canEdit}>
          <option value="">No sort</option>
          {table.columns.flatMap((c) => [
            <option key={`${c.id}a`} value={`${c.id}:asc`}>
              {c.name} ↑
            </option>,
            <option key={`${c.id}d`} value={`${c.id}:desc`}>
              {c.name} ↓
            </option>,
          ])}
        </Select>
        <span className="flex items-center gap-1">
          <Select value={view.filter?.column ?? ""} onChange={(e) => setView({ filter: e.target.value ? { column: e.target.value, value: view.filter?.value ?? "" } : null })} aria-label="Filter column" className="h-8 w-32 text-xs" disabled={!canEdit}>
            <option value="">No filter</option>
            {table.columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {view.filter ? <Input defaultValue={view.filter.value} onBlur={(e) => setView({ filter: { column: view.filter!.column, value: e.target.value } })} placeholder="contains…" aria-label="Filter value" className="h-8 w-28 text-xs" disabled={!canEdit} /> : null}
        </span>
      </div>
      {problem ? (
        <p role="alert" className="flex items-center gap-2 text-xs text-danger">
          {problem}
          <button type="button" aria-label="Dismiss" onClick={() => setProblem(null)}>
            <X className="size-3" />
          </button>
        </p>
      ) : null}
      {view.kind === "table" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b">
                {table.columns.map((c) => (
                  <th key={c.id} className="px-2 py-1.5 font-semibold whitespace-nowrap">
                    {c.name} <span className="font-normal text-muted-foreground">{TYPE_LABELS[c.type]}</span>
                    {canEdit && table.columns.length > 1 ? (
                      <button type="button" aria-label={`Remove column ${c.name}`} className="ml-1 text-muted-foreground hover:text-danger" onClick={() => act(removeColumnAction(table.id, c.id))}>
                        <X className="inline size-3" />
                      </button>
                    ) : null}
                  </th>
                ))}
                {canEdit ? <th className="w-8" /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  {table.columns.map((c) => (
                    <td key={c.id} className="px-2 py-1 align-middle">
                      <Cell key={String(r.cells[c.id] ?? "")} col={c} value={r.cells[c.id]} people={people} canEdit={canEdit} onSave={(v) => act(setCellAction(table.id, r.id, c.id, v))} />
                    </td>
                  ))}
                  {canEdit ? (
                    <td>
                      <button type="button" aria-label="Remove row" className="text-muted-foreground hover:text-danger" onClick={() => act(removeRowAction(table.id, r.id))}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? <p className="py-2 text-xs text-muted-foreground">No rows{view.filter?.value ? " match the filter" : ""}.</p> : null}
        </div>
      ) : view.kind === "board" ? (
        groupCol ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {boardGroups(rows, groupCol).map((g) => (
              <div key={g.key} className="w-56 shrink-0 space-y-1.5 rounded-md bg-subtle p-2">
                <p className="text-xs font-semibold">
                  {g.label} <span className="text-muted-foreground">{g.rows.length}</span>
                </p>
                {g.rows.map((r) => (
                  <div key={r.id} className="space-y-1 rounded-md border bg-card p-2 text-xs">
                    <p className="font-medium">{String(r.cells[nameCol.id] ?? "") || "Untitled"}</p>
                    {canEdit ? <Cell col={groupCol} value={r.cells[groupCol.id]} people={people} canEdit onSave={(v) => act(setCellAction(table.id, r.id, groupCol.id, v))} /> : null}
                  </div>
                ))}
                {canEdit && g.key ? (
                  <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => act(addRowAction(table.id, { [groupCol.id]: g.key }))}>
                    + Add
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Add a Status or Select column to see the board.</p>
        )
      ) : dateCol ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <button type="button" aria-label="Previous month" onClick={() => setMonth(shift(month, -1))}>
              <ChevronLeft className="size-4" />
            </button>
            <span className="font-medium">{new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
            <button type="button" aria-label="Next month" onClick={() => setMonth(shift(month, 1))}>
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-border text-[11px]">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="bg-subtle px-1 py-0.5 font-medium">
                {d}
              </div>
            ))}
            {calendarMonth(rows, dateCol, month)
              .flat()
              .map((d) => (
                <div key={d.date} className={cn("min-h-14 bg-card p-1", !d.inMonth && "text-muted-foreground")}>
                  <p>{Number(d.date.slice(8))}</p>
                  {d.rows.map((r) => (
                    <p key={r.id} className="truncate rounded bg-accent px-1 text-accent-foreground">
                      {String(r.cells[nameCol.id] ?? "") || "Untitled"}
                    </p>
                  ))}
                </div>
              ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Add a Date column to see the calendar.</p>
      )}
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => act(addRowAction(table.id))}>
            <Plus /> Row
          </Button>
          {adding ? (
            <form
              className="flex flex-wrap items-center gap-1"
              onSubmit={async (e) => {
                e.preventDefault();
                await act(addColumnAction(table.id, { name: colName, type: colType, ...(colType === "select" || colType === "status" ? { options: colOptions.split(",").map((o) => o.trim()).filter(Boolean) } : {}) }));
                setAdding(false);
                setColName("");
                setColOptions("");
              }}
            >
              <Input value={colName} onChange={(e) => setColName(e.target.value)} placeholder="Column name" aria-label="Column name" className="h-8 w-32 text-xs" required />
              <Select value={colType} onChange={(e) => setColType(e.target.value as DocColumnType)} aria-label="Column type" className="h-8 w-28 text-xs">
                {DOC_COLUMN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
              {colType === "select" || colType === "status" ? <Input value={colOptions} onChange={(e) => setColOptions(e.target.value)} placeholder="Options, comma between" aria-label="Options" className="h-8 w-44 text-xs" /> : null}
              <Button size="sm" type="submit">
                Add
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </form>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
              <Plus /> Column
            </Button>
          )}
        </div>
      ) : null}
    </section>
  );
}

function shift(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}
