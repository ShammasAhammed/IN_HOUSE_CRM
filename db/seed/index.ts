// npm run db:seed — wipe a LOCAL database and fill it with realistic, fictional data:
// 8 clients (+ Oppllo internal), 13 people in the real roles, six services, retainers with fee history and
// monthly periods, ~40 projects, ~1,000 tasks, six months of time entries, assets and events.
// Dates are relative to today, so the data never goes stale.

import { crc32, deflateSync } from "node:zlib";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { addDays, addMonths, endOfMonth, istDate, startOfMonth, type IsoDate } from "@/lib/dates";
import { newId } from "@/lib/id";
import type { ApprovalState, Role, TaskPriority, TaskStatus } from "@/lib/types";
import { periodTerms, rolloverMinutes } from "@/services/rules/retainer";
import { generateNKeysBetween } from "fractional-indexing";
import { approverFor } from "@/services/rules/leave";
import { DEFAULT_WORK_WEEK, isWorkingDay, previousWorkingDay, workingDays } from "@/services/rules/working-days";
import * as s from "../schema";
import { CLIENTS, DEPARTMENTS, PEOPLE, SERVICES, type SeedEngagement, type SeedService } from "./data";
import { GRANTS, HOLIDAYS, LEAVES, LEAVE_TYPES } from "./hr";
import { seedLeads } from "./leads";

config({ path: ".env.local", quiet: true });

// ---------- deterministic randomness ----------
let state = 20261014;
const rand = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (min: number, max: number) => min + rand() * (max - min);
const int = (min: number, max: number) => Math.floor(between(min, max + 1));
const chance = (p: number) => rand() < p;
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;
const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

