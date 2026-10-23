import { and, asc, eq, isNull } from "drizzle-orm";
import { docTableRows, docTables } from "@/db/schema";
import type { DocTableRecord, DocTablesRepository } from "@/repositories";
import type { Db } from "./connection";

const cols = { id: docTables.id, docId: docTables.docId, title: docTables.title, columns: docTables.columns, view: docTables.view, createdAt: docTables.createdAt, updatedAt: docTables.updatedAt };

export function docTablesRepository(db: Db): DocTablesRepository {
  return {
    async create({ at, ...row }) {
      await db.insert(docTables).values({ ...row, createdAt: at, updatedAt: at });
    },
    async find(id) {
      const [r] = await db.select(cols).from(docTables).where(and(eq(docTables.id, id), isNull(docTables.deletedAt)));
      return (r as DocTableRecord | undefined) ?? null;
    },
    forDoc(docId) {
      return db.select(cols).from(docTables).where(and(eq(docTables.docId, docId), isNull(docTables.deletedAt))).orderBy(asc(docTables.createdAt)) as Promise<DocTableRecord[]>;
    },
    async update(id, { at, ...patch }) {
      await db.update(docTables).set({ ...patch, updatedAt: at }).where(eq(docTables.id, id));
    },
    rows(tableId) {
      return db
        .select({ id: docTableRows.id, tableId: docTableRows.tableId, position: docTableRows.position, cells: docTableRows.cells, updatedAt: docTableRows.updatedAt })
        .from(docTableRows)
        .where(and(eq(docTableRows.tableId, tableId), isNull(docTableRows.deletedAt)))
        .orderBy(asc(docTableRows.position), asc(docTableRows.createdAt));
    },
    async addRow({ at, ...row }) {
      await db.insert(docTableRows).values({ ...row, createdAt: at, updatedAt: at });
    },
    async updateRow(id, cells, by, at) {
      await db.update(docTableRows).set({ cells, updatedById: by, updatedAt: at }).where(eq(docTableRows.id, id));
    },
    async removeRow(id, at) {
      const r = await db.update(docTableRows).set({ deletedAt: at }).where(and(eq(docTableRows.id, id), isNull(docTableRows.deletedAt))).returning({ id: docTableRows.id });
      return r.length > 0;
    },
  };
}
