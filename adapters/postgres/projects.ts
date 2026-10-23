import { and, asc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  clientMembers,
  clients,
  engagements,
  people,
  projectStages,
  projects,
  services,
  serviceStages,
  serviceTaskTemplates,
  taskRecurrences,
} from "@/db/schema";
import type { ProjectRow, ProjectsRepository, RecurrenceRow, TaskScope } from "@/repositories";
import type { Db } from "./connection";
import { liveMember, notHiddenFrom, q } from "./sql";

const currentStage = alias(projectStages, "current_stage");

/** Projects visible in a task scope: all, or those of clients they're on, or those holding their tasks. */
function projectScope(scope: TaskScope): SQL {
  switch (scope.kind) {
    case "all":
      return scope.viewerId ? notHiddenFrom(projects.clientId, scope.viewerId) : sql`true`;
    case "own":
      return sql`${q(projects.id)} in (select t.project_id from tasks t where (t.owner_id = ${scope.personId} or t.reviewer_id = ${scope.personId}) and t.deleted_at is null)
        and ${notHiddenFrom(projects.clientId, scope.personId)}`;
    case "assigned":
      return sql`(${q(projects.clientId)} in (select ${q(clientMembers.clientId)} from ${clientMembers}
          where ${q(clientMembers.personId)} = ${scope.personId} and ${liveMember('"client_members"')})
        or ${q(projects.id)} in (select t.project_id from tasks t where (t.owner_id = ${scope.personId} or t.reviewer_id = ${scope.personId}) and t.deleted_at is null))
        and ${notHiddenFrom(projects.clientId, scope.personId)}`;
  }
}

const recurrenceColumns = {
  id: taskRecurrences.id,
  projectId: taskRecurrences.projectId,
  projectName: projects.name,
  clientId: taskRecurrences.clientId,
  title: taskRecurrences.title,
  description: taskRecurrences.description,
  ownerId: taskRecurrences.ownerId,
  ownerName: people.fullName,
  reviewerId: taskRecurrences.reviewerId,
  priority: taskRecurrences.priority,
  stageId: taskRecurrences.stageId,
  deliverableId: taskRecurrences.deliverableId,
  estimateMinutes: taskRecurrences.estimateMinutes,
  frequency: taskRecurrences.frequency,
  weekday: taskRecurrences.weekday,
  dayOfMonth: taskRecurrences.dayOfMonth,
  leadWorkingDays: taskRecurrences.leadWorkingDays,
  startsOn: taskRecurrences.startsOn,
  endsOn: taskRecurrences.endsOn,
  active: taskRecurrences.active,
  generatedUntil: taskRecurrences.generatedUntil,
  createdById: taskRecurrences.createdById,
};

