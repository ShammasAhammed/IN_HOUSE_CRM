// Settings: what Oppllo sells (D19) — services with their default stages (D20) and starter tasks. Owner only.
// Projects copy stages when they start, so edits here never rewrite existing projects.
// Stage positions stay 0, 1, 2 … with no gaps; starter tasks point at a stage by position and follow it when stages
// move or go.

import { newId } from "@/lib/id";
import { forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { parse } from "@/lib/validation/common";
import {
  addStageSchema,
  addTemplateSchema,
  createServiceSchema,
  moveServiceSchema,
  moveStageSchema,
  moveTemplateSchema,
  renameStageSchema,
  stageIdSchema,
  templateIdSchema,
  updateServiceSchema,
  updateTemplateSchema,
} from "@/lib/validation/catalog";
import type { DataStore, NewEvent, Repositories, ServiceRecord, ServiceStageRecord, TaskTemplateRecord } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, type Actor } from "./permissions";

export type ServiceSetup = ServiceRecord & { stages: ServiceStageRecord[]; templates: TaskTemplateRecord[] };

const DENIED = "Only the owner changes what Oppllo sells.";
/** Every new service starts with these stages (D20). */
export const DEFAULT_STAGES = ["Onboarding", "Strategy", "Production", "Live", "Reporting"];

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "service";