/** An instant on an India calendar day. */
const at = (date: IsoDate, hour: number, minute = 0) =>
  new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`);

/** A small poster-like PNG (a card on a coloured ground, a band for each version): enough to review on screen. */
const PALETTE = [[127, 33, 194], [204, 51, 204], [23, 92, 211], [21, 128, 61], [180, 83, 9], [217, 45, 32], [15, 118, 110], [30, 41, 59]] as const;
function samplePng(colour: number, version: number): Buffer {
  const [w, h] = [360, 450];
  const bg = PALETTE[colour % PALETTE.length]!;
  const card = bg.map((c) => Math.round(c + (255 - c) * 0.85));
  const band = bg.map((c) => Math.round(c * 0.6));
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    for (let x = 0; x < w; x++) {
      const inCard = y > 70 && y < 320 && x > 36 && x < w - 36;
      const inBand = y > h - 90;
      const mark = y > 24 && y < 44 && x > 24 && x < 24 + version * 26 && (x - 24) % 26 < 20;
      const px = mark ? [255, 255, 255] : inCard ? card : inBand ? band : bg;
      raw.set(px, row + 1 + x * 3);
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "latin1");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const CHANGE_NOTES = ["Logo bigger and the phone number in bold", "Use the batch photo, not the stock one", "Add the date in Malayalam too", "Shorter headline; the fee line is hard to read", "Brighter, please: it looks dull on the phone"];
let assetCount = 0;

// ---------- rows to insert ----------
const rows = {
  departments: [] as (typeof s.departments.$inferInsert)[],
  people: [] as (typeof s.people.$inferInsert)[],
  personRoles: [] as (typeof s.personRoles.$inferInsert)[],
  services: [] as (typeof s.services.$inferInsert)[],
  serviceStages: [] as (typeof s.serviceStages.$inferInsert)[],
  serviceTaskTemplates: [] as (typeof s.serviceTaskTemplates.$inferInsert)[],
  clients: [] as (typeof s.clients.$inferInsert)[],
  clientContacts: [] as (typeof s.clientContacts.$inferInsert)[],
  clientMembers: [] as (typeof s.clientMembers.$inferInsert)[],
  engagements: [] as (typeof s.engagements.$inferInsert)[],
  engagementFees: [] as (typeof s.engagementFees.$inferInsert)[],
  engagementPeriods: [] as (typeof s.engagementPeriods.$inferInsert)[],
  projects: [] as (typeof s.projects.$inferInsert)[],
  projectStages: [] as (typeof s.projectStages.$inferInsert)[],
  deliverables: [] as (typeof s.deliverables.$inferInsert)[],
  tasks: [] as (typeof s.tasks.$inferInsert)[],
  timeEntries: [] as (typeof s.timeEntries.$inferInsert)[],
  assets: [] as (typeof s.assets.$inferInsert)[],
  assetVersions: [] as (typeof s.assetVersions.$inferInsert)[],
  events: [] as (typeof s.events.$inferInsert)[],
  settings: [] as (typeof s.settings.$inferInsert)[],
  leaveTypes: [] as (typeof s.leaveTypes.$inferInsert)[],
  leaveQuotas: [] as (typeof s.leaveQuotas.$inferInsert)[],
  holidays: [] as (typeof s.holidays.$inferInsert)[],
  leaveRequests: [] as (typeof s.leaveRequests.$inferInsert)[],
  attendanceDays: [] as (typeof s.attendanceDays.$inferInsert)[],
  accessGrants: [] as (typeof s.accessGrants.$inferInsert)[],
  checklistItems: [] as (typeof s.checklistItems.$inferInsert)[],
  storedFiles: [] as (typeof s.storedFiles.$inferInsert)[],
  assetComments: [] as (typeof s.assetComments.$inferInsert)[],
  contentItems: [] as (typeof s.contentItems.$inferInsert)[],
  personDocuments: [] as (typeof s.personDocuments.$inferInsert)[],
  leaveGrants: [] as (typeof s.leaveGrants.$inferInsert)[],
  taskComments: [] as (typeof s.taskComments.$inferInsert)[],
  taskRecurrences: [] as (typeof s.taskRecurrences.$inferInsert)[],
};

const today = istDate();
const now = new Date();
const windowStart = startOfMonth(addMonths(today, -6));
const thisMonth = startOfMonth(today);
const week = DEFAULT_WORK_WEEK;

function event(e: Omit<typeof s.events.$inferInsert, "id">) {
  rows.events.push({ id: newId(), ...e });
}

// ---------- people ----------
const personId = new Map<string, string>();
const deptId = new Map<string, string>();
for (const d of DEPARTMENTS) deptId.set(d.name, newId());
for (const p of PEOPLE) personId.set(p.key, newId());
const pid = (key: string) => {
  const id = personId.get(key);
  if (!id) throw new Error(`Unknown person ${key}`);
  return id;
};

for (const d of DEPARTMENTS) {
  rows.departments.push({ id: deptId.get(d.name)!, name: d.name, headPersonId: pid(d.head) });
}
for (const p of PEOPLE) {
  const first = p.fullName.split(" ")[0]!.toLowerCase();
  const joinDate = addDays(addMonths(thisMonth, -p.joinedMonthsAgo), int(0, 20));
  rows.people.push({
    id: pid(p.key),
    fullName: p.fullName,
    workEmail: `${first}@oppllo.example`,
    workPhone: `+91 9${int(100000000, 999999999)}`,
    personalPhone: `+91 9${int(100000000, 999999999)}`,
    personalEmail: `${first}.${p.key}@gmail.example`,
    emergencyContactName: pick(["Suresh", "Mini", "Rasheed", "Latha", "George", "Sainaba"]),
    emergencyContactPhone: `+91 9${int(100000000, 999999999)}`,
    emergencyContactRelation: pick(["Parent", "Spouse", "Sibling"]),
    departmentId: deptId.get(p.department)!,
    reportsToId: p.reportsTo ? pid(p.reportsTo) : null,
    jobTitle: p.jobTitle,
    employmentType: p.employmentType,
    workLocation: p.workLocation,
    joinDate,
    capacityMinutesPerWeek: p.capacityHours * 60,
    status: "active",
    createdAt: at(joinDate, 10),
  });
  for (const role of p.roles) rows.personRoles.push({ personId: pid(p.key), role });
  event({ occurredAt: at(joinDate, 10), actorId: pid("faisal"), action: "person.created", entityType: "person", entityId: pid(p.key), personId: pid(p.key), data: { roles: p.roles } });
}
const rolesOf = new Map(PEOPLE.map((p) => [p.key, p.roles]));

// ---------- services ----------
const serviceId = new Map<string, string>();
SERVICES.forEach((svc, i) => {
  const id = newId();
  serviceId.set(svc.key, id);
  rows.services.push({ id, key: svc.key, name: svc.name, position: i });
  svc.stages.forEach((name, position) => rows.serviceStages.push({ id: newId(), serviceId: id, name, position }));
  const templates = svc.oneOff.length ? svc.oneOff : svc.monthly;
  templates.forEach((t, position) =>
    rows.serviceTaskTemplates.push({
      id: newId(),
      serviceId: id,
      title: t.title,
      stagePosition: t.stage,
      dueOffsetDays: Math.min(28, 3 + position * 4),
      estimateMinutes: Math.round(t.hours * 60),
      defaultRole: t.role,
      position,
    }),
  );
});

// ---------- helpers for work generation ----------
type TaskSpec = { title: string; role: Role; hours: number; stage: number; creative?: boolean };

function ownerFor(role: Role, team: string[], strategist: string): string {
  const candidates = team.filter((k) => rolesOf.get(k)?.includes(role));
  if (role === "strategist") return strategist;
  if (candidates.length === 0) return strategist;
  // Interns pick up some creative and social work on their clients.
  const interns = team.filter((k) => rolesOf.get(k)?.includes("intern"));
  if (["designer", "video_editor", "social_media"].includes(role) && interns.length && chance(0.25)) return pick(interns);
  return pick(candidates);
}

function statusFor(due: IsoDate): TaskStatus {
  // Old work is finished; only the last few weeks have some realistic slippage.
  if (due < addDays(today, -30)) return "done";
  if (due < addDays(today, -3)) return chance(0.93) ? "done" : pick<TaskStatus>(["in_progress", "in_review", "blocked"]);
  if (due < today) return chance(0.6) ? "done" : pick<TaskStatus>(["in_progress", "in_review", "todo"]);
  if (due <= addDays(today, 3)) return pick<TaskStatus>(["todo", "in_progress", "in_progress", "in_review", "done"]);
  return chance(0.85) ? "todo" : "in_progress";
}

function priorityFor(): TaskPriority {
  const r = rand();
  return r < 0.08 ? "urgent" : r < 0.3 ? "high" : r < 0.9 ? "normal" : "low";
}

type Ctx = { clientId: string; engagementId: string | null; projectId: string; stageIds: string[]; strategist: string; team: string[]; load: number; deliverableId: string | null; projectFolder: string; billable: boolean };

/** Monthly usage per engagement, for periods and rollover. */
const usage = new Map<string, Map<IsoDate, number>>();
function addUsage(engagementId: string | null, workDate: IsoDate, minutes: number) {
  if (!engagementId) return;
  const byMonth = usage.get(engagementId) ?? new Map<IsoDate, number>();
  const m = startOfMonth(workDate);
  byMonth.set(m, (byMonth.get(m) ?? 0) + minutes);
  usage.set(engagementId, byMonth);
}

function addTask(ctx: Ctx, spec: TaskSpec, due: IsoDate, start: IsoDate) {
  const id = newId();
  const ownerKey = ownerFor(spec.role, ctx.team, ctx.strategist);
  const status = statusFor(due);
  const estimate = roundTo(spec.hours * 60 * between(0.8, 1.2), 30);
  let completedAt: Date | null = null;
  if (status === "done") {
    const doneDay = previousWorkingDay(addDays(due, int(-2, chance(0.15) ? 3 : 0)), week);
    completedAt = at(doneDay > today ? today : doneDay, int(10, 18), int(0, 59));
    if (completedAt > now) completedAt = new Date(now.getTime() - int(5, 120) * 60_000);
  }
  // Planned ahead: created a few days before it starts, but never in the future.
  let createdAt = at(addDays(start, -int(1, 5)), int(9, 12), int(0, 59));
  if (createdAt > now) createdAt = new Date(now.getTime() - int(1, 72) * 3600_000);
  rows.tasks.push({
    id,
    projectId: ctx.projectId,
    clientId: ctx.clientId,
    title: spec.title,
    description: chance(0.4) ? `Notes for ${spec.title.toLowerCase()}. Check the brief and last month's results first.` : null,
    status,
    priority: priorityFor(),
    ownerId: pid(ownerKey),
    reviewerId: spec.creative ? pid(ctx.strategist) : null,
    stageId: ctx.stageIds[Math.min(spec.stage, ctx.stageIds.length - 1)] ?? null,
    deliverableId: spec.creative ? ctx.deliverableId : null,
    startDate: start,
    dueDate: due,
    estimateMinutes: estimate,
    completedAt,
    rank: `m${String(rows.tasks.length).padStart(6, "0")}`,
    createdById: pid(ctx.strategist),
    createdAt,
    updatedAt: completedAt ?? createdAt,
  });
  event({ occurredAt: createdAt, actorId: pid(ctx.strategist), action: "task.created", entityType: "task", entityId: id, clientId: ctx.clientId, data: { title: spec.title } });
  if (completedAt) {
    event({ occurredAt: completedAt, actorId: pid(ownerKey), action: "task.completed", entityType: "task", entityId: id, clientId: ctx.clientId, data: { title: spec.title } });
  }

  // Subtasks on some creative work.
  if (spec.creative && chance(0.3)) {
    for (const label of ["Variant A", "Variant B"]) {
      const subDone = status === "done" || chance(0.4);
      rows.tasks.push({
        id: newId(),
        projectId: ctx.projectId,
        clientId: ctx.clientId,
        parentTaskId: id,
        title: `${spec.title} — ${label}`,
        status: subDone ? "done" : "todo",
        priority: "normal",
        ownerId: pid(ownerKey),
        startDate: start,
        dueDate: due,
        estimateMinutes: null,
        completedAt: subDone ? (completedAt ?? at(start, 15)) : null,
        rank: `m${String(rows.tasks.length).padStart(6, "0")}`,
        createdById: pid(ctx.strategist),
        createdAt,
      });
    }
  }

  // Time: actual effort scales with how hard this client is serviced.
  const actual = estimate * ctx.load * between(0.75, 1.25);
  const share = status === "done" ? 1 : status === "in_progress" || status === "in_review" || status === "blocked" ? between(0.3, 0.8) : 0;
  let remaining = roundTo(actual * share, 15);
  if (share === 0) remaining = 0;
  const lastDay = completedAt ? istDate(completedAt) : today < due ? today : due;
  const days = workingDays(start, lastDay < start ? start : lastDay, week).filter((d) => d <= today);
  const workDays = days.length ? days : [previousWorkingDay(start <= today ? start : today, week)];
  const pieces = Math.min(workDays.length, remaining > 240 ? int(2, 3) : 1);
  for (let i = 0; i < pieces && remaining > 0; i++) {
    const minutes = i === pieces - 1 ? remaining : roundTo(remaining / (pieces - i), 15);
    const workDate = workDays[Math.floor((i / pieces) * workDays.length)]!;
    const entryMinutes = Math.min(minutes, 600);
    rows.timeEntries.push({
      id: newId(),
      taskId: id,
      personId: pid(ownerKey),
      clientId: ctx.clientId,
      engagementId: ctx.engagementId,
      workDate,
      minutes: entryMinutes,
      billable: ctx.billable,
      createdAt: at(workDate, 18, int(0, 59)),
    });
    addUsage(ctx.engagementId, workDate, ctx.billable ? entryMinutes : 0);
    remaining -= entryMinutes;
  }

  // Creative output becomes an asset with versions: stills as small PNGs in the database, videos as Drive links, and a
  // review thread that matches where each one is (D80).
  if (spec.creative && status !== "todo" && !(status === "in_progress" && chance(0.5))) {
    const assetId = newId();
    const versions = status === "done" ? int(1, 3) : 1;
    const isVideo = /reel|video|edit|film/i.test(spec.title);
    const recent = due >= addDays(today, -10);
    const approval: ApprovalState =
      status === "done"
        ? !recent || chance(0.85) ? "approved" : "client_review"
        : status === "in_review"
          ? pick<ApprovalState>(["internal_review", "client_review"])
          : pick<ApprovalState>(["draft", "changes_requested"]);
    let approvedVersionId: string | null = null;
    const n = assetCount++;
    const slug = spec.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const maker = pid(ownerKey);
    const reviewer = pid(ctx.strategist);
    const internalClient = !ctx.billable;
    for (let v = 1; v <= versions; v++) {
      const versionId = newId();
      const made = at(start, 12 + v) > now ? now : at(start, 12 + v);
      if (v === versions && approval === "approved") approvedVersionId = versionId;
      if (isVideo) {
        const url = `https://drive.google.com/file/d/seed${newId().replace(/-/g, "").slice(-20)}/view`;
        rows.assetVersions.push({ id: versionId, assetId, version: v, storageProvider: "external_link", storageLocation: url, storageFileId: url, fileName: `drive.google.com${new URL(url).pathname.slice(0, 40)}…`, mimeType: null, sizeBytes: null, uploadedById: maker, createdAt: made });
      } else {
        const data = samplePng(n, v);
        const fileId = newId();
        const fileName = `${slug}-v${v}.png`;
        rows.storedFiles.push({ id: fileId, folder: `clients/${ctx.clientId}/assets/${assetId}`, name: fileName, contentType: "image/png", sizeBytes: data.byteLength, data, createdAt: made });
        rows.assetVersions.push({ id: versionId, assetId, version: v, storageProvider: "postgres", storageLocation: "stored_files", storageFileId: fileId, fileName, mimeType: "image/png", sizeBytes: data.byteLength, uploadedById: maker, createdAt: made });
      }
      // The thread: earlier versions went back with changes; the latest is wherever the asset is now.
      const say = (minutes: number, authorId: string, action: (typeof s.assetComments.$inferInsert)["action"], body = "") =>
        rows.assetComments.push({ id: newId(), assetId, versionId, authorId, action, body, createdAt: new Date(Math.min(made.getTime() + minutes * 60_000, now.getTime())) });
      const last = v === versions;
      const state: ApprovalState = last ? approval : "changes_requested";
      if (state === "draft") continue;
      say(5, maker, "submit");
      if (state === "internal_review") continue;
      if (internalClient) {
        say(90, reviewer, state === "approved" ? "approve" : "request_changes", state === "approved" ? "" : CHANGE_NOTES[(n + v) % CHANGE_NOTES.length]);
        continue;
      }
      if (state === "changes_requested" && (n + v) % 3 === 0) {
        say(60, reviewer, "request_changes", CHANGE_NOTES[(n + v) % CHANGE_NOTES.length]);
        continue;
      }
      say(60, reviewer, "send_to_client");
      if (state === "client_review") continue;
      if (state === "approved") say(240, reviewer, "client_approved", (n % 2 ? "Principal approved on WhatsApp" : "Approved by the director on a call"));
      else say(240, reviewer, "client_changes", CHANGE_NOTES[(n + v) % CHANGE_NOTES.length]);
      if (n % 4 === 0) say(250, maker, null, "On it, new version by evening.");
    }
    rows.assets.push({
      id: assetId,
      clientId: ctx.clientId,
      projectId: ctx.projectId,
      taskId: id,
      title: spec.title,
      kind: isVideo ? "video" : "image",
      approvalState: approval,
      currentVersion: versions,
      approvedVersionId,
      approvedById: approvedVersionId ? pid(ctx.strategist) : null,
      approvedAt: approvedVersionId ? completedAt : null,
      createdById: pid(ownerKey),
      createdAt: at(start, 12) > now ? now : at(start, 12),
      updatedAt: completedAt ?? (at(start, 12 + versions) > now ? now : at(start, 12 + versions)),
    });
    if (approvedVersionId) {
      event({ occurredAt: completedAt ?? now, actorId: pid(ctx.strategist), action: "asset.approved", entityType: "asset", entityId: assetId, clientId: ctx.clientId, data: { version: versions } });
    }
  }
}

