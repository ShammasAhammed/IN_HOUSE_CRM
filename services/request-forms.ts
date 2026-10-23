// Request forms (Stage 9b.5, ClickUp parity). A lead sets up a form for a project; anyone on the team fills it (or,
// when the lead turns on the public link, someone outside without signing in). Each submission becomes a task for
// the form's owner, with the answers as its notes.
import { randomBytes } from "node:crypto";
import { generateKeyBetween } from "fractional-indexing";
import { z } from "zod";
import { isId, newId } from "@/lib/id";
import { conflict, forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { optionalId, optionalText, parse } from "@/lib/validation/common";
import type { DataStore, NewEvent, Repositories, RequestFormRow } from "@/repositories";
import { change, commit } from "./change";
import type { Clock } from "./clock";
import { can, clientScope, type Actor } from "./permissions";
import { OUTSIDE_SPACE, spaceGuard, levelBlocks } from "./spaces";
import { checkAnswers, questionsSchema, taskFromAnswers, type Question } from "./rules/request-forms";
import { taskScope } from "./tasks";

const LEADS_ONLY = "Only strategists and the owner set up request forms.";
/** Submissions through a public link per form per day: enough for real use, a wall for spam. */
export const PUBLIC_DAILY_CAP = 50;
/** Requests one sender may make through a form's public link in an hour. */
export const PUBLIC_HOURLY_PER_SENDER = 5;

const saveSchema = z.object({
  formId: optionalId,
  name: z.string().trim().min(2, { message: "Name the form." }).max(80),
  description: optionalText(1000),
  projectId: z.uuid({ message: "Pick the project its tasks go to." }),
  ownerId: optionalId,
  questions: z.string().transform((v, ctx) => {
    try {
      return JSON.parse(v) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "The questions couldn't be read." });
      return z.NEVER;
    }
  }),
  active: z.union([z.literal("on"), z.literal(""), z.boolean()]).optional().transform((v) => v === "on" || v === true),
  public: z.union([z.literal("on"), z.literal(""), z.boolean()]).optional().transform((v) => v === "on" || v === true),
});

const publicSchema = z.object({
  submitterName: z.string().trim().min(2, { message: "Tell us your name." }).max(80),
  submitterEmail: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), { message: "Type an email address." }),
  /** A field people never see: bots fill it. */
  website: z.string().max(0).optional(),
});

export type FormView = { canManage: boolean; id: string; name: string; description: string | null; questions: Question[]; projectName: string; clientName: string | null; active: boolean; publicSlug: string | null; submissions: number; ownerId: string | null; projectId: string };

const questionsOf = (f: RequestFormRow): Question[] => {
  const p = questionsSchema.safeParse(f.questions);
  return p.success ? p.data : [];
};

