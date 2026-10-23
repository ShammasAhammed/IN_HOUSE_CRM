// The AI engine (Stage 9.1, D85; router Stage 12.3): every question goes through ask(), which picks the model by the
// router's rules (rules/ai-router.ts), checks the monthly spending limit and the per-person daily cap before every
// attempt, runs the model, and logs what each attempt cost. When a model fails, refuses, says nothing or answers in
// the wrong shape, the next one tries; every attempt is a row in the usage log ("escalated from" the one before).
// The decision helper (Jev, or Claude Haiku without it) answers small questions the same way: limited and logged.
// The owner sees spending, sets the limit, and steers the router in Settings → AI.
import { z } from "zod";
import { forbidden, ok, fail, type Result } from "@/lib/result";
import { settingId } from "@/lib/id";
import { AI_FEATURES, type AiFeature, type AiOutcome } from "@/lib/types";
import { aiLimitSchema } from "@/lib/validation/ai";
import { parse } from "@/lib/validation/common";
import type { AiModel, AiRequest, AiResult, AiToolCall, AiUsageRecord, AiUsageTotals, DataStore, DecisionAnswer, DecisionModel, DecisionQuestion } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, type Actor } from "./permissions";
import { blockedReason, dayRange, DEFAULT_MONTHLY_LIMIT_PAISE, monthRange, sumUsage, toPaise, type AiLimit } from "./rules/ai";
import { DEFAULT_ORDER, FEATURE_TIER, isMalayalam, PROVIDERS, route, shiftTier, stripContacts, TIERS, type RouterSettings, type Tier } from "./rules/ai-router";

const LIMIT_KEY = "ai_limit";
export const ROUTER_KEY = "ai_router";
const DENIED = "Only the owner sees AI spending.";
/** Below this, the decision helper's hint is ignored and the plain rules decide. */
export const HINT_MIN_PROBABILITY = 0.7;
/** Questions whose difficulty varies enough to be worth a hint. */
const HINTED = new Set<AiFeature>(["assistant", "chat_answer"]);
/** The co-worker's own daily run (12.5): inside the monthly limit, outside the person's daily question count. */
export const SYSTEM_FEATURES: readonly AiFeature[] = ["coworker"];

export type AiAnswer = { text: string; outcome: Exclude<AiOutcome, "failed">; toolCalls: AiToolCall[]; costPaise: number | null; usageId: string; provider: string; model: string };

export type AiUsagePage = {
  connected: boolean;
  provider: string;
  model: string;
  month: string;
  limitPaise: number;
  spent: AiUsageTotals;
  byPerson: Array<AiUsageTotals & { personId: string; personName: string }>;
  recent: AiUsageRecord[];
};

export type RouterPage = {
  settings: RouterSettings;
  models: Array<{ provider: string; model: string; supportsTools: boolean }>;
  decision: Array<{ provider: string; model: string }>;
};

const routerOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("move"), tier: z.enum(TIERS), model: z.string().min(1), by: z.coerce.number().int().min(-1).max(1) }),
  z.object({ op: z.literal("prefer"), feature: z.enum(AI_FEATURES), model: z.string().optional().default(""), only: z.string().optional() }),
  z.object({ op: z.literal("malayalam"), first: z.enum(["gemini", "openai"]) }),
  z.object({ op: z.literal("personal"), provider: z.enum(PROVIDERS), on: z.string().optional() }),
  z.object({ op: z.literal("helper"), use: z.enum(["hints", "leadScores"]), on: z.string().optional() }),
]);

/** The decision helper's answers and who gave them. */
export type Decided = { answers: Record<string, DecisionAnswer>; provider: string; model: string };

/** One attempt's outcome: an answer to keep, or why the next model should try. */
type Attempt = { kind: "kept"; answer: AiAnswer } | { kind: "next"; result: AiResult; why: "failed" | "refused" | "empty" | "shape" } | { kind: "blocked"; reason: string };