function newProject(input: { clientId: string; engagementId: string | null; name: string; svc: SeedService | null; strategist: string; start: IsoDate; due: IsoDate | null; done: boolean; onHold?: boolean; stageIndex: number }) {
  const id = newId();
  const stageIds = (input.svc?.stages ?? ["Planned", "Doing", "Done"]).map((name, position) => {
    const sid = newId();
    rows.projectStages.push({ id: sid, projectId: id, name, position });
    return sid;
  });
  rows.projects.push({
    id,
    clientId: input.clientId,
    engagementId: input.engagementId,
    name: input.name,
    status: input.done ? "completed" : input.onHold ? "on_hold" : "active",
    currentStageId: stageIds[Math.min(input.stageIndex, stageIds.length - 1)] ?? null,
    leadId: pid(input.strategist),
    startDate: input.start,
    dueDate: input.due,
    completedAt: input.done && input.due ? at(input.due, 17) : null,
    createdById: pid(input.strategist),
    createdAt: at(input.start, 10),
  });
  event({ occurredAt: at(input.start, 10), actorId: pid(input.strategist), action: "project.created", entityType: "project", entityId: id, clientId: input.clientId, data: { name: input.name } });
  return { id, stageIds };
}

const monthLabel = (m: IsoDate) => new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}T00:00:00Z`));

// ---------- clients, engagements, projects, tasks ----------
for (const c of CLIENTS) {
  const clientId = newId();
  const starts = c.engagements.map((e) => engagementStart(e));
  const clientStart = starts.sort()[0]!;
  rows.clients.push({
    id: clientId,
    name: c.name,
    legalName: c.legalName,
    segment: c.segment,
    city: c.city,
    status: c.status ?? "active",
    startDate: clientStart,
    gstin: c.gstin,
    billingAddress: `${c.legalName}, ${c.city}, Kerala`,
    leadStrategistId: pid(c.strategist),
    crmLeadId: `crm-${newId().slice(-10)}`,
    createdAt: at(clientStart, 11),
  });
  event({ occurredAt: at(clientStart, 11), actorId: pid("ajmal"), action: "client.created", entityType: "client", entityId: clientId, clientId, data: { name: c.name } });
  c.contacts.forEach((ct) =>
    rows.clientContacts.push({ id: newId(), clientId, name: ct.name, designation: ct.designation, phone: ct.phone, email: ct.email, whatsapp: ct.phone, isPrimary: ct.primary ?? false }),
  );
  for (const key of new Set([c.strategist, ...c.team])) rows.clientMembers.push({ clientId, personId: pid(key) });

  for (const e of c.engagements) {
    const svc = SERVICES.find((x) => x.key === e.service)!;
    const engagementId = newId();
    const start = engagementStart(e);
    const end = e.kind === "one_off" ? addDays(start, (e.durationDays ?? 30) - 1) : null;
    const status = e.status ?? (end && end < today ? "ended" : "active");
    let renewal: IsoDate | null = null;
    if (e.kind === "retainer") {
      renewal = addMonths(start, 12);
      while (renewal < today) renewal = addMonths(renewal, 12);
    }
    rows.engagements.push({
      id: engagementId,
      clientId,
      serviceId: serviceId.get(svc.key)!,
      kind: e.kind,
      name: e.kind === "retainer" ? `${svc.name} retainer` : `${svc.name} — ${c.name.split(" ")[0]}`,
      status,
      startDate: start,
      endDate: end,
      renewalDate: renewal,
      hoursBudgetMinutes: e.hours * 60,
      rolloverPolicy: e.rollover ? "rollover" : "expire",
      createdAt: at(start, 11),
    });
    event({ occurredAt: at(start, 11), actorId: pid("ajmal"), action: "engagement.created", entityType: "engagement", entityId: engagementId, clientId, data: { kind: e.kind } });

    const fees: Array<{ from: IsoDate; paise: number }> = [{ from: start, paise: e.feeRupees * 100 }];
    if (e.feeChange) fees.push({ from: startOfMonth(addMonths(today, -e.feeChange.monthsAgo)), paise: e.feeChange.feeRupees * 100 });
    for (const f of fees) {
      rows.engagementFees.push({ id: newId(), engagementId, amountPaise: f.paise, effectiveFrom: f.from, createdById: pid("faisal"), createdAt: at(f.from, 10) });
      if (f.from !== start) event({ occurredAt: at(f.from, 10), actorId: pid("faisal"), action: "engagement.fee_changed", entityType: "engagement", entityId: engagementId, clientId, data: { amountPaise: f.paise } });
    }
    const feeOn = (d: IsoDate) => fees.filter((f) => f.from <= d).at(-1)?.paise ?? fees[0]!.paise;

    let deliverableId: string | null = null;
    for (const d of svc.deliverables) {
      const did = newId();
      deliverableId ??= did;
      rows.deliverables.push({ id: did, engagementId, name: d.name, targetCount: e.kind === "retainer" ? d.perMonth : d.perMonth * 2 });
    }

    if (e.kind === "one_off") {
      const done = end! < today;
      const project = newProject({ clientId, engagementId, name: rows.engagements.at(-1)!.name, svc, strategist: c.strategist, start, due: end, done, stageIndex: done ? 99 : 2 });
      const ctx: Ctx = { clientId, engagementId, projectId: project.id, stageIds: project.stageIds, strategist: c.strategist, team: c.team, load: e.load, deliverableId, projectFolder: `Clients/${c.name}/${svc.name}`, billable: true };
      const span = (e.durationDays ?? 30) - 1;
      svc.oneOff.forEach((spec, i) => {
        const due = previousWorkingDay(addDays(start, Math.round(((i + 1) / svc.oneOff.length) * span)), week);
        addTask(ctx, spec, due, previousWorkingDay(addDays(due, -int(2, 6)), week));
      });
      continue;
    }

    // Retainer: one project per quarter-long admissions campaign, monthly recurring work inside it.
    const pausedAfter = status === "paused" ? startOfMonth(addMonths(today, -2)) : null;
    const months: IsoDate[] = [];
    for (let m = startOfMonth(start > windowStart ? start : windowStart); m <= thisMonth; m = addMonths(m, 1)) months.push(m);
    const campaigns: IsoDate[][] = [];
    for (let i = 0; i < months.length; i += 3) campaigns.push(months.slice(i, i + 3));

    for (const campaign of campaigns) {
      const first = campaign[0]!;
        const campaignEnd = endOfMonth(addMonths(first, 2));
      const done = campaignEnd < today;
      const onHold = !done && pausedAfter !== null;
      const name = `${svc.name} · ${monthLabel(first)}${campaign.length > 1 || !done ? ` – ${monthLabel(addMonths(first, 2))}` : ""}`;
      const project = newProject({ clientId, engagementId, name, svc, strategist: c.strategist, start: first > start ? first : start, due: campaignEnd, done, onHold, stageIndex: done ? 99 : 3 });
      const ctx: Ctx = { clientId, engagementId, projectId: project.id, stageIds: project.stageIds, strategist: c.strategist, team: c.team, load: e.load, deliverableId, projectFolder: `Clients/${c.name}/${name}`, billable: true };

      for (const m of campaign) {
        if (pausedAfter && m > pausedAfter) continue;
        const monthFrom = m < start ? start : m;
        const days = workingDays(monthFrom, endOfMonth(m), week);
        if (days.length === 0) continue;
        // Plan the month's work, then scale estimates so planned hours match the (prorated) budget;
        // the client's load factor then decides whether they end up under or over it.
        const planned: Array<{ spec: TaskSpec; title: string; due: IsoDate; start: IsoDate }> = [];
        for (const spec of svc.monthly) {
          const weekly = /weekly|bid|community/i.test(spec.title) || spec.creative;
          const count = weekly ? Math.max(1, Math.round(days.length / 6)) : 1;
          for (let k = 0; k < count; k++) {
            // Reports land at month end; everything else spreads through the month.
            const position = /report/i.test(spec.title) ? days.length - 1 : Math.min(days.length - 1, Math.floor(((k + between(0.2, 0.9)) / count) * days.length));
            const short = monthLabel(m).split(" ")[0];
            planned.push({
              spec,
              title: count > 1 ? `${spec.title} (${short} #${k + 1})` : `${spec.title} (${short})`,
              due: days[position]!,
              start: days[Math.max(0, position - int(1, 4))]!,
            });
          }
        }
        const covered = periodTerms({ engagementStart: start, engagementEnd: end, anyDateInMonth: m, monthlyBudgetMinutes: e.hours * 60, monthlyFeePaise: 0 });
        const plannedHours = planned.reduce((sum, t) => sum + t.spec.hours, 0);
        const scale = covered && plannedHours > 0 ? covered.baseBudgetMinutes / 60 / plannedHours : 1;
        for (const t of planned) addTask(ctx, { ...t.spec, title: t.title, hours: t.spec.hours * scale }, t.due, t.start);
        // Over-serviced clients pull in unplanned extra work early in the month: this is what burn warns about.
        if (m === thisMonth && e.load > 1.1) {
          const early = days.filter((d) => d < today);
          for (let k = 0; k < 3 && early.length; k++) {
            const due = early[Math.min(early.length - 1, 2 + k * 2)]!;
            addTask(ctx, { title: `Extra revisions the client asked for (#${k + 1})`, role: "designer", hours: (e.hours * 0.13) / e.load, stage: 2 }, due, early[0]!);
          }
        }
      }
    }

    // Periods: calendar months in the window, prorated, with rollover from the month before (D22–D24).
    let previous: { baseBudgetMinutes: number; rolloverInMinutes: number; usedMinutes: number } | null = null;
    for (const m of months) {
      // A paused retainer opens no new periods.
      if (pausedAfter && m > pausedAfter) continue;
      const terms = periodTerms({ engagementStart: start, engagementEnd: end, anyDateInMonth: m, monthlyBudgetMinutes: e.hours * 60, monthlyFeePaise: feeOn(m) });
      if (!terms) continue;
      const rolloverIn: number = previous ? rolloverMinutes({ policy: e.rollover ? "rollover" : "expire", monthlyBudgetMinutes: e.hours * 60, previous }) : 0;
      const used = usage.get(engagementId)?.get(m) ?? 0;
      const budget = terms.baseBudgetMinutes + rolloverIn;
      const pct = budget > 0 ? (used * 100) / budget : 0;
      rows.engagementPeriods.push({
        id: newId(),
        engagementId,
        periodStart: terms.periodStart,
        periodEnd: terms.periodEnd,
        baseBudgetMinutes: terms.baseBudgetMinutes,
        rolloverInMinutes: rolloverIn,
        feePaise: terms.feePaise,
        status: terms.periodEnd < today ? "closed" : "open",
        warned80At: pct >= 80 ? at(terms.periodEnd < today ? terms.periodEnd : today, 9) : null,
        warned100At: pct >= 100 ? at(terms.periodEnd < today ? terms.periodEnd : today, 9) : null,
        createdAt: at(terms.periodStart, 0, 5),
      });
      previous = { baseBudgetMinutes: terms.baseBudgetMinutes, rolloverInMinutes: rolloverIn, usedMinutes: used };
    }
  }
}

