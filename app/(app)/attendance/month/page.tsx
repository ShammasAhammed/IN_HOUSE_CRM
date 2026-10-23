import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarX2, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { addMonths, istTime } from "@/lib/dates";
import { countOf, formatDays, formatMinutes, formatMonth, formatTime, formatWeekdayDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { ATTENDANCE_LOCATION_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { MonthView } from "@/services/attendance";
import type { DayKind } from "@/services/rules/attendance";
import { FixDay } from "./fix-day";

export const metadata: Metadata = { title: "Attendance month" };

/** What a day without a check-in says. "No record" days say it with a badge instead. */
const KIND: Record<Exclude<DayKind, "present">, string> = {
  leave: "On leave",
  holiday: "Holiday",
  off: "Day off",
  absent: "",
  not_in: "Not in",
  today: "Not checked in yet",
  upcoming: "",
  not_employed: "",
};

export default function MonthPage({ searchParams }: PageProps<"/attendance/month">) {
  return (
    <Suspense fallback={<LoadingRows rows={10} columns={4} label="Loading the month" />}>
      <Month searchParams={searchParams} />
    </Suspense>
  );
}

async function Month({ searchParams }: Pick<PageProps<"/attendance/month">, "searchParams">) {
  const actor = await requireActor();
  const { month, person } = await searchParams;
  const result = await getServices().attendance.month(actor, {
    ...(typeof month === "string" ? { month } : {}),
    ...(typeof person === "string" ? { personId: person } : {}),
  });
  if (!result.ok) return <ErrorState error={result.error} />;
  const m = result.value;
  const mine = m.person.id === actor.personId;
  const who = mine ? "" : `&person=${m.person.id}`;
  const first = `${m.month}-01`;
  const c = m.counts;
  const days = m.days.filter((d) => d.kind !== "not_employed");
  const canFix = m.canManage && !(mine && !actor.roles.includes("owner"));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button asChild size="icon" variant="ghost" aria-label="Previous month">
            <Link href={`/attendance/month?month=${addMonths(first, -1).slice(0, 7)}${who}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <h2 className="min-w-40 text-center font-semibold">{formatMonth(m.month)}</h2>
          <Button asChild size="icon" variant="ghost" aria-label="Next month">
            <Link href={`/attendance/month?month=${addMonths(first, 1).slice(0, 7)}${who}`}>
              <ChevronRight />
            </Link>
          </Button>
        </div>
        {mine ? null : <p className="text-sm font-medium">{m.person.fullName}</p>}
      </div>

      {!m.keepsAttendance ? (
        <EmptyState icon={CalendarX2} title="No attendance to show" description={mine ? "You keep your own hours as a freelancer, so there's no check-in." : `${m.person.fullName.split(" ")[0]} keeps their own hours as a freelancer, so there's no check-in.`} />
      ) : days.length === 0 ? (
        <EmptyState icon={CalendarX2} title="Nothing this month" description={mine ? "You weren't with Oppllo yet, or had left." : "They weren't with Oppllo this month."} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Worked so far" value={`${c.present.office + c.present.home + c.present.client_site} of ${countOf(c.workingDays, "day")}`} hint={`${c.present.office} office · ${c.present.home} home · ${c.present.client_site} client site`} />
            <Stat label="Leave" value={formatDays(c.leaveDays)} />
            <Stat label="No record" value={String(c.absent)} tone={c.absent ? "warning" : undefined} hint="Past working days with no check-in or leave" />
            <Stat label="Late · short · not closed" value={`${c.late} · ${c.short} · ${c.open}`} hint="After 9:45 · under 7 hours · no check-out" />
          </dl>

          <ul className="divide-y rounded-lg border bg-card shadow-card">
            {days.map((d) => (
              <DayRow key={d.date} day={d} canFix={canFix} personId={m.person.id} />
            ))}
          </ul>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        {mine
          ? "Late and short days are shown to you first; they start a conversation, they never cut pay or leave. Forgot to check out? Fix it on the Today tab within a week; after that, HR corrects it."
          : "Late and short days start a conversation; they never cut pay or leave. Every correction needs a reason and is kept in the history."}
      </p>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warning" }) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-card">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("tabular mt-0.5 font-semibold", tone === "warning" && "text-warning")}>{value}</dd>
      {hint ? <dd className="mt-0.5 text-xs text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}

function DayRow({ day: d, canFix, personId }: { day: MonthView["days"][number]; canFix: boolean; personId: string }) {
  const worked = d.workedMinutes;
  const quiet = d.kind === "off" || d.kind === "holiday" || d.kind === "upcoming" || d.kind === "not_in";
  return (
    <li className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm", quiet && "text-muted-foreground")}>
      <span className="tabular w-28 shrink-0">{formatWeekdayDate(d.date)}</span>
      <span className="min-w-0 flex-1">
        {d.kind === "present" && d.location && d.checkInAt ? (
          <>
            {ATTENDANCE_LOCATION_LABELS[d.location]} · {formatTime(new Date(d.checkInAt))}
            {d.checkOutAt ? `–${formatTime(new Date(d.checkOutAt))}` : ""}
            {worked !== null ? <span className="text-muted-foreground"> · {formatMinutes(worked)}</span> : null}
            {d.note ? <span className="text-muted-foreground"> · {d.note}</span> : null}
            {d.lat !== null && d.lng !== null ? (
              <a
                href={`https://www.openstreetmap.org/?mlat=${d.lat}&mlon=${d.lng}#map=15/${d.lat}/${d.lng}`}
                target="_blank"
                rel="noreferrer"
                className="ml-1 inline-flex align-middle text-muted-foreground hover:text-foreground"
                title="Rough location at check-in"
                aria-label="Rough location at check-in, on a map"
              >
                <MapPin className="size-3.5" />
              </a>
            ) : null}
          </>
        ) : (
          KIND[d.kind as Exclude<DayKind, "present">]
        )}
        {d.halfLeave ? <span className="text-info"> · ½ day leave</span> : null}
      </span>
      <span className="flex flex-wrap gap-1">
        {d.late ? <Badge tone="warning">Late</Badge> : null}
        {d.short ? <Badge tone="warning">Short</Badge> : null}
        {d.open ? <Badge tone="neutral">No check-out</Badge> : null}
        {d.kind === "absent" ? <Badge tone="danger">No record</Badge> : null}
        {d.corrected ? <Badge tone="info">Corrected</Badge> : null}
      </span>
      {canFix && d.kind !== "upcoming" ? (
        <FixDay
          personId={personId}
          workDate={d.date}
          dayLabel={formatWeekdayDate(d.date)}
          current={
            d.kind === "present" && d.location && d.checkInAt
              ? { location: d.location, inTime: istTime(new Date(d.checkInAt)), outTime: d.checkOutAt ? istTime(new Date(d.checkOutAt)) : "", note: d.note ?? "" }
              : null
          }
        />
      ) : null}
    </li>
  );
}
