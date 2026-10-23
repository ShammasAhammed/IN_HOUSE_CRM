import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GoalRow } from "@/components/goal-row";
import { HealthBadge } from "@/components/health-badge";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime, formatShortDate, shortNames } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { LEAD_STAGE_LABELS, LEAD_STAGES } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" description="What needs you today: late work, budgets running hot, who's away, who's stretched." />
      <Suspense fallback={<LoadingRows rows={8} columns={3} label="Loading the dashboard" />}>
        <Dashboard />
      </Suspense>
    </>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;
const span = (a: string, b: string) => (a === b ? formatShortDate(a) : `${formatShortDate(a)} – ${formatShortDate(b)}`);

/** Stage 14.3: the company goals running now, at a glance. */
async function CompanyGoals() {
  const actor = await requireActor();
  const d = await getServices().goals.dashboard(actor, "now");
  if (!d.company.length) return <Empty>No company goals running now. Set them on Goals.</Empty>;
  return (
    <ul className="space-y-4">
      {d.company.slice(0, 6).map((g) => (
        <li key={g.id}>
          <GoalRow g={g} compact />
        </li>
      ))}
    </ul>
  );
}

async function Dashboard() {
  const actor = await requireActor();
  const r = await getServices().dashboard.owner(actor);
  if (!r.ok) return <ErrorState error={r.error} />;
  const d = r.value;
  // Only retainers using hours faster than the month is passing (test report L17: a 0% one isn't "hot").
  const hot = d.burn.filter((b) => b.usedPercent > b.monthPercent);
  const stats = [
    { label: "Active clients", value: d.counts.activeClients, href: "/clients" },
    { label: "Overdue tasks", value: d.counts.overdueTasks, href: "/tasks?due=overdue", warn: d.counts.overdueTasks > 0 },
    { label: "Creatives to review", value: d.counts.creativesInReview, href: "/creatives?state=internal_review", warn: d.counts.creativesInReview > 0 },
    { label: "Creatives with clients", value: d.counts.withClients, href: "/creatives?state=client_review" },
  ] as const;
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-lg border bg-card p-3 shadow-card hover:bg-subtle">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className={cn("tabular mt-0.5 text-xl font-semibold", "warn" in s && s.warn && "text-warning")}>{s.value}</dd>
          </Link>
        ))}
      </dl>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Company goals</CardTitle>
            <Link href="/goals" className="text-xs text-primary hover:underline">
              All goals
            </Link>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Empty>Checking goals…</Empty>}>
              <CompanyGoals />
            </Suspense>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clients at risk</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Empty>Checking results…</Empty>}>
              <AtRisk />
            </Suspense>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Budgets running hot</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Under the title, not beside it, so it fits a 390 px phone (QA S9-18). */}
            <p className="mb-3 text-xs text-muted-foreground">Hours used vs. days of the month gone</p>
            {hot.length === 0 ? (
              <Empty>{d.burn.length ? "No retainer is using hours faster than the month is going." : "No active retainers this month."}</Empty>
            ) : (
              <ul className="space-y-3">
                {hot.map((b) => (
                  <li key={b.engagementId}>
                    <Link href={`/engagements/${b.engagementId}`} className="block space-y-1 hover:opacity-80">
                      <span className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">
                          <span className="font-medium">{b.clientName}</span> <span className="text-muted-foreground">· {b.name}</span>
                        </span>
                        <span className={cn("tabular shrink-0", b.usedPercent >= 100 ? "text-danger" : b.usedPercent > b.monthPercent + 10 ? "text-warning" : "text-muted-foreground")}>
                          {b.usedPercent}% / {b.monthPercent}%
                        </span>
                      </span>
                      <span className="relative block h-1.5 overflow-hidden rounded-full bg-subtle">
                        <span className={cn("absolute inset-y-0 left-0 rounded-full", b.usedPercent >= 100 ? "bg-danger" : b.usedPercent > b.monthPercent + 10 ? "bg-warning" : "bg-primary")} style={{ width: `${Math.min(100, b.usedPercent)}%` }} />
                        <span className="absolute inset-y-0 w-0.5 bg-foreground/40" style={{ left: `${Math.min(100, b.monthPercent)}%` }} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Late projects</CardTitle>
          </CardHeader>
          <CardContent>
            {d.lateProjects.length === 0 ? (
              <Empty>Nothing late.</Empty>
            ) : (
              <ul className="divide-y">
                {d.lateProjects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`} className="flex items-center gap-2 py-2 text-sm hover:opacity-80">
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{p.clientName}</span> <span className="text-muted-foreground">· {p.name}</span>
                      </span>
                      {p.overdueTasks ? <Badge tone="warning">{p.overdueTasks} overdue</Badge> : null}
                      {p.dueDate && p.dueDate < d.today ? <Badge tone="danger">Due {formatShortDate(p.dueDate)}</Badge> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>This week&apos;s load</CardTitle>
            <Link href="/week" className="text-xs text-primary hover:underline">
              Week
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {d.capacity.over.length === 0 ? <Empty>Nobody is over capacity.</Empty> : null}
            {d.capacity.over.map((p) => (
              <p key={p.personId} className="flex justify-between text-sm">
                <span>{p.personName}</span>
                <span className="tabular text-danger">{p.loadPercent ?? "—"}%</span>
              </p>
            ))}
            {d.capacity.light.length ? <p className="text-xs text-muted-foreground">Room this week: {shortNames(d.capacity.light.map((p) => p.personName)).join(", ")}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Away this week</CardTitle>
          </CardHeader>
          <CardContent>
            {d.away.length === 0 ? (
              <Empty>Everyone&apos;s in.</Empty>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {d.away.map((a, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>{a.personName}</span>
                    <span className="text-muted-foreground">
                      {span(a.startDate, a.endDate)}
                      {a.halfDay ? " · ½" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Renewals in 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            {d.renewals.length === 0 ? (
              <Empty>None coming up.</Empty>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {d.renewals.map((e) => (
                  <li key={e.engagementId}>
                    <Link href={`/engagements/${e.engagementId}`} className="flex justify-between gap-2 hover:opacity-80">
                      <span className="truncate">
                        {e.clientName} · {e.name}
                      </span>
                      <span className="shrink-0 text-muted-foreground">{formatDate(e.renewalDate)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sales</CardTitle>
            <Link href="/sales/pipeline" className="text-xs text-primary hover:underline">
              Pipeline
            </Link>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Empty>Counting leads…</Empty>}>
              <Sales />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Clients whose results are behind target or whose retainer hours are over budget (Stage 11.1). */
async function AtRisk() {
  const actor = await requireActor();
  const r = await getServices().results.atRisk(actor);
  if (!r.ok) return <ErrorState error={r.error} />;
  if (r.value.length === 0) return <Empty>Every client with a target is on track.</Empty>;
  return (
    <ul className="divide-y">
      {r.value.map((c) => (
        <li key={c.clientId} className="py-2.5 first:pt-0 last:pb-0">
          <div className="flex items-center gap-2">
            <Link href={`/clients/${c.clientId}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
              {c.clientName}
            </Link>
            <HealthBadge level={c.health.level} />
          </div>
          <p className="text-xs text-muted-foreground">{c.health.reasons.join(" · ")}</p>
        </li>
      ))}
    </ul>
  );
}

/** Leads per stage, read from the same place as the Sales screens so the two never disagree (M9). */
async function Sales() {
  const actor = await requireActor();
  const r = await getServices().leads.stageCounts(actor);
  if (!r.ok) return <Empty>Only the sales team and the owner see the pipeline.</Empty>;
  const { byStage, asOf } = r.value;
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-3 gap-3">
        {LEAD_STAGES.map((k) => (
          <Link key={k} href={`/sales/leads?stage=${k}`} className="-m-1 rounded-md p-1 hover:bg-subtle">
            <dt className="text-xs text-muted-foreground">{LEAD_STAGE_LABELS[k]}</dt>
            <dd className={cn("tabular text-lg font-semibold", k === "won" && "text-success")}>{byStage[k] ?? 0}</dd>
          </Link>
        ))}
      </dl>
      {asOf ? <p className="text-xs text-muted-foreground">As of the last copy from the CRM, {formatDateTime(asOf)}.</p> : null}
    </div>
  );
}
