// Database tables inside pages (Stage 13.4).
import type { DocTableColumn, DocTableView } from "@/lib/types";

export type DocTableRecord = { id: string; docId: string; title: string; columns: DocTableColumn[]; view: DocTableView; createdAt: Date; updatedAt: Date };
export type DocTableRow = { id: string; tableId: string; position: number; cells: Record<string, unknown>; updatedAt: Date };

export interface DocTablesRepository {
  create(row: { id: string; docId: string; title: string; columns: DocTableColumn[]; view: DocTableView; createdById: string; at: Date }): Promise<void>;
  find(id: string): Promise<DocTableRecord | null>;
  forDoc(docId: string): Promise<DocTableRecord[]>;
  update(id: string, patch: Partial<Pick<DocTableRecord, "title" | "columns" | "view">> & { at: Date }): Promise<void>;
  rows(tableId: string): Promise<DocTableRow[]>;
  addRow(row: { id: string; tableId: string; position: number; cells: Record<string, unknown>; createdById: string; at: Date }): Promise<void>;
  updateRow(id: string, cells: Record<string, unknown>, by: string, at: Date): Promise<void>;
  removeRow(id: string, at: Date): Promise<boolean>;
}