export function createCatalogService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;

  const event = (actor: Actor, serviceId: string, action: string, data: Record<string, unknown>): NewEvent => ({ actorId: actor.personId, action, entityType: "service", entityId: serviceId, data });

  async function service(repos: Repositories, serviceId: string) {
    return (await repos.catalog.listServices({ activeOnly: false })).find((s) => s.id === serviceId) ?? null;
  }
  async function stageById(repos: Repositories, stageId: string) {
    const all = await repos.catalog.listStages((await repos.catalog.listServices({ activeOnly: false })).map((s) => s.id));
    const stage = all.find((s) => s.id === stageId);
    return stage ? { stage, siblings: all.filter((s) => s.serviceId === stage.serviceId) } : null;
  }
  async function templateById(repos: Repositories, templateId: string) {
    const all = await repos.catalog.listTemplates((await repos.catalog.listServices({ activeOnly: false })).map((s) => s.id));
    const template = all.find((t) => t.id === templateId);
    return template ? { template, siblings: all.filter((t) => t.serviceId === template.serviceId) } : null;
  }
  /** Swap a row with its neighbour; positions are an index, so moving is a swap. */
  const neighbour = <T extends { position: number }>(rows: T[], row: T, direction: "up" | "down") => rows.find((r) => r.position === row.position + (direction === "up" ? -1 : 1));

  return {
    async overview(actor: Actor): Promise<Result<ServiceSetup[]>> {
      if (!can(actor, "settings.manage")) return forbidden(DENIED);
      const services = await store.catalog.listServices({ activeOnly: false });
      const ids = services.map((s) => s.id);
      const [stages, templates] = await Promise.all([store.catalog.listStages(ids), store.catalog.listTemplates(ids)]);
      return ok(services.map((s) => ({ ...s, stages: stages.filter((x) => x.serviceId === s.id), templates: templates.filter((t) => t.serviceId === s.id) })));
    },

    async createService(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "settings.manage")) return forbidden(DENIED);
      const parsed = parse(createServiceSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        const all = await repos.catalog.listServices({ activeOnly: false });
        if (all.some((s) => s.name.toLowerCase() === parsed.value.name.toLowerCase())) return invalid("There's already a service with that name.", { name: ["There's already a service with that name."] });
        let key = slug(parsed.value.name);
        for (let n = 2; await repos.catalog.findServiceByKey(key); n++) key = `${slug(parsed.value.name)}_${n}`;
        const id = newId();
        await repos.catalog.createService(id, { key, name: parsed.value.name, description: parsed.value.description, active: true, position: all.length });
        for (const [position, name] of DEFAULT_STAGES.entries()) await repos.catalog.createStage(newId(), { serviceId: id, name, position });
        return change({ id }, event(actor, id, "service.created", { name: parsed.value.name }));
      });
    },

    async updateService(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "settings.manage")) return forbidden(DENIED);
      const parsed = parse(updateServiceSchema, raw);
      if (!parsed.ok) return parsed;
      const { serviceId, ...input } = parsed.value;
      return commit(store, async (repos) => {
        const before = await service(repos, serviceId);
        if (!before) return notFound("That service");
        const all = await repos.catalog.listServices({ activeOnly: false });
        if (all.some((s) => s.id !== serviceId && s.name.toLowerCase() === input.name.toLowerCase())) return invalid("There's already a service with that name.", { name: ["There's already a service with that name."] });
        const fields = (Object.keys(input) as Array<keyof typeof input>).filter((k) => input[k] !== before[k]);
        if (fields.length === 0) return noChange({ id: serviceId });
        await repos.catalog.updateService(serviceId, input);
        // Retiring hides it from new engagements; existing engagements keep it.
        return change({ id: serviceId }, event(actor, serviceId, input.active !== before.active ? (input.active ? "service.reactivated" : "service.retired") : "service.updated", { name: input.name, fields }));
      });
    },

    async moveService(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "settings.manage")) return forbidden(DENIED);
      const parsed = parse(moveServiceSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        // Renumber first so positions are an index even if older data had gaps.
        const all = (await repos.catalog.listServices({ activeOnly: false })).map((s, position) => ({ ...s, position }));
        const row = all.find((s) => s.id === parsed.value.serviceId);
        if (!row) return notFound("That service");
        const other = neighbour(all, row, parsed.value.direction);
        if (!other) return noChange({ id: row.id });
        [row.position, other.position] = [other.position, row.position];
        for (const s of all) await repos.catalog.updateService(s.id, { position: s.position });
        return change({ id: row.id }, event(actor, row.id, "service.moved", { name: row.name, direction: parsed.value.direction }));
      });
    },

    async addStage(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "settings.manage")) return forbidden(DENIED);
      const parsed = parse(addStageSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        const s = await service(repos, parsed.value.serviceId);
        if (!s) return notFound("That service");
        const stages = await repos.catalog.listStages([s.id]);
        const id = newId();
        await repos.catalog.createStage(id, { serviceId: s.id, name: parsed.value.name, position: stages.length });
        return change({ id }, event(actor, s.id, "service.stage_added", { name: parsed.value.name }));
      });
    },

    async renameStage(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "settings.manage")) return forbidden(DENIED);
      const parsed = parse(renameStageSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        const found = await stageById(repos, parsed.value.stageId);
        if (!found) return notFound("That stage");
        if (found.stage.name === parsed.value.name) return noChange({ id: found.stage.id });
        await repos.catalog.updateStage(found.stage.id, { name: parsed.value.name });
        return change({ id: found.stage.id }, event(actor, found.stage.serviceId, "service.stage_renamed", { from: found.stage.name, to: parsed.value.name }));
      });
    },

    async moveStage(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "settings.manage")) return forbidden(DENIED);
      const parsed = parse(moveStageSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        const found = await stageById(repos, parsed.value.stageId);
        if (!found) return notFound("That stage");
        const { stage, siblings } = found;
        const other = neighbour(siblings, stage, parsed.value.direction);
        if (!other) return noChange({ id: stage.id });
        await repos.catalog.updateStage(stage.id, { position: other.position });
        await repos.catalog.updateStage(other.id, { position: stage.position });
        // Starter tasks follow their stage.
        for (const t of await repos.catalog.listTemplates([stage.serviceId])) {
          if (t.stagePosition === stage.position) await repos.catalog.updateTemplate(t.id, { stagePosition: other.position });
          else if (t.stagePosition === other.position) await repos.catalog.updateTemplate(t.id, { stagePosition: stage.position });
        }
        return change({ id: stage.id }, event(actor, stage.serviceId, "service.stage_moved", { name: stage.name, direction: parsed.value.direction }));
      });
    },

    async removeStage(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "settings.manage")) return forbidden(DENIED);
      const parsed = parse(stageIdSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        const found = await stageById(repos, parsed.value.stageId);
        if (!found) return notFound("That stage");
        const { stage, siblings } = found;
        await repos.catalog.updateStage(stage.id, { deletedAt: clock.now() });
        for (const s of siblings.filter((x) => x.position > stage.position)) await repos.catalog.updateStage(s.id, { position: s.position - 1 });
        // Starter tasks on it lose their stage; later ones shift with their stage.
        for (const t of await repos.catalog.listTemplates([stage.serviceId])) {
          if (t.stagePosition === stage.position) await repos.catalog.updateTemplate(t.id, { stagePosition: null });
          else if (t.stagePosition !== null && t.stagePosition > stage.position) await repos.catalog.updateTemplate(t.id, { stagePosition: t.stagePosition - 1 });
        }
        return change({ id: stage.id }, event(actor, stage.serviceId, "service.stage_removed", { name: stage.name }));
      });
    },

    async addTemplate(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "settings.manage")) return forbidden(DENIED);
      const parsed = parse(addTemplateSchema, raw);
      if (!parsed.ok) return parsed;
      const { serviceId, estimateHours, ...input } = parsed.value;
      return commit(store, async (repos) => {
        const s = await service(repos, serviceId);
        if (!s) return notFound("That service");
        const [stages, templates] = await Promise.all([repos.catalog.listStages([s.id]), repos.catalog.listTemplates([s.id])]);
        if (input.stagePosition !== null && input.stagePosition >= stages.length) return invalid("Pick one of the service's stages.", { stagePosition: ["Pick one of the service's stages."] });
        const id = newId();
        await repos.catalog.createTemplate(id, { serviceId: s.id, ...input, estimateMinutes: estimateHours, position: templates.length });
        return change({ id }, event(actor, s.id, "service.task_added", { title: input.title }));
      });
    },

    async updateTemplate(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "settings.manage")) return forbidden(DENIED);
      const parsed = parse(updateTemplateSchema, raw);
      if (!parsed.ok) return parsed;
      const { templateId, estimateHours, ...input } = parsed.value;
      return commit(store, async (repos) => {
        const found = await templateById(repos, templateId);
        if (!found) return notFound("That starter task");
        const stages = await repos.catalog.listStages([found.template.serviceId]);
        if (input.stagePosition !== null && input.stagePosition >= stages.length) return invalid("Pick one of the service's stages.", { stagePosition: ["Pick one of the service's stages."] });
        const patch = { ...input, estimateMinutes: estimateHours };
        const fields = (Object.keys(patch) as Array<keyof typeof patch>).filter((k) => patch[k] !== found.template[k]);
        if (fields.length === 0) return noChange({ id: templateId });
        await repos.catalog.updateTemplate(templateId, patch);
        return change({ id: templateId }, event(actor, found.template.serviceId, "service.task_updated", { title: input.title, fields }));
      });
    },

    async moveTemplate(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "settings.manage")) return forbidden(DENIED);
      const parsed = parse(moveTemplateSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        const found = await templateById(repos, parsed.value.templateId);
        if (!found) return notFound("That starter task");
        const siblings = found.siblings.map((t, position) => ({ ...t, position }));
        const row = siblings.find((t) => t.id === found.template.id)!;
        const other = neighbour(siblings, row, parsed.value.direction);
        if (!other) return noChange({ id: row.id });
        [row.position, other.position] = [other.position, row.position];
        for (const t of siblings) await repos.catalog.updateTemplate(t.id, { position: t.position });
        return change({ id: row.id }, event(actor, row.serviceId, "service.task_moved", { title: row.title, direction: parsed.value.direction }));
      });
    },

    async removeTemplate(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "settings.manage")) return forbidden(DENIED);
      const parsed = parse(templateIdSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        const found = await templateById(repos, parsed.value.templateId);
        if (!found) return notFound("That starter task");
        await repos.catalog.updateTemplate(found.template.id, { deletedAt: clock.now() });
        const rest = found.siblings.filter((t) => t.id !== found.template.id);
        for (const [position, t] of rest.entries()) if (t.position !== position) await repos.catalog.updateTemplate(t.id, { position });
        return change({ id: found.template.id }, event(actor, found.template.serviceId, "service.task_removed", { title: found.template.title }));
      });
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
