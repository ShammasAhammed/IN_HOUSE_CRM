import type { Metadata } from "next";
import { Suspense } from "react";
import { Inbox, Users } from "lucide-react";
import { Days, LeaveDates, LeaveStatusBadge } from "@/components/leave-bits";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatShortDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import type { ApprovalItem } from "@/services/leave";
import { daysLabel } from "@/services/rules/leave";
import { DecisionForm, RevokeForm } from "./decision-form";

export const metadata: Metadata = { title: "Leave approvals" };

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<LoadingRows rows={3} columns={3} label="Loading requests" />}>
      <Approvals />
    </Suspense>
  );
}

async function Approvals() {
  const actor = await requireActor();
  const leave = getServices().leave;
  const [result, upcoming] = await Promise.all([leave.approvals(actor), leave.myApprovedUpcoming(actor)]);
  if (!result.ok) return <ErrorState error={result.error} />;
  const { mine, others } = result.value;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold">Waiting for you</h2>
        {mine.length === 0 ? (
          <EmptyState icon={Inbox} title="Nothing to decide" description="When someone who reports to you asks for leave, it appears here." />
        ) : (
          <ul className="space-y-3">
            {mine.map((item) => (
              <ApprovalCard key={item.request.id} item={item} decide />
            ))}
          </ul>
        )}
      </section>

      {others.length ? (
        <section>
          <h2 className="mb-1 text-sm font-semibold">Waiting for others</h2>
          <p className="mb-3 text-xs text-muted-foreground">As the owner you can decide these too, for example when their approver is away.</p>
          <ul className="space-y-3">
            {others.map((item) => (
              <ApprovalCard key={item.request.id} item={item} decide />
            ))}
          </ul>
        </section>
      ) : null}

      {!upcoming.ok ? <ErrorState error={upcoming.error} /> : null}
      {upcoming.ok && upcoming.value.length ? (
        <section>
          <h2 className="mb-1 text-sm font-semibold">Approved, coming up</h2>
          <p className="mb-3 text-xs text-muted-foreground">If plans change, you can revoke leave that hasn&apos;t started. Say why.</p>
          <ul className="divide-y rounded-lg border bg-card shadow-card">
            {upcoming.value.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <Avatar name={r.personName} size="sm" />
                <span className="font-medium">{r.personName}</span>
                <span className="text-sm text-muted-foreground">
                  <LeaveDates start={r.startDate} end={r.endDate} halfDay={r.halfDay} /> · {r.leaveTypeName}
                </span>
                <span className="ml-auto">
                  <RevokeForm requestId={r.id} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ApprovalCard({ item, decide }: { item: ApprovalItem; decide: boolean }) {
  const r = item.request;
  return (
    <li className="rounded-lg border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-start gap-3">
        <Avatar name={r.personName} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{r.personName}</p>
            {item.kind === "cut_short" ? <Badge tone="info">Wants to end early</Badge> : <LeaveStatusBadge status={r.status} />}
          </div>
          <p className="mt-0.5 text-sm">
            <LeaveDates start={r.startDate} end={r.endDate} halfDay={r.halfDay} />
            <span className="text-muted-foreground">
              {" "}
              · {r.leaveTypeName} · <Days halfDays={r.halfDays} />
            </span>
          </p>
          {item.kind === "cut_short" && r.cancelRequestedFrom ? (
            <p className="mt-1 text-sm text-muted-foreground">Back at work from {formatShortDate(r.cancelRequestedFrom)}; the days after come back to their balance.</p>
          ) : null}
          {r.reason ? <p className="mt-1 text-sm text-foreground-2">“{r.reason}”</p> : null}
          <p className="mt-1 text-xs text-muted-foreground">
            {item.availableAfter === null
              ? "No balance for this type"
              : item.kind === "cut_short"
                ? `${daysLabel(item.availableAfter)} of ${r.leaveTypeName?.toLowerCase() ?? "leave"} left now; ending early gives days back`
                : `${daysLabel(item.availableAfter)} of ${r.leaveTypeName?.toLowerCase() ?? "leave"} left after this`}
          </p>
          {item.clashes.length ? (
            <p className="mt-2 flex items-start gap-1.5 rounded-md bg-warning-soft px-2.5 py-1.5 text-xs text-warning">
              <Users className="mt-px size-3.5 shrink-0" />
              Also away from the team:{" "}
              {item.clashes
                .map((c) => `${c.personName} (${formatShortDate(c.startDate)}${c.endDate !== c.startDate ? `–${formatShortDate(c.endDate)}` : ""}${c.status === "pending" ? ", asked" : ""})`)
                .join(", ")}
            </p>
          ) : null}
        </div>
        {decide ? (
          <div className="w-full sm:w-64">
            <DecisionForm requestId={r.id} kind={item.kind} />
          </div>
        ) : null}
      </div>
    </li>
  );
}
