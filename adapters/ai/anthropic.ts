// Claude through the Anthropic API (Stage 9.1, D85). The only place that talks to Anthropic. Runs the tool rounds:
// the model asks for a tool, the tool runs with the asker's own permissions (the service builds it), the result goes
// back, until the model answers or the step limit is reached. Every call's tokens are priced from prices.ts.
import Anthropic from "@anthropic-ai/sdk";
import type { AiCallUsage, AiModel, AiResult, AiToolCall } from "@/repositories";
import { priced } from "./prices";

type Tokens = { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number | null; cache_read_input_tokens: number | null };

export function priceCall(model: string, t: Tokens): AiCallUsage {
  return priced(model, { input: t.input_tokens, output: t.output_tokens, cacheWrite: t.cache_creation_input_tokens ?? 0, cacheRead: t.cache_read_input_tokens ?? 0 });
}

/** One call's usage. With a safety fallback, each model that ran is listed (and billed) on its own. */
function usageOf(message: Anthropic.Beta.BetaMessage, requested: string): AiCallUsage[] {
  const runs = (message.usage.iterations ?? []).filter((i) => i.type === "message" || i.type === "fallback_message");
  if (!runs.length) return [priceCall(message.model || requested, message.usage)];
  return runs.map((i) => priceCall(("model" in i && i.model) || requested, i));
}

const textOf = (message: Anthropic.Beta.BetaMessage) =>
  message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n\n")
    .trim();

export function anthropicModel(opts: { apiKey: string; model?: string; client?: Anthropic }): AiModel {
  const model = opts.model || "claude-opus-5-5";
  const client = opts.client ?? new Anthropic({ apiKey: opts.apiKey, maxRetries: 2, timeout: 120_000 });
  return {
    connected: true,
    provider: "anthropic",
    model,
    supportsTools: true,

    async answer(req): Promise<AiResult> {
      const usage: AiCallUsage[] = [];
      const toolCalls: AiToolCall[] = [];
      const byName = new Map(req.tools.map((t) => [t.name, t]));
      // Same order and bytes every time, so the system prompt and tools are read from the cache after the first call.
      const tools: Anthropic.Beta.BetaTool[] = req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema, strict: true }));
      const messages: Anthropic.Beta.BetaMessageParam[] = req.turns.map((t) => ({ role: t.role, content: t.text }));
      let lastText = "";
      try {
        for (let step = 0; step < req.maxSteps; step++) {
          if (usage.reduce((t, u) => t + u.costMicroUsd, 0) >= req.maxCostMicroUsd) return { kind: "answer", outcome: "step_limit", text: lastText, toolCalls, usage };
          const message = await client.beta.messages
            .stream({
              model,
              max_tokens: req.maxOutputTokens,
              system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
              messages,
              ...(tools.length ? { tools } : {}),
              thinking: { type: "adaptive" },
              output_config: { effort: req.effort },
              // The conversation so far is cached too, so each tool round re-reads it cheaply.
              cache_control: { type: "ephemeral" },
              // If the model's safety checks decline, Anthropic retries on its recommended fallback model.
              fallbacks: "default",
              betas: ["server-side-fallback-2026-07-01"],
            })
            .finalMessage();
          usage.push(...usageOf(message, model));
          if (message.stop_reason === "refusal") return { kind: "answer", outcome: "refused", text: "", toolCalls, usage };
          lastText = textOf(message) || lastText;
          const uses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
          if (message.stop_reason === "max_tokens") return { kind: "answer", outcome: "step_limit", text: lastText ? `${lastText}\n\n[The answer was cut off: it ran too long. Ask for less.]` : "", toolCalls, usage };
          if (!uses.length) return { kind: "answer", outcome: "answered", text: lastText, toolCalls, usage };

          messages.push({ role: "assistant", content: message.content as Anthropic.Beta.BetaContentBlockParam[] });
          const results = await Promise.all(
            uses.map(async (use): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
              const tool = byName.get(use.name);
              let out = { ok: false, text: `There is no tool called ${use.name}.` };
              // A lookup that breaks is reported to the model, so the spending so far is still recorded.
              if (tool) out = await tool.run(use.input).catch(() => ({ ok: false, text: "That lookup failed. Say so rather than guessing." }));
              toolCalls.push({ name: use.name, ok: out.ok });
              return { type: "tool_result", tool_use_id: use.id, content: out.text, ...(out.ok ? {} : { is_error: true }) };
            }),
          );
          messages.push({ role: "user", content: results });
        }
        return { kind: "answer", outcome: "step_limit", text: lastText, toolCalls, usage };
      } catch (err) {
        if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return { kind: "failed", reason: "auth", message: err.message, toolCalls, usage };
        if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) return { kind: "failed", reason: "busy", message: err.message, toolCalls, usage };
        if (err instanceof Anthropic.APIError) return { kind: "failed", reason: err.status === 529 ? "busy" : "error", message: err.message, toolCalls, usage };
        return { kind: "failed", reason: "error", message: err instanceof Error ? err.message : String(err), toolCalls, usage };
      }
    },
  };
}
