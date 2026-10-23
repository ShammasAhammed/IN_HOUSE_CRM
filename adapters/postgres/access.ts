import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { accessGrants, checklistItems, clients, people } from "@/db/schema";
import type { AccessRepository } from "@/repositories";
import type { Db } from "./connection";
import { q } from "./sql";

const grantColumns = {
  id: accessGrants.id,
  personId: accessGrants.personId,
  system: accessGrants.system,
  account: accessGrants.account,
  clientId: accessGrants.clientId,
  clientName: clients.name,
  level: accessGrants.level,
  grantedOn: accessGrants.grantedOn,
  revokedOn: accessGrants.revokedOn,
  notes: accessGrants.notes,
};

const itemColumns = {
  id: checklistItems.id,
  personId: checklistItems.personId,
  kind: checklistItems.kind,
  title: checklistItems.title,
  position: checklistItems.position,
  source: checklistItems.source,
  doneAt: checklistItems.doneAt,
  doneByName: people.fullName,
};

export function accessRepository(db: Db): AccessRepository {
  const grants = () => db.select(grantColumns).from(accessGrants).leftJoin(clients, eq(clients.id, accessGrants.clientId));
  const items = () => db.select(itemColumns).from(checklistItems).leftJoin(people, eq(people.id, checklistItems.doneById));
  return {
    async listGrants(personId) {
      return grants()
        .where(and(eq(accessGrants.personId, personId), isNull(accessGrants.deletedAt)))
        .orderBy(sql`${q(accessGrants.revokedOn)} is not null`, asc(accessGrants.system), asc(accessGrants.account));
    },
    async findGrant(id) {
      const [row] = await grants().where(and(eq(accessGrants.id, id), isNull(accessGrants.deletedAt))).limit(1);
      return row ?? null;
    },
    async createGrant(id, grant) {
      await db.insert(accessGrants).values({ id, ...grant });
    },
    async updateGrant(id, patch) {
      await db.update(accessGrants).set({ ...patch, updatedAt: new Date() }).where(eq(accessGrants.id, id));
    },
    async listItems(personId) {
      return items()
        .where(and(eq(checklistItems.personId, personId), isNull(checklistItems.deletedAt)))
        .orderBy(asc(checklistItems.kind), asc(checklistItems.position));
    },
    async findItem(id) {
      const [row] = await items().where(and(eq(checklistItems.id, id), isNull(checklistItems.deletedAt))).limit(1);
      return row ?? null;
    },
    async createItems(rows) {
      if (rows.length) await db.insert(checklistItems).values(rows);
    },
    async updateItem(id, patch) {
      await db.update(checklistItems).set({ ...patch, updatedAt: new Date() }).where(eq(checklistItems.id, id));
    },
  };
}
