// The AI router (Stage 12.3): which model takes a job, by plain rules that cost nothing. Pure: no I/O, unit-tested.
//
// D-12.3a tiers: each feature declares one; each tier lists models cheapest-first (the owner can reorder them, or put
//   one model first or lock one for a feature). The first model that is connected and allowed takes the job; on an
//   error or outage, an empty or badly shaped answer, or a refusal, the next one tries (services/ai.ts).
// D-12.3b Malayalam (Malayalam script in the question, or a request for Malayalam) goes to Gemini or ChatGPT only, in
//   the order the owner chose, never Claude. With neither connected the job stops with a clear message.
// D-12.3c tool jobs only go to adapters that run tools; jobs with personal data skip providers the owner keeps from it.
import type { AiFeature } from "@/lib/types";

export const TIERS = ["fast", "standard", "best"] as const;
export type Tier = (typeof TIERS)[number];
export const TIER_LABELS: Record<Tier, string> = { fast: "Fast", standard: "Standard", best: "Best" };

export const FEATURE_TIER: Record<AiFeature, Tier> = {
  assistant: "best",
  mcp: "best",
  chat_answer: "best",
  client_report: "best",
  client_update: "standard",
  teammate: "standard",
  chat_tasks: "standard",
  compare: "standard",
  daily_summary: "fast",
  chat_catchup: "fast",
  route_hint: "fast",
  lead_score: "fast",
  assistant_plan: "fast",
  assistant_promise: "fast",
  assistant_draft: "standard",
  assistant_summary: "standard",
  coworker: "fast",
  doc_write: "standard",
  doc_shorten: "fast",
  doc_translate: "standard",
  meeting_summary: "standard",
  meeting_actions: "fast",
  meeting_transcript: "standard",
};

/** Cheapest first within each tier (owner's order, 19 Oct 2026). */
export const DEFAULT_ORDER: Record<Tier, string[]> = {
  fast: ["gpt-5-nano", "claude-haiku-5-5", "gemini-3.5-flash-lite"],
  standard: ["gpt-5-mini", "gemini-3.8-flash", "claude-sonnet-5-5"],
  best: ["claude-opus-5-5", "gemini-4-argon", "gpt-5.5"],
};

export const PROVIDERS = ["anthropic", "openai", "gemini"] as const;
export type Provider = (typeof PROVIDERS)[number];
export const PROVIDER_LABELS: Record<string, string> = { anthropic: "Claude (Anthropic)", openai: "ChatGPT (OpenAI)", gemini: "Gemini (Google)", typesafe: "Jev (TypeSafe)" };
const MALAYALAM_PROVIDERS = ["gemini", "openai"] as const;

export type RouterSettings = {
  order?: Partial<Record<Tier, string[]>>;
  /** A model to try first for a feature, or (only) the one model it may use. */
  prefer?: Partial<Record<AiFeature, { model: string; only: boolean }>>;
  malayalamFirst?: "gemini" | "openai";
  /** false keeps personal data away from that provider; absent means allowed (all three paid APIs don't train on it). */
  personal?: Partial<Record<Provider, boolean>>;
  /** The decision helper's two uses; absent means on. */
  hints?: boolean;
  leadScores?: boolean;
};

export type ModelInfo = { provider: string; model: string; supportsTools?: boolean };

export const NO_MALAYALAM = "Malayalam needs Gemini or ChatGPT connected: Claude isn't used for Malayalam. The owner adds a Gemini or OpenAI key (docs/ai.md).";

/** Malayalam script anywhere, or the word asking for it. */
export const isMalayalam = (text: string) => /[ഀ-ൿ]/.test(text) || /\bmalayalam\b/i.test(text);

/** A hard question moves up a tier, an easy one down; the feature's tier is the middle. */
export function shiftTier(tier: Tier, difficulty: "easy" | "medium" | "hard" | null): Tier {
  const i = TIERS.indexOf(tier) + (difficulty === "hard" ? 1 : difficulty === "easy" ? -1 : 0);
  return TIERS[Math.max(0, Math.min(TIERS.length - 1, i))]!;
}

const KNOWN = new Set(Object.values(DEFAULT_ORDER).flat());

/** The models to try, in order, or why none may take the job. */
export function route<M extends ModelInfo>(input: { feature: AiFeature; tier: Tier; models: readonly M[]; settings: RouterSettings; tools: boolean; personal: boolean; malayalam: boolean }): { ok: true; order: M[] } | { ok: false; reason: string } {
  const { feature, tier, models, settings } = input;
  const allowed = (m: M) => (!input.tools || m.supportsTools !== false) && (!input.personal || settings.personal?.[m.provider as Provider] !== false);
  const byId = (id: string) => models.find((m) => m.model === id);
  const prefer = settings.prefer?.[feature];

  let order: M[];
  if (input.malayalam) {
    const first = settings.malayalamFirst ?? "gemini";
    const providers = [first, ...MALAYALAM_PROVIDERS.filter((p) => p !== first)];
    const tierList = settings.order?.[tier] ?? DEFAULT_ORDER[tier];
    const all = [...tierList, ...Object.values(DEFAULT_ORDER).flat()];
    order = providers.flatMap((p) => {
      const m = all.map(byId).find((x) => x?.provider === p) ?? models.find((x) => x.provider === p);
      return m ? [m] : [];
    });
    if (prefer && MALAYALAM_PROVIDERS.includes(byId(prefer.model)?.provider as "gemini")) order = [byId(prefer.model)!, ...order.filter((m) => m.model !== prefer.model)];
    order = order.filter(allowed);
    return order.length ? { ok: true, order } : { ok: false, reason: NO_MALAYALAM };
  }

  if (prefer?.only) {
    const m = byId(prefer.model);
    if (!m) return { ok: false, reason: `This job is locked to ${prefer.model}, which isn't connected. The owner can change that in Settings → AI.` };
    return allowed(m) ? { ok: true, order: [m] } : { ok: false, reason: `This job is locked to ${prefer.model}, which can't take it (tools or personal data). The owner can change that in Settings → AI.` };
  }
  const listed = (settings.order?.[tier] ?? DEFAULT_ORDER[tier]).map(byId).filter((m): m is M => Boolean(m));
  // A model in no tier list (a different AI_MODEL, a test model) is kept as a last resort.
  order = [...listed, ...models.filter((m) => !KNOWN.has(m.model) && !listed.includes(m))];
  if (prefer) {
    const m = byId(prefer.model);
    if (m) order = [m, ...order.filter((x) => x !== m)];
  }
  order = order.filter(allowed);
  if (order.length) return { ok: true, order };
  return { ok: false, reason: input.tools ? "No connected AI can look things up for this job. The owner can check Settings → AI." : "No connected AI may take this job. The owner can check Settings → AI." };
}

// ---------- personal data out of what the decision helper reads ----------

/** Phone numbers and emails out of free text, before it goes to the decision helper. */
export const stripContacts = (text: string) =>
  text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/(\+?\d[\d\s().-]{7,}\d)/g, "[phone]");