export function createRequestFormService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;
  const lead = (actor: Actor) => can(actor, "projects.write");
  /** Clients this lead looks after: their forms are theirs to change, and theirs to see the client and project of. */
  async function managed(actor: Actor): Promise<(f: RequestFormRow) => boolean> {
    if (!lead(actor)) return () => false;
    const scope = clientScope(actor);
    if (scope.kind === "all" && !scope.viewerId) return () => true;
    const mine = new Set(await store.clients.visibleIds(scope));
    return (f) => mine.has(f.clientId);
  }
  const view = (f: RequestFormRow, showClient: boolean): FormView => ({
    canManage: showClient,
    id: f.id,
    name: f.name,
    description: f.description,
    questions: questionsOf(f),
    projectName: showClient ? f.projectName : "",
    clientName: showClient ? f.clientName : null,
    active: f.active,
    publicSlug: f.publicSlug,
    submissions: f.submissions,
    ownerId: f.ownerId,
    projectId: f.projectId,
  });

  /** The task a submission makes, the submission row and the events. Inside a commit. */
  async function file(repos: Repositories, f: RequestFormRow, answers: Record<string, string>, by: { actorId: string | null; name: string; email: string | null; key?: string | null }) {
    const questions = questionsOf(f);
    const t = taskFromAnswers(f.name, questions, answers, by.name);
    const owner = f.ownerId ? await repos.people.findById(f.ownerId) : null;
    const ownerId = owner?.status === "active" ? owner.id : null;
    const taskId = newId();
    await repos.tasks.create(taskId, {
      projectId: f.projectId,
      clientId: f.clientId,
      parentTaskId: null,
      title: t.title,
      description: t.description,
      status: "todo",
      priority: "normal",
      ownerId,
      reviewerId: null,
      stageId: null,
      deliverableId: null,
      startDate: null,
      dueDate: t.dueDate && t.dueDate >= clock.today() ? t.dueDate : null,
      estimateMinutes: null,
      completedAt: null,
      rank: generateKeyBetween(await repos.tasks.lastRank(f.projectId, "todo"), null),
      recurrenceId: null,
      createdById: by.actorId,
    });
    await repos.tasks.update(taskId, { tags: ["Request"] });
    const submissionId = newId();
    await repos.taskSetup.addSubmission({ id: submissionId, formId: f.id, taskId, submittedById: by.actorId, submitterName: by.name, submitterEmail: by.email, submitterKey: by.key ?? null, answers });
    const events: NewEvent[] = [
      { actorId: by.actorId, action: "task.created", entityType: "task", entityId: taskId, clientId: f.clientId, data: { title: t.title, ownerId, form: f.name } },
      { actorId: by.actorId, action: "request_form.submitted", entityType: "request_form", entityId: f.id, clientId: f.clientId, data: { taskId, from: by.name, public: by.actorId === null } },
    ];
    return { taskId, events };
  }

  return {
    /** Forms to fill (active ones), and for leads every form with its settings. */
    async list(actor: Actor): Promise<{ forms: FormView[]; canManage: boolean }> {
      const all = await store.taskSetup.forms();
      const mine = await managed(actor);
      // Everyone may ask for work through any open form; closed ones only show to the leads who own them.
      return { forms: all.filter((f) => f.active || mine(f)).map((f) => view(f, mine(f))), canManage: lead(actor) };
    },

    async get(actor: Actor, formId: string): Promise<Result<FormView & { canManage: boolean }>> {
      const f = isId(formId) ? await store.taskSetup.findForm(formId) : null;
      const mine = await managed(actor);
      if (!f || (!f.active && !mine(f))) return notFound("That form");
      return ok(view(f, mine(f)));
    },

    /** The public face of a form: its questions, nothing about the client. */
    /** The request a task came from, question by question, for the top of the task page (test report L11). */
    async forTask(actor: Actor, taskId: string): Promise<Result<{ formName: string; from: string; at: Date; answers: Array<{ label: string; value: string }> } | null>> {
      const t = isId(taskId) ? await store.tasks.findById(taskId, taskScope(actor)) : null;
      if (!t) return notFound("That task");
      const sub = await store.taskSetup.submissionForTask(t.id);
      if (!sub) return ok(null);
      const f = await store.taskSetup.findForm(sub.formId);
      const questions = f ? questionsOf(f) : [];
      const answers = questions.filter((q) => sub.answers[q.id]).map((q) => ({ label: q.label, value: sub.answers[q.id]! }));
      return ok({ formName: f?.name ?? "Request", from: sub.submitterName, at: sub.createdAt, answers });
    },

    async getPublic(slug: string): Promise<Result<{ name: string; description: string | null; questions: Question[] }>> {
      const f = /^[a-z0-9]{12,32}$/.test(slug) ? await store.taskSetup.findFormBySlug(slug) : null;
      if (!f || !f.active) return notFound("That form");
      return ok({ name: f.name, description: f.description, questions: questionsOf(f) });
    },

    /** Create or change a form. Its tasks go to a project the lead can see. */
    async save(actor: Actor, raw: unknown): Promise<Result<{ id: string; publicSlug: string | null }>> {
      if (!lead(actor)) return forbidden(LEADS_ONLY);
      const parsed = parse(saveSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const questions = questionsSchema.safeParse(v.questions);
      if (!questions.success) return invalid(questions.error.issues[0]?.message ?? "Check the questions.", { questions: [questions.error.issues[0]?.message ?? "Check the questions."] });
      return commit(store, async (repos) => {
        const project = await repos.projects.findById(v.projectId, taskScope(actor), clock.today());
        if (!project) return invalid("Pick one of your projects.", { projectId: ["Pick one of your projects."] });
        { const blocked = await levelBlocks(repos, actor, project.clientId, "edit"); if (blocked) return blocked; }
        if (v.ownerId) {
          const owner = await repos.people.findById(v.ownerId);
          if (!owner || owner.status !== "active") return invalid("Pick someone on the team.", { ownerId: ["Pick someone on the team."] });
          if (await spaceGuard(repos)(v.ownerId, project.clientId)) return invalid(OUTSIDE_SPACE, { ownerId: [OUTSIDE_SPACE] });
        }
        const before = v.formId ? await repos.taskSetup.findForm(v.formId) : null;
        if (v.formId && (!before || !(await managed(actor))(before))) return notFound("That form");
        const publicSlug = v.public ? (before?.publicSlug ?? randomBytes(12).toString("base64url").replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 16).padEnd(12, "0")) : null;
        const row = { name: v.name, description: v.description, projectId: project.id, ownerId: v.ownerId ?? null, questions: questions.data, active: v.active, publicSlug };
        const id = before?.id ?? newId();
        if (before) await repos.taskSetup.updateForm(id, row);
        else await repos.taskSetup.addForm({ ...row, id, createdById: actor.personId });
        return change({ id, publicSlug }, { actorId: actor.personId, action: before ? "request_form.changed" : "request_form.created", entityType: "request_form", entityId: id, clientId: project.clientId, data: { name: v.name, public: Boolean(publicSlug), active: v.active } });
      });
    },

    async remove(actor: Actor, formId: string): Promise<Result<null>> {
      if (!lead(actor)) return forbidden(LEADS_ONLY);
      if (!isId(formId)) return notFound("That form");
      return commit(store, async (repos) => {
        const f = await repos.taskSetup.findForm(formId);
        if (!f || !(await managed(actor))(f)) return notFound("That form");
        await repos.taskSetup.updateForm(f.id, { deletedAt: clock.now(), publicSlug: null, active: false });
        return change(null, { actorId: actor.personId, action: "request_form.removed", entityType: "request_form", entityId: f.id, clientId: f.clientId, data: { name: f.name } });
      });
    },

    /** Someone on the team sends a request. Becomes a task for the form's owner. */
    async submit(actor: Actor, formId: string, raw: Record<string, unknown>): Promise<Result<{ taskId: string; canOpen: boolean }>> {
      const f = isId(formId) ? await store.taskSetup.findForm(formId) : null;
      if (!f || !f.active) return notFound("That form");
      const checked = checkAnswers(questionsOf(f), raw);
      if (!checked.ok) return invalid("Check the highlighted answers.", checked.errors);
      const r = await commit(store, async (repos) => {
        const { taskId, events } = await file(repos, f, checked.answers, { actorId: actor.personId, name: actor.fullName, email: null });
        return change({ taskId }, events[0]!, ...events.slice(1));
      });
      if (!r.ok) return r;
      // The requester may not see the project's tasks (an intern asking design for a poster).
      return ok({ taskId: r.value.taskId, canOpen: Boolean(await store.tasks.findById(r.value.taskId, taskScope(actor))) });
    },

    /** Someone outside sends a request through the public link. */
    /** `senderKey`: a one-way hash of where it came from (the page's job), to stop one sender flooding a form. */
    async submitPublic(slug: string, raw: Record<string, unknown>, senderKey: string | null = null): Promise<Result<{ received: true }>> {
      const f = /^[a-z0-9]{12,32}$/.test(slug) ? await store.taskSetup.findFormBySlug(slug) : null;
      if (!f || !f.active) return notFound("That form");
      const who = parse(publicSchema, raw);
      if (!who.ok) return who;
      const checked = checkAnswers(questionsOf(f), raw);
      if (!checked.ok) return invalid("Check the highlighted answers.", checked.errors);
      const now = clock.now().getTime();
      const r = await commit(store, async (repos) => {
        // Counted under the form's lock, so parallel requests can't all slip under the cap.
        await repos.taskSetup.lockForm(f.id);
        if ((await repos.taskSetup.countPublicSubmissions(f.id, new Date(now - 24 * 60 * 60 * 1000))) >= PUBLIC_DAILY_CAP) return conflict("This form has had a lot of requests today. Please try again tomorrow or contact us directly.");
        if (senderKey && (await repos.taskSetup.countPublicSubmissions(f.id, new Date(now - 60 * 60 * 1000), senderKey)) >= PUBLIC_HOURLY_PER_SENDER) return conflict("You've sent several requests just now. Please wait a while before sending another.");
        const { events } = await file(repos, f, checked.answers, { actorId: null, name: `${who.value.submitterName} (outside${who.value.submitterEmail ? `, ${who.value.submitterEmail}` : ""})`, email: who.value.submitterEmail, key: senderKey });
        return change({ received: true as const }, events[0]!, ...events.slice(1));
      });
      return r;
    },
  };
}

export type RequestFormService = ReturnType<typeof createRequestFormService>;
