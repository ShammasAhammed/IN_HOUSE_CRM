"use client";

// The comparison itself: an instruction, two or three models, up to 30 examples (one per block, split by a line with
// "---"), answers side by side with their cost, and "use first for…" per model.
import { useState } from "react";
import { Check, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { formatRupees } from "@/lib/format";
import { AI_FEATURE_LABELS, AI_FEATURES, type AiFeature } from "@/lib/types";
import { PROVIDER_LABELS } from "@/services/rules/ai-router";
import { compareAction, preferModelAction, type CompareResult } from "../../actions";

const MAX_EXAMPLES = 30;
const MAX_MODELS = 3;

/** Editable starters for the owner's Malayalam check (no real client or parent data). */
const MALAYALAM = {
  instruction: "Write in Malayalam (Malayalam script) for an education institution in Kerala. Short, warm and natural, the way a local team would write it. No English unless asked.",
  examples: [
    "An Instagram ad caption for a nursing college in Kottayam: B.Sc Nursing admissions for 2027 are open, 60 seats, hostel available, INC approved. End with a call to apply this week.",
    "A WhatsApp follow-up to a parent who asked about B.Sc Nursing for their daughter last week and hasn't replied. Polite and short; offer a campus visit on Saturday.",
    "Translate this brief for the client into Malayalam: We will run Meta lead ads for 4 weeks for Plus Two science students in Kottayam and Idukki, with a ₹40,000 budget, a landing page and a WhatsApp follow-up for every lead.",
    "A 30-second reel script for an IAS academy's open day: a hook, three short scenes, and a closing line.",
  ],
};
const FEATURES = AI_FEATURES.filter((f) => f !== "compare" && f !== "route_hint" && f !== "lead_score" && f !== "mcp");

type Row = { example: string; outputs: Record<string, CompareResult | "running"> };

export function Compare({ models, briefs }: { models: Array<{ model: string; provider: string }>; briefs: string[] }) {
  const [feature, setFeature] = useState<AiFeature>("teammate");
  const [instruction, setInstruction] = useState(MALAYALAM.instruction);
  const [examples, setExamples] = useState(MALAYALAM.examples.join("\n---\n"));
  // The Malayalam starter goes to Gemini and ChatGPT first, like the router (never Claude for Malayalam).
  const firstPick = [models.find((m) => m.provider === "gemini"), models.find((m) => m.provider === "openai")].filter((m) => m !== undefined);
  const [picked, setPicked] = useState<string[]>((firstPick.length === 2 ? firstPick : models.slice(0, 2)).map((m) => m.model));
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const list = examples
    .split(/\n-{3,}\n/)
    .map((e) => e.trim())
    .filter(Boolean)
    .slice(0, MAX_EXAMPLES);

  const run = async () => {
    setRunning(true);
    setSaved(null);
    const start: Row[] = list.map((example) => ({ example, outputs: Object.fromEntries(picked.map((m) => [m, "running" as const])) }));
    setRows(start);
    for (const [i, example] of list.entries()) {
      await Promise.all(
        picked.map(async (model) => {
          const r = await compareAction({ model, instruction, example });
          setRows((cur) => cur.map((row, j) => (j === i ? { ...row, outputs: { ...row.outputs, [model]: r } } : row)));
        }),
      );
    }
    setRunning(false);
  };

  const total = (model: string) => rows.reduce((n, r) => n + (typeof r.outputs[model] === "object" && r.outputs[model].ok ? (r.outputs[model].costPaise ?? 0) : 0), 0);

  if (models.length < 2)
    return <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Comparing needs at least two connected models. Add a Gemini or OpenAI key next to the Claude one (docs/ai.md).</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Compare AI models</h1>
        <p className="text-sm text-muted-foreground">Run the same examples on two or three models and read the answers side by side. Each answer counts against the monthly AI limit.</p>
      </div>
      <div className="grid gap-4 rounded-lg border bg-card p-4 shadow-card md:grid-cols-2">
        <div className="space-y-3">
          <label className="block space-y-1.5 text-sm font-medium">
            For which job (where &quot;use first&quot; saves)
            <Select value={feature} onChange={(e) => setFeature(e.target.value as AiFeature)} className="h-9">
              {FEATURES.map((f) => (
                <option key={f} value={f}>
                  {AI_FEATURE_LABELS[f]}
                </option>
              ))}
            </Select>
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            Instruction to every model
            <Textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={4} />
          </label>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Models (up to {MAX_MODELS})</legend>
            {models.map((m) => (
              <label key={m.model} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={picked.includes(m.model)}
                  disabled={!picked.includes(m.model) && picked.length >= MAX_MODELS}
                  onChange={(e) => setPicked(e.target.checked ? [...picked, m.model] : picked.filter((x) => x !== m.model))}
                />
                {m.model} <span className="text-xs text-muted-foreground">{PROVIDER_LABELS[m.provider] ?? m.provider}</span>
              </label>
            ))}
          </fieldset>
        </div>
        <div className="space-y-2">
          <label className="block space-y-1.5 text-sm font-medium">
            Examples, one per block, split by a line with ---
            <Textarea value={examples} onChange={(e) => setExamples(e.target.value)} rows={12} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => (setInstruction(MALAYALAM.instruction), setExamples(MALAYALAM.examples.join("\n---\n")))}>
              Malayalam starter set
            </Button>
            {briefs.length ? (
              <Button size="sm" variant="ghost" onClick={() => setExamples(briefs.map((b) => `Write a short Instagram caption for this task: ${b}`).join("\n---\n"))}>
                Recent tasks as examples
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{list.length} example{list.length === 1 ? "" : "s"} (up to {MAX_EXAMPLES})</p>
        </div>
        <div className="md:col-span-2">
          <Button onClick={run} disabled={running || picked.length < 2 || !list.length}>
            {running ? <Loader2 className="animate-spin" /> : <Play />} Run {list.length * picked.length} answers
          </Button>
        </div>
      </div>

      {rows.length ? (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b align-top">
                <th className="w-48 px-3 py-2 text-left font-medium">Example</th>
                {picked.map((m) => (
                  <th key={m} className="px-3 py-2 text-left font-medium">
                    {m}
                    <span className="block text-xs font-normal text-muted-foreground tabular">{formatRupees(total(m))} so far</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1"
                      onClick={async () => {
                        const r = await preferModelAction(feature, m);
                        setSaved(r.message);
                      }}
                    >
                      <Check /> Use first for {AI_FEATURE_LABELS[feature]}
                    </Button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row, i) => (
                <tr key={i} className="align-top">
                  <td className="px-3 py-2 text-xs text-muted-foreground">{row.example}</td>
                  {picked.map((m) => {
                    const o = row.outputs[m];
                    return (
                      <td key={m} className="px-3 py-2">
                        {o === "running" || !o ? (
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        ) : o.ok ? (
                          <>
                            <p className="whitespace-pre-wrap">{o.text}</p>
                            {o.costPaise !== null ? <p className="mt-1 text-xs text-muted-foreground tabular">{formatRupees(o.costPaise)}</p> : null}
                          </>
                        ) : (
                          <p className="text-danger">{o.message}</p>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {saved ? (
        <p role="status" className="text-sm text-success">
          {saved}
        </p>
      ) : null}
    </div>
  );
}
