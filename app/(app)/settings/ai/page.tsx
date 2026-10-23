import type { Metadata } from "next";
import { Suspense } from "react";
import { Sparkles } from "lucide-react";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { formatCount, formatDateTime, formatMonth, formatRupees, paiseToRupeesInput } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { AI_FEATURE_LABELS, type AiOutcome } from "@/lib/types";
import { DAILY_QUESTIONS_PER_PERSON } from "@/services/rules/ai";
import { ConnectedApps } from "@/components/connected-apps";
import { AiLimitForm, SummaryToggle } from "./limit-form";
import { RouterSettingsSection } from "./router";
import { CoworkerSection } from "./coworker";

export const metadata: Metadata = { title: "AI" };

const OUTCOME: Record<AiOutcome, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  answered: { label: "Answered", tone: "success" },
  step_limit: { label: "Stopped early", tone: "warning" },
  refused: { label: "Declined", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
};

export default function AiSettingsPage() {
  return (
    <Suspense fallback={<LoadingRows rows={5} columns={3} label="Loading AI spending" />}>
      <AiSettings />
    </Suspense>
  );
}

async function AiSettings() {
  const actor = await requireActor();
  const [r, summary, chatAi, router, assistant, coworker] = await Promise.all([getServices().ai.usage(actor), getServices().dailySummary.setting(actor), getServices().chatAi.setting(actor), getServices().ai.router(actor), getServices().myAssistant.ownerSetting(actor), getServices().coworker.page(actor)]);
  if (!r.ok) return <ErrorState error={r.error} />;
  const u = r.value;
  const percent = u.limitPaise > 0 ? Math.round((u.spent.costPaise / u.limitPaise) * 100) : 100;
  const level = percent >= 100 ? "bg-danger" : percent >= 80 ? "bg-warning" : "bg-primary";

  return (
    <div className="max-w-4xl space-y-5">
      <section className="space-y-4 rounded-lg border bg-card p-4 shadow-card md:p-5" aria-label="Spending">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{formatMonth(u.month)}</h2>
          {u.connected ? (
            <Badge tone="success">
              Switched on · {u.provider}
            </Badge>
          ) : (
            <Badge tone="warning">Not switched on</Badge>
          )}
        </div>
        {u.connected ? null : (
          <p className="text-sm text-muted-foreground">
            Add at least one AI key in Vercel (<code className="text-xs">ANTHROPIC_API_KEY</code>, <code className="text-xs">OPENAI_API_KEY</code> or <code className="text-xs">GEMINI_API_KEY</code>) and redeploy. See docs/ai.md.
          </p>
        )}
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span>
              <span className="tabular text-lg font-semibold">{formatRupees(u.spent.costPaise)}</span>
              <span className="text-muted-foreground"> of {formatRupees(u.limitPaise)}</span>
            </span>
            <span className="tabular text-xs text-muted-foreground">
              {formatCount(u.spent.questions)} {u.spent.questions === 1 ? "question" : "questions"}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-subtle" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, percent)} aria-label="Spent this month">
            <div className={`h-full ${level}`} style={{ width: `${Math.min(100, percent)}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            When the limit is reached, the assistant stops until next month or until you raise it. Each person can also ask up to {DAILY_QUESTIONS_PER_PERSON} questions a day. Costs are worked out from Anthropic&apos;s prices in rupees, so
            your Anthropic bill can differ by a little.
          </p>
        </div>
        <AiLimitForm rupees={paiseToRupeesInput(u.limitPaise)} />
      </section>

      {router.ok ? <RouterSettingsSection page={router.value} /> : null}

      {summary.ok ? (
        <section className="space-y-2" aria-label="Morning summary">
          <h2 className="text-sm font-semibold">Morning summary</h2>
          <p className="text-sm text-muted-foreground">Each morning the AI writes you a few lines from the dashboard: late work, overload, retainers running hot, renewals. It arrives as a notification and counts against the limit above (a few rupees a day).</p>
          <SummaryToggle on={summary.value.on} />
        </section>
      ) : null}

      {chatAi.ok ? (
        <section className="space-y-2" aria-label="AI in chat">
          <h2 className="text-sm font-semibold">AI in chat</h2>
          <p className="text-sm text-muted-foreground">
            People can type @AI in a chat to get an answer posted there, using only what everyone in that chat can see. Catch me up and Suggest tasks are shown only to the person who asks, and tasks are created only when someone approves them. All of it counts against the limit above.
          </p>
          <SummaryToggle on={chatAi.value.on} of="chat" />
        </section>
      ) : null}

      {coworker.ok ? <CoworkerSection page={coworker.value} /> : null}

      {assistant.ok ? (
        <section className="space-y-2" aria-label="Personal assistant">
          <h2 className="text-sm font-semibold">Personal assistant</h2>
          <p className="text-sm text-muted-foreground">
            The AI parts of everyone&apos;s assistant: the one-line summary on My Day, Draft reply, spotting promises, and report write-ups. The rule-built morning plan and lists keep working when this is off. Each person can also turn parts off on their My page. You see what it costs, never what anyone asked.
          </p>
          <SummaryToggle on={assistant.value.ai} of="assistant" />
        </section>
      ) : null}

      <section className="space-y-2" aria-label="By person">
        <h2 className="text-sm font-semibold">By person</h2>
        {u.byPerson.length === 0 ? (
          <EmptyState icon={Sparkles} title="Nobody has asked anything this month" description="Spending shows here once people use the assistant." />
        ) : (
          <ul className="divide-y rounded-lg border bg-card shadow-card">
            {u.byPerson.map((p) => (
              <li key={p.personId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 truncate">{p.personName}</span>
                <span className="tabular shrink-0 text-muted-foreground">
                  {formatCount(p.questions)} · <span className="font-medium text-foreground">{formatRupees(p.costPaise)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConnectedApps everyone />

      {u.recent.length ? (
        <section className="space-y-2" aria-label="Recent questions">
          <h2 className="text-sm font-semibold">Recent questions</h2>
          <p className="text-xs text-muted-foreground">What each question cost. The questions themselves aren&apos;t stored.</p>
          <ul className="divide-y rounded-lg border bg-card shadow-card">
            {u.recent.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {q.personName} <span className="text-muted-foreground">· {AI_FEATURE_LABELS[q.feature]}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {q.model}
                    {q.escalatedFrom ? ` · after ${q.escalatedFrom} didn't answer` : ""}
                  </span>
                </span>
                <Badge tone={OUTCOME[q.outcome].tone}>{OUTCOME[q.outcome].label}</Badge>
                <span className="tabular text-xs text-muted-foreground">
                  {formatCount(q.inputTokens + q.cacheWriteTokens + q.cacheReadTokens)} in · {formatCount(q.outputTokens)} out
                </span>
                <span className="tabular w-16 text-right font-medium">{formatRupees(q.costPaise)}</span>
                <span className="tabular w-full text-xs text-muted-foreground sm:w-auto">{formatDateTime(q.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
