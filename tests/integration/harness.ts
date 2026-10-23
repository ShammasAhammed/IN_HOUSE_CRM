// Test harness: a real PostgreSQL store on the test database, wiped between tests, plus small fixture builders.
import { sql, type SQL } from "drizzle-orm";
import { createPostgresStore } from "@/adapters/postgres";
import { connect } from "@/adapters/postgres/connection";
import * as s from "@/db/schema";
import type { IsoDate } from "@/lib/dates";
import { newId } from "@/lib/id";
import type { Role } from "@/lib/types";
import type { Clock } from "@/services/clock";
import { capabilitiesFor, type Actor } from "@/services/permissions";

const url = () => {
  const u = process.env.DATABASE_URL_TEST;
  if (!u) throw new Error("DATABASE_URL_TEST is not set");
  return u;
};

export function testStore() {
  return createPostgresStore(url(), { max: 2 });
}

export function fixedClock(today: IsoDate): Clock {
  return { today: () => today, now: () => new Date(`${today}T06:30:00Z`) };
}

/** Direct database access for building fixtures. */
export function testDb() {
  return connect(url(), { max: 2 });
}

type Db = ReturnType<typeof testDb>["db"];

export async function wipe(db: Db) {
  await db.execute(sql`truncate table space_kit_items, goal_projects, goal_checkins, goals, gallery_uses, gallery_templates, presets, meeting_actions, meetings, doc_comments, doc_table_rows, doc_tables, doc_files, share_inbox, link_previews, swipe_items, board_task_links, board_files, board_comments, board_reactions, board_votes, board_versions, board_people, boards, client_link_cache, client_links, chat_portal_reads, coworker_suggestions, coworker_digests, assistant_promises, assistant_day_summaries, lead_ai_scores, chat_reads, chat_messages, chat_members, chat_channels, portal_link_tokens, portal_users, space_access_requests, backup_runs, consent_records, client_reports, ai_drafts, client_files, client_campaigns, client_knowledge, client_results, ad_insight_cache, client_ad_accounts, google_conversions, lead_activities, leads, lead_sources, mcp_connections, oauth_codes, oauth_clients, ai_usage, crm_won_leads, notifications, content_items, asset_comments, person_documents, stored_files, checklist_items, access_grants, attendance_days, task_comments, task_recurrences, settings, leave_grants, leave_requests, leave_quotas, leave_types, holidays, events, asset_versions, assets, time_entries, tasks, deliverables, project_stages,
    projects, engagement_periods, engagement_fees, engagements, client_members, client_contacts, clients,
    service_task_templates, service_stages, services, person_roles, departments, people cascade`);
}

export async function addPerson(db: Db, name: string, roles: Role[], extra: Partial<typeof s.people.$inferInsert> = {}) {
  const id = newId();
  await db.insert(s.people).values({
    id,
    fullName: name,
    workEmail: `${name.toLowerCase().replace(/\s+/g, ".")}@oppllo.example`,
    jobTitle: roles[0] ?? "Person",
    employmentType: roles.includes("intern") ? "intern" : "full_time",
    joinDate: "2026-01-01",
    capacityMinutesPerWeek: 2400,
    ...extra,
  });
  if (roles.length) await db.insert(s.personRoles).values(roles.map((role) => ({ personId: id, role })));
  return id;
}

export function actorOf(personId: string, roles: Role[], extra: Partial<Pick<Actor, "employmentType">> = {}): Actor {
  return {
    personId,
    fullName: "Test person",
    email: "test@oppllo.example",
    roles,
    employmentType: roles.includes("intern") ? "intern" : "full_time",
    capabilities: capabilitiesFor(roles),
    ...extra,
  };
}

export async function addService(db: Db, key = "meta_ads") {
  const id = newId();
  await db.insert(s.services).values({ id, key, name: key === "meta_ads" ? "Meta ads for admissions" : key });
  return id;
}

export async function addClient(db: Db, name: string, opts: { strategistId?: string; members?: string[] } = {}) {
  const id = newId();
  await db.insert(s.clients).values({ id, name, status: "active", leadStrategistId: opts.strategistId ?? null });
  await db.insert(s.clientContacts).values({
    id: newId(),
    clientId: id,
    name: `${name} Director`,
    phone: "+91 90000 00000",
    email: "director@client.example",
    isPrimary: true,
  });
  for (const personId of opts.members ?? []) await db.insert(s.clientMembers).values({ clientId: id, personId });
  return id;
}

