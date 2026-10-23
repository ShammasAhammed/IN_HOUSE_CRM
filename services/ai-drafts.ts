// AI teammates (Stage 11.3): hand a routine piece of a task (a caption, a creative brief, a first script, report prep)
// to the AI. It never acts on its own: it writes a draft on the task, with no tools and so no way to change anything,
// from what the asking person can see (the task and its client's knowledge base). A person who can change the task
// approves it (edited if needed) or rejects it. Every run goes through ai.ask(): logged, priced, inside the monthly
// limit, and refused with the reason when the AI is off.
import { z } from "zod";
import { isId, newId } from "@/lib/id";
import { conflict, forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { AI_DRAFT_KINDS, AI_DRAFT_KIND_LABELS, type AiDraftKind } from "@/lib/types";
import { id, parse } from "@/lib/validation/common";
import type { AiDraftRecord, DataStore, TaskDetailRow } from "@/repositories";
import type { AiService } from "./ai";
import { change, commit } from "./change";
import type { Clock } from "./clock";
import type { KnowledgeService } from "./knowledge";
import { can, type Actor } from "./permissions";
import { levelBlocks } from "./spaces";
import { draftRequest, MAX_INSTRUCTIONS, TEAMMATE_SYSTEM } from "./rules/ai-drafts";
import { canEdit, taskScope } from "./tasks";

const DENIED = "Only people who can change this task ask the AI teammate or approve its drafts.";

const requestSchema = z.object({
  taskId: id,
  kind: z.enum(AI_DRAFT_KINDS, { message: "Pick what the AI should draft." }),
  instructions: z
    .string()
    .trim()
    .max(MAX_INSTRUCTIONS, { message: `Keep it under ${MAX_INSTRUCTIONS.toLocaleString("en-IN")} characters.` })
    .optional()
    .transform((v) => v || null),
});
const decideSchema = z.object({
  draftId: id,
  decision: z.enum(["approve", "reject"], { message: "Approve or reject." }),
  body: z.string().trim().max(20_000, { message: "Keep it under 20,000 characters." }).optional().default(""),
});

export type AiDraftView = Omit<AiDraftRecord, "costPaise" | "model"> & { model: string | null; costPaise: number | null };
export type TaskDrafts = {
  drafts: AiDraftView[];
  /** May this person ask for drafts and decide on them. */
  canUse: boolean;
  /** Null when the AI can be asked now; otherwise why not (no key yet, monthly limit reached…). */
  blocked: string | null;
};

export function createAiDraftService(deps: { store: DataStore; clock: Clock; ai: Pick<AiService, "ask" | "status">; knowledge: Pick<KnowledgeService, "forClient"> }) {
  const { store, clock, ai } = deps;

  async function visibleTask(actor: Actor, taskId: string): Promise<TaskDetailRow | null> {
    if (!isId(taskId)) return null;
    return store.tasks.findById(taskId, taskScope(actor));
  }

  // What each run cost is the owner's to see (D85); everyone sees who asked and what came back.
  const view = (actor: Actor) => (d: AiDraftRecord): AiDraftView => (can(actor, "settings.manage") ? d : { ...d, costPaise: null });

  return {
    async forTask(actor: Actor, taskId: string): Promise<Result<TaskDrafts>> {
      const t = await visibleTask(actor, taskId);
      if (!t) return notFound("That task");
      const canUse = canEdit(actor, t);
      const [drafts, status] = await Promise.all([store.aiDrafts.forTask(t.id), canUse ? ai.status(actor) : Promise.resolve({ ready: false, reason: null })]);
      return ok({ drafts: drafts.map(view(actor)), canUse, blocked: canUse && !status.ready ? (status.reason ?? "The AI isn't available.") : null });
    },

    /** Ask the AI teammate for a draft on a task. Nothing on the task changes; the draft waits for a person. */
    async request(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(requestSchema, raw);
      if (!parsed.ok) return parsed;
      const { taskId, kind, instructions } = parsed.value;
      const t = await visibleTask(actor, taskId);
      if (!t) return notFound("That task");
      if (!canEdit(actor, t)) return forbidden(DENIED);
      { const blocked = await levelBlocks(store, actor, t.clientId, "edit"); if (blocked) return blocked; }
      // The client's knowledge base, read as the asker: the AI never sees more than they could.
      const kb = await deps.knowledge.forClient(actor, t.clientId);
      const knowledge = kb.ok ? { tone: kb.value.knowledge.tone, dos: kb.value.knowledge.dos, donts: kb.value.knowledge.donts, campaigns: kb.value.campaigns } : null;
      const answer = await ai.ask(actor, "teammate", {
        system: TEAMMATE_SYSTEM,
        turns: [{ role: "user", text: draftRequest({ kind, instructions, task: { title: t.title, description: t.description, clientName: t.clientName, projectName: t.projectName, dueDate: t.dueDate }, knowledge }) }],
        tools: [],
        effort: "medium",
        maxOutputTokens: 1500,
        maxSteps: 1,
        maxCostMicroUsd: 80_000,
      });
      if (!answer.ok) return answer;
      const draftId = newId();
      return commit(store, async (repos) => {
        await repos.aiDrafts.create({ id: draftId, taskId: t.id, clientId: t.clientId, kind, instructions, body: answer.value.text.trim(), requestedById: actor.personId, aiUsageId: answer.value.usageId });
        return change({ id: draftId }, draftEvent(actor, t, "task.ai_draft_created", kind, { draftId }));
      });
    },

    /** Approve (with the person's edits) or reject a waiting draft. Decided drafts never change again. */
    async decide(actor: Actor, raw: unknown): Promise<Result<{ status: "approved" | "rejected" }>> {
      const parsed = parse(decideSchema, raw);
      if (!parsed.ok) return parsed;
      const { draftId, decision, body } = parsed.value;
      const d = await store.aiDrafts.find(draftId);
      const t = d ? await visibleTask(actor, d.taskId) : null;
      if (!d || !t) return notFound("That draft");
      if (!canEdit(actor, t)) return forbidden(DENIED);
      { const blocked = await levelBlocks(store, actor, t.clientId, "edit"); if (blocked) return blocked; }
      if (decision === "approve" && !body) return invalid("The approved text can't be empty. Reject the draft instead.", { body: ["Write the text, or reject the draft."] });
      const status = decision === "approve" ? "approved" : "rejected";
      const finalBody = decision === "approve" ? body : d.body;
      return commit(store, async (repos) => {
        if (!(await repos.aiDrafts.decide(d.id, { status, body: finalBody, reviewedById: actor.personId }, clock.now()))) {
          return conflict("Someone already decided on this draft. Reload the page to see it.");
        }
        return change({ status }, draftEvent(actor, t, `task.ai_draft_${status}`, d.kind, { draftId: d.id, ...(status === "approved" ? { edited: finalBody !== d.body } : {}) }));
      });
    },
  };
}

function draftEvent(actor: Actor, t: TaskDetailRow, action: string, kind: AiDraftKind, data: Record<string, unknown>) {
  // On the task, so its Activity shows who asked the AI and what was decided.
  return { actorId: actor.personId, action, entityType: "task" as const, entityId: t.id, clientId: t.clientId, data: { ...data, taskId: t.id, kind, kindLabel: AI_DRAFT_KIND_LABELS[kind], title: t.title } };
}
export type AiDraftService = ReturnType<typeof createAiDraftService>;
