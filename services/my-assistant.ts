// The personal assistant (Stage 12.4): everyone's helper for their own work. It only suggests; the person clicks.
//   - Morning plan on My Day: built by rules from what the person may see (free, no AI); with the AI on, one or two
//     sentences on top, written once per person per day (feature assistant_plan, Fast tier).
//   - Draft reply in chat, task comments and creative threads (assistant_draft, Standard): put in the person's box to
//     edit; nothing is sent until they send it. The client's tone of voice is followed; Malayalam follows the router.
//   - Promises found in the person's own new messages (assistant_promise, the decision helper): "Remind me" or "Make it
//     a task", one click each, never by itself.
//   - Report help: "What did I do this week?" (rules, plus an AI paragraph) and a monthly self-review draft.
// Everything runs as the person's own Actor. Promises, drafts, summaries and questions are only ever shown to that
// person; the owner sees what the AI cost, never what was asked. Each person can switch parts off; the owner can switch
// the AI parts off for everyone.
import { z } from "zod";
import { addDays, istInstant, startOfMonth, startOfWeek, type IsoDate } from "@/lib/dates";
import { formatWeekdayDate } from "@/lib/format";
import { isId, newId, settingId } from "@/lib/id";
import { fail, forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { parse } from "@/lib/validation/common";
import type { AiTurn, DataStore, NotificationWrite, PromiseRecord } from "@/repositories";
import type { AiService } from "./ai";
import type { AssetService } from "./assets";
import { STALE_CHECKIN_DAYS } from "./rules/goals";
import { change, commit, noChange } from "./change";
import { forClient, type ChatService } from "./chat";
import type { Clock } from "./clock";
import type { createGrowthService } from "./growth";
import type { KnowledgeService } from "./knowledge";
import type { createLeaveService } from "./leave";
import { can, type Actor } from "./permissions";
import type { createProjectService } from "./projects";
import { DRAFT_SYSTEM, dueOn, mayBePromise, PLAN_SYSTEM, PROMISE_QUESTIONS, REVIEW_SYSTEM, SUMMARY_SYSTEM, type DuePhrase, DUE_PHRASES } from "./rules/assistant";
import { chatData } from "./rules/chat-ai";
import { DEFAULT_WORK_WEEK, type WorkWeek } from "./rules/working-days";
import type { createSpaceAccessService } from "./space-access";
import { taskScope, type MyDay, type TaskService, type TaskView } from "./tasks";

export const ASSISTANT_KEY = "assistant";
const prefsKey = (personId: string) => `assistant_prefs:${personId}`;
export const ASSISTANT_PARTS = ["plan", "drafts", "promises", "reports"] as const;
export type AssistantPart = (typeof ASSISTANT_PARTS)[number];
export type AssistantPrefs = Record<AssistantPart, boolean>;
const MENTION_KINDS = ["task.mentioned", "chat.mention"];
const SURE = 0.7;
export const AI_NOT_ON = "The AI isn't switched on yet. Once the owner adds an AI key, the assistant also writes summaries and drafts for you.";
const AI_OFF = "The owner has switched the assistant's AI off for now.";

export type Waiting = { key: string; label: string; count: number; href: string };
export type HeadsUp = { personName: string; until: IsoDate; tasks: Array<{ id: string; title: string; clientName: string; dueDate: IsoDate | null }> };
export type MorningPlan = { today: IsoDate; doFirst: TaskView[]; overdue: TaskView[]; overdueCount: number; waiting: Waiting[]; headsUp: HeadsUp[]; promises: PromiseRecord[] };
export type WeekSummary = { from: IsoDate; to: IsoDate; clients: Array<{ clientName: string; tasks: string[]; minutes: number }>; totalMinutes: number; doneCount: number };
export type Written = { text: string; costPaise: number | null };

/** What people wrote, as data: JSON inside <data>, "<" escaped so nothing can close the block. */
const data = (value: unknown) => `<data>\n${JSON.stringify(value).replace(/</g, "\\u003c")}\n</data>`;

export function createMyAssistantService(deps: {
  store: DataStore;
  clock: Clock;
  ai: Pick<AiService, "ask" | "decide" | "switchedOn">;
  tasks: Pick<TaskService, "get" | "create">;
  leave: Pick<ReturnType<typeof createLeaveService>, "waitingOnMeCount" | "offOn">;
  assets: Pick<AssetService, "waitingForReview" | "page">;
  chat: Pick<ChatService, "unreadTotal" | "forAi">;
  spaceAccess: Pick<ReturnType<typeof createSpaceAccessService>, "mine">;
  knowledge: Pick<KnowledgeService, "forClient">;
  growth: Pick<ReturnType<typeof createGrowthService>, "page">;
  projects: Pick<ReturnType<typeof createProjectService>, "list">;
}) {
  const { store, clock, ai } = deps;

  async function prefs(personId: string): Promise<AssistantPrefs> {
    const saved = await store.calendar.getSetting<Partial<AssistantPrefs>>(prefsKey(personId));
    return { plan: saved?.plan !== false, drafts: saved?.drafts !== false, promises: saved?.promises !== false, reports: saved?.reports !== false };
  }
  /** Null when the AI may help now; otherwise why not. */
  async function aiBlocked(): Promise<string | null> {
    if (!ai.switchedOn()) return AI_NOT_ON;
    return (await store.calendar.getSetting<{ ai: boolean }>(ASSISTANT_KEY))?.ai === false ? AI_OFF : null;
  }
  async function workWeek(from: IsoDate, to: IsoDate): Promise<{ week: WorkWeek; holidays: Set<IsoDate> }> {
    const [week, holidays] = await Promise.all([store.calendar.getSetting<WorkWeek>("work_week"), store.calendar.listHolidays(from, to)]);
    return { week: week ?? DEFAULT_WORK_WEEK, holidays: new Set(holidays.map((h) => h.date)) };
  }
  async function write(actor: Actor, feature: "assistant_plan" | "assistant_draft" | "assistant_summary", system: string, text: string, maxOutputTokens: number): Promise<Result<Written>> {
    const r = await ai.ask(actor, feature, { system, turns: [{ role: "user", text } satisfies AiTurn], tools: [], effort: "low", maxOutputTokens, maxSteps: 1, maxCostMicroUsd: feature === "assistant_plan" ? 20_000 : 80_000 });
    if (!r.ok) return r;
    return ok({ text: r.value.text.trim(), costPaise: r.value.costPaise });
  }
  const header = (actor: Actor) => `${actor.fullName} · today is ${formatWeekdayDate(clock.today())}, India`;

  return {
    prefs: (actor: Actor) => prefs(actor.personId),

    /** Can the AI parts help this person now (and if not, why)? Rule parts work regardless. */
    async status(actor: Actor): Promise<{ prefs: AssistantPrefs; aiReason: string | null }> {
      const [p, reason] = await Promise.all([prefs(actor.personId), aiBlocked()]);
      return { prefs: p, aiReason: reason };
    },

    /** A person switches a part of their own assistant on or off. */
    async setPart(actor: Actor, raw: unknown): Promise<Result<AssistantPrefs>> {
      const parsed = parse(z.object({ part: z.enum(ASSISTANT_PARTS), on: z.string().optional() }), raw);
      if (!parsed.ok) return parsed;
      const key = prefsKey(actor.personId);
      return commit(store, async (repos) => {
        const before = await prefs(actor.personId);
        const next = { ...before, [parsed.value.part]: parsed.value.on === "on" };
        if (before[parsed.value.part] === next[parsed.value.part]) return noChange(next);
        await repos.calendar.setSetting(key, next, actor.personId);
        return change(next, { actorId: actor.personId, action: "setting.changed", entityType: "setting", entityId: settingId(key), data: { key: "assistant_prefs", part: parsed.value.part, on: next[parsed.value.part] } });
      });
    },

    /** The owner's switch for the assistant's AI parts, for everyone (Settings → AI). */
    async ownerSetting(actor: Actor): Promise<Result<{ ai: boolean }>> {
      if (!can(actor, "settings.manage")) return forbidden("Only the owner switches the assistant's AI.");
      return ok({ ai: (await store.calendar.getSetting<{ ai: boolean }>(ASSISTANT_KEY))?.ai !== false });
    },
    async setOwnerSetting(actor: Actor, raw: unknown): Promise<Result<null>> {
      if (!can(actor, "settings.manage")) return forbidden("Only the owner switches the assistant's AI.");
      const on = z.object({ on: z.string().optional() }).safeParse(raw).data?.on === "on";
      return commit(store, async (repos) => {
        if (((await repos.calendar.getSetting<{ ai: boolean }>(ASSISTANT_KEY))?.ai !== false) === on) return noChange(null);
        await repos.calendar.setSetting(ASSISTANT_KEY, { ai: on }, actor.personId);
        return change(null, { actorId: actor.personId, action: "setting.changed", entityType: "setting", entityId: settingId(ASSISTANT_KEY), data: { key: ASSISTANT_KEY, on } });
      });
    },

    // ---------- the morning plan ----------

    /** Built by rules from My Day and what waits on the person: no AI, one query per list, all in parallel. */
    async plan(actor: Actor, day: MyDay): Promise<MorningPlan> {
      const today = day.today;
      const soon = addDays(today, 3);
      const [leave, creatives, mentions, flags, chats, access, off, visibleSoon, promises] = await Promise.all([
        deps.leave.waitingOnMeCount(actor),
        deps.assets.waitingForReview(actor),
        store.notifications.countUnread(actor.personId, MENTION_KINDS),
        store.notifications.countUnread(actor.personId, ["coworker.flag"]),
        deps.chat.unreadTotal(actor),
        deps.spaceAccess.mine(actor),
        deps.leave.offOn(actor, today, addDays(today, 2)),
        // Open work due soon that this person may see (private spaces and other clients stay out: their scope).
        store.tasks.list({ scope: taskScope(actor), openDueOnOrBefore: soon, limit: 200 }),
        store.assistant.promises(actor.personId, ["open", "reminder"]),
      ]);
      // Goals this person owns with no check-in for two weeks (Stage 14.3).
      const staleGoals = await store.goals.staleOwned(actor.personId, new Date(clock.now().getTime() - STALE_CHECKIN_DAYS * 86_400_000));
      const item = (key: string, count: number, one: string, many: string, href: string): Waiting => ({ key, label: count === 1 ? one : many, count, href });
      const waiting: Waiting[] = [
        item("creatives", creatives.review, "creative to review", "creatives to review", "/creatives?state=internal_review"),
        item("leave", leave, "leave request to decide", "leave requests to decide", "/leave/approvals"),
        item("mentions", mentions, "unread mention", "unread mentions", "/notifications"),
        item("chats", chats, "unread chat message", "unread chat messages", "/chat"),
        item("access", access.toConfirm.length, "space access to confirm", "space accesses to confirm", "/me/access"),
        item("flags", flags, "flag from the AI co-worker", "flags from the AI co-worker", "/notifications"),
        item("goals", staleGoals, `goal with no check-in for ${STALE_CHECKIN_DAYS} days`, `goals with no check-in for ${STALE_CHECKIN_DAYS} days`, "/goals"),
      ].filter((w) => w.count > 0);
      const away = new Map(off.ok ? off.value.filter((o) => o.personId !== actor.personId).map((o) => [o.personId, o]) : []);
      const byOwner = new Map<string, HeadsUp>();
      for (const t of visibleSoon) {
        const o = t.ownerId ? away.get(t.ownerId) : undefined;
        if (!o || t.status === "done") continue;
        const h = byOwner.get(o.personId) ?? { personName: o.personName, until: o.endDate, tasks: [] };
        if (h.tasks.length < 5) h.tasks.push({ id: t.id, title: t.title, clientName: t.clientName, dueDate: t.dueDate });
        byOwner.set(o.personId, h);
      }
      return {
        today,
        doFirst: day.dueToday.slice(0, 5),
        overdue: [...day.overdue].sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")).slice(0, 5),
        overdueCount: day.overdue.length,
        waiting,
        headsUp: [...byOwner.values()],
        // Missed or due today; the rest wait on My page.
        promises: promises.filter((p) => p.dueOn !== null && p.dueOn <= today),
      };
    },

    /** One or two sentences on top of the plan, written once per person per day. Null when off, unavailable or failed. */
    async planSummary(actor: Actor, plan: MorningPlan): Promise<string | null> {
      const today = clock.today();
      if (!(await prefs(actor.personId)).plan || (await aiBlocked())) return null;
      const cached = await store.assistant.daySummary(actor.personId, today);
      if (cached) return cached;
      const facts = {
        person: actor.fullName,
        doFirst: plan.doFirst.map((t) => `${t.title} (${t.clientName}, ${t.priority})`),
        overdue: { count: plan.overdueCount, first: plan.overdue.map((t) => `${t.title} (${t.clientName}, due ${t.dueDate})`) },
        waiting: plan.waiting.map((w) => `${w.count} ${w.label}`),
        headsUp: plan.headsUp.map((h) => `${h.personName} is off until ${h.until}, owns ${h.tasks.length} task(s) due soon`),
        promises: plan.promises.map((p) => `${p.excerpt} (due ${p.dueOn})`),
      };
      const r = await write(actor, "assistant_plan", PLAN_SYSTEM, `${header(actor)}\n${data(facts)}`, 200);
      if (!r.ok || !r.value.text) return null;
      await store.assistant.saveDaySummary(actor.personId, today, r.value.text);
      return r.value.text;
    },

    // ---------- draft replies ----------

    /** A reply to the latest messages of a thread the person can see, for them to edit and send (or not). */
    async draftReply(actor: Actor, target: { kind: "chat"; channelId: string } | { kind: "task"; taskId: string } | { kind: "creative"; assetId: string }): Promise<Result<Written>> {
      if (!(await prefs(actor.personId)).drafts) return forbidden("Draft replies are switched off on your My page.");
      const blocked = await aiBlocked();
      if (blocked) return forbidden(blocked);
      let lines: Parameters<typeof chatData>[0] = [];
      let about = "";
      let clientId: string | null = null;
      if (target.kind === "chat") {
        const c = await deps.chat.forAi(actor, target.channelId, 20);
        if (!c.ok) return c;
        lines = c.value.messages;
        about = `Chat: ${c.value.channel.title}`;
        clientId = forClient(c.value.channel.kind) ? c.value.channel.clientId : null;
      } else if (target.kind === "task") {
        const t = await deps.tasks.get(actor, target.taskId);
        if (!t.ok) return t;
        lines = t.value.comments.slice(-20);
        about = `Task: ${t.value.title} for ${t.value.clientName}${t.value.description ? `. Brief: ${t.value.description.slice(0, 1000)}` : ""}`;
        clientId = t.value.clientId;
      } else {
        const a = await deps.assets.page(actor, target.assetId);
        if (!a.ok) return a;
        const latest = a.value.versions[0]; // newest first
        lines = (latest?.comments ?? []).slice(-20).map((c) => ({ authorName: c.authorName, body: c.body, createdAt: c.createdAt }));
        about = `Creative under review: ${a.value.asset.title}`;
        clientId = a.value.asset.clientId;
      }
      if (!lines.some((l) => !l.deletedAt && l.body.trim())) return invalid("There's nothing in this thread to reply to yet.");
      const kb = clientId ? await deps.knowledge.forClient(actor, clientId) : null;
      const tone = kb?.ok ? { tone: kb.value.knowledge.tone, dos: kb.value.knowledge.dos, donts: kb.value.knowledge.donts } : null;
      // The thread goes in the question, so a thread in Malayalam takes the router's Malayalam path (never Claude).
      const text = `${header(actor)}. Draft ${actor.fullName}'s reply.\n${data({ about, clientToneOfVoice: tone })}\n${chatData(lines)}`;
      return write(actor, "assistant_draft", DRAFT_SYSTEM, text, 800);
    },

    // ---------- promises ----------

    /**
     * After the person's own message or comment is saved: is it a promise? A free word check first, then the decision
     * helper. Saves a suggestion the person sees (nothing else happens). Quietly does nothing when off or unsure.
     */
    async notePromise(actor: Actor, src: { source: PromiseRecord["source"]; sourceId: string; link: string; text: string }): Promise<PromiseRecord | null> {
      if (!mayBePromise(src.text) || !(await prefs(actor.personId)).promises || (await aiBlocked())) return null;
      const d = await ai.decide(actor, "assistant_promise", src.text.slice(0, 1500), PROMISE_QUESTIONS);
      const isPromise = d?.answers.promise;
      if (!d || isPromise?.value !== true || isPromise.probability < SURE) return null;
      const due = d.answers.due;
      const phrase = due && due.probability >= 0.5 && DUE_PHRASES.includes(due.value as DuePhrase) ? (due.value as DuePhrase) : "none";
      const today = clock.today();
      const { week, holidays } = await workWeek(today, addDays(today, 45));
      const row = { id: newId(), personId: actor.personId, source: src.source, sourceId: src.sourceId, link: src.link, excerpt: src.text.trim().slice(0, 300), duePhrase: phrase === "none" ? null : phrase, dueOn: dueOn(phrase, today, week, holidays) };
      return (await store.assistant.addPromise(row, clock.now())) ? ((await store.assistant.findPromise(row.id, actor.personId)) ?? null) : null;
    },

    /** The person's own open promises, and the projects they could turn one into a task in. */
    async promises(actor: Actor): Promise<{ promises: PromiseRecord[]; projects: Array<{ id: string; name: string; clientName: string }> }> {
      const [list, projects] = await Promise.all([store.assistant.promises(actor.personId, ["open", "reminder"]), deps.projects.list(actor, { statuses: ["active"] })]);
      return { promises: list, projects: projects.ok ? projects.value.map((p) => ({ id: p.id, name: p.name, clientName: p.clientName })) : [] };
    },

    /** One click on a promise: remind me on a day, make it a task (through the task service), kept, or not a promise. */
    async decidePromise(actor: Actor, raw: unknown): Promise<Result<{ taskId: string | null }>> {
      const parsed = parse(
        z.object({ promiseId: z.uuid(), action: z.enum(["remind", "task", "kept", "dismiss"]), date: z.string().optional().default(""), projectId: z.string().optional().default(""), title: z.string().trim().max(200).optional().default("") }),
        raw,
      );
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      // Only the writer: someone else's id is simply not found.
      const p = await store.assistant.findPromise(v.promiseId, actor.personId);
      if (!p || (p.status !== "open" && p.status !== "reminder")) return notFound("That promise");
      const today = clock.today();
      let taskId: string | null = null;
      let remindOn: IsoDate | null = null;
      if (v.action === "remind") {
        remindOn = /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : (p.dueOn ?? addDays(today, 1));
        if (remindOn < today) return invalid("Pick today or a later day.", { date: ["Pick today or a later day."] });
      }
      if (v.action === "task") {
        if (!isId(v.projectId)) return invalid("Pick a project for the task.", { projectId: ["Pick a project."] });
        const made = await deps.tasks.create(actor, { projectId: v.projectId, title: v.title || p.excerpt.slice(0, 200), ownerId: actor.personId, dueDate: p.dueOn ?? "" });
        if (!made.ok) return made;
        taskId = made.value.id;
      }
      const status = v.action === "remind" ? "reminder" : v.action === "task" ? "task" : v.action === "kept" ? "kept" : "dismissed";
      return commit(store, async (repos) => {
        if (!(await repos.assistant.decidePromise(p.id, actor.personId, { status, remindOn, taskId }, clock.now()))) return fail("conflict", "That promise was already settled.");
        // The event says only what was chosen, never the words: promises are the writer's alone.
        return change({ taskId }, { actorId: actor.personId, action: "assistant.promise_settled", entityType: "person", entityId: actor.personId, data: { status } });
      });
    },

    /** Daily job: today's reminders, as the writer's own notification. */
    async runReminders(): Promise<{ sent: number; errors: unknown[] }> {
      const due = await store.assistant.dueReminders(clock.today());
      const rows: Array<NotificationWrite & { id: string }> = due.map((p) => ({ id: newId(), personId: p.personId, kind: "assistant.reminder", title: "You said you would", body: p.excerpt, link: p.link, dedupeKey: `promise:${p.id}` }));
      if (rows.length) await store.notifications.create(rows);
      await store.assistant.markReminded(due.map((p) => p.id), clock.now());
      return { sent: rows.length, errors: [] };
    },

    // ---------- report help ----------

    /** This week's own done tasks and time, by client. Rules only. */
    async week(actor: Actor): Promise<WeekSummary> {
      const to = clock.today();
      const from = startOfWeek(to);
      const [done, time] = await Promise.all([
        store.tasks.list({ scope: { kind: "own", personId: actor.personId }, assignedTo: actor.personId, statuses: ["done"], completedSince: istInstant(from, "00:00"), anyLevel: true, limit: 200 }),
        store.time.list({ personId: actor.personId, from, to }),
      ]);
      const clients = new Map<string, { clientName: string; tasks: string[]; minutes: number }>();
      const at = (name: string) => clients.get(name) ?? (clients.set(name, { clientName: name, tasks: [], minutes: 0 }), clients.get(name)!);
      for (const t of done) at(t.clientName).tasks.push(t.title);
      for (const e of time) at(e.clientName).minutes += e.minutes;
      return { from, to, clients: [...clients.values()].sort((a, b) => b.minutes - a.minutes), totalMinutes: time.reduce((n, e) => n + e.minutes, 0), doneCount: done.length };
    },

    /** The week as a short paragraph, from the list above only. */
    async weekWriteUp(actor: Actor): Promise<Result<Written>> {
      if (!(await prefs(actor.personId)).reports) return forbidden("Report help is switched off on your My page.");
      const blocked = await aiBlocked();
      if (blocked) return forbidden(blocked);
      const w = await this.week(actor);
      if (!w.doneCount && !w.totalMinutes) return invalid("Nothing is done or logged this week yet.");
      return write(actor, "assistant_summary", SUMMARY_SYSTEM, `${header(actor)}. My week from ${w.from} to ${w.to}:\n${data(w.clients.map((c) => ({ client: c.clientName, done: c.tasks, minutes: c.minutes })))}`, 400);
    },

    /** A draft of this month's self-review for Growth: never saved or submitted, only shown to the person. */
    async selfReview(actor: Actor): Promise<Result<Written>> {
      if (!(await prefs(actor.personId)).reports) return forbidden("Report help is switched off on your My page.");
      const blocked = await aiBlocked();
      if (blocked) return forbidden(blocked);
      const to = clock.today();
      const from = startOfMonth(to);
      const [growth, done, time] = await Promise.all([
        deps.growth.page(actor, actor.personId),
        store.tasks.list({ scope: { kind: "own", personId: actor.personId }, assignedTo: actor.personId, statuses: ["done"], completedSince: istInstant(from, "00:00"), anyLevel: true, limit: 300 }),
        store.time.list({ personId: actor.personId, from, to }),
      ]);
      if (!growth.ok) return growth;
      const g = growth.value;
      const facts = {
        role: g.person.jobTitle,
        month: from.slice(0, 7),
        done: done.map((t) => `${t.title} (${t.clientName})`).slice(0, 80),
        hoursLogged: Math.round(time.reduce((n, e) => n + e.minutes, 0) / 6) / 10,
        skills: g.skills.map((s) => ({ skill: s.skill.name, level: s.current, required: s.required })),
        goals: g.goals.map((goal) => ({ goal: goal.title, status: goal.status, due: goal.dueDate })),
      };
      return write(actor, "assistant_summary", REVIEW_SYSTEM, `${header(actor)}. Draft my self-review for ${from.slice(0, 7)}:\n${data(facts)}`, 900);
    },
  };
}
export type MyAssistantService = ReturnType<typeof createMyAssistantService>;
