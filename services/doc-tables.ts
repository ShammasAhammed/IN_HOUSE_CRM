// Database tables inside pages (Stage 13.4): typed columns, rows, and table/board/calendar views with sort and filter.
// Kept in their own tables (not inside the page text) so search, Ask and the MCP can read them. Whoever can open the
// page reads its tables; whoever can edit the page (client and space levels, 14.2) edits them. Every change is an
// event, and the page's search text is refreshed with the table's words.
import { z } from "zod";
import { isId, newId } from "@/lib/id";
import { invalid, notFound, ok, type Result } from "@/lib/result";
import { DOC_COLUMN_TYPES, type DocTableColumn, type DocTableView } from "@/lib/types";
import { parse } from "@/lib/validation/common";
import type { DataStore, DocTableRecord, DocTableRow, NewEvent, Repositories } from "@/repositories";
import { change, commit } from "./change";
import type { Clock } from "./clock";
import type { DocService } from "./docs";
import type { Actor } from "./permissions";
import { checkCell, defaultColumns, defaultView, MAX_COLUMNS, MAX_ROWS, tableText } from "./rules/doc-tables";
import { levelBlocks } from "./spaces";

export type DocTableData = { table: DocTableRecord; rows: DocTableRow[]; canEdit: boolean; people: Array<{ id: string; name: string }> };

const columnSchema = z.object({ name: z.string().trim().min(1, { message: "Name the column." }).max(60), type: z.enum(DOC_COLUMN_TYPES), options: z.array(z.string().trim().min(1).max(40)).max(20).optional() });
const viewSchema = z.object({
  kind: z.enum(["table", "board", "calendar"]),
  groupBy: z.string().max(40).optional(),
  dateColumn: z.string().max(40).optional(),
  sort: z.object({ column: z.string().max(40), dir: z.enum(["asc", "desc"]) }).nullable().optional(),
  filter: z.object({ column: z.string().max(40), value: z.string().max(100) }).nullable().optional(),
});