function engagementStart(e: SeedEngagement): IsoDate {
  return addDays(addMonths(thisMonth, -e.startMonthsAgo), e.startDay - 1);
}

// ---------- Oppllo's own internal work (no budget, not billable) ----------
{
  const clientId = newId();
  rows.clients.push({ id: clientId, name: "Oppllo (internal)", segment: "other", city: "Kochi", status: "active", isInternal: true, leadStrategistId: pid("faisal"), startDate: windowStart, createdAt: at(windowStart, 9) });
  for (const key of PEOPLE.map((p) => p.key)) rows.clientMembers.push({ clientId, personId: pid(key) });
  const internal: Array<{ name: string; tasks: TaskSpec[] }> = [
    { name: "Oppllo marketing", tasks: [
      { title: "Oppllo Instagram post", role: "social_media", hours: 1.5, stage: 1 },
      { title: "Case study write-up", role: "strategist", hours: 3, stage: 1 },
      { title: "Oppllo reel", role: "video_editor", hours: 3, stage: 1, creative: true },
    ] },
    { name: "Team and operations", tasks: [
      { title: "Team learning session", role: "strategist", hours: 1.5, stage: 1 },
      { title: "Monthly invoices to clients", role: "accountant", hours: 3, stage: 1 },
      { title: "Sales pipeline review", role: "bdo", hours: 1, stage: 1 },
    ] },
  ];
  for (const proj of internal) {
    const project = newProject({ clientId, engagementId: null, name: proj.name, svc: null, strategist: "faisal", start: windowStart, due: null, done: false, stageIndex: 1 });
    const team = PEOPLE.map((p) => p.key);
    const ctx: Ctx = { clientId, engagementId: null, projectId: project.id, stageIds: project.stageIds, strategist: "faisal", team, load: 1, deliverableId: null, projectFolder: `Oppllo/${proj.name}`, billable: false };
    for (let m = windowStart; m <= thisMonth; m = addMonths(m, 1)) {
      const days = workingDays(m, endOfMonth(m), week);
      for (const spec of proj.tasks) {
        const due = days[int(Math.floor(days.length / 3), days.length - 1)]!;
        addTask(ctx, { ...spec, title: `${spec.title} (${monthLabel(m).split(" ")[0]})` }, due, days[Math.max(0, days.indexOf(due) - 2)]!);
      }
    }
  }
}

