// The AI model behind the assistant (Stage 9, D85): Claude first, switchable to another provider with one new adapter.
// Services hand it a question, the conversation so far and the tools it may call; the adapter runs the tool rounds
// and reports what each call cost. It never throws for a provider failure: it says what went wrong.
import type { AiFeature, AiOutcome, LeadScore } from "@/lib/types";

/** A tool the model may call. `run` does the work with the asker's own permissions and returns text for the model. */
export type AiTool = {
  name: string;
  description: string;
  /** JSON Schema of the input: an object whose properties are all listed in `required`, no extra properties. */
  inputSchema: Record<string, unknown>;
  run(input: unknown): Promise<{ ok: boolean; text: string }>;
};

export type AiTurn = { role: "user" | "assistant"; text: string };

export type AiCallUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  /** What the provider charges for this call, in millionths of a US dollar. */
  costMicroUsd: number;
};

export type AiRequest = {
  /** Stays the same between questions so the provider can cache it. */
  system: string;
  /** Earlier turns, oldest first, then the new question last (role "user"). */
  turns: AiTurn[];
  tools: AiTool[];
  /** How hard to think: "low" for quick lookups, "medium" for most questions. */
  effort: "low" | "medium" | "high";
  maxOutputTokens: number;
  /** Calls to the model allowed for one question (each tool round is one call). */
  maxSteps: number;
  /** Stop starting new rounds once this question has cost this much (millionths of a dollar). */
  maxCostMicroUsd: number;
  /** Does the job carry personal data (names, phones, chat)? Then providers the owner keeps from it are skipped. Default yes. */
  personal?: boolean;
  /** A format check on the answer (JSON a service parses): failing it moves on to the next model. */
  accept?: (text: string) => boolean;
};

export type AiToolCall = { name: string; ok: boolean };

export type AiResult =
  | { kind: "answer"; outcome: Exclude<AiOutcome, "failed">; text: string; toolCalls: AiToolCall[]; usage: AiCallUsage[] }
  | {
      kind: "failed";
      /** auth: the key is wrong or revoked; busy: rate limited or overloaded; error: anything else. */
      reason: "auth" | "busy" | "error";
      message: string;
      toolCalls: AiToolCall[];
      usage: AiCallUsage[];
    };

export interface AiModel {
  readonly connected: boolean;
  /** anthropic, openai, gemini… (the router's personal-data and Malayalam rules go by provider). */
  readonly provider: string;
  readonly model: string;
  /** False when this adapter can't run tools yet: jobs with tools skip it. Absent means it can. */
  readonly supportsTools?: boolean;
  answer(request: AiRequest): Promise<AiResult>;
}

export type AiUsageWrite = {
  personId: string;
  feature: AiFeature;
  provider: string;
  model: string;
  outcome: AiOutcome;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  costMicroUsd: number;
  costPaise: number;
  /** When an earlier model failed this question: that model (Stage 12.3). */
  escalatedFrom?: string | null;
  at: Date;
};

export type AiUsageRecord = Omit<AiUsageWrite, "at"> & { id: string; personName: string; createdAt: Date };

export type AiUsageTotals = { questions: number; costPaise: number };

export interface AiUsageRepository {
  /** Hold the spending lock until the transaction ends, so two questions can't both pass the limit check. */
  lock(): Promise<void>;
  /** Returns the row's id. */
  record(row: AiUsageWrite): Promise<string>;
  /** Fill in what a reserved question finally cost. */
  finish(id: string, row: Omit<AiUsageWrite, "personId" | "feature" | "at">): Promise<void>;
  /** Totals from `from` (inclusive) to `to` (exclusive). */
  /** `feature`: only that feature's rows; `exceptFeatures`: leave those out (a person's daily count skips the co-worker's). */
  totals(range: { from: Date; to: Date; personId?: string; feature?: AiFeature; exceptFeatures?: readonly AiFeature[] }): Promise<AiUsageTotals>;
  byPerson(range: { from: Date; to: Date }): Promise<Array<AiUsageTotals & { personId: string; personName: string }>>;
  /** Newest first. */
  recent(range: { from: Date; to: Date }, limit: number): Promise<AiUsageRecord[]>;
}

// ---------- the decision helper (Stage 12.3) ----------

/** Small questions about a piece of text, answered with a value and how sure the answer is. */
export type DecisionQuestion =
  | { id: string; kind: "choice"; instructions: string; options: Record<string, string> }
  /** Levels from 1 up, one description each; the answer is the level number. */
  | { id: string; kind: "score"; instructions: string; levels: string[] }
  | { id: string; kind: "yesno"; instructions: string };

/** probability: 0–1, how sure the model is of this value. */
export type DecisionAnswer = { value: string | number | boolean; probability: number };

export type DecisionResult = { ok: true; answers: Record<string, DecisionAnswer>; usage: AiCallUsage[] } | { ok: false; message: string; usage: AiCallUsage[] };

export interface DecisionModel {
  readonly connected: boolean;
  readonly provider: string;
  readonly model: string;
  /** The text being judged goes in `state`; never phone numbers or emails (the caller strips them). */
  decide(state: string, questions: DecisionQuestion[]): Promise<DecisionResult>;
}

/** The decision helper's hint about a lead (Stage 12.3); never part of the lead itself. */
export type LeadAiScore = { leadId: string; label: LeadScore; score: number; junk: boolean; surePercent: number; provider: string; model: string; scoredAt: Date };

export interface LeadAiScoreRepository {
  forLeads(leadIds: readonly string[]): Promise<LeadAiScore[]>;
  save(row: LeadAiScore): Promise<void>;
  /** Live leads created since `since` with no hint yet, newest first. */
  unscored(since: Date, limit: number): Promise<string[]>;
}
