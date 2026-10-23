// The calendar (Stage 9b.3): a month of tasks on their due days. A grid on wide screens, a list of days on phones.
import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { Suspense } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { PriorityMark } from "@/components/task-bits";
import { TaskViewSwitch } from "@/components/task-view-switch";
import { Button } from "@/components/ui/button";
import { formatMonth, formatWeekdayDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { cn } from "@/lib/utils";
import type { TaskView } from "@/services/tasks";
import { PlanFilters, planFilterFrom, planHref } from "../plan-filters";

export const metadata: Metadata = { title: "Calendar" };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHOWN = 4;

export default function CalendarPage({ searchParams }: PageProps<"/tasks/calendar">) {
  return (
    <>
      <PageHeader title="Calendar" description="Tasks on the day they're due." actions={<TaskViewSwitch current="calendar" />} />
      <Suspense fallback={<LoadingRows rows={6} columns={7} label="Loading the calendar" />}>
        <Calendar searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function Chip({ t }: { t: TaskView }) {
  return (
    <Link
      href={`/tasks/${t.id}` as Route}
      title={`${t.title} · ${t.clientName}${t.ownerName ? ` · ${t.ownerName}` : ""}`}
      className={cn(
        "flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-xs hover:bg-hover",
        t.status === "done" ? "text-muted-foreground line-through" : t.overdue ? "bg-danger-soft text-danger" : "bg-subtle",
      )}
    >
      <PriorityMark priority={t.priority} />
      <span className="truncate">{t.title}</span>
    </Link>
  );
}

async function Calendar({ searchParams }: { searchParams: PageProps<"/tasks/calendar">["searchParams"] }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const filter = planFilterFrom(sp);
  const month = typeof sp.month === "string" ? sp.month : undefined;
  const r = await getServices().planning.calendar(actor, month, filter);
  if (!r.ok) return <ErrorState error={r.error} />;
  const { days, byDay, today } = r.value;
  const ym = r.value.month.slice(0, 7);
  const inMonth = (d: string) => d.slice(0, 7) === ym;
  const total = Object.values(byDay).reduce((n, ts) => n + ts.length, 0);
  return (
    <div className="space-y-4" data-wide>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline" aria-label="Previous month">
          <Link href={planHref("/tasks/calendar", filter, { month: r.value.prev.slice(0, 7) })}>
            <ChevronLeft />
          </Link>
        </Button>
        <h2 className="min-w-36 text-center text-sm font-semibold">{formatMonth(ym)}</h2>
        <Button asChild size="sm" variant="outline" aria-label="Next month">
          <Link href={planHref("/tasks/calendar", filter, { month: r.value.next.slice(0, 7) })}>
            <ChevronRight />
          </Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href={planHref("/tasks/calendar", filter, {})}>Today</Link>
        </Button>
      </div>
      {r.value.truncated ? <p className="text-sm text-warning">Showing the first 3,000 tasks. Filter by person, client or project to see the rest.</p> : null}
      <PlanFilters actor={actor} filter={filter} path="/tasks/calendar" keep={{ month: month ?? "" }} />

      {/* Wide screens: the month grid. */}
      <div className="hidden overflow-hidden rounded-lg border bg-card shadow-card md:block">
        <div className="grid grid-cols-7 border-b text-xs text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-1.5">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const ts = byDay[d] ?? [];
            return (
              <div key={d} className={cn("min-h-28 min-w-0 space-y-1 border-b p-1.5", i % 7 !== 6 && "border-r", !inMonth(d) && "bg-subtle/60")}>
                <p className={cn("tabular px-1 text-xs", d === today ? "inline-block rounded bg-primary px-1.5 font-medium text-primary-foreground" : inMonth(d) ? "text-foreground" : "text-muted-foreground")}>{Number(d.slice(8))}</p>
                {ts.slice(0, SHOWN).map((t) => (
                  <Chip key={t.id} t={t} />
                ))}
                {ts.length > SHOWN ? (
                  <details className="text-xs">
                    <summary className="cursor-pointer px-1.5 text-muted-foreground hover:text-foreground">{ts.length - SHOWN} more</summary>
                    <div className="mt-1 space-y-1">
                      {ts.slice(SHOWN).map((t) => (
                        <Chip key={t.id} t={t} />
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Phones: the days that have tasks. */}
      <div className="space-y-3 md:hidden">
        {total === 0 ? <EmptyState icon={CalendarDays} title="Nothing due this month" description="Try another month or fewer filters." /> : null}
        {days
          .filter((d) => inMonth(d) && byDay[d]?.length)
          .map((d) => (
            <section key={d} className="rounded-lg border bg-card shadow-card">
              <h3 className={cn("border-b px-3 py-2 text-xs font-medium", d === today ? "text-primary" : "text-muted-foreground")}>
                {d === today ? "Today · " : ""}
                {formatWeekdayDate(d)}
              </h3>
              <ul className="space-y-1 p-2">
                {byDay[d]!.map((t) => (
                  <li key={t.id}>
                    <Chip t={t} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
      {total === 0 ? <p className="hidden text-sm text-muted-foreground md:block">Nothing due this month with these filters.</p> : null}
    </div>
  );
}
