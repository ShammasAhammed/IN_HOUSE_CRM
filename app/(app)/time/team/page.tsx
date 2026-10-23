import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ErrorState, LoadingRows } from "@/components/states";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { addDays, istDate, startOfWeek } from "@/lib/dates";
import { formatShortDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Team time" };

const DAY = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", timeZone: "UTC" });
const short = (minutes: number) => (minutes ? (Math.round((minutes / 60) * 10) / 10).toLocaleString("en-IN") : "0");
const FILL = { empty: "bg-danger-soft text-danger", short: "bg-warning-soft text-warning", ok: "text-foreground-2", upcoming: "text-muted-foreground", off: "text-muted-foreground/60" } as const;

export default function TeamTimePage({ searchParams }: PageProps<"/time/team">) {
  return (
    <Suspense fallback={<LoadingRows rows={10} columns={8} label="Loading the team's time" />}>
      <TeamWeek searchParams={searchParams} />
    </Suspense>
  );
}

async function TeamWeek({ searchParams }: Pick<PageProps<"/time/team">, "searchParams">) {
  const actor = await requireActor();
  const { start } = await searchParams;
  const result = await getServices().time.team(actor, typeof start === "string" ? start : undefined);
  if (!result.ok) return <ErrorState error={result.error} />;
  const { weekStart, days, rows } = result.value;
  const thisWeek = startOfWeek(istDate());
  const behind = rows.filter((r) => r.gaps > 0).length;

  return (
    <div className="space-y-4" data-wide>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button asChild size="icon" variant="ghost" aria-label="Previous week">
            <Link href={`/time/team?start=${addDays(weekStart, -7)}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <h2 className="min-w-44 text-center font-semibold">
            {formatShortDate(weekStart)} – {formatShortDate(addDays(weekStart, 6))}
          </h2>
          <Button asChild size="icon" variant="ghost" aria-label="Next week">
            <Link href={`/time/team?start=${addDays(weekStart, 7)}`}>
              <ChevronRight />
            </Link>
          </Button>
          {weekStart !== thisWeek ? (
            <Button asChild size="sm" variant="ghost">
              <Link href="/time/team">This week</Link>
            </Button>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-warning">{behind}</span> of {rows.length} with gaps
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-subtle">
            <tr className="border-b">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Person</th>
              {days.map((d) => (
                <th key={d.date} className={cn("px-1 py-2 text-center text-xs font-medium text-muted-foreground", !d.working && "text-muted-foreground/60")}>
                  {DAY.format(new Date(`${d.date}T00:00:00Z`))}
                  {d.holiday ? <span className="block text-[11px] text-info">Holiday</span> : null}
                </th>
              ))}
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Week</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.personId} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <Link href={`/time?start=${weekStart}&person=${r.personId}`} className="flex items-center gap-2 font-medium hover:underline">
                    <Avatar name={r.personName} size="sm" /> {r.personName}
                  </Link>
                </td>
                {r.days.map((d) => (
                  <td key={d.date} className="px-1 py-2 text-center">
                    <span className={cn("tabular inline-block min-w-10 rounded-md px-1.5 py-0.5 text-xs", FILL[d.fill])}>{d.expectedMinutes || d.loggedMinutes ? short(d.loggedMinutes) : "–"}</span>
                  </td>
                ))}
                <td className="tabular px-3 py-2 text-right text-xs">
                  <span className="font-semibold">{short(r.loggedMinutes)}</span>
                  <span className="text-muted-foreground"> / {short(r.expectedMinutes)} h</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Hours logged per day. Red: nothing logged on a past working day. Amber: under three quarters of the day.</p>
    </div>
  );
}
