// Meetings library (Stage 13.4): every meeting is a page made from the Meeting template plus when, who, what kind
// and how it repeats. Rules (no AI) read its Decisions and Action items: an item with an @owner and a date becomes a
// proposal, and Approve makes the task through the task service and its guards. A weekly or monthly meeting gets its
// next page on the daily job, starting with the last one's open items. Seen exactly like its page (client, space and
// 14.2 levels); the client portal sees nothing.
import { z } from "zod";
import { addDays, isIsoDate, type IsoDate } from "@/lib/dates";
import { isId, newId } from "@/lib/id";
import { invalid, notFound, ok, type Result } from "@/lib/result";
import { MEETING_KINDS, MEETING_REPEATS, type MeetingKind } from "@/lib/types";
import { optionalId, parse } from "@/lib/validation/common";
import type { DataStore, MeetingRecord } from "@/repositories";
import { change, commit } from "./change";
import type { Clock } from "./clock";
import type { DocService } from "./docs";
import { toActor } from "./identity";
import { clientScope, type Actor } from "./permissions";
import { actionItemsOf, carriedItems, decisionsOf, nextDate, taskTitle, type ActionItem } from "./rules/meetings";
import { meetingBody } from "./rules/doc-templates";
import { DEFAULT_WORK_WEEK, isWorkingDay, type WorkWeek } from "./rules/working-days";
import { levelBlocks } from "./spaces";
import type { TaskService } from "./tasks";

const date = z.string().refine(isIsoDate, { message: "Pick a date." });
const details = {
  kind: z.enum(MEETING_KINDS),
  meetingDate: date,
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  attendees: z.array(z.uuid()).max(50).default([]),
  repeat: z.enum(MEETING_REPEATS).default("none"),
};
const createSchema = z.object({ title: z.string().trim().min(1, { message: "Name the meeting." }).max(150), clientId: optionalId, projectId: optionalId, ...details });
const updateSchema = z.object({ meetingId: z.uuid(), projectId: optionalId, ...details });

export type MeetingItem = ActionItem & { taskId: string | null };
export type MeetingDetail = MeetingRecord & { items: MeetingItem[]; decisions: string[]; people: Array<{ id: string; name: string }> };
export type Decision = { meetingId: string; docId: string; title: string; meetingDate: IsoDate; clientName: string | null; text: string };

