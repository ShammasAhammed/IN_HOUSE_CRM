// The morning plan on My Day (Stage 12.4): built by rules from what the person may see, fast; the AI's one or two
// sentences stream in on their own, so they never hold up the page.
import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, Handshake, Inbox, Sparkles, Sun, Umbrella } from "lucide-react";
import { formatShortDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import type { Actor } from "@/services/permissions";
import type { MorningPlan } from "@/services/my-assistant";

async function Summary({ actor, plan }: { actor: Actor; plan: MorningPlan }) {
  const text = await getServices().myAssistant.planSummary(actor, plan);
  return text ? (
    <p className="flex items-start gap-2 text-sm">
      <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>{text}</span>
    </p>
  ) : null;
}

function Row({ icon: Icon, title, children }: { icon: typeof Sun; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}

export function MorningPlanCard({ actor, plan }: { actor: Actor; plan: MorningPlan }) {
  const empty = !plan.doFirst.length && !plan.overdueCount && !plan.waiting.length && !plan.headsUp.length && !plan.promises.length;
  return (
    <section aria-label="Your plan for today" className="space-y-3 rounded-lg border bg-card p-4 shadow-card">
      <Suspense fallback={null}>
        <Summary actor={actor} plan={plan} />
      </Suspense>
      {empty ? <p className="text-sm text-muted-foreground">Nothing due, late or waiting on you. A good day to get ahead.</p> : null}
      {plan.doFirst.length ? (
        <Row icon={Sun} title="Do first">
          <ul className="space-y-0.5">
            {plan.doFirst.slice(0, 3).map((t) => (
              <li key={t.id} className="truncate">
                <Link href={`/tasks/${t.id}` as Route} className="font-medium hover:underline">
                  {t.title}
                </Link>{" "}
                <span className="text-xs text-muted-foreground">
                  {t.clientName}
                  {t.priority === "urgent" || t.priority === "high" ? ` · ${t.priority}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Row>
      ) : null}
      {plan.overdueCount ? (
        <Row icon={AlertTriangle} title="Late">
          <span className="text-danger">{plan.overdueCount === 1 ? "1 task is" : `${plan.overdueCount} tasks are`} past due</span>
          {plan.overdue[0] ? (
            <span className="text-muted-foreground">
              , oldest{" "}
              <Link href={`/tasks/${plan.overdue[0].id}` as Route} className="hover:underline">
                {plan.overdue[0].title}
              </Link>
            </span>
          ) : null}
        </Row>
      ) : null}
      {plan.waiting.length ? (
        <Row icon={Inbox} title="Waiting for you">
          <span className="flex flex-wrap gap-1.5">
            {plan.waiting.map((w) => (
              <Link key={w.key} href={w.href as Route} className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning hover:brightness-95">
                {w.count} {w.label}
              </Link>
            ))}
          </span>
        </Row>
      ) : null}
      {plan.headsUp.length ? (
        <Row icon={Umbrella} title="Heads-up">
          <ul className="space-y-0.5">
            {plan.headsUp.map((h) => (
              <li key={h.personName}>
                {h.personName} is away until {formatShortDate(h.until)}, with{" "}
                {h.tasks.map((t, i) => (
                  <span key={t.id}>
                    {i ? ", " : ""}
                    <Link href={`/tasks/${t.id}` as Route} className="hover:underline">
                      {t.title}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      ({t.clientName}
                      {t.dueDate ? `, due ${formatShortDate(t.dueDate)}` : ""})
                    </span>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </Row>
      ) : null}
      {plan.promises.length ? (
        <Row icon={Handshake} title="You said you would">
          <ul className="space-y-0.5">
            {plan.promises.slice(0, 3).map((p) => (
              <li key={p.id} className="truncate">
                <Link href={"/me#promises" as Route} className="hover:underline">
                  &ldquo;{p.excerpt}&rdquo;
                </Link>{" "}
                <span className={p.dueOn && p.dueOn < plan.today ? "text-xs text-danger" : "text-xs text-muted-foreground"}>{p.dueOn ? `due ${formatShortDate(p.dueOn)}` : ""}</span>
              </li>
            ))}
          </ul>
        </Row>
      ) : null}
    </section>
  );
}

/** Mondays, for the owner (12.5): one line per client from the AI co-worker's digest. Hours are in it: owners only. */
export async function ClientDigest({ actor }: { actor: Actor }) {
  const lines = await getServices().coworker.digest(actor);
  if (!lines?.length) return null;
  return (
    <section aria-label="Client health this week" className="space-y-2 rounded-lg border bg-card p-4 shadow-card">
      <h2 className="text-sm font-semibold">Client health this week</h2>
      <ul className="space-y-1 text-sm">
        {lines.map((l) => (
          <li key={l.clientId}>
            <span aria-hidden>{l.light}</span>{" "}
            <Link href={`/clients/${l.clientId}` as Route} className="font-medium hover:underline">
              {l.clientName}
            </Link>
            <span className="block pl-6 text-xs text-muted-foreground">{l.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
