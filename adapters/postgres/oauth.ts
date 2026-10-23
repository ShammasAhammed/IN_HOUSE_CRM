import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { mcpConnections, oauthClients, oauthCodes, people } from "@/db/schema";
import type { McpConnectionRecord, OAuthRepository } from "@/repositories";
import type { Db } from "./connection";

export function oauthRepository(db: Db): OAuthRepository {
  const live = (at: Date) => and(isNull(mcpConnections.revokedAt), gt(mcpConnections.refreshExpiresAt, at));
  const listing = () =>
    db
      .select({
        id: mcpConnections.id,
        clientName: oauthClients.name,
        personId: mcpConnections.personId,
        personName: people.fullName,
        createdAt: mcpConnections.createdAt,
        lastUsedAt: mcpConnections.lastUsedAt,
        refreshExpiresAt: mcpConnections.refreshExpiresAt,
      })
      .from(mcpConnections)
      .innerJoin(oauthClients, eq(oauthClients.id, mcpConnections.clientId))
      .innerJoin(people, eq(people.id, mcpConnections.personId));

  return {
    async createClient(c) {
      await db.insert(oauthClients).values(c);
    },
    async findClient(clientId) {
      const [row] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).limit(1);
      return row ?? null;
    },
    async createCode(c) {
      await db.insert(oauthCodes).values(c);
    },
    async takeCode(codeHash, at) {
      const [row] = await db
        .update(oauthCodes)
        .set({ usedAt: at })
        .where(and(eq(oauthCodes.codeHash, codeHash), isNull(oauthCodes.usedAt), gt(oauthCodes.expiresAt, at)))
        .returning({ clientId: oauthCodes.clientId, personId: oauthCodes.personId, redirectUri: oauthCodes.redirectUri, codeChallenge: oauthCodes.codeChallenge, resource: oauthCodes.resource });
      return row ?? null;
    },
    async createConnection(c) {
      await db.insert(mcpConnections).values(c);
    },
    async findByAccess(accessHash, at) {
      const [row] = await db
        .select({ id: mcpConnections.id, personId: mcpConnections.personId, clientName: oauthClients.name })
        .from(mcpConnections)
        .innerJoin(oauthClients, eq(oauthClients.id, mcpConnections.clientId))
        .where(and(eq(mcpConnections.accessHash, accessHash), isNull(mcpConnections.revokedAt), gt(mcpConnections.accessExpiresAt, at)))
        .limit(1);
      return row ?? null;
    },
    async rotate(refreshHash, next, at) {
      const [row] = await db
        .update(mcpConnections)
        .set(next)
        .where(and(eq(mcpConnections.refreshHash, refreshHash), live(at)))
        .returning({ id: mcpConnections.id, personId: mcpConnections.personId, clientId: mcpConnections.clientId });
      return row ?? null;
    },
    async touch(connectionId, at) {
      await db.update(mcpConnections).set({ lastUsedAt: at }).where(eq(mcpConnections.id, connectionId));
    },
    async listLive(at, personId) {
      const rows = await listing()
        .where(and(live(at), personId ? eq(mcpConnections.personId, personId) : undefined))
        .orderBy(desc(mcpConnections.createdAt));
      return rows as McpConnectionRecord[];
    },
    async findLive(connectionId, at) {
      const [row] = await listing()
        .where(and(eq(mcpConnections.id, connectionId), live(at)))
        .limit(1);
      return (row as McpConnectionRecord | undefined) ?? null;
    },
    async revoke(connectionId, at) {
      await db.update(mcpConnections).set({ revokedAt: at }).where(eq(mcpConnections.id, connectionId));
    },
  };
}
