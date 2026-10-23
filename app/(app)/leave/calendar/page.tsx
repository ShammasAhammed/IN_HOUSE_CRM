import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ErrorState, LoadingRows } from "@/components/states";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { addMonths, dayOfWeek, istDate } from "@/lib/dates";
import { formatWeekdayDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { cn } from "@/lib/utils";
import type { CalendarMonth } from "@/services/leave";

export const metadata: Metadata = { title: "Team calendar" };

const monthName = (month: string) =>
  new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

export default function CalendarPage({ searchParams }: PageProps<"/leave/calendar">) {
  return (
    <Suspense fallback={<LoadingRows rows={10} columns={6} label="Loading the calendar" />}>
      <Calendar searchParams={searchParams} />
    </Suspense>
  );
}

async function Calendar({ searchParams }: { searchParams: PageProps<"/leave/calendar">["searchParams"] }) {
  const actor = await requireActor();
  const { month: raw } = await searchParams;
  const today = istDate();
  const month = typeof raw === "string" && /^\d{4}-\d{2}$/.test(raw) ? raw : today.slice(0, 7);
  const result = await getServices().leave.teamCalendar(actor, month);
  if (!result.ok) return <ErrorState error={result.error} />;
  const cal = result.value;
  const prev = addMonths(`${month}-01`, -1).slice(0, 7);
  const next = addMonths(`${month}-01`, 1).slice(0, 7);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button asChild size="icon" variant="ghost" aria-label="Previous month">
            <Link href={`/leave/calendar?month=${prev}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <h2 className="min-w-36 text-center font-semibold">{monthName(month)}</h2>
          <Button asChild size="icon" variant="ghost" aria-label="Next month">
            <Link href={`/leave/calendar?month=${next}`}>
              <ChevronRight />
            </Link>
          </Button>
          {month !== today.slice(0, 7) ? (
            <Button asChild size="sm" variant="ghost">
              <Link href="/leave/calendar">Today</Link>
            </Button>
          ) : null}
        </div>
        <Legend />
      </div>
      <Grid cal={cal} today={today} />
      <ByDay cal={cal} today={today} />
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-sm bg-primary" /> Away
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-sm border border-dashed border-warning bg-warning-soft" /> Asked
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-sm bg-[linear-gradient(135deg,var(--primary)_50%,transparent_50%)] ring-1 ring-primary/30" /> Half day
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-sm bg-hover" /> Off / holiday
      </span>
    </div>
  );
}

/** Desktop: people down the side, days across. */
function Grid({ cal, today }: { cal: CalendarMonth; today: string }) {
  const working = new Set(cal.workingDays);
  const holidays = new Map(cal.holidays.map((h) => [h.date, h.name]));
  return (
    <div className="hidden overflow-x-auto rounded-lg border bg-card shadow-card md:block">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b bg-subtle">
            <th className="sticky left-0 z-10 min-w-44 bg-subtle px-3 py-2 text-left font-medium text-muted-foreground">Person</th>
            {cal.days.map((d) => (
              <th
                key={d}
                title={holidays.get(d)}
                className={cn("w-7 min-w-7 py-1.5 text-center font-medium text-muted-foreground", !working.has(d) && "bg-hover", d === today && "text-primary")}
              >
                <div className="text-[10px] leading-3">{"SMTWTFS"[dayOfWeek(d)]}</div>
                <div className={cn("tabular", d === today && "mx-auto flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground")}>
                  {Number(d.slice(8))}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cal.rows.map((row) => (
            <tr key={row.personId} className="border-b last:border-0">
              <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-1.5 text-left font-normal">
                <div className="flex items-center gap-2">
                  <Avatar name={row.personName} size="sm" />
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-sm font-medium">{row.personName}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{row.departmentName}</p>
                  </div>
                </div>
              </th>
              {cal.days.map((d) => {
                const entry = working.has(d) ? row.days[d] : undefined;
                const label = entry ? `${row.personName}: ${entry.status === "pending" ? "asked for" : "away"}${entry.typeName ? ` (${entry.typeName})` : ""}` : undefined;
                return (
                  <td key={d} className={cn("p-0.5", !working.has(d) && "bg-hover")}>
                    {entry ? (
                      <div
                        title={label}
                        aria-label={label}
                        className={cn(
                          "mx-auto h-6 w-full rounded-sm",
                          entry.status === "pending" ? "border border-dashed border-warning bg-warning-soft" : "bg-primary",
                          entry.halfDay && entry.status !== "pending" && "bg-[linear-gradient(135deg,var(--primary)_50%,var(--accent)_50%)]",
                        )}
                      />
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Phone: a list of days that have someone away. */
function ByDay({ cal, today }: { cal: CalendarMonth; today: string }) {
  const holidays = new Map(cal.holidays.map((h) => [h.date, h.name]));
  const days = cal.days
    .map((d) => ({
      date: d,
      holiday: holidays.get(d),
      away: cal.rows.flatMap((r) => (r.days[d] && cal.workingDays.includes(d) ? [{ name: r.personName, ...r.days[d]! }] : [])),
    }))
    .filter((d) => d.holiday || d.away.length);
  return (
    <div className="space-y-2 md:hidden">
      {days.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Nobody is away this month.</p> : null}
      {days.map((d) => (
        <div key={d.date} className={cn("rounded-lg border bg-card p-3 shadow-card", d.date === today && "border-primary/40")}>
          <p className="text-sm font-medium">
            {formatWeekdayDate(d.date)}
            {d.holiday ? <span className="ml-2 text-xs font-normal text-muted-foreground">Holiday · {d.holiday}</span> : null}
          </p>
          {d.away.length ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {d.away.map((a) => (
                <li key={a.name} className={cn("flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 text-xs", a.status === "pending" ? "bg-warning-soft text-warning" : "bg-accent text-accent-foreground")}>
                  <Avatar name={a.name} size="sm" className="size-5" />
                  {a.name}
                  {a.halfDay ? " · half" : ""}
                  {a.status === "pending" ? " · asked" : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}