export function projectsRepository(db: Db): ProjectsRepository {
  const select = (today: string) =>
    db
      .select({
        id: projects.id,
        name: projects.name,
        clientId: projects.clientId,
        clientName: clients.name,
        engagementId: projects.engagementId,
        engagementName: engagements.name,
        status: projects.status,
        currentStageId: projects.currentStageId,
        currentStageName: currentStage.name,
        leadId: projects.leadId,
        leadName: people.fullName,
        startDate: projects.startDate,
        dueDate: projects.dueDate,
        openTasks: sql<number>`(select count(*)::int from tasks t where t.project_id = ${q(projects.id)} and t.deleted_at is null and t.parent_task_id is null and t.status <> 'done')`,
        overdueTasks: sql<number>`(select count(*)::int from tasks t where t.project_id = ${q(projects.id)} and t.deleted_at is null and t.parent_task_id is null and t.status <> 'done' and t.due_date < ${today})`,
        doneTasks: sql<number>`(select count(*)::int from tasks t where t.project_id = ${q(projects.id)} and t.deleted_at is null and t.parent_task_id is null and t.status = 'done')`,
      })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .leftJoin(engagements, eq(engagements.id, projects.engagementId))
      .leftJoin(people, eq(people.id, projects.leadId))
      .leftJoin(currentStage, eq(currentStage.id, projects.currentStageId));

  const recurrences = () =>
    db
      .select(recurrenceColumns)
      .from(taskRecurrences)
      .innerJoin(projects, eq(projects.id, taskRecurrences.projectId))
      .leftJoin(people, eq(people.id, taskRecurrences.ownerId));

  return {
    async list(filter) {
      const rows = await select(filter.today)
        .where(
          and(
            isNull(projects.deletedAt),
            projectScope(filter.scope),
            filter.clientIds ? (filter.clientIds.length ? inArray(projects.clientId, [...filter.clientIds]) : sql`false`) : undefined,
            filter.statuses ? inArray(projects.status, [...filter.statuses]) : undefined,
          ),
        )
        .orderBy(asc(clients.name), asc(projects.startDate));
      return rows as ProjectRow[];
    },
    async findById(id, scope, today) {
      const [row] = await select(today)
        .where(and(eq(projects.id, id), isNull(projects.deletedAt), projectScope(scope)))
        .limit(1);
      return (row as ProjectRow | undefined) ?? null;
    },
    async create(id, project) {
      await db.insert(projects).values({ id, ...project });
    },
    async update(id, patch) {
      await db.update(projects).set({ ...patch, updatedAt: new Date() }).where(eq(projects.id, id));
    },
    async listStages(projectIds) {
      if (projectIds.length === 0) return [];
      return db
        .select({ id: projectStages.id, projectId: projectStages.projectId, name: projectStages.name, position: projectStages.position })
        .from(projectStages)
        .where(and(inArray(projectStages.projectId, [...projectIds]), isNull(projectStages.deletedAt)))
        .orderBy(asc(projectStages.position));
    },
    async createStages(rows) {
      if (rows.length) await db.insert(projectStages).values(rows);
    },
    async serviceTemplate(serviceId) {
      const [service] = await db.select({ id: services.id, name: services.name }).from(services).where(and(eq(services.id, serviceId), isNull(services.deletedAt)));
      if (!service) return null;
      const [stages, templates] = await Promise.all([
        db
          .select({ name: serviceStages.name, position: serviceStages.position })
          .from(serviceStages)
          .where(and(eq(serviceStages.serviceId, serviceId), isNull(serviceStages.deletedAt)))
          .orderBy(asc(serviceStages.position)),
        db
          .select({
            title: serviceTaskTemplates.title,
            stagePosition: serviceTaskTemplates.stagePosition,
            dueOffsetDays: serviceTaskTemplates.dueOffsetDays,
            estimateMinutes: serviceTaskTemplates.estimateMinutes,
            defaultRole: serviceTaskTemplates.defaultRole,
            position: serviceTaskTemplates.position,
          })
          .from(serviceTaskTemplates)
          .where(and(eq(serviceTaskTemplates.serviceId, serviceId), isNull(serviceTaskTemplates.deletedAt)))
          .orderBy(asc(serviceTaskTemplates.position)),
      ]);
      return { serviceId: service.id, serviceName: service.name, stages, tasks: templates };
    },

    async listRecurrences(filter) {
      const rows = await recurrences()
        .where(
          and(
            isNull(taskRecurrences.deletedAt),
            isNull(projects.deletedAt),
            filter.projectId ? eq(taskRecurrences.projectId, filter.projectId) : undefined,
            filter.activeOnly || filter.liveOnly ? eq(taskRecurrences.active, true) : undefined,
            filter.liveOnly
              ? and(
                  eq(projects.status, "active"),
                  sql`exists (select 1 from ${clients} where ${q(clients.id)} = ${q(taskRecurrences.clientId)} and ${q(clients.deletedAt)} is null)`,
                )
              : undefined,
          ),
        )
        .orderBy(asc(taskRecurrences.title));
      return rows as RecurrenceRow[];
    },
    async findRecurrence(id) {
      const [row] = await recurrences().where(and(eq(taskRecurrences.id, id), isNull(taskRecurrences.deletedAt))).limit(1);
      return (row as RecurrenceRow | undefined) ?? null;
    },
    async lockRecurrence(id) {
      await db.execute(sql`select 1 from ${taskRecurrences} where ${q(taskRecurrences.id)} = ${id} for update`);
      const [row] = await recurrences().where(and(eq(taskRecurrences.id, id), isNull(taskRecurrences.deletedAt))).limit(1);
      return (row as RecurrenceRow | undefined) ?? null;
    },
    async createRecurrence(id, rule) {
      await db.insert(taskRecurrences).values({ id, ...rule });
    },
    async updateRecurrence(id, patch) {
      await db.update(taskRecurrences).set({ ...patch, updatedAt: new Date() }).where(eq(taskRecurrences.id, id));
    },
  };
}

