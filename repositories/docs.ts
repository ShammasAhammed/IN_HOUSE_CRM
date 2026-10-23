// Docs and wiki (Stage 9b.5).
import type { StorageProvider } from "@/lib/types";
export type DocRow = {
  id: string;
  title: string;
  body: string;
  parentId: string | null;
  clientId: string | null;
  clientName: string | null;
  position: number;
  version: number;
  /** HR slice 3: part of the training library, for a department or everyone. */
  training: boolean;
  departmentId: string | null;
  createdById: string | null;
  updatedByName: string | null;
  updatedAt: Date;
};
export type DocSummary = Omit<DocRow, "body"> & { excerpt: string };
export type DocVersionRow = { version: number; title: string; body: string; editedByName: string | null; createdAt: Date };

export type DocCommentRow = { id: string; docId: string; quote: string | null; body: string; authorId: string; authorName: string; resolvedAt: Date | null; resolvedByName: string | null; createdAt: Date };

export interface DocsRepository {
  /** Live docs, team ones plus those of these clients (all clients when `clientIds` is "all"). */
  list(clientIds: readonly string[] | "all", filter?: { search?: string; clientId?: string | null }): Promise<DocSummary[]>;
  findById(id: string): Promise<DocRow | null>;
  create(row: { id: string; title: string; body: string; parentId: string | null; clientId: string | null; position: number; createdById: string; training?: boolean; departmentId?: string | null }): Promise<void>;
  /** Marks a page as training (for a department, or everyone), or not. */
  setTraining(id: string, training: boolean, departmentId: string | null): Promise<void>;
  /** Training pages for a department (and everyone's), team pages only. */
  training(departmentId: string | null): Promise<Array<{ id: string; title: string; departmentId: string | null; updatedAt: Date }>>;
  /** Saves a new version only if `version` is still the latest (two people editing: the second is told). */
  update(id: string, expectedVersion: number, patch: { title: string; body: string; parentId: string | null; updatedById: string }): Promise<boolean>;
  remove(id: string, at: Date): Promise<void>;
  addVersion(row: { id: string; docId: string; version: number; title: string; body: string; editedById: string }): Promise<void>;
  versions(docId: string): Promise<DocVersionRow[]>;
  /** Stage 13.4: pictures in pages. */
  addFile(row: { id: string; docId: string; fileProvider: StorageProvider; fileLocation: string; fileId: string; contentType: string; size: number; createdById: string }): Promise<void>;
  file(id: string): Promise<{ id: string; docId: string; fileProvider: StorageProvider; fileId: string; contentType: string } | null>;
  /** Stage 13.4: the words of the page's database tables, for search. */
  setTableText(docId: string, text: string): Promise<void>;
  /** Stage 13.4: comments on a line of a page. */
  addComment(row: { id: string; docId: string; quote: string | null; body: string; authorId: string; at: Date }): Promise<void>;
  comments(docId: string): Promise<DocCommentRow[]>;
  comment(id: string): Promise<DocCommentRow | null>;
  resolveComment(id: string, by: string | null, at: Date | null): Promise<void>;
  removeComment(id: string, at: Date): Promise<void>;
  /** Live docs directly under this one. */
  children(id: string): Promise<Array<{ id: string; title: string }>>;
}