// A few tasks for this week so My Day has real content for everyone, including people without client work.
{
  const internalProject = rows.projects.find((p) => p.name === "Team and operations")!;
  const internalClientId = internalProject.clientId;
  const weekDays = workingDays(today, addDays(today, 6), week);
  const extras: Array<[string, string]> = [
    ["divya", "Collect October attendance sheets"],
    ["divya", "Update the holiday list for next year"],
    ["joseph", "Reconcile September payments"],
    ["ajmal", "Follow up audit calls from last week"],
    ["faisal", "Review Q4 pricing for retainers"],
  ];
  for (const [key, title] of extras) {
    const due = pick(weekDays.length ? weekDays : [today]);
    const createdAt = at(addDays(today, -2), 10);
    const id = newId();
    rows.tasks.push({ id, projectId: internalProject.id, clientId: internalClientId, title, status: "todo", priority: "normal", ownerId: pid(key), startDate: today, dueDate: due, estimateMinutes: 60, rank: `m${String(rows.tasks.length).padStart(6, "0")}`, createdById: pid("faisal"), createdAt });
    event({ occurredAt: createdAt, actorId: pid("faisal"), action: "task.created", entityType: "task", entityId: id, clientId: internalClientId, data: { title } });
  }
}

// ---------- HR: settings, leave types, holidays, a year of leave ----------
{
  rows.settings.push({ key: "work_week", value: DEFAULT_WORK_WEEK, updatedById: pid("faisal") });
  const leaveTypeId = new Map<string, string>();
  LEAVE_TYPES.forEach((t, position) => {
    const id = newId();
    leaveTypeId.set(t.key, id);
    const { quotasDays, ...rest } = t;
    rows.leaveTypes.push({ id, ...rest, position });
    for (const [employmentType, days] of Object.entries(quotasDays)) {
      rows.leaveQuotas.push({ id: newId(), leaveTypeId: id, employmentType: employmentType as never, halfDaysPerYear: days * 2 });
    }
  });
  for (const [date, name] of HOLIDAYS) rows.holidays.push({ id: newId(), date, name });
  const holidaySet = new Set(HOLIDAYS.map(([d]) => d));

  const owners = PEOPLE.filter((p) => p.roles.includes("owner")).map((p) => pid(p.key));
  const active = new Set(PEOPLE.map((p) => pid(p.key)));
  for (const l of LEAVES) {
    const person = PEOPLE.find((p) => p.key === l.person)!;
    // Start on a working day, then take `days` working days.
    let start = addDays(today, -l.fromDaysAgo);
    while (!isWorkingDay(start, week, holidaySet)) start = addDays(start, 1);
    let end = start;
    for (let n = 1; n < l.days; ) {
      end = addDays(end, 1);
      if (isWorkingDay(end, week, holidaySet)) n++;
    }
    const { approverId, autoApprove } = approverFor({
      requester: { id: pid(person.key), roles: person.roles, reportsToId: person.reportsTo ? pid(person.reportsTo) : null },
      activePeopleIds: active,
      ownerIds: owners,
    });
    const id = newId();
    let requestedAt = at(addDays(start, -Math.max(2, Math.min(10, l.fromDaysAgo + 12))), 10, 15);
    if (requestedAt > now) requestedAt = new Date(now.getTime() - int(2, 48) * 3600_000);
    const decided = l.status !== "pending";
    const decidedAt = decided ? new Date(Math.min(requestedAt.getTime() + 5 * 3600_000, now.getTime() - 60_000)) : null;
    rows.leaveRequests.push({
      id,
      personId: pid(person.key),
      leaveTypeId: leaveTypeId.get(l.type)!,
      startDate: start,
      endDate: end,
      halfDay: l.halfDay ?? null,
      reason: l.reason,
      status: autoApprove && l.status === "pending" ? "approved" : l.status,
      approverId,
      decidedById: decided && l.status !== "cancelled" ? approverId : null,
      decidedAt,
      decisionNote: l.status === "rejected" ? "Campaign launch that week — can we move it?" : null,
      createdById: pid(person.key),
      createdAt: requestedAt,
      updatedAt: decidedAt ?? requestedAt,
    });
    event({ occurredAt: requestedAt, actorId: pid(person.key), action: "leave.requested", entityType: "leave_request", entityId: id, personId: pid(person.key), data: { type: l.type, startDate: start, endDate: end } });
    if (decidedAt) {
      const action = l.status === "cancelled" ? "leave.cancelled" : `leave.${l.status}`;
      event({ occurredAt: decidedAt, actorId: l.status === "cancelled" ? pid(person.key) : approverId, action, entityType: "leave_request", entityId: id, personId: pid(person.key) });
    }
  }
  for (const [key, daysAgo, days, reason] of GRANTS) {
    const grantedOn = addDays(today, -daysAgo);
    const id = newId();
    rows.leaveGrants.push({ id, personId: pid(key), leaveTypeId: leaveTypeId.get("comp_off")!, halfDays: days * 2, grantedOn, expiresOn: addDays(grantedOn, 60), reason, grantedById: pid("divya") });
    event({ occurredAt: at(grantedOn, 11), actorId: pid("divya"), action: "leave.granted", entityType: "leave_grant", entityId: id, personId: pid(key), data: { halfDays: days * 2, reason } });
  }
}

