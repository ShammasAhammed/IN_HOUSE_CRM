import { and, arrayOverlaps, asc, desc, eq, gte, ilike, inArray, isNull, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { clientMembers, clients, people, projectStages, projects, taskChecklistItems, taskComments, taskDependencies, taskFiles, taskPeople, taskViews, tasks } from "@/db/schema";
import type { TaskDetailRow, TaskFileRow, TaskFilter, TaskRow, TaskScope, TasksRepository } from "@/repositories";
import type { Db } from "./connection";
import { liveMember, notHiddenFrom, q } from "./sql";

const reviewer = sql.raw(`"reviewer"`);

/** On the task as an extra assignee or a watcher (Stage 9b.2): they see it whatever their role. */
const onTask = (personId: string) =>
  sql`exists (select 1 from task_people tp where tp.task_id = ${q(tasks.id)} and tp.person_id = ${personId} and tp.deleted_at is null)`;

export function taskScopeCondition(scope: TaskScope): SQL {
  switch (scope.kind) {
    case "all":
      return scope.viewerId ? notHiddenFrom(tasks.clientId, scope.viewerId) : sql`true`;
    case "own":
      return sql`(${q(tasks.ownerId)} = ${scope.personId} or ${q(tasks.reviewerId)} = ${scope.personId} or ${onTask(scope.personId)})
        and ${notHiddenFrom(tasks.clientId, scope.personId)}`;
    case "assigned":
      return sql`(${q(tasks.ownerId)} = ${scope.personId} or ${q(tasks.reviewerId)} = ${scope.personId} or ${onTask(scope.personId)}
        or ${q(tasks.clientId)} in (select ${q(clientMembers.clientId)} from ${clientMembers}
          where ${q(clientMembers.personId)} = ${scope.personId} and ${liveMember('"client_members"')}))
        and ${notHiddenFrom(tasks.clientId, scope.personId)}`;
  }
}

// Per-task counts as correlated subqueries with explicit aliases (see adapters/postgres/sql.ts on why).
const subtasksTotal = sql<number>`(select count(*)::int from tasks sub where sub.parent_task_id = ${q(tasks.id)} and sub.deleted_at is null)`;
const subtasksDone = sql<number>`(select count(*)::int from tasks sub where sub.parent_task_id = ${q(tasks.id)} and sub.deleted_at is null and sub.status = 'done')`;
const commentCount = sql<number>`(select count(*)::int from task_comments c where c.task_id = ${q(tasks.id)} and c.deleted_at is null)`;
const loggedMinutes = sql<number>`(select coalesce(sum(te.minutes), 0)::int from time_entries te where te.task_id = ${q(tasks.id)} and te.deleted_at is null)`;
const assignees = sql<Array<{ id: string; name: string }>>`coalesce((select json_agg(json_build_object('id', tp.person_id, 'name', ap.full_name) order by tp.created_at)
  from task_people tp join people ap on ap.id = tp.person_id
  where tp.task_id = ${q(tasks.id)} and tp.role = 'assignee' and tp.deleted_at is null), '[]'::json)`;

const rowColumns = {
  id: tasks.id,
  title: tasks.title,
  tags: tasks.tags,
  status: tasks.status,
  priority: tasks.priority,
  startDate: tasks.startDate,
  dueDate: tasks.dueDate,
  estimateMinutes: tasks.estimateMinutes,
  completedAt: tasks.completedAt,
  rank: tasks.rank,
  parentTaskId: tasks.parentTaskId,
  clientId: tasks.clientId,
  clientName: clients.name,
  projectId: tasks.projectId,
  projectName: projects.name,
  stageId: tasks.stageId,
  stageName: projectStages.name,
  ownerId: tasks.ownerId,
  ownerName: people.fullName,
  reviewerId: tasks.reviewerId,
  createdById: tasks.createdById,
  recurrenceId: tasks.recurrenceId,
  subtasksDone,
  subtasksTotal,
  commentCount,
  loggedMinutes,
  assignees,
};

export function tasksRepository(db: Db): TasksRepository {
  const detailColumns = {
    ...rowColumns,
    description: tasks.description,
    custom: tasks.custom,
    reviewerName: sql<string | null>`(select ${reviewer}.full_name from people ${reviewer} where ${reviewer}.id = ${q(tasks.reviewerId)})`,
    deliverableId: tasks.deliverableId,
    engagementId: projects.engagementId,
    createdAt: tasks.createdAt,
    updatedAt: tasks.updatedAt,
  };
  const base = (detail: boolean) =>
    db
      .select(detail ? detailColumns : rowColumns)
      .from(tasks)
      .innerJoin(projects, and(eq(projects.id, tasks.projectId), isNull(projects.deletedAt)))
      .innerJoin(clients, eq(clients.id, tasks.clientId))
      .leftJoin(people, eq(people.id, tasks.ownerId))
      .leftJoin(projectStages, eq(projectStages.id, tasks.stageId));

  function where(f: TaskFilter): SQL | undefined {
    return and(
      isNull(tasks.deletedAt),
      taskScopeCondition(f.scope),
      // A list of ids finds those tasks at any level; otherwise top-level tasks or one task's subtasks.
      (f.ids || f.anyLevel) && f.parentTaskId === undefined ? undefined : f.parentTaskId === undefined || f.parentTaskId === null ? isNull(tasks.parentTaskId) : eq(tasks.parentTaskId, f.parentTaskId),
      f.ownerId ? eq(tasks.ownerId, f.ownerId) : undefined,
      f.assignedTo
        ? or(eq(tasks.ownerId, f.assignedTo), sql`exists (select 1 from task_people tp where tp.task_id = ${q(tasks.id)} and tp.person_id = ${f.assignedTo} and tp.role = 'assignee' and tp.deleted_at is null)`)
        : undefined,
      f.projectId ? eq(tasks.projectId, f.projectId) : undefined,
      f.clientId ? eq(tasks.clientId, f.clientId) : undefined,
      f.statuses ? inArray(tasks.status, [...f.statuses]) : undefined,
      f.openDueOnOrBefore ? and(ne(tasks.status, "done"), lte(tasks.dueDate, f.openDueOnOrBefore)) : undefined,
      f.dueFrom ? gte(tasks.dueDate, f.dueFrom) : undefined,
      f.overlaps ? and(gte(tasks.dueDate, f.overlaps.from), sql`least(coalesce(${q(tasks.startDate)}, ${q(tasks.dueDate)}), ${q(tasks.dueDate)}) <= ${f.overlaps.to}`) : undefined,
      f.dueTo ? lte(tasks.dueDate, f.dueTo) : undefined,
      f.completedSince ? gte(tasks.completedAt, f.completedSince) : undefined,
      f.recurrenceId ? eq(tasks.recurrenceId, f.recurrenceId) : undefined,
      f.tags?.length ? arrayOverlaps(tasks.tags, [...f.tags]) : undefined,
      f.priorities?.length ? inArray(tasks.priority, [...f.priorities]) : undefined,
      f.search ? ilike(tasks.title, `%${f.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`) : undefined,
      f.noDueDate ? isNull(tasks.dueDate) : undefined,
      f.ids ? (f.ids.length ? inArray(tasks.id, [...f.ids]) : sql`false`) : undefined,
      f.forWeek
        ? or(
            and(gte(tasks.dueDate, f.forWeek.from), lte(tasks.dueDate, f.forWeek.to)),
            and(lt(tasks.dueDate, f.forWeek.from), ne(tasks.status, "done")),
            // Long tasks that started before the week and end after it.
            and(lte(tasks.startDate, f.forWeek.to), gte(tasks.dueDate, f.forWeek.to)),
          )
        : undefined,
    );
  }

  return {
    async countsByClient(clientIds, today, ownerId) {
      if (clientIds.length === 0) return [];
      return db
        .select({
          clientId: tasks.clientId,
          open: sql<number>`count(*) filter (where ${q(tasks.status)} <> 'done')::int`,
          overdue: sql<number>`count(*) filter (where ${q(tasks.status)} <> 'done' and ${q(tasks.dueDate)} < ${today})::int`,
        })
        .from(tasks)
        .where(
          and(
            inArray(tasks.clientId, [...clientIds]),
            isNull(tasks.deletedAt),
            isNull(tasks.parentTaskId),
            ownerId ? eq(tasks.ownerId, ownerId) : undefined,
          ),
        )
        .groupBy(tasks.clientId);
    },

    async list(filter) {
      const dir = filter.sort?.dir === "desc" ? desc : asc;
      // Priority sorts by weight, not alphabetically; empty dates go last either way.
      const order =
        filter.sort?.by === "priority" ? [dir(sql`case ${q(tasks.priority)} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`), asc(tasks.dueDate)]
        : filter.sort?.by === "title" ? [dir(tasks.title)]
        : filter.sort?.by === "client" ? [dir(clients.name), asc(tasks.dueDate)]
        : filter.sort?.by === "owner" ? [sql`${people.fullName} ${sql.raw(filter.sort.dir === "desc" ? "desc" : "asc")} nulls last`, asc(tasks.dueDate)]
        : filter.sort?.by === "status" ? [dir(sql`case ${q(tasks.status)} when 'todo' then 0 when 'in_progress' then 1 when 'in_review' then 2 when 'blocked' then 3 else 4 end`), asc(tasks.dueDate)]
        : filter.sort?.by === "created" ? [dir(tasks.createdAt)]
        : filter.sort?.by === "due" ? [sql`${q(tasks.dueDate)} ${sql.raw(filter.sort.dir === "desc" ? "desc" : "asc")} nulls last`, asc(tasks.rank)]
        : [asc(tasks.dueDate), asc(tasks.rank)];
      const rows = await base(false)
        .where(where(filter))
        .orderBy(...order)
        .limit(filter.limit ?? 2000);
      return rows as TaskRow[];
    },

    async allTags(scope) {
      const rows = scope
        ? await db.execute(sql`select tag, count(*)::int as n from ${tasks}
            join ${projects} on ${q(projects.id)} = ${q(tasks.projectId)} and ${q(projects.deletedAt)} is null
            cross join lateral unnest(${q(tasks.tags)}) as tag
            where ${q(tasks.deletedAt)} is null and ${q(tasks.parentTaskId)} is null and ${taskScopeCondition(scope)}
            group by tag order by n desc, tag limit 200`)
        : await db.execute(sql`select tag, count(*)::int as n from tasks, unnest(tags) as tag where deleted_at is null group by tag order by n desc, tag limit 200`);
      return rows.map((r) => ({ tag: String(r.tag), count: Number(r.n) }));
    },
    async views(personId) {
      return db.select({ id: taskViews.id, name: taskViews.name, query: taskViews.query }).from(taskViews).where(and(eq(taskViews.personId, personId), isNull(taskViews.deletedAt))).orderBy(asc(taskViews.createdAt));
    },
    async addView(row) {
      await db.insert(taskViews).values(row);
    },
    async removeView(id, personId, at) {
      const r = await db.update(taskViews).set({ deletedAt: at }).where(and(eq(taskViews.id, id), eq(taskViews.personId, personId), isNull(taskViews.deletedAt))).returning({ id: taskViews.id });
      return r.length > 0;
    },
    async findById(id, scope) {
      const [row] = await base(true)
        .where(and(eq(tasks.id, id), isNull(tasks.deletedAt), taskScopeCondition(scope)))
        .limit(1);
      return (row as TaskDetailRow | undefined) ?? null;
    },

    async create(id, task) {
      await db.insert(tasks).values({ id, ...task });
    },

    async createMany(rows) {
      if (rows.length === 0) return [];
      const inserted = await db
        .insert(tasks)
        .values(rows)
        .onConflictDoNothing({ target: [tasks.recurrenceId, tasks.recurrenceDate], where: sql`${q(tasks.recurrenceId)} is not null and ${q(tasks.deletedAt)} is null` })
        .returning({ id: tasks.id });
      return inserted.map((r) => r.id);
    },

    async update(id, patch) {
      await db.update(tasks).set({ ...patch, updatedAt: new Date() }).where(eq(tasks.id, id));
    },

    async findExternal(externalIds) {
      if (externalIds.length === 0) return [];
      const rows = await db
        .select({ id: tasks.id, externalId: tasks.externalId, parentTaskId: tasks.parentTaskId, projectId: tasks.projectId, clientId: tasks.clientId })
        .from(tasks)
        .where(and(inArray(tasks.externalId, [...externalIds]), isNull(tasks.deletedAt)));
      return rows.map((r) => ({ ...r, externalId: r.externalId! }));
    },

    async recentSame(input) {
      const [r] = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.projectId, input.projectId),
            input.parentTaskId ? eq(tasks.parentTaskId, input.parentTaskId) : isNull(tasks.parentTaskId),
            eq(tasks.title, input.title),
            eq(tasks.createdById, input.createdById),
            sql`${tasks.createdAt} > now() - make_interval(secs => ${input.withinSeconds})`,
            isNull(tasks.deletedAt),
          ),
        )
        .limit(1);
      return r?.id ?? null;
    },
    async lastRank(projectId, status) {
      const [row] = await db
        .select({ rank: tasks.rank })
        .from(tasks)
        .where(and(eq(tasks.projectId, projectId), eq(tasks.status, status), isNull(tasks.parentTaskId), isNull(tasks.deletedAt)))
        .orderBy(desc(tasks.rank))
        .limit(1);
      return row?.rank ?? null;
    },

    async listComments(taskId) {
      return db
        .select({
          id: taskComments.id,
          taskId: taskComments.taskId,
          authorId: taskComments.authorId,
          authorName: people.fullName,
          body: taskComments.body,
          createdAt: taskComments.createdAt,
        })
        .from(taskComments)
        .innerJoin(people, eq(people.id, taskComments.authorId))
        .where(and(eq(taskComments.taskId, taskId), isNull(taskComments.deletedAt)))
        .orderBy(asc(taskComments.createdAt));
    },

    async addComment(id, taskId, authorId, body) {
      await db.insert(taskComments).values({ id, taskId, authorId, body });
    },

    async people(taskId) {
      return db
        .select({ personId: taskPeople.personId, fullName: people.fullName, role: taskPeople.role, addedAt: taskPeople.createdAt })
        .from(taskPeople)
        .innerJoin(people, eq(people.id, taskPeople.personId))
        .where(and(eq(taskPeople.taskId, taskId), isNull(taskPeople.deletedAt)))
        .orderBy(asc(taskPeople.createdAt));
    },
    async addPerson(row) {
      await db.insert(taskPeople).values(row).onConflictDoNothing();
    },
    async removePerson(taskId, personId, role, at) {
      const r = await db
        .update(taskPeople)
        .set({ deletedAt: at })
        .where(and(eq(taskPeople.taskId, taskId), eq(taskPeople.personId, personId), eq(taskPeople.role, role), isNull(taskPeople.deletedAt)))
        .returning({ id: taskPeople.id });
      return r.length > 0;
    },

    async checklist(taskId) {
      return db
        .select({ id: taskChecklistItems.id, text: taskChecklistItems.text, done: taskChecklistItems.done, doneByName: people.fullName, doneAt: taskChecklistItems.doneAt, rank: taskChecklistItems.rank })
        .from(taskChecklistItems)
        .leftJoin(people, eq(people.id, taskChecklistItems.doneById))
        .where(and(eq(taskChecklistItems.taskId, taskId), isNull(taskChecklistItems.deletedAt)))
        .orderBy(asc(taskChecklistItems.rank));
    },
    async findChecklistItem(id) {
      const [row] = await db
        .select({ id: taskChecklistItems.id, taskId: taskChecklistItems.taskId, text: taskChecklistItems.text, done: taskChecklistItems.done, doneByName: people.fullName, doneAt: taskChecklistItems.doneAt, rank: taskChecklistItems.rank })
        .from(taskChecklistItems)
        .leftJoin(people, eq(people.id, taskChecklistItems.doneById))
        .where(and(eq(taskChecklistItems.id, id), isNull(taskChecklistItems.deletedAt)))
        .limit(1);
      return row ?? null;
    },
    async addChecklistItem(row) {
      await db.insert(taskChecklistItems).values(row);
    },
    async updateChecklistItem(id, patch) {
      await db.update(taskChecklistItems).set(patch).where(eq(taskChecklistItems.id, id));
    },

    async files(taskId) {
      return fileRows(and(eq(taskFiles.taskId, taskId), isNull(taskFiles.deletedAt)));
    },
    async findFile(id) {
      const [row] = await fileRows(and(eq(taskFiles.id, id), isNull(taskFiles.deletedAt)));
      return row ?? null;
    },
    async addFile(row) {
      await db.insert(taskFiles).values(row);
    },
    async dependencyLinks(taskIds) {
      if (!taskIds.length) return [];
      const a = alias(tasks, "dep_a");
      const b = alias(tasks, "dep_b");
      return db
        .select({ taskId: taskDependencies.taskId, dependsOnId: taskDependencies.dependsOnId })
        .from(taskDependencies)
        .innerJoin(a, and(eq(a.id, taskDependencies.taskId), isNull(a.deletedAt)))
        .innerJoin(b, and(eq(b.id, taskDependencies.dependsOnId), isNull(b.deletedAt)))
        .where(and(isNull(taskDependencies.deletedAt), or(inArray(taskDependencies.taskId, [...taskIds]), inArray(taskDependencies.dependsOnId, [...taskIds]))));
    },
    async addDependency(row) {
      await db.insert(taskDependencies).values(row).onConflictDoNothing();
    },
    async removeDependency(taskId, dependsOnId, at) {
      const r = await db
        .update(taskDependencies)
        .set({ deletedAt: at })
        .where(and(eq(taskDependencies.taskId, taskId), eq(taskDependencies.dependsOnId, dependsOnId), isNull(taskDependencies.deletedAt)))
        .returning({ id: taskDependencies.id });
      return r.length > 0;
    },
    async removeFile(id, at) {
      const r = await db.update(taskFiles).set({ deletedAt: at }).where(and(eq(taskFiles.id, id), isNull(taskFiles.deletedAt))).returning({ id: taskFiles.id });
      return r.length > 0;
    },
  };

  function fileRows(where: SQL | undefined): Promise<TaskFileRow[]> {
    return db
      .select({
        id: taskFiles.id,
        taskId: taskFiles.taskId,
        title: taskFiles.title,
        provider: taskFiles.provider,
        location: taskFiles.location,
        fileId: taskFiles.fileId,
        fileName: taskFiles.fileName,
        contentType: taskFiles.contentType,
        sizeBytes: taskFiles.sizeBytes,
        addedById: taskFiles.addedById,
        addedByName: people.fullName,
        createdAt: taskFiles.createdAt,
      })
      .from(taskFiles)
      .leftJoin(people, eq(people.id, taskFiles.addedById))
      .where(where)
      .orderBy(desc(taskFiles.createdAt));
  }
}
