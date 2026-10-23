import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { clients, docComments, docFiles, docs, docVersions, people } from "@/db/schema";
import type { DocsRepository } from "@/repositories";
import type { Db } from "./connection";

const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function docsRepository(db: Db): DocsRepository {
  const editor = alias(people, "doc_editor");
  return {
    async list(clientIds, filter = {}) {
      const scope: SQL | undefined = clientIds === "all" ? undefined : clientIds.length ? or(isNull(docs.clientId), inArray(docs.clientId, [...clientIds])) : isNull(docs.clientId);
      const rows = await db
        .select({
          id: docs.id,
          title: docs.title,
          parentId: docs.parentId,
          clientId: docs.clientId,
          clientName: clients.name,
          position: docs.position,
          version: docs.version,
          training: docs.training,
          departmentId: docs.departmentId,
          createdById: docs.createdById,
          updatedByName: editor.fullName,
          updatedAt: docs.updatedAt,
          excerpt: sql<string>`left(${docs.body}, 160)`,
        })
        .from(docs)
        .leftJoin(clients, eq(clients.id, docs.clientId))
        .leftJoin(editor, eq(editor.id, docs.updatedById))
        .where(
          and(
            isNull(docs.deletedAt),
            scope,
            filter.clientId === null ? isNull(docs.clientId) : filter.clientId ? eq(docs.clientId, filter.clientId) : undefined,
            // Matches the trigram index (migrations 0029, 0055), so a search never reads every page's text.
            filter.search ? sql`(${docs.title} || ' ' || ${docs.body} || ' ' || ${docs.tableText}) ilike ${like(filter.search)}` : undefined,
          ),
        )
        .orderBy(asc(docs.position), asc(docs.title))
        .limit(500);
      return rows;
    },
    async findById(id) {
      const [row] = await db
        .select({
          id: docs.id,
          title: docs.title,
          body: docs.body,
          parentId: docs.parentId,
          clientId: docs.clientId,
          clientName: clients.name,
          position: docs.position,
          version: docs.version,
          training: docs.training,
          departmentId: docs.departmentId,
          createdById: docs.createdById,
          updatedByName: editor.fullName,
          updatedAt: docs.updatedAt,
        })
        .from(docs)
        .leftJoin(clients, eq(clients.id, docs.clientId))
        .leftJoin(editor, eq(editor.id, docs.updatedById))
        .where(and(eq(docs.id, id), isNull(docs.deletedAt)))
        .limit(1);
      return row ?? null;
    },
    async create(row) {
      await db.insert(docs).values({ ...row, updatedById: row.createdById });
    },
    async update(id, expectedVersion, patch) {
      const r = await db
        .update(docs)
        .set({ ...patch, version: sql`${docs.version} + 1`, updatedAt: new Date() })
        .where(and(eq(docs.id, id), eq(docs.version, expectedVersion), isNull(docs.deletedAt)))
        .returning({ id: docs.id });
      return r.length > 0;
    },
    async setTraining(id, training, departmentId) {
      await db.update(docs).set({ training, departmentId: training ? departmentId : null }).where(eq(docs.id, id));
    },
    async training(departmentId) {
      return db
        .select({ id: docs.id, title: docs.title, departmentId: docs.departmentId, updatedAt: docs.updatedAt })
        .from(docs)
        .where(and(isNull(docs.deletedAt), isNull(docs.clientId), eq(docs.training, true), departmentId ? or(isNull(docs.departmentId), eq(docs.departmentId, departmentId)) : isNull(docs.departmentId)))
        .orderBy(asc(docs.title));
    },
    async remove(id, at) {
      await db.update(docs).set({ deletedAt: at }).where(eq(docs.id, id));
    },
    async addVersion(row) {
      await db.insert(docVersions).values(row);
    },
    async versions(docId) {
      return db
        .select({ version: docVersions.version, title: docVersions.title, body: docVersions.body, editedByName: people.fullName, createdAt: docVersions.createdAt })
        .from(docVersions)
        .leftJoin(people, eq(people.id, docVersions.editedById))
        .where(and(eq(docVersions.docId, docId), isNull(docVersions.deletedAt)))
        .orderBy(desc(docVersions.version))
        .limit(50);
    },
    async children(id) {
      return db.select({ id: docs.id, title: docs.title }).from(docs).where(and(eq(docs.parentId, id), isNull(docs.deletedAt))).orderBy(asc(docs.position), asc(docs.title));
    },
    async addFile(row) {
      await db.insert(docFiles).values(row);
    },
    async file(id) {
      const [r] = await db.select({ id: docFiles.id, docId: docFiles.docId, fileProvider: docFiles.fileProvider, fileId: docFiles.fileId, contentType: docFiles.contentType }).from(docFiles).where(eq(docFiles.id, id));
      return r ?? null;
    },
    async setTableText(docId, text) {
      await db.update(docs).set({ tableText: text.slice(0, 50_000) }).where(eq(docs.id, docId));
    },
    async addComment({ at, ...row }) {
      await db.insert(docComments).values({ ...row, createdAt: at });
    },
    comments(docId) {
      const resolver = alias(people, "comment_resolver");
      return db
        .select({ id: docComments.id, docId: docComments.docId, quote: docComments.quote, body: docComments.body, authorId: docComments.authorId, authorName: people.fullName, resolvedAt: docComments.resolvedAt, resolvedByName: resolver.fullName, createdAt: docComments.createdAt })
        .from(docComments)
        .innerJoin(people, eq(people.id, docComments.authorId))
        .leftJoin(resolver, eq(resolver.id, docComments.resolvedById))
        .where(and(eq(docComments.docId, docId), isNull(docComments.deletedAt)))
        .orderBy(asc(docComments.createdAt));
    },
    async comment(id) {
      const [r] = await db
        .select({ id: docComments.id, docId: docComments.docId, quote: docComments.quote, body: docComments.body, authorId: docComments.authorId, authorName: people.fullName, resolvedAt: docComments.resolvedAt, resolvedByName: sql<string | null>`null`, createdAt: docComments.createdAt })
        .from(docComments)
        .innerJoin(people, eq(people.id, docComments.authorId))
        .where(and(eq(docComments.id, id), isNull(docComments.deletedAt)));
      return r ?? null;
    },
    async resolveComment(id, by, at) {
      await db.update(docComments).set({ resolvedById: by, resolvedAt: at }).where(eq(docComments.id, id));
    },
    async removeComment(id, at) {
      await db.update(docComments).set({ deletedAt: at }).where(eq(docComments.id, id));
    },
  };
}