// ---------- HR slice 2: four weeks of attendance ----------
{
  const holidaySet = new Set(HOLIDAYS.map(([d]) => d));
  // Full days of approved leave: nobody checks in on those.
  const away = new Set<string>();
  for (const l of rows.leaveRequests.filter((r) => r.status === "approved" && !r.halfDay)) {
    for (let d = l.startDate; d <= l.endDate; d = addDays(d, 1)) away.add(`${l.personId}|${d}`);
  }
  const nowMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % 1440;
  // Rough locations (thousandths of a degree): the Kochi office, homes around it, client campuses.
  const OFFICE = [10026, 76313] as const;
  for (const person of PEOPLE.filter((p) => p.employmentType !== "freelancer")) {
    const personId = pid(person.key);
    const joinDate = rows.people.find((p) => p.id === personId)!.joinDate as IsoDate;
    const creative = person.roles.some((r) => ["designer", "video_editor", "social_media"].includes(r));
    for (let ago = 27; ago >= 0; ago--) {
      const date = addDays(today, -ago);
      if (date < joinDate || !isWorkingDay(date, week, holidaySet) || away.has(`${personId}|${date}`)) continue;
      // Today: about two in three are in by now, once the morning has started.
      if (ago === 0 && (nowMinutes < 9 * 60 + 45 || chance(0.35))) continue;
      if (ago > 0 && chance(0.03)) continue; // a day nobody recorded
      const location =
        creative && chance(0.08) ? "client_site" : person.workLocation === "home" ? (chance(0.7) ? "home" : "office") : person.workLocation === "hybrid" && chance(0.35) ? "home" : "office";
      const late = chance(0.12);
      const inMinutes = late ? int(9 * 60 + 46, 10 * 60 + 30) : int(9 * 60 + 5, 9 * 60 + 44);
      const checkInAt = at(date, Math.floor(inMinutes / 60), inMinutes % 60);
      const short = person.employmentType !== "part_time" && chance(0.06);
      const outMinutes = person.employmentType === "part_time" ? inMinutes + int(240, 330) : short ? int(15 * 60 + 40, 16 * 60 + 20) : int(18 * 60, 18 * 60 + 50);
      const forgot = ago > 0 && ago < 6 && chance(0.04);
      const located = chance(0.4);
      rows.attendanceDays.push({
        id: newId(),
        personId,
        workDate: date,
        location,
        checkInAt,
        checkOutAt: ago === 0 || forgot ? null : at(date, Math.floor(outMinutes / 60), outMinutes % 60),
        latMilli: located ? OFFICE[0] + (location === "office" ? 0 : int(-60, 60)) : null,
        lngMilli: located ? OFFICE[1] + (location === "office" ? 0 : int(-60, 60)) : null,
        note: location === "client_site" ? pick(["Shoot at the campus", "Admission fair stall", "Client review meeting"]) : null,
        correctedById: null,
        correctionReason: null,
        createdAt: checkInAt,
        updatedAt: checkInAt,
      });
    }
  }
}

// ---------- HR slice 2: the access register and a joining checklist ----------
{
  const grant = (key: string, system: string, account: string | null, level: string | null, clientId: string | null = null) => {
    const person = rows.people.find((p) => p.id === pid(key))!;
    rows.accessGrants.push({ id: newId(), personId: person.id, system, account, level, clientId, grantedOn: person.joinDate as IsoDate, grantedById: pid("divya") });
  };
  for (const p of PEOPLE) {
    grant(p.key, "Google Workspace", `${p.fullName.split(" ")[0]!.toLowerCase()}@oppllo.com`, p.roles.includes("owner") ? "Super admin" : "User");
    grant(p.key, "ClickUp", null, p.roles.some((r) => ["owner", "strategist"].includes(r)) ? "Admin" : "Member");
    if (p.roles.some((r) => ["designer", "video_editor", "social_media", "intern"].includes(r))) grant(p.key, "Canva", "Oppllo team", "Member");
  }
  // Client ad accounts: the performance team has them.
  for (const c of rows.clients.filter((x) => !x.isInternal).slice(0, 5)) {
    grant("rahul", "Meta Business Manager", `${c.name} ad account`, "Admin", c.id);
    grant("anjali", "Meta Business Manager", `${c.name} ad account`, "Analyst", c.id);
  }
  // The newest joiner's checklist, mostly done.
  const newest = [...PEOPLE].sort((a, b) => a.joinedMonthsAgo - b.joinedMonthsAgo)[0]!;
  const steps = ["Google Workspace account and Oppllo email", "Oppllo One login and roles checked", "Added to the team WhatsApp groups", "Tools they need: Canva, Meta Business Manager, Google Ads (record each in Access)", "Laptop or other device handed over", "Introduced to the team", "First client briefing with their lead", "Offer letter signed and filed", "ID proof copy filed (last four digits only in Oppllo One)", "Emergency contact recorded"];
  const joined = rows.people.find((p) => p.id === pid(newest.key))!.joinDate as IsoDate;
  steps.forEach((title, position) =>
    rows.checklistItems.push({ id: newId(), personId: pid(newest.key), kind: "joining", title, position, source: null, doneAt: position < 7 ? at(addDays(joined, Math.min(position, 4)), 11) : null, doneById: position < 7 ? pid("divya") : null }),
  );
}

