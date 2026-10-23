// AI in chat (Stage 12.2): help without leaving the conversation. Three things, all through ai.ask() (the monthly
// limit, the daily cap, the usage log with its feature name; cost shown to the owner only):
//   - @AI: a question answered with Ask's read-only tools and posted in the chat, labelled AI. It reads with the chat's
//     shared view (D-12.2a in rules/chat-ai.ts), never the asker's wider one, because everyone in the chat reads it.
//   - "Catch me up": a summary of a chat or a task's comments since the person last read, shown only to them.
//   - "Suggest tasks": proposals from the chat, shown only to the asker; nothing is created until they approve one, and
//     approving goes through the ordinary task service with all its checks.
// The AI never posts by itself, never sends anything outside, never writes. The owner can switch AI in chat off.
import { z } from "zod";
import { formatWeekdayDate } from "@/lib/format";
import { settingId } from "@/lib/id";
import { fail, forbidden, notFound, ok, type Result } from "@/lib/result";
import { parse } from "@/lib/validation/common";
import type { AiTool, DataStore } from "@/repositories";
import type { AiService } from "./ai";
import { assistantTools, type AssistantDeps } from "./assistant";
import { change, commit, noChange } from "./change";
import { forClient, type ChatService, type MessageView } from "./chat";
import type { Clock } from "./clock";
import { can, clientScope, type Actor } from "./permissions";
import { ANSWER_SYSTEM, asksAi, CATCHUP_SYSTEM, chatData, MAX_ANSWER, MAX_CATCHUP_MESSAGES, MAX_CONTEXT_MESSAGES, readProposals, sharedView, TASKS_SYSTEM, type Proposal, type SharedView } from "./rules/chat-ai";
import { canCreateTasks } from "./tasks";

export const CHAT_AI_KEY = "ai_chat";
type Setting = { on: boolean };

export const SHARED_AI = "The client reads this chat, so @AI here answers only you: it is never posted.";
export const NOT_ON = "The AI isn't switched on yet. Once the owner adds the AI key, typing @AI here answers questions from what everyone in this chat can see, and Catch me up and Suggest tasks work too.";
const OFF = "The owner has switched AI in chat off.";

/** Tools that read one client, and what the chat's shared view needs before the AI may use them. */
const PINNED: Record<string, (v: SharedView) => boolean> = {
  client_overview: (v) => v.projects && v.tasks,
  list_projects: (v) => v.projects,
  list_tasks: (v) => v.tasks,
  creatives: (v) => v.tasks,
  content_calendar: (v) => v.tasks,
  ad_results: (v) => v.clients,
  client_knowledge: (v) => v.clients,
  client_results: (v) => v.clients,
  client_files: (v) => v.clients,
};

const approveSchema = z.object({
  projectId: z.uuid({ message: "Pick a project." }),
  title: z.string(),
  ownerId: z.string().optional().default(""),
  dueDate: z.string().optional().default(""),
});

export type CatchUp = { text: string; costPaise: number | null };
export type TaskSuggestions = {
  proposals: Proposal[];
  people: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string; clientName: string }>;
  defaultProjectId: string | null;
  costPaise: number | null;
};

