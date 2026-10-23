import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { addDays, dayOfWeek, istDate, startOfWeek } from "@/lib/dates";
import { formatHours, formatShortDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { cn } from "@/lib/utils";
import type { WeekRow, WeekView } from "@/services/capacity";

export const metadata: Metadata = { title: "Week" };

export default function WeekPage({ searchParams }: PageProps<"/week">) {
  return (
    <>
      <PageHeader title="Week" description="Assigned hours against each person's real capacity this week. Red is over, pale has room." />
      <Suspense fallback={<LoadingRows rows={10} columns={7} label="Loading the week" />}>
        <Week searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const h = (minutes: number) => (minutes === 0 ? "–" : (Math.round((minutes / 60) * 10) / 10).toLocaleString("en-IN"));

async function Week({ searchParams }: { searchParams: PageProps<"/week">["searchParams"] }) {
  const actor = await requireActor();
  const { start } = await searchParams;
  const result = await getServices().capacity.week(actor, typeof start === "string" ? start : undefined);
  if (!result.ok) return <ErrorState error={result.error} />;
  const week = result.value;
  const thisWeek = startOfWeek(istDate());
  const over = week.rows.filter((r) => r.level === "over").length;
  const light = week.rows.filter((r) => r.level === "light" && r.capacityMinutes > 0).length;

  return (
    <div className="space-y-4" data-wide>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button asChild size="icon" variant="ghost" aria-label="Previous week">
            <Link href={`/week?start=${addDays(week.weekStart, -7)}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <h2 className="min-w-44 text-center font-semibold">
            {formatShortDate(week.weekStart)} – {formatShortDate(addDays(week.weekStart, 6))}
          </h2>
          <Button asChild size="icon" variant="ghost" aria-label="Next week">
            <Link href={`/week?start=${addDays(week.weekStart, 7)}`}>
              <ChevronRight />
            </Link>
          </Button>
          {week.weekStart !== thisWeek ? (
            <Button asChild size="sm" variant="ghost">
              <Link href="/week">This week</Link>
            </Button>
          ) : null}
        </div>
        {week.everyone ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-danger">{over}</span> over for the week · <span className="font-medium text-foreground">{light}</span> with room
            <span className="hidden sm:inline"> (a red day can sit inside a week that&apos;s fine overall)</span>
          </p>
        ) : null}
      </div>
      <Grid week={week} today={istDate()} />
      <p className="text-xs text-muted-foreground">
        Hours = task estimates spread from start to due date (1h when there&apos;s no estimate); overdue open work counts today. Capacity = weekly project
        hours, minus holidays and approved leave.
      </p>
    </div>
  );
}

function Grid({ week, today }: { week: WeekView; today: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-subtle text-xs text-muted-foreground">
            <th className="sticky left-0 z-10 min-w-52 bg-subtle px-3 py-2 text-left font-medium">Person</th>
            {week.days.map((d) => (
              <th key={d.date} className={cn("min-w-20 px-2 py-2 text-center font-medium", !d.working && "bg-hover", d.date === today && "text-primary")} title={d.holiday ?? undefined}>
                <div>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dayOfWeek(d.date)]}</div>
                <div className="tabular text-[11px] font-normal">{d.holiday ? d.holiday : formatShortDate(d.date)}</div>
              </th>
            ))}
            <th className="min-w-36 px-3 py-2 text-right font-medium">Week</th>
          </tr>
        </thead>
        <tbody>
          {week.rows.map((row) => (
            <Row key={row.personId} row={row} week={week} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ row, week }: { row: WeekRow; week: WeekView }) {
  return (
    <tr className="border-b last:border-0">
      <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-normal">
        <Link href={`/board?owner=${row.personId}`} className="flex items-center gap-2 hover:underline">
          <Avatar name={row.personName} size="sm" />
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-medium">{row.personName}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {/* Tasks in this week's window only, so it isn't mistaken for everything they own (QA S9-04). */}
              {row.departmentName ? `${row.departmentName} · ` : ""}
              {row.openTasks} open this week
            </span>
          </span>
        </Link>
      </th>
      {row.days.map((d) => {
        const day = week.days.find((x) => x.date === d.date)!;
        const away = row.leave[d.date];
        // No capacity that day (before they joined, or a day off): the hours show, but not as "over" (QA S9-12),
        // matching the week summary, which judges the whole week.
        const noCapacity = d.capacityMinutes === 0;
        const over = !noCapacity && d.assignedMinutes > d.capacityMinutes;
        return (
          <td key={d.date} className={cn("px-1 py-1 text-center", !day.working && "bg-hover")}>
            {away === 1 ? (
              <span className="inline-block rounded bg-accent px-1.5 py-0.5 text-[11px] text-accent-foreground">Leave</span>
            ) : day.working || d.assignedMinutes ? (
              <div
                title={noCapacity ? `${formatHours(d.assignedMinutes)} assigned on a day with no capacity` : `${formatHours(d.assignedMinutes)} assigned of ${formatHours(d.capacityMinutes)}${away ? " (half day off)" : ""}`}
                className={cn(
                  "tabular mx-auto rounded px-1 py-1 text-xs",
                  over ? "bg-danger-soft font-medium text-danger" : d.assignedMinutes === 0 || noCapacity ? "text-muted-foreground" : d.assignedMinutes < d.capacityMinutes / 2 ? "bg-subtle text-foreground-2" : "bg-success-soft text-success",
                )}
              >
                {h(d.assignedMinutes)}
                <span className="text-[10px] opacity-60">/{h(d.capacityMinutes)}</span>
              </div>
            ) : null}
          </td>
        );
      })}
      <td className="px-3 py-1.5 text-right">
        <div className="flex items-center justify-end gap-2">
          <span className="tabular text-xs text-muted-foreground" title="Hours logged this week">
            {formatHours(row.loggedMinutes)} logged ·
          </span>
          <span
            className={cn(
              "tabular rounded-full px-2 py-0.5 text-xs font-medium",
              row.level === "over" ? "bg-danger-soft text-danger" : row.level === "light" ? "bg-neutral-soft text-muted-foreground" : "bg-success-soft text-success",
            )}
            title={`${formatHours(row.assignedMinutes)} assigned of ${formatHours(row.capacityMinutes)}`}
          >
            {row.loadPercent === null ? (row.assignedMinutes ? "No capacity" : "—") : `${row.loadPercent}% load`}
          </span>
        </div>
      </td>
    </tr>
  );
}