// ---------- HR slice 2: the document locker (small sample PDFs kept in PostgreSQL, D78) ----------
/** A one-page PDF with a few lines of text: enough to open in a browser. ASCII only. */
function samplePdf(lines: string[]): Buffer {
  const esc = (t: string) => t.replace(/[\\()]/g, (c) => `\\${c}`);
  const text = lines.map((l, i) => `BT /F1 ${i === 0 ? 16 : 11} Tf 56 ${780 - i * 22} Td (${esc(l)}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(text, "latin1")} >>\nstream\n${text}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
{
  const file = (key: string, kind: (typeof s.personDocuments.$inferInsert)["kind"], title: string, lines: string[], opts: { expiresOn?: IsoDate; daysAfterJoining?: number } = {}) => {
    const person = rows.people.find((p) => p.id === pid(key))!;
    const data = samplePdf(lines);
    const fileId = newId();
    const fileName = `${title} - ${person.fullName}.pdf`;
    const createdAt = at(addDays(person.joinDate as IsoDate, opts.daysAfterJoining ?? 1), 12);
    rows.storedFiles.push({ id: fileId, folder: `people/${person.id}`, name: fileName, contentType: "application/pdf", sizeBytes: data.byteLength, data, createdAt });
    rows.personDocuments.push({ id: newId(), personId: person.id, kind, title, provider: "postgres", location: "stored_files", fileId, fileName, contentType: "application/pdf", sizeBytes: data.byteLength, expiresOn: opts.expiresOn ?? null, uploadedById: pid("divya"), createdAt, updatedAt: createdAt });
  };
  for (const p of PEOPLE.filter((x) => !x.roles.includes("owner"))) {
    const joined = rows.people.find((r) => r.id === pid(p.key))!.joinDate as IsoDate;
    file(p.key, "offer_letter", "Offer letter", ["Oppllo Digital", `Offer letter for ${p.fullName}`, `Role: ${p.jobTitle}`, `Joining on ${joined}`, "Sample document for testing Oppllo One."], { daysAfterJoining: -7 });
    if (p.employmentType === "intern") {
      // Internship agreements run three or four months: the newest ones lapse soon.
      file(p.key, "contract", "Internship agreement", ["Oppllo Digital", `Internship agreement: ${p.fullName}`, `From ${joined} for four months`], { expiresOn: addMonths(joined, 4) });
    } else {
      file(p.key, "contract", "Employment agreement", ["Oppllo Digital", `Employment agreement: ${p.fullName}`, `From ${joined}`]);
    }
  }
  file("vishnu", "id_proof", "Masked Aadhaar", ["Masked Aadhaar (sample)", "Vishnu Prasad", "XXXX XXXX 4821"], { daysAfterJoining: 2 });
  file("hiba", "id_proof", "Masked Aadhaar", ["Masked Aadhaar (sample)", "Hiba Nasrin", "XXXX XXXX 7310"], { daysAfterJoining: 2 });
  file("nikhil", "certificate", "Premiere Pro certificate", ["Certificate of completion (sample)", "Nikhil Thomas", "Adobe Premiere Pro, advanced"], { daysAfterJoining: 30 });
}

// ---------- content calendars (D81): this month and next for client accounts ----------
{
  const channels = ["instagram_post", "instagram_reel", "instagram_story", "facebook_post", "meta_ad"] as const;
  const ideas = ["Admission open announcement", "Topper testimonial", "Fee offer reminder", "Campus tour reel", "Free demo class", "Result day celebration", "Scholarship test", "Parent FAQ carousel", "Faculty spotlight", "Last-date countdown"];
  const thisMonth = startOfMonth(today);
  rows.clients.filter((c) => !c.isInternal).slice(0, 8).forEach((c, ci) => {
    const creatives = rows.assets.filter((a) => a.clientId === c.id);
    for (let k = 0; k < 16; k++) {
      const day = addDays(thisMonth, Math.floor((k * 59) / 16) - (k > 9 ? 0 : 0));
      const asset = creatives[(ci + k) % Math.max(creatives.length, 1)];
      const past = day < today;
      const approved = asset?.approvalState === "approved";
      const status = past ? (approved ? "published" : "ready") : approved ? (k % 2 ? "scheduled" : "ready") : asset ? "in_production" : "idea";
      rows.contentItems.push({
        id: newId(),
        clientId: c.id!,
        title: ideas[(ci + k) % ideas.length]!,
        channel: channels[(ci + k) % channels.length]!,
        publishOn: day,
        publishTime: k % 3 ? `${String(17 + (k % 3)).padStart(2, "0")}:30` : null,
        status: status === "published" && !approved ? "ready" : status,
        assetId: asset && (approved || !past) ? asset.id! : null,
        ownerId: pid("fathima"),
        caption: k % 2 ? "Admissions open for 2027. Limited seats. Call 94470 11223." : null,
        publishedUrl: status === "published" ? "https://www.instagram.com/p/seedpost/" : null,
        createdById: pid("fathima"),
      });
    }
  });
}

// ---------- board order, comments and recurring rules ----------
{
  // Board ranks: per project and status, in due-date order, as fractional keys.
  const groups = new Map<string, typeof rows.tasks>();
  for (const t of rows.tasks) {
    const key = `${t.projectId}|${t.parentTaskId ?? ""}|${t.status}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
    const keys = generateNKeysBetween(null, null, group.length);
    group.forEach((t, i) => (t.rank = keys[i]!));
  }

  // A little conversation on work in progress.
  const lines = [
    "Client wants the fee details bigger on the first frame.",
    "Shared v2 in the Drive folder — please check the CTA.",
    "Lead quality dropped this week; let's test the 'scholarship' angle.",
    "Approved by the principal on WhatsApp, moving to ready.",
    "Can we push this to Thursday? Shoot moved.",
    "Numbers look good: CPL down 18% vs last week.",
  ];
  const keys = PEOPLE.map((p) => p.key);
  for (const t of rows.tasks.filter((x) => !x.parentTaskId && x.status !== "todo")) {
    if (!chance(0.3)) continue;
    const n = int(1, 3);
    for (let i = 0; i < n; i++) {
      const author = i === 0 && t.ownerId ? t.ownerId : pid(pick(keys));
      rows.taskComments.push({ id: newId(), taskId: t.id, authorId: author, body: pick(lines), createdAt: new Date((t.createdAt as Date).getTime() + (i + 1) * 3 * 3600_000) });
    }
  }

  // Recurring rules on each live retainer project (the generator continues them after this month).
  const monthEnd = endOfMonth(today);
  for (const project of rows.projects.filter((p) => p.status === "active" && p.engagementId)) {
    const engagement = rows.engagements.find((e) => e.id === project.engagementId)!;
    const svcKey = SERVICES.find((x) => serviceId.get(x.key) === engagement.serviceId)!.key;
    const stages = rows.projectStages.filter((st) => st.projectId === project.id);
    const live = stages.find((st) => st.position === 3)?.id ?? null;
    const report = stages.find((st) => st.position === 4)?.id ?? null;
    const base = { projectId: project.id, clientId: project.clientId, priority: "normal" as const, leadWorkingDays: 1, startsOn: windowStart, active: true, generatedUntil: monthEnd, createdById: project.leadId };
    rows.taskRecurrences.push({ id: newId(), ...base, title: "Monthly performance report", ownerId: project.leadId, stageId: report, estimateMinutes: 180, frequency: "monthly", dayOfMonth: 31, leadWorkingDays: 3 });
    if (svcKey === "meta_ads" || svcKey === "google_ads") {
      rows.taskRecurrences.push({ id: newId(), ...base, title: svcKey === "meta_ads" ? "Weekly ad check and budget pacing" : "Weekly search terms review", ownerId: pid("rahul"), stageId: live, estimateMinutes: 90, frequency: "weekly", weekday: 1 });
    }
  }
}

