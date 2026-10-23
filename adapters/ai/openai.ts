// ChatGPT through the OpenAI API (Stage 12.3), behind the same AiModel port as Claude. The only place that talks to
// OpenAI. Plain fetch to Chat Completions (no SDK for a few calls). Runs tool rounds like the Claude adapter; tools
// are strict, as the services already write them. Paid API only: OpenAI doesn't train on API data.
import type { AiCallUsage, AiModel, AiResult, AiToolCall } from "@/repositories";
import { priced } from "./prices";

const URL = "https://api.openai.com/v1/chat/completions";

type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Completion = {
  model?: string;
  choices: Array<{ finish_reason: string; message: { content: string | null; refusal?: string | null; tool_calls?: ToolCall[] } }>;
  usage?: { prompt_tokens: number; completion_tokens: number; prompt_tokens_details?: { cached_tokens?: number } };
};

/** HTTP status → why it failed, the same three reasons as the Claude adapter. */
export const failureOf = (status: number): "auth" | "busy" | "error" => (status === 401 || status === 403 ? "auth" : status === 429 || status >= 500 ? "busy" : "error");

export function openAiModel(opts: { apiKey: string; model: string; fetch?: typeof fetch }): AiModel {
  const { model } = opts;
  const send = opts.fetch ?? fetch;
  return {
    connected: true,
    provider: "openai",
    model,
    supportsTools: true,

    async answer(req): Promise<AiResult> {
      const usage: AiCallUsage[] = [];
      const toolCalls: AiToolCall[] = [];
      const byName = new Map(req.tools.map((t) => [t.name, t]));
      const tools = req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema, strict: true } }));
      const messages: Message[] = [{ role: "system", content: req.system }, ...req.turns.map((t): Message => (t.role === "user" ? { role: "user", content: t.text } : { role: "assistant", content: t.text }))];
      let lastText = "";
      try {
        for (let step = 0; step < req.maxSteps; step++) {
          if (usage.reduce((t, u) => t + u.costMicroUsd, 0) >= req.maxCostMicroUsd) return { kind: "answer", outcome: "step_limit", text: lastText, toolCalls, usage };
          const res = await send(URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, messages, max_completion_tokens: req.maxOutputTokens, reasoning_effort: req.effort, ...(tools.length ? { tools } : {}) }),
            signal: AbortSignal.timeout(120_000),
          });
          if (!res.ok) return { kind: "failed", reason: failureOf(res.status), message: `OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`, toolCalls, usage };
          const data = (await res.json()) as Completion;
          const u = data.usage;
          const cached = u?.prompt_tokens_details?.cached_tokens ?? 0;
          usage.push(priced(model, { input: (u?.prompt_tokens ?? 0) - cached, output: u?.completion_tokens ?? 0, cacheRead: cached }));
          const choice = data.choices[0];
          if (!choice) return { kind: "failed", reason: "error", message: "OpenAI sent no answer.", toolCalls, usage };
          if (choice.message.refusal || choice.finish_reason === "content_filter") return { kind: "answer", outcome: "refused", text: "", toolCalls, usage };
          lastText = choice.message.content?.trim() || lastText;
          if (choice.finish_reason === "length") return { kind: "answer", outcome: "step_limit", text: lastText ? `${lastText}\n\n[The answer was cut off: it ran too long. Ask for less.]` : "", toolCalls, usage };
          const calls = choice.message.tool_calls ?? [];
          if (!calls.length) return { kind: "answer", outcome: "answered", text: lastText, toolCalls, usage };

          messages.push({ role: "assistant", content: choice.message.content, tool_calls: calls });
          for (const call of calls) {
            const tool = byName.get(call.function.name);
            let out = { ok: false, text: `There is no tool called ${call.function.name}.` };
            if (tool) {
              let input: unknown = null;
              try {
                input = JSON.parse(call.function.arguments);
              } catch {
                // Not JSON: the tool's own check says so to the model.
              }
              out = await tool.run(input).catch(() => ({ ok: false, text: "That lookup failed. Say so rather than guessing." }));
            }
            toolCalls.push({ name: call.function.name, ok: out.ok });
            messages.push({ role: "tool", tool_call_id: call.id, content: out.text });
          }
        }
        return { kind: "answer", outcome: "step_limit", text: lastText, toolCalls, usage };
      } catch (err) {
        return { kind: "failed", reason: "busy", message: err instanceof Error ? err.message : String(err), toolCalls, usage };
      }
    },
  };
}
