import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { addDays, istDate, startOfWeek } from "@/lib/dates";
import { formatShortDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { TimeGrid } from "./time-grid";

export const metadata: Metadata = { title: "Time" };

export default function TimePage({ searchParams }: PageProps<"/time">) {
  return (
    <Suspense fallback={<LoadingRows rows={6} columns={8} label="Loading your week" />}>
      <MyWeek searchParams={searchParams} />
    </Suspense>
  );
}

async function MyWeek({ searchParams }: Pick<PageProps<"/time">, "searchParams">) {
  const actor = await requireActor();
  const { start, person } = await searchParams;
  const result = await getServices().time.week(actor, {
    ...(typeof start === "string" ? { start } : {}),
    ...(typeof person === "string" ? { personId: person } : {}),
  });
  if (!result.ok) return <ErrorState error={result.error} />;
  const week = result.value;
  const today = istDate();
  const thisWeek = startOfWeek(today);
  const who = week.mine ? "" : `&person=${week.person.id}`;
  const gaps = week.days.filter((d) => d.fill === "empty" || d.fill === "short").length;

  return (
    <div className="space-y-4" data-wide>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button asChild size="icon" variant="ghost" aria-label="Previous week">
            <Link href={`/time?start=${addDays(week.weekStart, -7)}${who}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <h2 className="min-w-44 text-center font-semibold">
            {formatShortDate(week.weekStart)} – {formatShortDate(addDays(week.weekStart, 6))}
          </h2>
          <Button asChild size="icon" variant="ghost" aria-label="Next week">
            <Link href={`/time?start=${addDays(week.weekStart, 7)}${who}`}>
              <ChevronRight />
            </Link>
          </Button>
          {week.weekStart !== thisWeek ? (
            <Button asChild size="sm" variant="ghost">
              <Link href={`/time?start=${thisWeek}${who}`}>This week</Link>
            </Button>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {week.mine ? "" : <span className="font-medium text-foreground">{week.person.name} · </span>}
          {gaps ? (
            <>
              <span className="font-medium text-warning">{gaps}</span> {gaps === 1 ? "day" : "days"} with a gap
            </>
          ) : (
            "No gaps"
          )}
        </p>
      </div>
      <TimeGrid week={week} lockNote={week.mine && week.days.some((d) => !d.editable && d.date <= today && d.expectedMinutes > 0)} />
      <p className="text-xs text-muted-foreground">
        Expected = your weekly project hours spread over the working days, less holidays and leave. A past day is marked when nothing is logged, or under
        three quarters of it.
      </p>
    </div>
  );
}