export function createAiService(deps: {
  store: DataStore;
  /** Every connected model (one per provider and model id); `model` alone is the one-model setup tests use. */
  models?: AiModel[];
  model?: AiModel;
  /** The decision helper, in order (Jev, then the chat-model fallback); empty when none is connected. */
  decisions?: DecisionModel[];
  clock: Clock;
  inrPerUsd: number;
  report?: (err: unknown, context?: Record<string, unknown>) => void;
}) {
  const { store, clock, inrPerUsd } = deps;
  const models = (deps.models ?? (deps.model ? [deps.model] : [])).filter((m) => m.connected);
  const decisions = (deps.decisions ?? []).filter((d) => d.connected);
  const limit = async () => (await store.calendar.getSetting<AiLimit>(LIMIT_KEY))?.monthlyPaise ?? DEFAULT_MONTHLY_LIMIT_PAISE;
  const settings = async () => (await store.calendar.getSetting<RouterSettings>(ROUTER_KEY)) ?? {};

  async function blocked(actor: Actor, repos: Pick<DataStore, "aiUsage" | "calendar"> = store, feature?: AiFeature): Promise<string | null> {
    const today = clock.today();
    const [spent, mine, saved] = await Promise.all([
      repos.aiUsage.totals(monthRange(today)),
      repos.aiUsage.totals({ ...dayRange(today), personId: actor.personId, exceptFeatures: SYSTEM_FEATURES }),
      repos.calendar.getSetting<AiLimit>(LIMIT_KEY),
    ]);
    const system = feature !== undefined && SYSTEM_FEATURES.includes(feature);
    return blockedReason({ connected: models.length > 0, spentPaise: spent.costPaise, limitPaise: saved?.monthlyPaise ?? DEFAULT_MONTHLY_LIMIT_PAISE, askedToday: system ? 0 : mine.questions });
  }

  /** Check the limits and hold a usage row at the attempt's ceiling cost, under one lock. */
  async function reserve(actor: Actor, feature: AiFeature, provider: string, model: string, ceilingMicroUsd: number, escalatedFrom: string | null): Promise<{ id: string } | { reason: string }> {
    return store.transaction(async (repos) => {
      await repos.aiUsage.lock();
      const reason = await blocked(actor, repos, feature);
      if (reason) return { reason };
      const empty = { provider, model, outcome: "failed" as const, calls: 0, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, costMicroUsd: 0 };
      return { id: await repos.aiUsage.record({ personId: actor.personId, feature, ...empty, costPaise: toPaise(ceilingMicroUsd, inrPerUsd), escalatedFrom, at: clock.now() }) };
    });
  }

  async function attempt(actor: Actor, feature: AiFeature, model: AiModel, request: AiRequest, escalatedFrom: string | null): Promise<Attempt> {
    const held = await reserve(actor, feature, model.provider, model.model, request.maxCostMicroUsd, escalatedFrom);
    if ("reason" in held) return { kind: "blocked", reason: held.reason };
    let result: AiResult = { kind: "failed", reason: "error", message: "No answer", toolCalls: [], usage: [] };
    try {
      result = await model.answer(request);
    } catch (err) {
      result = { kind: "failed", reason: "error", message: err instanceof Error ? err.message : String(err), toolCalls: [], usage: [] };
    }
    const total = sumUsage(result.usage);
    const costPaise = toPaise(total.costMicroUsd, inrPerUsd);
    const why = result.kind === "failed" ? "failed" : result.outcome === "refused" ? "refused" : !result.text.trim() ? "empty" : request.accept && !request.accept(result.text) ? "shape" : null;
    const outcome: AiOutcome = result.kind === "failed" || why === "empty" || why === "shape" ? "failed" : result.outcome;
    await store.aiUsage.finish(held.id, { provider: model.provider, model: result.usage.at(-1)?.model ?? model.model, outcome, calls: result.usage.length, ...total, costPaise, escalatedFrom });
    if (result.kind === "failed") deps.report?.(new Error(`AI ${result.reason} (${model.model}): ${result.message}`), { feature, personId: actor.personId });
    if (why || result.kind === "failed") return { kind: "next", result, why: why ?? "failed" };
    // What each answer cost is the owner's to see (D85).
    return { kind: "kept", answer: { text: result.text, outcome: result.outcome, toolCalls: result.toolCalls, costPaise: can(actor, "settings.manage") ? costPaise : null, usageId: held.id, provider: model.provider, model: model.model } };
  }

  /** Try each model in order until one gives a usable answer. */
  async function run(actor: Actor, feature: AiFeature, order: AiModel[], request: AiRequest): Promise<Result<AiAnswer>> {
    let last: Attempt | null = null;
    let from: string | null = null;
    for (const m of order) {
      const a = await attempt(actor, feature, m, request, from);
      if (a.kind === "kept") return ok(a.answer);
      if (a.kind === "blocked") return fail("forbidden", a.reason);
      last = a;
      from = m.model;
    }
    if (last?.kind === "next" && last.why === "refused") return fail("conflict", "The AI won't answer that one. Try asking it another way.");
    if (last?.kind === "next" && last.result.kind === "failed") {
      if (last.result.reason === "auth") return fail("forbidden", "The AI key isn't working. The owner needs to check it in Vercel.");
      if (last.result.reason === "busy") return fail("conflict", "The AI is busy right now. Try again in a minute.");
    }
    return fail("conflict", "The AI couldn't answer that. Try asking it a different way.");
  }

  /** The decision helper, inside the same limit and log. Null when there's none, it's off, or it failed everywhere. */
  async function decide(actor: Actor, feature: AiFeature, state: string, questions: DecisionQuestion[]): Promise<Decided | null> {
    let from: string | null = null;
    for (const d of decisions) {
      const held = await reserve(actor, feature, d.provider, d.model, 20_000, from);
      if ("reason" in held) return null;
      const r = await d.decide(stripContacts(state), questions).catch((err: unknown) => ({ ok: false as const, message: String(err), usage: [] }));
      const total = sumUsage(r.usage);
      await store.aiUsage.finish(held.id, { provider: d.provider, model: d.model, outcome: r.ok ? "answered" : "failed", calls: r.usage.length, ...total, costPaise: toPaise(total.costMicroUsd, inrPerUsd), escalatedFrom: from });
      if (r.ok) return { answers: r.answers, provider: d.provider, model: d.model };
      from = d.model;
    }
    return null;
  }

  /** The router's hint for one question: how hard, and is it Malayalam. Ignored when unsure. */
  async function hint(actor: Actor, text: string): Promise<{ difficulty: "easy" | "medium" | "hard" | null; malayalam: boolean }> {
    const a = await decide(actor, "route_hint", text.slice(0, 2000), [
      { id: "difficulty", kind: "choice", instructions: "How hard is this request for an AI assistant at a marketing agency?", options: { easy: "a quick lookup or a short reply", medium: "a few lookups or a normal piece of writing", hard: "reasoning across many records, planning, or a long careful answer" } },
      { id: "malayalam", kind: "yesno", instructions: "The request is written in Malayalam (any script) or asks for an answer in Malayalam." },
    ]);
    const sure = (x: DecisionAnswer | undefined) => (x && x.probability >= HINT_MIN_PROBABILITY ? x.value : null);
    return { difficulty: (sure(a?.answers.difficulty) as "easy" | "medium" | "hard" | null) ?? null, malayalam: sure(a?.answers.malayalam) === true };
  }

  return {
    /** Whether any AI key is set at all: the menu hides Ask until it is (test report L12). */
    switchedOn(): boolean {
      return models.length > 0;
    },

    /** For the assistant screen: can this person ask now, and if not, why. */
    async status(actor: Actor): Promise<{ ready: boolean; reason: string | null }> {
      const reason = await blocked(actor);
      return { ready: reason === null, reason };
    },

    /**
     * Ask the AI. Callers (the assistant, the MCP) build the tools from the asker's own Actor, so the model can only
     * reach what this person could open themselves. The limit is checked before every attempt: one attempt can take
     * the month a little past it, never a second.
     */
    async ask(actor: Actor, feature: AiFeature, request: AiRequest): Promise<Result<AiAnswer>> {
      const reason = await blocked(actor, store, feature);
      if (reason) return fail("forbidden", reason);
      const s = await settings();
      const question = request.turns.filter((t) => t.role === "user").at(-1)?.text ?? "";
      let tier: Tier = FEATURE_TIER[feature];
      let malayalam = isMalayalam(question);
      if (HINTED.has(feature) && s.hints !== false && decisions.length) {
        const h = await hint(actor, question);
        tier = shiftTier(tier, h.difficulty);
        malayalam ||= h.malayalam;
      }
      const r = route({ feature, tier, models, settings: s, tools: request.tools.length > 0, personal: request.personal !== false, malayalam });
      if (!r.ok) return fail("forbidden", r.reason);
      return run(actor, feature, r.order, request);
    },

    /** The decision helper for other services (lead scores): null when it's not there or not sure enough to answer. */
    async decide(actor: Actor, feature: AiFeature, state: string, questions: DecisionQuestion[]): Promise<Decided | null> {
      if (!decisions.length || (await blocked(actor, store, feature))) return null;
      return decide(actor, feature, state, questions);
    },

    /** Has the owner switched a decision-helper use off? */
    async helperOn(use: "hints" | "leadScores"): Promise<boolean> {
      return decisions.length > 0 && (await settings())[use] !== false;
    },

    /** The owner's model comparison: one model, no routing, logged as "compare". */
    async compare(actor: Actor, model: string, request: AiRequest): Promise<Result<AiAnswer>> {
      if (!can(actor, "settings.manage")) return forbidden("Only the owner compares models.");
      const m = models.find((x) => x.model === model);
      if (!m) return fail("invalid", `${model} isn't connected.`);
      return run(actor, "compare", [m], { ...request, tools: [] });
    },

    async usage(actor: Actor): Promise<Result<AiUsagePage>> {
      if (!can(actor, "settings.manage")) return forbidden(DENIED);
      const range = monthRange(clock.today());
      const [spent, byPerson, recent, limitPaise] = await Promise.all([store.aiUsage.totals(range), store.aiUsage.byPerson(range), store.aiUsage.recent(range, 50), limit()]);
      return ok({ connected: models.length > 0, provider: [...new Set(models.map((m) => m.provider))].join(", "), model: models.map((m) => m.model).join(", "), month: range.month, limitPaise, spent, byPerson, recent });
    },

    async router(actor: Actor): Promise<Result<RouterPage>> {
      if (!can(actor, "settings.manage")) return forbidden("Only the owner steers the AI router.");
      return ok({ settings: await settings(), models: models.map((m) => ({ provider: m.provider, model: m.model, supportsTools: m.supportsTools !== false })), decision: decisions.map((d) => ({ provider: d.provider, model: d.model })) });
    },

    async setRouter(actor: Actor, raw: unknown): Promise<Result<RouterSettings>> {
      if (!can(actor, "settings.manage")) return forbidden("Only the owner steers the AI router.");
      const parsed = parse(routerOp, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return commit(store, async (repos) => {
        const before = (await repos.calendar.getSetting<RouterSettings>(ROUTER_KEY)) ?? {};
        const next: RouterSettings = structuredClone(before);
        if (v.op === "move") {
          const list = [...(next.order?.[v.tier] ?? DEFAULT_ORDER[v.tier])];
          const i = list.indexOf(v.model);
          const j = i + v.by;
          if (i < 0 || j < 0 || j >= list.length) return noChange(before);
          [list[i], list[j]] = [list[j]!, list[i]!];
          next.order = { ...next.order, [v.tier]: list };
        } else if (v.op === "prefer") {
          const prefer = { ...next.prefer };
          if (v.model) prefer[v.feature] = { model: v.model, only: v.only === "on" };
          else delete prefer[v.feature];
          next.prefer = prefer;
        } else if (v.op === "malayalam") next.malayalamFirst = v.first;
        else if (v.op === "personal") next.personal = { ...next.personal, [v.provider]: v.on === "on" };
        else next[v.use] = v.on === "on";
        if (JSON.stringify(before) === JSON.stringify(next)) return noChange(next);
        await repos.calendar.setSetting(ROUTER_KEY, next, actor.personId);
        return change(next, { actorId: actor.personId, action: "setting.changed", entityType: "setting", entityId: settingId(ROUTER_KEY), data: { key: ROUTER_KEY, ...v } });
      });
    },

    async setLimit(actor: Actor, raw: unknown): Promise<Result<AiLimit>> {
      if (!can(actor, "settings.manage")) return forbidden("Only the owner sets the AI spending limit.");
      const parsed = parse(aiLimitSchema, raw);
      if (!parsed.ok) return parsed;
      const next: AiLimit = { monthlyPaise: parsed.value.monthly };
      return commit(store, async (repos) => {
        const before = (await repos.calendar.getSetting<AiLimit>(LIMIT_KEY)) ?? { monthlyPaise: DEFAULT_MONTHLY_LIMIT_PAISE };
        if (before.monthlyPaise === next.monthlyPaise) return noChange(next);
        await repos.calendar.setSetting(LIMIT_KEY, next, actor.personId);
        return change(next, { actorId: actor.personId, action: "setting.changed", entityType: "setting", entityId: settingId(LIMIT_KEY), data: { key: LIMIT_KEY, from: before, to: next } });
      });
    },
  };
}

export type AiService = ReturnType<typeof createAiService>;
