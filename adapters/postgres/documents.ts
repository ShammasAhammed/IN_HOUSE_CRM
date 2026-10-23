import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { people, personDocuments } from "@/db/schema";
import type { DocumentsRepository } from "@/repositories";
import type { Db } from "./connection";
import { q } from "./sql";

const columns = {
  id: personDocuments.id,
  personId: personDocuments.personId,
  kind: personDocuments.kind,
  title: personDocuments.title,
  idLast4: personDocuments.idLast4,
  provider: personDocuments.provider,
  location: personDocuments.location,
  fileId: personDocuments.fileId,
  fileName: personDocuments.fileName,
  contentType: personDocuments.contentType,
  sizeBytes: personDocuments.sizeBytes,
  expiresOn: personDocuments.expiresOn,
  uploadedByName: people.fullName,
  createdAt: personDocuments.createdAt,
};

export function documentsRepository(db: Db): DocumentsRepository {
  const select = () => db.select(columns).from(personDocuments).leftJoin(people, eq(people.id, personDocuments.uploadedById));
  return {
    async list(personId) {
      return select()
        .where(and(eq(personDocuments.personId, personId), isNull(personDocuments.deletedAt)))
        .orderBy(desc(personDocuments.createdAt), desc(personDocuments.id));
    },
    async find(id) {
      const [row] = await select().where(and(eq(personDocuments.id, id), isNull(personDocuments.deletedAt))).limit(1);
      return row ?? null;
    },
    async lockForUpdate(id) {
      await db.execute(sql`select 1 from ${personDocuments} where ${q(personDocuments.id)} = ${id} for update`);
      const [row] = await select().where(and(eq(personDocuments.id, id), isNull(personDocuments.deletedAt))).limit(1);
      return row ?? null;
    },
    async create(id, doc) {
      await db.insert(personDocuments).values({ id, ...doc });
    },
    async update(id, patch) {
      await db.update(personDocuments).set({ ...patch, updatedAt: new Date() }).where(eq(personDocuments.id, id));
    },
  };
}