export async function addRetainer(
  db: Db,
  clientId: string,
  serviceId: string,
  opts: { feePaise: number; budgetMinutes: number; periodStart: IsoDate; periodEnd: IsoDate; startDate?: IsoDate },
) {
  const id = newId();
  await db.insert(s.engagements).values({
    id,
    clientId,
    serviceId,
    kind: "retainer",
    name: "Retainer",
    startDate: opts.startDate ?? "2026-01-01",
    hoursBudgetMinutes: opts.budgetMinutes,
  });
  await db.insert(s.engagementFees).values({ id: newId(), engagementId: id, amountPaise: opts.feePaise, effectiveFrom: "2026-01-01" });
  await db.insert(s.engagementPeriods).values({
    id: newId(),
    engagementId: id,
    periodStart: opts.periodStart,
    periodEnd: opts.periodEnd,
    baseBudgetMinutes: opts.budgetMinutes,
    feePaise: opts.feePaise,
  });
  return id;
}

export async function addTime(
  db: Db,
  opts: { taskId: string; personId: string; clientId: string; engagementId: string | null; minutes: number; workDate: IsoDate; billable?: boolean },
) {
  const id = newId();
  await db.insert(s.timeEntries).values({ id, ...opts, billable: opts.billable ?? true });
  return id;
}

/** Soft delete, the only kind there is. */
export async function softDelete(db: Db, table: "client_contacts" | "time_entries" | "client_members" | "person_roles" | "tasks", where: SQL) {
  await db.execute(sql`update ${sql.identifier(table)} set deleted_at = now() where ${where}`);
}

export async function addProjectWithTask(
  db: Db,
  clientId: string,
  opts: { engagementId?: string; ownerId?: string; dueDate?: IsoDate; status?: "todo" | "done"; loggedMinutes?: number; workDate?: IsoDate },
) {
  const projectId = newId();
  await db.insert(s.projects).values({ id: projectId, clientId, engagementId: opts.engagementId ?? null, name: "Project" });
  const taskId = newId();
  const done = opts.status === "done";
  await db.insert(s.tasks).values({
    id: taskId,
    projectId,
    clientId,
    title: "Task",
    ownerId: opts.ownerId ?? null,
    dueDate: opts.dueDate ?? null,
    status: opts.status ?? "todo",
    completedAt: done ? new Date() : null,
  });
  // Split into entries of at most 8 hours, as a person would log them.
  for (let left = opts.loggedMinutes ?? 0; left > 0 && opts.ownerId; left -= 480) {
    await db.insert(s.timeEntries).values({
      id: newId(),
      taskId,
      personId: opts.ownerId,
      clientId,
      engagementId: opts.engagementId ?? null,
      workDate: opts.workDate ?? "2026-10-05",
      minutes: Math.min(480, left),
    });
  }
  return { projectId, taskId };
}

/** Leave types and quotas as decided in D39, the working week (D32) and a few holidays. */
export async function addLeaveSetup(db: Db) {
  const types = {
    casual: newId(),
    sick: newId(),
    comp_off: newId(),
    unpaid: newId(),
  };
  await db.insert(s.leaveTypes).values([
    { id: types.casual, key: "casual", name: "Casual leave", position: 0 },
    { id: types.sick, key: "sick", name: "Sick leave", maxBackdateDays: 7, position: 1 },
    { id: types.comp_off, key: "comp_off", name: "Comp-off", grantedOnly: true, grantExpiryDays: 60, position: 2 },
    { id: types.unpaid, key: "unpaid", name: "Unpaid leave", usesBalance: false, position: 3 },
  ]);
  await db.insert(s.leaveQuotas).values([
    { id: newId(), leaveTypeId: types.casual, employmentType: "full_time", halfDaysPerYear: 24 },
    { id: newId(), leaveTypeId: types.casual, employmentType: "intern", halfDaysPerYear: 12 },
    { id: newId(), leaveTypeId: types.sick, employmentType: "full_time", halfDaysPerYear: 24 },
  ]);
  await db.insert(s.settings).values({ key: "work_week", value: { workingWeekdays: [1, 2, 3, 4, 5, 6], saturdaysOff: [2] } });
  await db.insert(s.holidays).values([
    { id: newId(), date: "2026-10-20", name: "Vijayadashami" },
    { id: newId(), date: "2026-12-25", name: "Christmas" },
  ]);
  return types;
}

export async function addDepartment(db: Db, name: string) {
  const id = newId();
  await db.insert(s.departments).values({ id, name });
  return id;
}

export async function eventsFor(db: Db, entityId: string) {
  return db.select({ action: s.events.action, actorId: s.events.actorId }).from(s.events).where(sql`${s.events.entityId} = ${entityId}`).orderBy(s.events.occurredAt);
}