// ---------- write ----------
async function insertAll(db: PostgresJsDatabase, table: Parameters<PostgresJsDatabase["insert"]>[0], values: unknown[], chunk = 1000) {
  for (let i = 0; i < values.length; i += chunk) {
    await db.insert(table).values(values.slice(i, i + chunk) as never);
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  const host = new URL(url).hostname;
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "db"].includes(host)) {
    throw new Error(`Refusing to seed a non-local database (${host}).`);
  }

  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client);
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`truncate table ad_insight_cache, client_ad_accounts, google_conversions, lead_activities, leads, lead_sources, ai_usage, mcp_connections, oauth_codes, oauth_clients, crm_won_leads, notifications, content_items, asset_comments, person_documents, stored_files, checklist_items, access_grants, attendance_days, task_comments, task_recurrences, settings, leave_grants, leave_requests, leave_quotas, leave_types, holidays, events, asset_versions, assets, time_entries, tasks, deliverables, project_stages, projects,
        engagement_periods, engagement_fees, engagements, client_members, client_contacts, clients,
        service_task_templates, service_stages, services, person_roles, departments, people cascade`);
      // Departments reference their head; insert them headless, then set heads once people exist.
      const heads = rows.departments.map((d) => ({ id: d.id, head: d.headPersonId }));
      await insertAll(tx, s.departments, rows.departments.map((d) => ({ ...d, headPersonId: null })));
      // People reference their manager: insert managers first.
      const ordered = [...rows.people].sort((a, b) => Number(Boolean(a.reportsToId)) - Number(Boolean(b.reportsToId)));
      const inserted = new Set<string>();
      while (inserted.size < ordered.length) {
        const ready = ordered.filter((p) => !inserted.has(p.id) && (!p.reportsToId || inserted.has(p.reportsToId)));
        await insertAll(tx, s.people, ready);
        ready.forEach((p) => inserted.add(p.id));
      }
      for (const h of heads) await tx.update(s.departments).set({ headPersonId: h.head }).where(sql`id = ${h.id}`);
      await insertAll(tx, s.personRoles, rows.personRoles);
      await insertAll(tx, s.services, rows.services);
      await insertAll(tx, s.serviceStages, rows.serviceStages);
      await insertAll(tx, s.serviceTaskTemplates, rows.serviceTaskTemplates);
      await insertAll(tx, s.clients, rows.clients);
      await insertAll(tx, s.clientContacts, rows.clientContacts);
      await insertAll(tx, s.clientMembers, rows.clientMembers);
      await insertAll(tx, s.engagements, rows.engagements);
      await insertAll(tx, s.engagementFees, rows.engagementFees);
      await insertAll(tx, s.engagementPeriods, rows.engagementPeriods);
      // Projects point at a current stage and stages point at projects: insert projects without it first.
      await insertAll(tx, s.projects, rows.projects.map((p) => ({ ...p, currentStageId: null })));
      await insertAll(tx, s.projectStages, rows.projectStages);
      for (const p of rows.projects) {
        if (p.currentStageId) await tx.update(s.projects).set({ currentStageId: p.currentStageId }).where(sql`id = ${p.id}`);
      }
      await insertAll(tx, s.deliverables, rows.deliverables);
      // Parents before subtasks.
      await insertAll(tx, s.tasks, rows.tasks.filter((t) => !t.parentTaskId));
      await insertAll(tx, s.tasks, rows.tasks.filter((t) => t.parentTaskId));
      await insertAll(tx, s.taskRecurrences, rows.taskRecurrences);
      await insertAll(tx, s.timeEntries, rows.timeEntries);
      await insertAll(tx, s.taskComments, rows.taskComments);
      await insertAll(tx, s.assets, rows.assets.map((a) => ({ ...a, approvedVersionId: null })));
      await insertAll(tx, s.assetVersions, rows.assetVersions);
      await insertAll(tx, s.assetComments, rows.assetComments);
      await insertAll(tx, s.contentItems, rows.contentItems);
      for (const a of rows.assets) {
        if (a.approvedVersionId) await tx.update(s.assets).set({ approvedVersionId: a.approvedVersionId }).where(sql`id = ${a.id}`);
      }
      await insertAll(tx, s.settings, rows.settings);
      await insertAll(tx, s.leaveTypes, rows.leaveTypes);
      await insertAll(tx, s.leaveQuotas, rows.leaveQuotas);
      await insertAll(tx, s.holidays, rows.holidays);
      await insertAll(tx, s.leaveRequests, rows.leaveRequests);
      await insertAll(tx, s.leaveGrants, rows.leaveGrants);
      await insertAll(tx, s.attendanceDays, rows.attendanceDays);
      await insertAll(tx, s.accessGrants, rows.accessGrants);
      await insertAll(tx, s.checklistItems, rows.checklistItems);
      await insertAll(tx, s.storedFiles, rows.storedFiles);
      await insertAll(tx, s.personDocuments, rows.personDocuments);
      await insertAll(tx, s.events, rows.events);
      const bdo = rows.people.filter((p) => ["Muhammed Ajmal", "Faisal Rahman"].includes(p.fullName)).map((p) => p.id);
      const sales = seedLeads(today, bdo, rand);
      await insertAll(tx, s.leads, sales.leads as (typeof s.leads.$inferInsert)[]);
      await insertAll(tx, s.leadActivities, sales.activities as (typeof s.leadActivities.$inferInsert)[]);
    });
  } finally {
    await client.end();
  }

  const counts = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length]));
  console.log(`Seeded for ${today} (history from ${windowStart}):`);
  console.table(counts);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
