import { and, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { clientCampaigns, clientFiles, clientKnowledge, people } from "@/db/schema";
import type { CampaignRecord, ClientFileRecord, KnowledgeRepository } from "@/repositories";
import type { Db } from "./connection";

export function knowledgeRepository(db: Db): KnowledgeRepository {
  const forClients = (column: typeof clientKnowledge.clientId | typeof clientCampaigns.clientId | typeof clientFiles.clientId, ids: readonly string[] | "all") =>
    ids === "all" ? undefined : inArray(column, [...ids]);

  function campaignRows(where: SQL | undefined): Promise<CampaignRecord[]> {
    return db
      .select({
        id: clientCampaigns.id,
        clientId: clientCampaigns.clientId,
        name: clientCampaigns.name,
        period: clientCampaigns.period,
        whatWorked: clientCampaigns.whatWorked,
        whatToAvoid: clientCampaigns.whatToAvoid,
        createdByName: people.fullName,
        createdAt: clientCampaigns.createdAt,
      })
      .from(clientCampaigns)
      .leftJoin(people, eq(people.id, clientCampaigns.createdById))
      .where(and(isNull(clientCampaigns.deletedAt), where))
      .orderBy(desc(clientCampaigns.createdAt));
  }

  function fileRows(where: SQL | undefined): Promise<ClientFileRecord[]> {
    return db
      .select({
        id: clientFiles.id,
        clientId: clientFiles.clientId,
        kind: clientFiles.kind,
        title: clientFiles.title,
        provider: clientFiles.provider,
        location: clientFiles.location,
        fileId: clientFiles.fileId,
        fileName: clientFiles.fileName,
        contentType: clientFiles.contentType,
        sizeBytes: clientFiles.sizeBytes,
        addedByName: people.fullName,
        createdAt: clientFiles.createdAt,
      })
      .from(clientFiles)
      .leftJoin(people, eq(people.id, clientFiles.addedById))
      .where(and(isNull(clientFiles.deletedAt), where))
      .orderBy(desc(clientFiles.createdAt));
  }

  return {
    async list(ids) {
      if (ids !== "all" && ids.length === 0) return { knowledge: [], campaigns: [], files: [] };
      const editor = alias(people, "knowledge_editor");
      const [knowledge, campaigns, files] = await Promise.all([
        db
          .select({ clientId: clientKnowledge.clientId, tone: clientKnowledge.tone, dos: clientKnowledge.dos, donts: clientKnowledge.donts, brandColours: clientKnowledge.brandColours, version: clientKnowledge.version, updatedByName: editor.fullName, updatedAt: clientKnowledge.updatedAt })
          .from(clientKnowledge)
          .leftJoin(editor, eq(editor.id, clientKnowledge.updatedById))
          .where(forClients(clientKnowledge.clientId, ids)),
        campaignRows(forClients(clientCampaigns.clientId, ids)),
        fileRows(forClients(clientFiles.clientId, ids)),
      ]);
      return { knowledge, campaigns, files };
    },
    async saveKnowledge(row, expectedVersion, at) {
      if (expectedVersion === 0) {
        const r = await db.insert(clientKnowledge).values({ ...row, createdAt: at, updatedAt: at }).onConflictDoNothing().returning({ v: clientKnowledge.version });
        return r.length > 0;
      }
      const r = await db
        .update(clientKnowledge)
        .set({ tone: row.tone, dos: row.dos, donts: row.donts, brandColours: row.brandColours, updatedById: row.updatedById, updatedAt: at, version: sql`${clientKnowledge.version} + 1` })
        .where(and(eq(clientKnowledge.clientId, row.clientId), eq(clientKnowledge.version, expectedVersion)))
        .returning({ v: clientKnowledge.version });
      return r.length > 0;
    },
    async findCampaign(id) {
      const [r] = await campaignRows(eq(clientCampaigns.id, id));
      return r ?? null;
    },
    async addCampaign(row) {
      await db.insert(clientCampaigns).values(row);
    },
    async removeCampaign(id, at) {
      const r = await db.update(clientCampaigns).set({ deletedAt: at }).where(and(eq(clientCampaigns.id, id), isNull(clientCampaigns.deletedAt))).returning({ id: clientCampaigns.id });
      return r.length > 0;
    },
    async findFile(id) {
      const [r] = await fileRows(eq(clientFiles.id, id));
      return r ?? null;
    },
    async addFile(row) {
      await db.insert(clientFiles).values(row);
    },
    async removeFile(id, at) {
      const r = await db.update(clientFiles).set({ deletedAt: at }).where(and(eq(clientFiles.id, id), isNull(clientFiles.deletedAt))).returning({ id: clientFiles.id });
      return r.length > 0;
    },
  };
}