export function createChatAiService(deps: {
  store: DataStore;
  clock: Clock;
  ai: Pick<AiService, "ask" | "status" | "switchedOn">;
  chat: Pick<ChatService, "forAi" | "postAiAnswer">;
  /** Ask's services, for its read-only tools (9.2). */
  tools: Omit<AssistantDeps, "ai" | "clock">;
}) {
  const { store, clock, ai, chat } = deps;
  const assistantDeps: AssistantDeps = { ...deps.tools, ai: deps.ai as AiService, clock };
  const switchedOn = async () => (await store.calendar.getSetting<Setting>(CHAT_AI_KEY))?.on !== false;

  async function blocked(actor: Actor): Promise<string | null> {
    if (!ai.switchedOn()) return NOT_ON;
    if (!(await switchedOn())) return OFF;
    const s = await ai.status(actor);
    return s.ready ? null : (s.reason ?? "The AI isn't available.");
  }

  /** Ask's tools as the chat's shared view: only the shared clients, only what every reader may see. */
  async function sharedTools(readers: readonly Actor[]): Promise<{ tools: AiTool[]; clients: string[] }> {
    const view = sharedView(readers.map((r) => r.capabilities));
    if (!view.clients) return { tools: [], clients: [] };
    const visibleIds = (r: Actor) => {
      const scope = clientScope(r);
      return scope.kind === "none" ? Promise.resolve<string[]>([]) : store.clients.visibleIds(scope);
    };
    const [first, ...rest] = await Promise.all(readers.map(visibleIds));
    const shared = rest.map((ids) => new Set(ids)).reduce((acc, set) => acc.filter((id) => set.has(id)), first!);
    // Clients only, like Ask: its lookups don't reach spaces.
    const all = await store.clients.list(clientScope(readers[0]!));
    const clients = all.filter((c) => shared.includes(c.id)).map((c) => c.name);
    if (!clients.length) return { tools: [], clients: [] };
    // Reads as the asker (for names like "me") with only the shared, read-only capabilities and no roles.
    const floor: Actor = { ...readers.find((r) => r.personId === readers[0]!.personId)!, roles: [], capabilities: view.caps };
    const pick = (name: string): string | null => {
      const q = name.trim().toLowerCase();
      if (!q) return null;
      const exact = clients.filter((c) => c.toLowerCase() === q);
      const hits = exact.length ? exact : clients.filter((c) => c.toLowerCase().includes(q));
      return hits.length === 1 ? hits[0]! : null;
    };
    const pinned = assistantTools(floor, assistantDeps)
      .filter((t) => PINNED[t.name]?.(view))
      .map(
        (t): AiTool => ({
          ...t,
          description: `${t.description} The client is required and must be one of chat_clients.`,
          async run(raw) {
            const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
            const client = pick(typeof input.client === "string" ? input.client : "");
            if (!client) return { ok: false, text: "Name one client from chat_clients: only those are visible to everyone in this chat." };
            // A project id could point anywhere: the client is the only filter allowed here.
            return t.run({ ...input, client, ...("project_id" in input ? { project_id: "" } : {}) });
          },
        }),
      );
    const list: AiTool = {
      name: "chat_clients",
      description: "The clients everyone in this chat can see. Only these can be looked up here.",
      inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
      run: async () => ({ ok: true, text: JSON.stringify(clients.slice(0, 150)) }),
    };
    return { tools: [list, ...pinned], clients };
  }

  const header = (actor: Actor) => `[${actor.fullName} · today is ${formatWeekdayDate(clock.today())}, India]`;

  return {
    /** Can this person use AI in chat now, and if not, why (shown instead of the AI options). */
    async status(actor: Actor): Promise<{ ready: boolean; reason: string | null; canSuggestTasks: boolean }> {
      const reason = await blocked(actor);
      return { ready: reason === null, reason, canSuggestTasks: canCreateTasks(actor) };
    },

    async setting(actor: Actor): Promise<Result<{ on: boolean }>> {
      if (!can(actor, "settings.manage")) return forbidden("Only the owner switches AI in chat on or off.");
      return ok({ on: await switchedOn() });
    },

    async setOn(actor: Actor, raw: unknown): Promise<Result<null>> {
      if (!can(actor, "settings.manage")) return forbidden("Only the owner switches AI in chat on or off.");
      const on = z.object({ on: z.string().optional() }).safeParse(raw).data?.on === "on";
      return commit(store, async (repos) => {
        if (((await repos.calendar.getSetting<Setting>(CHAT_AI_KEY))?.on !== false) === on) return noChange(null);
        await repos.calendar.setSetting(CHAT_AI_KEY, { on } satisfies Setting, actor.personId);
        return change(null, { actorId: actor.personId, action: "setting.changed", entityType: "setting", entityId: settingId(CHAT_AI_KEY), data: { key: CHAT_AI_KEY, on } });
      });
    },

    /** Answer someone's own @AI message and post the answer in the chat. Only they can ask for it, once. */
    async answer(actor: Actor, questionId: string): Promise<Result<MessageView>> {
      const reason = await blocked(actor);
      if (reason) return forbidden(reason);
      const q = await store.chat.findMessage(questionId).catch(() => null);
      if (!q || q.authorId !== actor.personId || q.deletedAt || q.aiReplyTo || !asksAi(q.body)) return notFound("That question");
      if (await store.chat.aiAnswerFor(q.id)) return fail("conflict", "The AI already answered that question.");
      const ctx = await chat.forAi(actor, q.channelId, MAX_CONTEXT_MESSAGES);
      if (!ctx.ok) return ctx;
      // D-12.6a: the client reads the shared chat, so @AI there never posts; it answers the asker alone (askPrivately).
      if (ctx.value.channel.kind === "shared") return forbidden(SHARED_AI);
      if (ctx.value.postBlock) return forbidden(ctx.value.postBlock);
      // The asker first: the shared tools read with their name; everyone else narrows what may be read.
      const readers = [actor, ...ctx.value.readers.filter((r) => r.personId !== actor.personId)];
      const { tools, clients } = await sharedTools(readers);
      const earlier = ctx.value.messages.filter((m) => m.createdAt <= q.createdAt && m.id !== q.id);
      const scope = tools.length ? `The tools can look up these clients only (what everyone in this chat sees): ${clients.length} client${clients.length === 1 ? "" : "s"}.` : "No tools here: someone in this chat sees only their own tasks, so answer only from the conversation and say so if more is needed.";
      const text = `${header(actor)}\n[Chat: ${ctx.value.channel.title}; ${readers.length} people can read your answer. ${scope}]\n\n${chatData(earlier)}\n\nQuestion from ${actor.fullName}:\n${chatData([q]).replace(/^<chat>\n|\n<\/chat>$/g, "")}`;
      const r = await ai.ask(actor, "chat_answer", { system: ANSWER_SYSTEM, turns: [{ role: "user", text }], tools, effort: "medium", maxOutputTokens: 2000, maxSteps: tools.length ? 6 : 1, maxCostMicroUsd: 300_000 });
      if (!r.ok) return r;
      const body = r.value.outcome === "refused" ? "I can't help with that one here." : r.value.text.trim() || "I couldn't put an answer together. Try a narrower question, about one client.";
      return chat.postAiAnswer(actor, q.id, body.slice(0, MAX_ANSWER));
    },

    /**
     * @AI in the chat shared with a client (D-12.6a): answered for the asker only, never posted, with the asker's own
     * Ask tools (it is theirs alone to read). The chat is data, as in 12.2.
     */
    async askPrivately(actor: Actor, channelId: string, question: string): Promise<Result<{ text: string; costPaise: number | null }>> {
      const reason = await blocked(actor);
      if (reason) return forbidden(reason);
      const ctx = await chat.forAi(actor, channelId, MAX_CONTEXT_MESSAGES);
      if (!ctx.ok) return ctx;
      const q = question.trim().slice(0, 4000);
      if (!q) return fail("invalid", "Ask a question after @AI.");
      const text = `${header(actor)}\n[Chat shared with the client ${ctx.value.channel.clientName ?? ""}. Your answer is shown only to ${actor.fullName}, never posted in the chat.]\n\n${chatData(ctx.value.messages)}\n\nQuestion from ${actor.fullName}:\n${chatData([{ authorName: actor.fullName, body: q, createdAt: clock.now() }]).replace(/^<chat>\n|\n<\/chat>$/g, "")}`;
      const r = await ai.ask(actor, "chat_answer", { system: ANSWER_SYSTEM, turns: [{ role: "user", text }], tools: assistantTools(actor, assistantDeps), effort: "medium", maxOutputTokens: 2000, maxSteps: 6, maxCostMicroUsd: 300_000 });
      if (!r.ok) return r;
      return ok({ text: r.value.text.trim() || "I couldn't put an answer together.", costPaise: r.value.costPaise });
    },

    /** What this person missed in a chat (since `since`, their last read) or on a task's comments. Only for them. */
    async catchUp(actor: Actor, target: { channelId: string; since?: string | null } | { taskId: string }): Promise<Result<CatchUp>> {
      const reason = await blocked(actor);
      if (reason) return forbidden(reason);
      let lines: Parameters<typeof chatData>[0];
      if ("taskId" in target) {
        const t = await deps.tools.tasks.get(actor, target.taskId);
        if (!t.ok) return t;
        lines = t.value.comments.slice(-MAX_CONTEXT_MESSAGES);
      } else {
        const ctx = await chat.forAi(actor, target.channelId, MAX_CATCHUP_MESSAGES);
        if (!ctx.ok) return ctx;
        const since = target.since ? new Date(target.since) : null;
        const fresh = since && !Number.isNaN(since.getTime()) ? ctx.value.messages.filter((m) => m.createdAt > since && m.authorId !== actor.personId) : null;
        if (fresh && !fresh.some((m) => !m.deletedAt)) return ok({ text: "Nothing new since you last looked.", costPaise: null });
        lines = fresh ? ctx.value.messages.filter((m) => m.createdAt > since!) : ctx.value.messages.slice(-MAX_CONTEXT_MESSAGES);
      }
      if (!lines.length) return ok({ text: "There's nothing here yet to catch up on.", costPaise: null });
      const r = await ai.ask(actor, "chat_catchup", { system: CATCHUP_SYSTEM, turns: [{ role: "user", text: `${header(actor)}\nCatch me up:\n\n${chatData(lines)}` }], tools: [], effort: "low", maxOutputTokens: 1200, maxSteps: 1, maxCostMicroUsd: 80_000 });
      if (!r.ok) return r;
      return ok({ text: r.value.text.trim() || "Nothing important to catch up on.", costPaise: r.value.costPaise });
    },

    /** Proposed tasks from one message or the latest messages, for the asker to approve or dismiss. */
    async suggestTasks(actor: Actor, target: { channelId: string; messageId?: string | null }): Promise<Result<TaskSuggestions>> {
      if (!canCreateTasks(actor)) return forbidden("Ask your lead to add tasks for you.");
      const reason = await blocked(actor);
      if (reason) return forbidden(reason);
      const ctx = await chat.forAi(actor, target.channelId, MAX_CONTEXT_MESSAGES);
      if (!ctx.ok) return ctx;
      const c = ctx.value.channel;
      const picked = target.messageId ? ctx.value.messages.filter((m) => m.id === target.messageId) : ctx.value.messages;
      if (target.messageId && !picked.length) return notFound("That message");
      if (!picked.some((m) => !m.deletedAt)) return fail("invalid", "There's nothing here yet to make tasks from.");
      const people = ctx.value.readers.filter((r) => r.roles.length).map((r) => ({ id: r.personId, name: r.fullName }));
      const projects = await deps.tools.projects.list(actor, { ...(forClient(c.kind) && c.clientId ? { clientId: c.clientId } : {}), statuses: ["active", "planned"] });
      const projectList = projects.ok ? projects.value.map((p) => ({ id: p.id, name: p.name, clientName: p.clientName })) : [];
      const r = await ai.ask(actor, "chat_tasks", {
        system: TASKS_SYSTEM,
        turns: [{ role: "user", text: `${header(actor)} (today is ${clock.today()})\nPeople who can own these tasks: ${JSON.stringify(people.map((p) => p.name))}\n\n${chatData(picked)}` }],
        tools: [],
        effort: "low",
        maxOutputTokens: 1500,
        maxSteps: 1,
        maxCostMicroUsd: 100_000,
        // Not JSON in the expected shape: the next model tries (12.3).
        accept: (t) => /"tasks"\s*:\s*\[/.test(t),
      });
      if (!r.ok) return r;
      const active = projects.ok ? projects.value.find((p) => p.status === "active") : undefined;
      return ok({ proposals: readProposals(r.value.text, people, clock.today()), people, projects: projectList, defaultProjectId: forClient(c.kind) ? (active?.id ?? projectList[0]?.id ?? null) : null, costPaise: r.value.costPaise });
    },

    /** Approving a proposal: an ordinary new task, with every check the task service makes (projects, 14.1/14.2). */
    async approveTask(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(approveSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return deps.tools.tasks.create(actor, { projectId: v.projectId, title: v.title, ownerId: v.ownerId, dueDate: v.dueDate, description: "Proposed by the AI from a chat; approved by a person." });
    },
  };
}
export type ChatAiService = ReturnType<typeof createChatAiService>;