export function createDocTablesService(deps: { store: DataStore; clock: Clock; docs: Pick<DocService, "get"> }) {
  const { store, clock } = deps;

  /** The table with the page it's on, when this person can open that page; `edit` also needs edit rights there. */
  async function access(actor: Actor, tableId: string, edit: boolean) {
    const t = isId(tableId) ? await store.docTables.find(tableId) : null;
    if (!t) return notFound("That table");
    const page = await deps.docs.get(actor, t.docId);
    if (!page.ok) return notFound("That table");
    const blocked = page.value.clientId ? await levelBlocks(store, actor, page.value.clientId, "edit") : null;
    if (edit && blocked) return blocked;
    return ok({ table: t, clientId: page.value.clientId, canEdit: !blocked });
  }

  const event = (actor: Actor, t: Pick<DocTableRecord, "id" | "docId" | "title">, clientId: string | null, action: string, data: Record<string, unknown> = {}): NewEvent => ({ actorId: actor.personId, action, entityType: "doc_table", entityId: t.id, clientId, data: { docId: t.docId, title: t.title, ...data } });

  /** The page's search text: the words of all its tables. */
  async function refreshText(repos: Repositories, docId: string) {
    const names = new Map((await repos.people.listActive()).map((p) => [p.id, p.fullName]));
    const parts: string[] = [];
    for (const t of await repos.docTables.forDoc(docId)) parts.push(tableText(t.title, t.columns, await repos.docTables.rows(t.id), names));
    await repos.docs.setTableText(docId, parts.join("\n\n"));
  }

  async function changeTable(actor: Actor, tableId: string, action: string, fn: (repos: Repositories, t: DocTableRecord) => Promise<Record<string, unknown> | string>): Promise<Result<null>> {
    const a = await access(actor, tableId, true);
    if (!a.ok) return a;
    return commit(store, async (repos) => {
      const t = (await repos.docTables.find(tableId))!;
      const r = await fn(repos, t);
      if (typeof r === "string") return invalid(r);
      await refreshText(repos, t.docId);
      return change(null, event(actor, t, a.value.clientId, action, r));
    });
  }

  return {
    async create(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(z.object({ docId: z.uuid(), title: z.string().trim().max(80).optional() }), raw);
      if (!parsed.ok) return parsed;
      const page = await deps.docs.get(actor, parsed.value.docId);
      if (!page.ok) return notFound("That page");
      if (page.value.clientId) {
        const blocked = await levelBlocks(store, actor, page.value.clientId, "edit");
        if (blocked) return blocked;
      }
      const id = newId();
      const columns = defaultColumns(() => newId().slice(-12));
      const title = parsed.value.title || "Table";
      return commit(store, async (repos) => {
        const now = clock.now();
        await repos.docTables.create({ id, docId: page.value.id, title, columns, view: defaultView(columns), createdById: actor.personId, at: now });
        await repos.docTables.addRow({ id: newId(), tableId: id, position: 0, cells: {}, createdById: actor.personId, at: now });
        return change({ id }, event(actor, { id, docId: page.value.id, title }, page.value.clientId, "doc_table.created"));
      });
    },

    /** A table with set columns, view and rows (Stage 13.6: a page made from a template); cells are checked. */
    async createFrom(actor: Actor, input: { id: string; docId: string; title: string; columns: DocTableColumn[]; view: DocTableView; rows: Array<Record<string, unknown>> }): Promise<Result<{ id: string }>> {
      const page = await deps.docs.get(actor, input.docId);
      if (!page.ok) return notFound("That page");
      if (page.value.clientId) {
        const blocked = await levelBlocks(store, actor, page.value.clientId, "edit");
        if (blocked) return blocked;
      }
      const columns = input.columns.slice(0, MAX_COLUMNS).filter((c) => (DOC_COLUMN_TYPES as readonly string[]).includes(c.type));
      if (!columns.length) return invalid("A table needs a column.");
      const known = new Set(columns.map((c) => c.id));
      const view = input.view && ["table", "board", "calendar"].includes(input.view.kind) ? { ...input.view, ...(input.view.sort && !known.has(input.view.sort.column) ? { sort: null } : {}), ...(input.view.filter && !known.has(input.view.filter.column) ? { filter: null } : {}) } : defaultView(columns);
      const title = input.title.trim().slice(0, 80) || "Table";
      return commit(store, async (repos) => {
        const now = clock.now();
        await repos.docTables.create({ id: input.id, docId: page.value.id, title, columns, view, createdById: actor.personId, at: now });
        const rows = input.rows.length ? input.rows.slice(0, MAX_ROWS) : [{}];
        for (const [i, r] of rows.entries()) {
          const cells: Record<string, unknown> = {};
          for (const col of columns) {
            const c = col.type === "person" ? null : checkCell(col, r[col.id]);
            if (c?.ok && c.value !== null) cells[col.id] = c.value;
          }
          await repos.docTables.addRow({ id: newId(), tableId: input.id, position: i, cells, createdById: actor.personId, at: now });
        }
        await refreshText(repos, page.value.id);
        return change({ id: input.id }, event(actor, { id: input.id, docId: page.value.id, title }, page.value.clientId, "doc_table.created", { fromTemplate: true }));
      });
    },

    async get(actor: Actor, tableId: string): Promise<Result<DocTableData>> {
      const a = await access(actor, tableId, false);
      if (!a.ok) return a;
      const [rows, people] = await Promise.all([store.docTables.rows(a.value.table.id), store.people.listActive()]);
      return ok({ table: a.value.table, rows, canEdit: a.value.canEdit, people: people.map((p) => ({ id: p.id, name: p.fullName })) });
    },

    /** Every table on a page this person can open (for tools). */
    async forDoc(actor: Actor, docId: string): Promise<Result<DocTableData[]>> {
      const page = await deps.docs.get(actor, docId);
      if (!page.ok) return page;
      const out: DocTableData[] = [];
      for (const t of await store.docTables.forDoc(page.value.id)) {
        const r = await this.get(actor, t.id);
        if (r.ok) out.push(r.value);
      }
      return ok(out);
    },

    rename: (actor: Actor, tableId: string, title: string) =>
      changeTable(actor, tableId, "doc_table.renamed", async (repos, t) => {
        const v = title.trim().slice(0, 80);
        if (!v) return "Name the table.";
        await repos.docTables.update(t.id, { title: v, at: clock.now() });
        return { to: v };
      }),

    addColumn: (actor: Actor, tableId: string, raw: unknown) =>
      changeTable(actor, tableId, "doc_table.column_added", async (repos, t) => {
        const p = columnSchema.safeParse(raw);
        if (!p.success) return p.error.issues[0]?.message ?? "Check the column.";
        if (t.columns.length >= MAX_COLUMNS) return `Up to ${MAX_COLUMNS} columns.`;
        const options = p.data.type === "status" ? (p.data.options?.length ? p.data.options : ["Not started", "In progress", "Done"]) : p.data.type === "select" ? (p.data.options ?? []) : undefined;
        const col: DocTableColumn = { id: newId().slice(-12), name: p.data.name, type: p.data.type, ...(options ? { options } : {}) };
        await repos.docTables.update(t.id, { columns: [...t.columns, col], at: clock.now() });
        return { column: col.name, type: col.type };
      }),

    updateColumn: (actor: Actor, tableId: string, columnId: string, raw: unknown) =>
      changeTable(actor, tableId, "doc_table.column_changed", async (repos, t) => {
        const p = columnSchema.partial().safeParse(raw);
        if (!p.success) return p.error.issues[0]?.message ?? "Check the column.";
        const col = t.columns.find((c) => c.id === columnId);
        if (!col) return "That column isn't there any more.";
        const next = t.columns.map((c) => (c.id === columnId ? { ...c, ...(p.data.name ? { name: p.data.name } : {}), ...(p.data.options && (c.type === "status" || c.type === "select") ? { options: p.data.options } : {}) } : c));
        await repos.docTables.update(t.id, { columns: next, at: clock.now() });
        return { column: col.name };
      }),

    removeColumn: (actor: Actor, tableId: string, columnId: string) =>
      changeTable(actor, tableId, "doc_table.column_removed", async (repos, t) => {
        if (t.columns.length <= 1) return "A table keeps at least one column.";
        const col = t.columns.find((c) => c.id === columnId);
        if (!col) return "That column isn't there any more.";
        // The cells stay in the rows (nothing is deleted); they just aren't shown.
        await repos.docTables.update(t.id, { columns: t.columns.filter((c) => c.id !== columnId), at: clock.now() });
        return { column: col.name };
      }),

    addRow: (actor: Actor, tableId: string, cells: Record<string, unknown> = {}) =>
      changeTable(actor, tableId, "doc_table.row_added", async (repos, t) => {
        const rows = await repos.docTables.rows(t.id);
        if (rows.length >= MAX_ROWS) return `Up to ${MAX_ROWS} rows in one table. Start another table.`;
        const clean: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(cells)) {
          const col = t.columns.find((c) => c.id === k);
          const r = col ? checkCell(col, v) : null;
          if (r?.ok) clean[k] = r.value;
        }
        await repos.docTables.addRow({ id: newId(), tableId: t.id, position: (rows.at(-1)?.position ?? -1) + 1, cells: clean, createdById: actor.personId, at: clock.now() });
        return {};
      }),

    setCell: (actor: Actor, tableId: string, rowId: string, columnId: string, value: unknown) =>
      changeTable(actor, tableId, "doc_table.cell_changed", async (repos, t) => {
        const col = t.columns.find((c) => c.id === columnId);
        const row = (await repos.docTables.rows(t.id)).find((r) => r.id === rowId);
        if (!col || !row) return "That cell isn't there any more.";
        if (col.type === "person" && value) {
          const p = await repos.people.findById(String(value));
          if (!p || p.status !== "active") return "Pick someone on the team.";
        }
        const r = checkCell(col, value);
        if (!r.ok) return r.reason;
        await repos.docTables.updateRow(row.id, { ...row.cells, [col.id]: r.value }, actor.personId, clock.now());
        return { rowId, column: col.name };
      }),

    removeRow: (actor: Actor, tableId: string, rowId: string) =>
      changeTable(actor, tableId, "doc_table.row_removed", async (repos) => ((await repos.docTables.removeRow(rowId, clock.now())) ? { rowId } : "That row isn't there any more.")),

    /** The table's view (table, board, calendar) with its sort and filter: saved for everyone. */
    setView: (actor: Actor, tableId: string, raw: unknown) =>
      changeTable(actor, tableId, "doc_table.view_changed", async (repos, t) => {
        const p = viewSchema.safeParse(raw);
        if (!p.success) return "Check the view.";
        const v = p.data as DocTableView;
        const known = (id?: string) => !id || t.columns.some((c) => c.id === id);
        if (!known(v.groupBy) || !known(v.dateColumn) || !known(v.sort?.column) || !known(v.filter?.column)) return "That column isn't there any more.";
        await repos.docTables.update(t.id, { view: v, at: clock.now() });
        return { view: v.kind };
      }),
  };
}

export type DocTablesService = ReturnType<typeof createDocTablesService>;
