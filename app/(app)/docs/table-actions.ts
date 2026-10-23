"use server";

// Database tables inside pages (Stage 13.4).
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import type { DocTableData } from "@/services/doc-tables";

type Done = { ok: true } | { ok: false; message: string };
const done = (r: { ok: boolean; error?: { message: string } }): Done => (r.ok ? { ok: true } : { ok: false, message: r.error!.message });

export async function getTableAction(tableId: string): Promise<{ ok: true; value: DocTableData } | { ok: false; message: string }> {
  const r = await getServices().docTables.get(await requireActor(), tableId);
  return r.ok ? { ok: true, value: JSON.parse(JSON.stringify(r.value)) as DocTableData } : { ok: false, message: r.error.message };
}
export async function setCellAction(tableId: string, rowId: string, columnId: string, value: unknown): Promise<Done> {
  return done(await getServices().docTables.setCell(await requireActor(), tableId, rowId, columnId, value));
}
export async function addRowAction(tableId: string, cells: Record<string, unknown> = {}): Promise<Done> {
  return done(await getServices().docTables.addRow(await requireActor(), tableId, cells));
}
export async function removeRowAction(tableId: string, rowId: string): Promise<Done> {
  return done(await getServices().docTables.removeRow(await requireActor(), tableId, rowId));
}
export async function addColumnAction(tableId: string, column: { name: string; type: string; options?: string[] }): Promise<Done> {
  return done(await getServices().docTables.addColumn(await requireActor(), tableId, column));
}
export async function updateColumnAction(tableId: string, columnId: string, patch: { name?: string; options?: string[] }): Promise<Done> {
  return done(await getServices().docTables.updateColumn(await requireActor(), tableId, columnId, patch));
}
export async function removeColumnAction(tableId: string, columnId: string): Promise<Done> {
  return done(await getServices().docTables.removeColumn(await requireActor(), tableId, columnId));
}
export async function setViewAction(tableId: string, view: unknown): Promise<Done> {
  return done(await getServices().docTables.setView(await requireActor(), tableId, view));
}
export async function renameTableAction(tableId: string, title: string): Promise<Done> {
  return done(await getServices().docTables.rename(await requireActor(), tableId, title));
}
