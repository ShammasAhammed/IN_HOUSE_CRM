import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Users } from "lucide-react";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Avatar } from "@/components/ui/avatar";
import { formatTime } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import type { PresenceRow, PresenceStatus } from "@/services/attendance";
import { CheckInCard } from "./check-in-card";

export const metadata: Metadata = { title: "Attendance" };

export default function AttendancePage() {
  return (
    <Suspense fallback={<LoadingRows rows={6} columns={2} label="Loading today" />}>
      <Today />
    </Suspense>
  );
}

const GROUPS: Array<{ title: string; match: (r: PresenceRow) => boolean }> = [
  { title: "In the office", match: (r) => r.status === "in" && r.location === "office" },
  { title: "Working from home", match: (r) => r.status === "in" && r.location === "home" },
  { title: "At a client site", match: (r) => r.status === "in" && r.location === "client_site" },
  { title: "On leave", match: (r) => r.status === "leave" },
  { title: "Not in yet", match: (r) => r.status === "not_in" },
  { title: "Gone for the day", match: (r) => r.status === "left" },
  { title: "Day off", match: (r) => r.status === "off" },
];
const STATUS_HINT: Partial<Record<PresenceStatus, string>> = { in: "since", left: "left" };

async function Today() {
  const actor = await requireActor();
  const result = await getServices().attendance.today(actor);
  if (!result.ok) return <ErrorState error={result.error} />;
  const t = result.value;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="space-y-3">
        {t.keepsAttendance ? <CheckInCard me={t.me} /> : <p className="text-sm text-muted-foreground">Freelancers keep their own hours, so there&apos;s nothing to check in.</p>}
        {t.holiday ? <p className="text-sm text-muted-foreground">Today is {t.holiday}.</p> : !t.working ? <p className="text-sm text-muted-foreground">Today isn&apos;t a working day.</p> : null}
        <p className="text-xs text-muted-foreground">
          <Link href="/attendance/month" className="underline-offset-2 hover:underline">
            Your month
          </Link>{" "}
          shows every day, with late or short days marked for you first.
        </p>
      </div>
      <section className="space-y-4 rounded-lg border bg-card p-4 shadow-card" aria-label="Who is where">
        <h2 className="text-sm font-semibold">Who is where</h2>
        {t.board.length === 0 ? <EmptyState icon={Users} title="Nobody checks in yet" description="Everyone except freelancers shows here once they're added under People." className="py-8" /> : null}
        {GROUPS.map((g) => {
          const rows = t.board.filter(g.match);
          if (rows.length === 0) return null;
          return (
            <div key={g.title} className="space-y-1.5">
              <h3 className="text-xs font-medium text-muted-foreground">
                {g.title} <span className="tabular">· {rows.length}</span>
              </h3>
              <ul className="flex flex-wrap gap-2">
                {rows.map((r) => (
                  <li key={r.personId} className="flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm">
                    <Avatar name={r.fullName} size="sm" />
                    <span>{r.fullName}</span>
                    {r.status === "in" && r.since ? <span className="tabular text-xs text-muted-foreground">{STATUS_HINT.in} {formatTime(r.since)}</span> : null}
                    {r.status === "left" && r.until ? <span className="tabular text-xs text-muted-foreground">{STATUS_HINT.left} {formatTime(r.until)}</span> : null}
                    {r.halfLeave ? <span className="text-xs text-info">½ day leave</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}
