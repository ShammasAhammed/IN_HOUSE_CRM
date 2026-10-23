import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { istDate } from "@/lib/dates";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { can } from "@/services/permissions";
import { ApplyForm } from "./apply-form";

export const metadata: Metadata = { title: "Ask for leave" };

export default function ApplyPage() {
  return (
    <Suspense fallback={<LoadingRows rows={4} columns={2} label="Loading the form" />}>
      <Apply />
    </Suspense>
  );
}

async function Apply() {
  const actor = await requireActor();
  const services = getServices();
  const overview = await services.leave.myOverview(actor);
  if (!overview.ok) return <ErrorState error={overview.error} />;
  const recordsForOthers = can(actor, "leave.manage") || can(actor, "leave.approve.any");
  if (!overview.value.canApply && !recordsForOthers) {
    return <ErrorState error={{ code: "forbidden", message: "Freelancers don't take leave through Oppllo One." }} />;
  }
  const directory = recordsForOthers ? await services.people.directory(actor) : null;
  const types = overview.value.balances.map((b) => ({
    id: b.leaveTypeId,
    name: b.name,
    allowHalfDay: b.allowHalfDay,
    usesBalance: b.usesBalance,
  }));
  if (!types.length)
    return <EmptyState title="HR hasn't set up leave types yet" description={can(actor, "leave.manage") ? "Add them in Leave → Settings (casual, sick, comp-off …), then people can ask for leave." : "Ask HR to add them in Leave → Settings. Until then, tell your lead directly."} />;
  return (
    <ApplyForm
      types={types}
      today={istDate()}
      me={actor.personId}
      people={directory?.ok ? directory.value.map((p) => ({ id: p.id, name: p.fullName })) : null}
    />
  );
}
