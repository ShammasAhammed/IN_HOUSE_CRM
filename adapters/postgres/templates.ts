import { and, count, desc, eq, isNull, or } from "drizzle-orm";
import { galleryTemplates, galleryUses, people, presets } from "@/db/schema";
import type { GalleryTemplateRecord, PresetRecord, TemplatesRepository } from "@/repositories";
import type { Db } from "./connection";

const fields = {
  id: galleryTemplates.id,
  kind: galleryTemplates.kind,
  name: galleryTemplates.name,
  description: galleryTemplates.description,
  tags: galleryTemplates.tags,
  scope: galleryTemplates.scope,
  ownerId: galleryTemplates.ownerId,
  ownerName: people.fullName,
  approved: galleryTemplates.approved,
  thumbnail: galleryTemplates.thumbnail,
  preview: galleryTemplates.preview,
  createdAt: galleryTemplates.createdAt,
  updatedAt: galleryTemplates.updatedAt,
};
const presetFields = { id: presets.id, kind: presets.kind, name: presets.name, value: presets.value, scope: presets.scope, ownerId: presets.ownerId, createdAt: presets.createdAt };

export function templatesRepository(db: Db): TemplatesRepository {
  return {
    async create({ at, ...row }) {
      await db.insert(galleryTemplates).values({ ...row, createdAt: at, updatedAt: at });
    },
    async find(id) {
      const [r] = await db
        .select({ ...fields, content: galleryTemplates.content })
        .from(galleryTemplates)
        .leftJoin(people, eq(people.id, galleryTemplates.ownerId))
        .where(and(eq(galleryTemplates.id, id), isNull(galleryTemplates.deletedAt)));
      return r ?? null;
    },
    list({ personId, kind }) {
      return db
        .select(fields)
        .from(galleryTemplates)
        .leftJoin(people, eq(people.id, galleryTemplates.ownerId))
        .where(and(isNull(galleryTemplates.deletedAt), kind ? eq(galleryTemplates.kind, kind) : undefined, or(eq(galleryTemplates.scope, "company"), eq(galleryTemplates.ownerId, personId))))
        .orderBy(desc(galleryTemplates.createdAt))
        .limit(500) as Promise<GalleryTemplateRecord[]>;
    },
    async update(id, { at, ...patch }) {
      await db.update(galleryTemplates).set({ ...patch, updatedAt: at }).where(eq(galleryTemplates.id, id));
    },
    async remove(id, at) {
      await db.update(galleryTemplates).set({ deletedAt: at }).where(eq(galleryTemplates.id, id));
    },
    async addUse({ at, ...row }) {
      await db.insert(galleryUses).values({ ...row, createdAt: at });
    },
    async useCounts() {
      const rows = await db.select({ key: galleryUses.templateKey, n: count() }).from(galleryUses).groupBy(galleryUses.templateKey);
      return new Map(rows.map((r) => [r.key, Number(r.n)]));
    },
    async addPreset({ at, ...row }) {
      await db.insert(presets).values({ ...row, createdAt: at });
    },
    presets(personId) {
      return db
        .select(presetFields)
        .from(presets)
        .where(and(isNull(presets.deletedAt), or(eq(presets.scope, "company"), eq(presets.ownerId, personId))))
        .orderBy(presets.kind, presets.name) as Promise<PresetRecord[]>;
    },
    async preset(id) {
      const [r] = await db.select(presetFields).from(presets).where(and(eq(presets.id, id), isNull(presets.deletedAt)));
      return (r as PresetRecord | undefined) ?? null;
    },
    async removePreset(id, at) {
      await db.update(presets).set({ deletedAt: at }).where(eq(presets.id, id));
    },
  };
}