export function createMeetingService(deps: { store: DataStore; clock: Clock; docs: Pick<DocService, "create" | "get">; tasks: Pick<TaskService, "create"> }) {
  const { store, clock } = deps;

  async function visibleClientIds(actor: Actor): Promise<readonly string[] | "all"> {
    const scope = clientScope(actor);
    if (scope.kind === "all" && !scope.viewerId) return "all";
    return store.clients.visibleIds(scope);
  }

  /** The meeting, when this person can open its page. */
  async function visible(actor: Actor, meetingId: string): Promise<MeetingRecord | null> {
    const m = isId(meetingId) ? await store.meetings.find(meetingId) : null;
    return m && (await deps.docs.get(actor, m.docId)).ok ? m : null;
  }

  /** Is a day a working day (the owner's work week and holidays), for due dates read from words. */
  async function workingDay(): Promise<(d: IsoDate) => boolean> {
    const today = clock.today();
    const [week, holidays] = await Promise.all([store.calendar.getSetting<WorkWeek>("work_week"), store.calendar.listHolidays(today, addDays(today, 400))]);
    const off = new Set(holidays.map((h) => h.date));
    return (d) => isWorkingDay(d, week ?? DEFAULT_WORK_WEEK, off);
  }

  async function activePeople(ids: readonly string[]) {
    const all = await store.people.listActive();
    return ids.map((id) => all.find((p) => p.id === id)).filter((p) => p !== undefined);
  }

  const event = (actor: Actor, m: Pick<MeetingRecord, "id" | "clientId" | "docId">, action: string, data: Record<string, unknown> = {}) => ({ actorId: actor.personId, action, entityType: "meeting" as const, entityId: m.id, clientId: m.clientId, data: { docId: m.docId, ...data } });

  async function detail(actor: Actor, m: MeetingRecord): Promise<MeetingDetail> {
    const [isWork, done, people] = await Promise.all([workingDay(), store.meetings.actions(m.id), store.people.listActive()]);
    const tasks = new Map(done.map((a) => [a.itemKey, a.taskId]));
    // Due dates count from the meeting's day (or today, for a meeting still ahead).
    const from = m.meetingDate < clock.today() ? m.meetingDate : clock.today();
    const items = actionItemsOf(m.body, from, isWork).map((a) => ({ ...a, taskId: tasks.get(a.key) ?? null }));
    return { ...m, items, decisions: decisionsOf(m.body), people: people.filter((p) => m.attendees.includes(p.id)).map((p) => ({ id: p.id, name: p.fullName })) };
  }

  /** A meeting page from the Meeting template; a series' next one starts with the open items carried over. */
  async function make(actor: Actor, raw: unknown, carried: string[] = [], previousId: string | null = null): Promise<Result<{ id: string; docId: string }>> {
    const parsed = parse(createSchema, raw);
    if (!parsed.ok) return parsed;
    const v = parsed.value;
    const attendees = await activePeople(v.attendees);
    const body = meetingBody({ attendees: attendees.map((p) => `@[${p.fullName}](person:${p.id})`), carried });
    // The page first (its own checks: client, private space, edit level), then the meeting on it.
    // shortcut: two transactions; a failed second step leaves a plain page behind, which is harmless.
    const page = await deps.docs.create(actor, { title: v.title, body, clientId: v.clientId });
    if (!page.ok) return page;
    const doc = await deps.docs.get(actor, page.value.id);
    if (!doc.ok) return doc;
    const id = newId();
    return commit(store, async (repos) => {
      await repos.meetings.create({ id, docId: page.value.id, clientId: doc.value.clientId, projectId: v.projectId, kind: v.kind, meetingDate: v.meetingDate, startTime: v.startTime ?? null, attendees: attendees.map((p) => p.id), repeat: v.repeat, previousId, createdById: actor.personId, at: clock.now() });
      return change({ id, docId: page.value.id }, event(actor, { id, clientId: doc.value.clientId, docId: page.value.id }, "meeting.created", { title: v.title, kind: v.kind, meetingDate: v.meetingDate }));
    });
  }

  const service = {
    create: (actor: Actor, raw: unknown) => make(actor, raw),

    async list(actor: Actor, filter: { clientId?: string | null; kind?: MeetingKind; from?: IsoDate; to?: IsoDate; attendee?: string; limit?: number } = {}): Promise<MeetingRecord[]> {
      const kind = MEETING_KINDS.find((k) => k === filter.kind);
      return store.meetings.list({
        clientIds: await visibleClientIds(actor),
        clientId: filter.clientId === null || (filter.clientId && isId(filter.clientId)) ? filter.clientId : undefined,
        kind,
        from: filter.from && isIsoDate(filter.from) ? filter.from : undefined,
        to: filter.to && isIsoDate(filter.to) ? filter.to : undefined,
        attendee: filter.attendee && isId(filter.attendee) ? filter.attendee : undefined,
        limit: Math.min(filter.limit ?? 200, 500),
      });
    },

    async get(actor: Actor, meetingId: string): Promise<Result<MeetingDetail>> {
      const m = await visible(actor, meetingId);
      return m ? ok(await detail(actor, m)) : notFound("That meeting");
    },

    /** The meeting a page belongs to, if it is one. */
    async forDoc(actor: Actor, docId: string): Promise<MeetingDetail | null> {
      const m = isId(docId) ? await store.meetings.byDoc(docId) : null;
      return m && (await deps.docs.get(actor, m.docId)).ok ? detail(actor, m) : null;
    },

    async update(actor: Actor, raw: unknown): Promise<Result<null>> {
      const parsed = parse(updateSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const m = await visible(actor, v.meetingId);
      if (!m) return notFound("That meeting");
      if (m.clientId) { const blocked = await levelBlocks(store, actor, m.clientId, "edit"); if (blocked) return blocked; }
      const attendees = (await activePeople(v.attendees)).map((p) => p.id);
      return commit(store, async (repos) => {
        await repos.meetings.update(m.id, { kind: v.kind, meetingDate: v.meetingDate, startTime: v.startTime ?? null, attendees, repeat: v.repeat, projectId: v.projectId, at: clock.now() });
        return change(null, event(actor, m, "meeting.updated", { kind: v.kind, meetingDate: v.meetingDate, repeat: v.repeat }));
      });
    },

    /** Approve an action item: the task is made by the task service (its project, level and space guards apply). */
    async approve(actor: Actor, raw: unknown): Promise<Result<{ taskId: string }>> {
      const parsed = parse(z.object({ meetingId: z.uuid(), itemKey: z.string().min(1).max(300), projectId: z.uuid({ message: "Pick a project." }) }), raw);
      if (!parsed.ok) return parsed;
      const m = await visible(actor, parsed.value.meetingId);
      if (!m) return notFound("That meeting");
      const d = await detail(actor, m);
      const item = d.items.find((i) => i.key === parsed.value.itemKey);
      if (!item) return invalid("That action item isn't on the page any more. Reload to see the latest.");
      if (item.taskId) return invalid("That action item is already a task.");
      const task = await deps.tasks.create(actor, {
        projectId: parsed.value.projectId,
        title: taskTitle(item.text, item.ownerName),
        ownerId: item.ownerId ?? undefined,
        dueDate: item.due ?? undefined,
        description: `From the meeting "${m.title}" on ${m.meetingDate}: ${item.text}`,
      });
      if (!task.ok) return task;
      return commit(store, async (repos) => {
        // shortcut: two people approving the same item at once make two tasks; the second link is refused.
        const linked = await repos.meetings.addAction({ id: newId(), meetingId: m.id, itemKey: item.key, taskId: task.value.id, createdById: actor.personId, at: clock.now() });
        if (!linked) return invalid("That action item is already a task.");
        return change({ taskId: task.value.id }, event(actor, m, "meeting.action_approved", { taskId: task.value.id, item: item.text }));
      });
    },

    /** "What did we decide with <client>?": the Decisions of every meeting this person can see, newest first. */
    async decisions(actor: Actor, filter: { clientId?: string | null; q?: string } = {}): Promise<Decision[]> {
      const q = (filter.q ?? "").trim().toLowerCase();
      return (await service.list(actor, { clientId: filter.clientId, limit: 500 })).flatMap((m) =>
        decisionsOf(m.body)
          .filter((text) => !q || text.toLowerCase().includes(q) || m.title.toLowerCase().includes(q))
          .map((text) => ({ meetingId: m.id, docId: m.docId, title: m.title, meetingDate: m.meetingDate, clientName: m.clientName, text })),
      );
    },

    /** Action items across the meetings this person can see (open ones by default), for Ask and the MCP. */
    async actionItems(actor: Actor, filter: { clientId?: string | null; all?: boolean } = {}) {
      const out: Array<MeetingItem & { meetingId: string; title: string; meetingDate: IsoDate }> = [];
      for (const m of await service.list(actor, { clientId: filter.clientId, limit: 100 })) {
        for (const i of (await detail(actor, m)).items) if (filter.all || !i.done) out.push({ ...i, meetingId: m.id, title: m.title, meetingDate: m.meetingDate });
      }
      return out;
    },

    /** The next meeting of a repeating series, with the last one's open items; once only. */
    async createNext(actor: Actor, meetingId: string): Promise<Result<{ id: string; docId: string }>> {
      const m = await visible(actor, meetingId);
      if (!m) return notFound("That meeting");
      if (m.nextId) {
        const next = await store.meetings.find(m.nextId);
        if (next) return ok({ id: next.id, docId: next.docId });
      }
      const repeat = m.repeat === "monthly" ? "monthly" : "weekly";
      const carried = carriedItems(m.body, clock.today());
      const created = await make(actor, { title: m.title, clientId: m.clientId, projectId: m.projectId, kind: m.kind, meetingDate: nextDate(m.meetingDate, repeat), startTime: m.startTime ?? "", attendees: m.attendees, repeat: m.repeat }, carried, m.id);
      if (!created.ok) return created;
      return commit(store, async (repos) => {
        await repos.meetings.update(m.id, { nextId: created.value.id, at: clock.now() });
        return change(created.value, event(actor, m, "meeting.next_created", { nextId: created.value.id, carried: carried.length }));
      });
    },

    /** The daily job: each repeating meeting that has happened gets its next one, made as the person who set it up. */
    async runDaily(): Promise<{ meetings: number; errors: unknown[] }> {
      const errors: unknown[] = [];
      let made = 0;
      for (const m of await store.meetings.dueRepeats(clock.today())) {
        try {
          const by = m.createdById ? await store.people.findById(m.createdById) : null;
          if (!by || by.status !== "active") continue;
          const r = await service.createNext(toActor(by), m.id);
          if (r.ok) made++;
        } catch (err) {
          errors.push(err);
        }
      }
      return { meetings: made, errors };
    },
  };
  return service;
}

export type MeetingService = ReturnType<typeof createMeetingService>;
