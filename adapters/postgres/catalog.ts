import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { serviceStages, serviceTaskTemplates, services } from "@/db/schema";
import type { CatalogRepository } from "@/repositories";
import type { Db } from "./connection";

const serviceColumns = { id: services.id, key: services.key, name: services.name, description: services.description, active: services.active, position: services.position };

export function catalogRepository(db: Db): CatalogRepository {
  return {
    async listServices(opts) {
      return db
        .select(serviceColumns)
        .from(services)
        .where(and(isNull(services.deletedAt), opts.activeOnly ? eq(services.active, true) : undefined))
        .orderBy(asc(services.position), asc(services.name));
    },
    async findServiceByKey(key) {
      const [row] = await db.select(serviceColumns).from(services).where(and(eq(services.key, key), isNull(services.deletedAt))).limit(1);
      return row ?? null;
    },
    async createService(id, s) {
      await db.insert(services).values({ id, ...s });
    },
    async updateService(id, patch) {
      await db.update(services).set({ ...patch, updatedAt: new Date() }).where(eq(services.id, id));
    },
    async listStages(serviceIds) {
      if (serviceIds.length === 0) return [];
      return db
        .select({ id: serviceStages.id, serviceId: serviceStages.serviceId, name: serviceStages.name, position: serviceStages.position })
        .from(serviceStages)
        .where(and(inArray(serviceStages.serviceId, [...serviceIds]), isNull(serviceStages.deletedAt)))
        .orderBy(asc(serviceStages.serviceId), asc(serviceStages.position));
    },
    async createStage(id, s) {
      await db.insert(serviceStages).values({ id, ...s });
    },
    async updateStage(id, patch) {
      await db.update(serviceStages).set({ ...patch, updatedAt: new Date() }).where(eq(serviceStages.id, id));
    },
    async listTemplates(serviceIds) {
      if (serviceIds.length === 0) return [];
      return db
        .select({
          id: serviceTaskTemplates.id,
          serviceId: serviceTaskTemplates.serviceId,
          title: serviceTaskTemplates.title,
          stagePosition: serviceTaskTemplates.stagePosition,
          dueOffsetDays: serviceTaskTemplates.dueOffsetDays,
          estimateMinutes: serviceTaskTemplates.estimateMinutes,
          defaultRole: serviceTaskTemplates.defaultRole,
          position: serviceTaskTemplates.position,
        })
        .from(serviceTaskTemplates)
        .where(and(inArray(serviceTaskTemplates.serviceId, [...serviceIds]), isNull(serviceTaskTemplates.deletedAt)))
        .orderBy(asc(serviceTaskTemplates.serviceId), asc(serviceTaskTemplates.position));
    },
    async createTemplate(id, t) {
      await db.insert(serviceTaskTemplates).values({ id, ...t });
    },
    async updateTemplate(id, patch) {
      await db.update(serviceTaskTemplates).set({ ...patch, updatedAt: new Date() }).where(eq(serviceTaskTemplates.id, id));
    },
  };
}
