import { and, asc, count, eq, gte, isNull, or, sql, type SQL } from "drizzle-orm";
import { automations, clients, people, projects, requestForms, requestSubmissions, taskFields, templates } from "@/db/schema";
import type { TaskSetupRepository } from "@/repositories";
import type { Db } from "./connection";
import { q } from "./sql";

export function taskSetupRepository(db: Db): TaskSetupRepository {
  const fieldRows = () =>
    db
      .select({ id: taskFields.id, name: taskFields.name, kind: taskFields.kind, options: taskFields.options, clientId: taskFields.clientId, clientName: clients.name, position: taskFields.position })
      .from(taskFields)
      .leftJoin(clients, eq(clients.id, taskFields.clientId));
  const templateRows = () =>
    db
      .select({ id: templates.id, kind: templates.kind, name: templates.name, description: templates.description, data: templates.data, createdByName: people.fullName, updatedAt: templates.updatedAt })
      .from(templates)
      .leftJoin(people, eq(people.id, templates.createdById));
  const formRows = (where: SQL | undefined) =>
    db
      .select({
        id: requestForms.id,
        name: requestForms.name,
        description: requestForms.description,
        projectId: requestForms.projectId,
        projectName: projects.name,
        clientId: projects.clientId,
        clientName: clients.name,
        ownerId: requestForms.ownerId,
        questions: requestForms.questions,
        active: requestForms.active,
        publicSlug: requestForms.publicSlug,
        submissions: sql<number>`(select count(*)::int from request_submissions rs where rs.form_id = ${q(requestForms.id)})`,
      })
      .from(requestForms)
      .innerJoin(projects, eq(projects.id, requestForms.projectId))
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .where(and(isNull(requestForms.deletedAt), where))
      .orderBy(asc(requestForms.name));
  const automationRows = (where: SQL | undefined) =>
    db
      .select({
        id: automations.id,
        name: automations.name,
        active: automations.active,
        trigger: automations.trigger,
        conditions: automations.conditions,
        actions: automations.actions,
        runs: automations.runs,
        lastRunAt: automations.lastRunAt,
        createdById: automations.createdById,
        createdByName: people.fullName,
      })
      .from(automations)
      .leftJoin(people, eq(people.id, automations.createdById))
      .where(and(isNull(automations.deletedAt), where))
      .orderBy(asc(automations.createdAt));
  return {
    async automations(opts = {}) {
      return automationRows(opts.activeOnly ? eq(automations.active, true) : undefined);
    },
    async findAutomation(id) {
      const [row] = await automationRows(eq(automations.id, id));
      return row ?? null;
    },
    async addAutomation(row) {
      await db.insert(automations).values(row);
    },
    async updateAutomation(id, patch) {
      await db.update(automations).set({ ...patch, updatedAt: new Date() }).where(eq(automations.id, id));
    },
    async countRun(id, at) {
      await db.update(automations).set({ runs: sql`${automations.runs} + 1`, lastRunAt: at }).where(eq(automations.id, id));
    },
    async forms() {
      return formRows(undefined);
    },
    async findForm(id) {
      const [row] = await formRows(eq(requestForms.id, id));
      return row ?? null;
    },
    async findFormBySlug(slug) {
      const [row] = await formRows(eq(requestForms.publicSlug, slug));
      return row ?? null;
    },
    async addForm(row) {
      await db.insert(requestForms).values(row);
    },
    async updateForm(id, patch) {
      await db.update(requestForms).set({ ...patch, updatedAt: new Date() }).where(eq(requestForms.id, id));
    },
    async addSubmission(row) {
      await db.insert(requestSubmissions).values(row);
    },
    async submissionForTask(taskId) {
      const [r] = await db
        .select({ formId: requestSubmissions.formId, submitterName: requestSubmissions.submitterName, answers: requestSubmissions.answers, createdAt: requestSubmissions.createdAt })
        .from(requestSubmissions)
        .where(eq(requestSubmissions.taskId, taskId))
        .limit(1);
      return r ?? null;
    },
    async countPublicSubmissions(formId, since, submitterKey) {
      const [r] = await db
        .select({ n: count() })
        .from(requestSubmissions)
        .where(and(eq(requestSubmissions.formId, formId), isNull(requestSubmissions.submittedById), gte(requestSubmissions.createdAt, since), submitterKey ? eq(requestSubmissions.submitterKey, submitterKey) : undefined));
      return Number(r?.n ?? 0);
    },
    async lockForm(id) {
      await db.execute(sql`select id from request_forms where id = ${id} for update`);
    },
    async fields(clientId) {
      return fieldRows()
        .where(and(isNull(taskFields.deletedAt), clientId === undefined ? undefined : clientId === null ? isNull(taskFields.clientId) : or(isNull(taskFields.clientId), eq(taskFields.clientId, clientId))))
        .orderBy(asc(taskFields.position), asc(taskFields.createdAt));
    },
    async findField(id) {
      const [row] = await fieldRows().where(and(eq(taskFields.id, id), isNull(taskFields.deletedAt))).limit(1);
      return row ?? null;
    },
    async addField(row) {
      await db.insert(taskFields).values(row);
    },
    async updateField(id, patch) {
      await db.update(taskFields).set({ ...patch, updatedAt: new Date() }).where(eq(taskFields.id, id));
    },
    async templates(kind) {
      return templateRows().where(and(eq(templates.kind, kind), isNull(templates.deletedAt))).orderBy(asc(templates.name));
    },
    async findTemplate(id) {
      const [row] = await templateRows().where(and(eq(templates.id, id), isNull(templates.deletedAt))).limit(1);
      return row ?? null;
    },
    async addTemplate(row) {
      await db.insert(templates).values(row);
    },
    async removeTemplate(id, at) {
      const r = await db.update(templates).set({ deletedAt: at }).where(and(eq(templates.id, id), isNull(templates.deletedAt))).returning({ id: templates.id });
      return r.length > 0;
    },
  };
}
