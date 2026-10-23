import { and, desc, eq, gt, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { clientContacts, clients, people, portalLinkTokens, portalUsers } from "@/db/schema";
import type { PortalRepository, PortalUserRecord } from "@/repositories";
import type { Db } from "./connection";

export function portalRepository(db: Db): PortalRepository {
  function rows(where: SQL): Promise<PortalUserRecord[]> {
    const inviter = alias(people, "portal_inviter");
    return db
      .select({
        id: portalUsers.id,
        clientId: portalUsers.clientId,
        clientName: clients.name,
        clientLive: sql<boolean>`${clients.deletedAt} is null and not ${clients.isInternal}`,
        leadStrategistId: clients.leadStrategistId,
        contactId: portalUsers.contactId,
        contactName: clientContacts.name,
        contactEmail: sql<string | null>`case when ${clientContacts.deletedAt} is null then lower(${clientContacts.email}) end`,
        email: portalUsers.email,
        invitedByName: inviter.fullName,
        createdAt: portalUsers.createdAt,
        revokedAt: portalUsers.revokedAt,
        lastSignInAt: portalUsers.lastSignInAt,
        consentId: portalUsers.consentId,
      })
      .from(portalUsers)
      .innerJoin(clients, eq(clients.id, portalUsers.clientId))
      .innerJoin(clientContacts, eq(clientContacts.id, portalUsers.contactId))
      .innerJoin(inviter, eq(inviter.id, portalUsers.invitedById))
      .where(where)
      .orderBy(desc(portalUsers.createdAt));
  }
  return {
    async create(row) {
      const r = await db.insert(portalUsers).values({ ...row, email: row.email.toLowerCase() }).onConflictDoNothing().returning({ id: portalUsers.id });
      return r.length > 0;
    },
    async find(id) {
      const [r] = await rows(eq(portalUsers.id, id));
      return r ?? null;
    },
    async findByEmail(email) {
      const [r] = await rows(and(sql`lower(${portalUsers.email}) = ${email.trim().toLowerCase()}`, isNull(portalUsers.revokedAt))!);
      return r ?? null;
    },
    listForClient: (clientId) => rows(eq(portalUsers.clientId, clientId)),
    async revoke(id, byId, at) {
      const r = await db.update(portalUsers).set({ revokedAt: at, revokedById: byId }).where(and(eq(portalUsers.id, id), isNull(portalUsers.revokedAt))).returning({ id: portalUsers.id });
      return r.length > 0;
    },
    async touchSignIn(id, at) {
      await db.update(portalUsers).set({ lastSignInAt: at }).where(eq(portalUsers.id, id));
    },
    async setConsent(id, consentId) {
      await db.update(portalUsers).set({ consentId }).where(eq(portalUsers.id, id));
    },
    async addToken(row) {
      await db.insert(portalLinkTokens).values(row);
    },
    async useToken(tokenHash, at) {
      const [r] = await db
        .update(portalLinkTokens)
        .set({ usedAt: at })
        .where(and(eq(portalLinkTokens.tokenHash, tokenHash), isNull(portalLinkTokens.usedAt), gt(portalLinkTokens.expiresAt, at)))
        .returning({ portalUserId: portalLinkTokens.portalUserId });
      return r?.portalUserId ?? null;
    },
  };
}
