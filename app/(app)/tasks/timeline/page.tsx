// The timeline (Stage 9b.3, a Gantt view): each task a bar from its start (or due day) to its due day, grouped by
// project, with "waits on" links named on the bars. Scrolls sideways inside its box on small screens.
import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight, GanttChart, Link2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { TaskViewSwitch } from "@/components/task-view-switch";
import { Button } from "@/components/ui/button";
import { dayOfWeek } from "@/lib/dates";
import { formatWeekdayDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { TASK_STATUS_LABELS, type TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PlanFilters, planFilterFrom, planHref } from "../plan-filters";

export const metadata: Metadata = { title: "Timeline" };

const BAR: Record<TaskStatus, string> = {
  todo: "bg-neutral-soft text-foreground",
  in_progress: "bg-info-soft text-info",
  in_review: "bg-accent text-accent-foreground",
  blocked: "bg-danger-soft text-danger",
  done: "bg-success-soft text-success",
};
const WEEK_CHOICES = [2, 4, 8, 12];

export default function TimelinePage({ searchParams }: PageProps<"/tasks/timeline">) {
  return (
    <>
      <PageHeader title="Timeline" description="Each task from its start to its due day, by project. Set start dates to see the full span." actions={<TaskViewSwitch current="timeline" />} />
      <Suspense fallback={<LoadingRows rows={8} columns={4} label="Loading the timeline" />}>
        <Timeline searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Timeline({ searchParams }: { searchParams: PageProps<"/tasks/timeline">["searchParams"] }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const filter = planFilterFrom(sp);
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const weeksRaw = Number(typeof sp.weeks === "string" ? sp.weeks : 4);
  const r = await getServices().planning.timeline(actor, from, weeksRaw, filter);
  if (!r.ok) return <ErrorState error={r.error} />;
  const t = r.value;
  const weeks = t.days.length / 7;
  const day = weeks > 4 ? 16 : 32; // px per day: narrower when showing more weeks
  const width = t.days.length * day;
  const todayAt = t.days.indexOf(t.today);
  const titles = new Map(t.rows.flatMap((g) => g.tasks.map((x) => [x.id, x.title] as const)));
  const waits = new Map<string, string[]>();
  for (const l of t.links) waits.set(l.taskId, [...(waits.get(l.taskId) ?? []), titles.get(l.dependsOnId) ?? "another task"]);
  const keep = { from: from ?? "", weeks: String(weeks) };

  return (
    <div className="space-y-4" data-wide>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline" aria-label="Earlier">
          <Link href={planHref("/tasks/timeline", filter, { from: t.prev, weeks: String(weeks) })}>
            <ChevronLeft />
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" aria-label="Later">
          <Link href={planHref("/tasks/timeline", filter, { from: t.next, weeks: String(weeks) })}>
            <ChevronRight />
          </Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href={planHref("/tasks/timeline", filter, { weeks: String(weeks) })}>Today</Link>
        </Button>
        <span className="text-sm text-muted-foreground">
          {formatWeekdayDate(t.days[0]!)} to {formatWeekdayDate(t.days.at(-1)!)}
        </span>
        <nav aria-label="How many weeks" className="ml-auto inline-flex rounded-md border bg-card p-0.5">
          {WEEK_CHOICES.map((w) => (
            <Link key={w} href={planHref("/tasks/timeline", filter, { from: from ?? "", weeks: String(w) })} aria-current={w === weeks ? "true" : undefined} className={cn("rounded px-2 py-0.5 text-sm text-muted-foreground hover:text-foreground", w === weeks && "bg-accent font-medium text-accent-foreground")}>
              {w}w
            </Link>
          ))}
        </nav>
      </div>
      {t.truncated ? <p className="text-sm text-warning">Showing the first 3,000 tasks. Filter by person, client or project to see the rest.</p> : null}
      <PlanFilters actor={actor} filter={filter} path="/tasks/timeline" keep={keep} />

      {t.rows.length === 0 ? (
        <EmptyState icon={GanttChart} title="No tasks in these weeks" description="Tasks need a due date to show here. Try other weeks or fewer filters." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
          <div className="relative w-max min-w-full">
            {/* Header: weeks and days. */}
            <div className="sticky top-0 z-10 flex border-b bg-card text-xs text-muted-foreground">
              <div className="sticky left-0 z-10 w-36 shrink-0 sm:w-52 border-r bg-card px-3 py-1.5">Task</div>
              <div className="flex">
                {t.days.map((d, i) => (
                  <div key={d} style={{ width: day }} className={cn("shrink-0 py-1.5 text-center tabular", dayOfWeek(d) >= 6 && "bg-subtle", d === t.today && "font-semibold text-primary")} title={formatWeekdayDate(d)}>
                    {day >= 32 || i % 7 === 0 ? Number(d.slice(8)) : ""}
                  </div>
                ))}
              </div>
            </div>
            {t.rows.map((g) => (
              <section key={g.projectId}>
                <div className="flex border-b bg-subtle text-xs">
                  <Link href={`/projects/${g.projectId}` as Route} className="sticky left-0 w-36 shrink-0 sm:w-52 truncate px-3 py-1.5 font-medium hover:underline">
                    {g.clientName} · {g.projectName}
                  </Link>
                </div>
                {g.tasks.map((x) => {
                  const after = waits.get(x.id);
                  const label = `${x.title} · ${TASK_STATUS_LABELS[x.status]}${x.ownerName ? ` · ${x.ownerName}` : ""}${after ? ` · waits on ${after.join(", ")}` : ""}`;
                  return (
                    <div key={x.id} className="flex border-b last:border-0 hover:bg-hover/50">
                      <Link href={`/tasks/${x.id}` as Route} className="sticky left-0 z-[1] flex w-36 shrink-0 sm:w-52 items-center gap-1 border-r bg-card px-3 py-1.5 text-sm hover:underline" title={label}>
                        <span className="truncate">{x.title}</span>
                        {after ? <Link2 className="size-3.5 shrink-0 text-muted-foreground" aria-label={`Waits on ${after.join(", ")}`} /> : null}
                      </Link>
                      <div className="relative" style={{ width }}>
                        {todayAt >= 0 ? <div className="absolute inset-y-0 w-px bg-primary/40" style={{ left: todayAt * day + day / 2 }} aria-hidden /> : null}
                        <Link
                          href={`/tasks/${x.id}` as Route}
                          title={label}
                          aria-label={label}
                          className={cn(
                            "absolute top-1.5 bottom-1.5 flex items-center overflow-hidden px-1.5 text-xs whitespace-nowrap hover:brightness-95",
                            BAR[x.status],
                            x.bar.startsBefore ? "rounded-l-none" : "rounded-l-md",
                            x.bar.endsAfter ? "rounded-r-none" : "rounded-r-md",
                            x.overdue && "ring-1 ring-danger",
                          )}
                          style={{ left: x.bar.offset * day + 2, width: Math.max(x.bar.length * day - 4, 8) }}
                        >
                          {x.bar.length * day >= 64 ? x.ownerName ?? "" : ""}
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
