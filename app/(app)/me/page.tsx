// Self-service (HR slice 1): everything about me in one place — profile, leave, holidays, who's away.
import { MyAssistant } from "./my-assistant";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, CalendarPlus, Inbox } from "lucide-react";
import { Days, LeaveDates, LeaveStatusBadge } from "@/components/leave-bits";
import { BalanceCard, OffThisWeek, UpcomingHolidays } from "@/components/leave-widgets";
import { ConnectedApps } from "@/components/connected-apps";
import { PersonHeader } from "@/components/person-header";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { istDate } from "@/lib/dates";
import { getServices } from "@/lib/server/container";
import { DocumentsPanel } from "../people/[id]/documents-panel";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "My page" };

export default function MePage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<Skeleton className="h-8 w-56" />}>
        <Greeting />
      </Suspense>
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-6">
          <Suspense fallback={<Skeleton className="h-32 w-full" />}>
            <Me />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <MyAssistant />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-48 w-full" />}>
            <MyLeaveSummary />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-24 w-full" />}>
            <MyDocuments />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-16 w-full" />}>
            <ConnectedApps />
          </Suspense>
        </div>
        <aside className="space-y-4">
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <OffThisWeek />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <UpcomingHolidays />
          </Suspense>
        </aside>
      </div>
    </div>
  );
}

function partOfDay(): string {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

async function Greeting() {
  const actor = await requireActor();
  return <h1 className="text-xl font-semibold tracking-tight">{`${partOfDay()}, ${actor.fullName.split(" ")[0]}`}</h1>;
}

async function Me() {
  const actor = await requireActor();
  const result = await getServices().people.profile(actor, actor.personId);
  if (!result.ok) return <ErrorState error={result.error} />;
  return (
    <PersonHeader
      person={result.value.person}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/people/${actor.personId}`}>My details</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/growth/${actor.personId}` as Route}>My growth</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={"/me/access" as Route}>My access</Link>
          </Button>
        </div>
      }
    />
  );
}

async function MyDocuments() {
  const actor = await requireActor();
  const result = await getServices().documents.forPerson(actor, actor.personId);
  if (!result.ok) return <ErrorState error={result.error} />;
  return <DocumentsPanel personId={actor.personId} data={result.value} today={istDate()} self />;
}

async function MyLeaveSummary() {
  const actor = await requireActor();
  const result = await getServices().leave.myOverview(actor);
  if (!result.ok) return <ErrorState error={result.error} />;
  const { balances, requests, waitingOnMe, canApply } = result.value;
  const today = istDate();
  const upcoming = requests.filter((r) => (r.effectiveEnd ?? r.endDate) >= today && (r.status === "approved" || r.status === "pending")).slice(0, 4);

  return (
    <section className="space-y-4">
      {waitingOnMe > 0 ? (
        <Link href="/leave/approvals" className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning hover:brightness-95">
          <Inbox className="size-4" />
          <span className="flex-1 font-medium">
            {waitingOnMe} leave {waitingOnMe === 1 ? "request is" : "requests are"} waiting for you
          </span>
          <ArrowRight className="size-4" />
        </Link>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">My leave</h2>
        {canApply ? (
          <Button asChild size="sm">
            <Link href="/leave/apply">
              <CalendarPlus /> Ask for leave
            </Link>
          </Button>
        ) : null}
      </div>
      {canApply ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {balances.map((b) => (
            <BalanceCard key={b.leaveTypeId} balance={b} />
          ))}
        </div>
      ) : null}
      {upcoming.length ? (
        <ul className="divide-y rounded-lg border bg-card shadow-card">
          {upcoming.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="flex-1">
                <LeaveDates start={r.startDate} end={r.effectiveEnd ?? r.endDate} halfDay={r.halfDay} />
                <span className="text-muted-foreground">
                  {" "}
                  · {r.leaveTypeName} · <Days halfDays={r.halfDays} />
                </span>
              </span>
              <LeaveStatusBadge status={r.status} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No leave coming up.</p>
      )}
      <Link href="/leave" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        All my leave <ArrowRight className="size-3.5" />
      </Link>
    </section>
  );
}
