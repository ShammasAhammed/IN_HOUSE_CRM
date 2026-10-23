import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarPlus, Plane } from "lucide-react";
import { ConfirmForm } from "@/components/confirm-form";
import { Days, LeaveDates, LeaveStatusBadge } from "@/components/leave-bits";
import { EmptyState, ErrorState, LoadingRows, SuccessNotice } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { istDate } from "@/lib/dates";
import { formatShortDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { BalanceCard, OffThisWeek, UpcomingHolidays } from "@/components/leave-widgets";
import { cancelLeaveAction } from "./actions";

export const metadata: Metadata = { title: "My leave" };

const DONE: Record<string, string> = {
  applied: "Request sent. You'll see it here as soon as it's decided.",
  recorded: "Leave recorded and approved.",
};

async function Done({ searchParams }: { searchParams: PageProps<"/leave">["searchParams"] }) {
  const { done } = await searchParams;
  return typeof done === "string" && Object.hasOwn(DONE, done) ? <SuccessNotice className="mb-4">{DONE[done]}</SuccessNotice> : null;
}

export default function MyLeavePage({ searchParams }: PageProps<"/leave">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <Done searchParams={searchParams} />
      </Suspense>
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-6">
          <Suspense fallback={<BalancesSkeleton />}>
            <MyLeave />
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

function BalancesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <LoadingRows rows={4} columns={3} label="Loading your leave" />
    </div>
  );
}

async function MyLeave() {
  const actor = await requireActor();
  const result = await getServices().leave.myOverview(actor);
  if (!result.ok) return <ErrorState error={result.error} />;
  const { balances, requests, canApply, year } = result.value;

  return (
    <>
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Your balance for {year}</h2>
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
        ) : (
          <p className="text-sm text-muted-foreground">Freelancers don&apos;t take leave through Oppllo One.</p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Your requests</h2>
        {requests.length === 0 ? (
          <EmptyState icon={Plane} title="No leave this year yet" description="When you ask for time off, it shows here with its status." />
        ) : (
          <ul className="divide-y rounded-lg border bg-card shadow-card">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    <LeaveDates start={r.startDate} end={r.effectiveEnd ?? r.endDate} halfDay={r.halfDay} />
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {r.leaveTypeName} · <Days halfDays={r.halfDays} />
                    </span>
                  </p>
                  {r.reason ? <p className="mt-0.5 truncate text-sm text-muted-foreground">{r.reason}</p> : null}
                  {r.decisionNote ? (
                    <p className="mt-1 text-sm">
                      <span className="text-muted-foreground">{r.approverName ?? "Approver"}:</span> {r.decisionNote}
                    </p>
                  ) : null}
                  {r.cancelRequestedFrom ? (
                    <p className="mt-1 text-xs text-warning">Asked to end it from {formatShortDate(r.cancelRequestedFrom)} — waiting for {r.approverName}.</p>
                  ) : r.effectiveEnd && r.effectiveEnd !== r.endDate ? (
                    <p className="mt-1 text-xs text-muted-foreground">Cut short: planned until {formatShortDate(r.endDate)}.</p>
                  ) : null}
                  {r.status === "pending" && r.approverName ? <p className="mt-1 text-xs text-muted-foreground">With {r.approverName}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <LeaveStatusBadge status={r.status} />
                  {r.canCancel ? (
                    <ConfirmForm
                      action={cancelLeaveAction}
                      fields={{ requestId: r.id }}
                      confirm={r.startDate <= istDate() ? "This leave has started. Ask to end it from tomorrow?" : "Cancel this leave?"}
                      label={r.startDate <= istDate() ? "End early" : "Cancel"}
                      variant="ghost"
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
