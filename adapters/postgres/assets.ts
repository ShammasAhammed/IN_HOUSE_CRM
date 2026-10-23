import { and, ilike, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { assetComments, assets, assetVersions, clientContacts, clientMembers, clients, people, portalUsers, projects, tasks } from "@/db/schema";
import type { ApprovalState } from "@/lib/types";
import type { AssetRecord, AssetScope, AssetsRepository, AssetSummary } from "@/repositories";
import type { Db } from "./connection";
import { liveMember, notHiddenFrom, q } from "./sql";

function scopeCondition(scope: AssetScope): SQL {
  if (scope.kind === "all") return scope.viewerId ? notHiddenFrom(assets.clientId, scope.viewerId) : sql`true`;
  if (scope.kind === "none") return sql`false`;
  const mine = sql`(${q(tasks.ownerId)} = ${scope.personId} or ${q(tasks.reviewerId)} = ${scope.personId} or ${q(assets.createdById)} = ${scope.personId})`;
  if (scope.kind === "own") return sql`${mine} and ${notHiddenFrom(assets.clientId, scope.personId)}`;
  return sql`(${mine} or ${q(assets.clientId)} in (select ${q(clientMembers.clientId)} from ${clientMembers}
    where ${q(clientMembers.personId)} = ${scope.personId} and ${liveMember('"client_members"')})) and ${notHiddenFrom(assets.clientId, scope.personId)}`;
}

const summaryColumns = {
  id: assets.id,
  title: assets.title,
  kind: assets.kind,
  approvalState: assets.approvalState,
  currentVersion: assets.currentVersion,
  clientId: assets.clientId,
  clientName: clients.name,
  projectName: projects.name,
  taskId: assets.taskId,
  taskTitle: tasks.title,
  updatedAt: assets.updatedAt,
};

const approver = alias(people, "approver");
const author = alias(people, "author");
const uploader = alias(people, "uploader");

export function assetsRepository(db: Db): AssetsRepository {
  const summaries = () =>
    db
      .select(summaryColumns)
      .from(assets)
      .innerJoin(clients, eq(clients.id, assets.clientId))
      .leftJoin(projects, eq(projects.id, assets.projectId))
      .leftJoin(tasks, and(eq(tasks.id, assets.taskId), isNull(tasks.deletedAt)));

  return {
    async listForClient(clientId, limit) {
      const rows = await summaries()
        .where(and(eq(assets.clientId, clientId), isNull(assets.deletedAt)))
        .orderBy(desc(assets.updatedAt))
        .limit(limit);
      return rows as AssetSummary[];
    },

    async list(f) {
      const rows = await summaries()
        .where(
          and(
            isNull(assets.deletedAt),
            scopeCondition(f.scope),
            f.clientId ? eq(assets.clientId, f.clientId) : undefined,
            f.taskId ? eq(assets.taskId, f.taskId) : undefined,
            f.states?.length ? inArray(assets.approvalState, [...f.states]) : undefined,
            f.search ? ilike(assets.title, `%${f.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`) : undefined,
          ),
        )
        .orderBy(desc(assets.updatedAt), desc(assets.id))
        .limit(f.limit ?? 200);
      return rows as AssetSummary[];
    },

    async countByState(f) {
      const rows = await db
        .select({ state: assets.approvalState, n: sql<number>`count(*)::int` })
        .from(assets)
        .leftJoin(tasks, and(eq(tasks.id, assets.taskId), isNull(tasks.deletedAt)))
        .where(and(isNull(assets.deletedAt), scopeCondition(f.scope), f.clientId ? eq(assets.clientId, f.clientId) : undefined))
        .groupBy(assets.approvalState);
      return Object.fromEntries(rows.map((r) => [r.state, r.n])) as Partial<Record<ApprovalState, number>>;
    },

    async findById(id, scope) {
      const [row] = await db
        .select({
          ...summaryColumns,
          projectId: assets.projectId,
          clientIsInternal: clients.isInternal,
          taskOwnerId: tasks.ownerId,
          taskReviewerId: tasks.reviewerId,
          approvedVersionId: assets.approvedVersionId,
          approvedByName: approver.fullName,
          approvedAt: assets.approvedAt,
          createdById: assets.createdById,
          createdAt: assets.createdAt,
        })
        .from(assets)
        .innerJoin(clients, eq(clients.id, assets.clientId))
        .leftJoin(projects, eq(projects.id, assets.projectId))
        .leftJoin(tasks, and(eq(tasks.id, assets.taskId), isNull(tasks.deletedAt)))
        .leftJoin(approver, eq(approver.id, assets.approvedById))
        .where(and(eq(assets.id, id), isNull(assets.deletedAt), scopeCondition(scope)))
        .limit(1);
      return (row as AssetRecord | undefined) ?? null;
    },

    async lockForUpdate(id) {
      await db.execute(sql`select 1 from ${assets} where ${q(assets.id)} = ${id} for update`);
    },

    async create(id, asset) {
      await db.insert(assets).values({ id, ...asset });
    },

    async update(id, patch) {
      await db.update(assets).set({ ...patch, updatedAt: new Date() }).where(eq(assets.id, id));
    },

    async listVersions(assetId) {
      return db
        .select({
          id: assetVersions.id,
          assetId: assetVersions.assetId,
          version: assetVersions.version,
          provider: assetVersions.storageProvider,
          location: assetVersions.storageLocation,
          fileId: assetVersions.storageFileId,
          fileName: assetVersions.fileName,
          mimeType: assetVersions.mimeType,
          sizeBytes: assetVersions.sizeBytes,
          note: assetVersions.note,
          uploadedByName: uploader.fullName,
          createdAt: assetVersions.createdAt,
        })
        .from(assetVersions)
        .leftJoin(uploader, eq(uploader.id, assetVersions.uploadedById))
        .where(and(eq(assetVersions.assetId, assetId), isNull(assetVersions.deletedAt)))
        .orderBy(desc(assetVersions.version));
    },

    async addVersion(id, v) {
      await db.insert(assetVersions).values({
        id,
        assetId: v.assetId,
        version: v.version,
        storageProvider: v.provider,
        storageLocation: v.location,
        storageFileId: v.fileId,
        fileName: v.fileName,
        mimeType: v.mimeType,
        sizeBytes: v.sizeBytes,
        note: v.note,
        uploadedById: v.uploadedById,
      });
    },

    async listComments(assetId) {
      return db
        .select({
          id: assetComments.id,
          versionId: assetComments.versionId,
          authorId: assetComments.authorId,
          portalUserId: assetComments.portalUserId,
          authorName: sql<string>`coalesce(${author.fullName}, ${clientContacts.name} || ' (client)')`,
          action: assetComments.action,
          body: assetComments.body,
          atSeconds: assetComments.atSeconds,
          createdAt: assetComments.createdAt,
        })
        .from(assetComments)
        .leftJoin(author, eq(author.id, assetComments.authorId))
        .leftJoin(portalUsers, eq(portalUsers.id, assetComments.portalUserId))
        .leftJoin(clientContacts, eq(clientContacts.id, portalUsers.contactId))
        .where(and(eq(assetComments.assetId, assetId), isNull(assetComments.deletedAt)))
        .orderBy(asc(assetComments.createdAt), asc(assetComments.id));
    },

    async addComment(row) {
      await db.insert(assetComments).values(row);
    },
  };
}
