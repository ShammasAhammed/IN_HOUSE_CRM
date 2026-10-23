// Teams (test report L16): HR and the owner add teams, name their heads and retire empty ones.
import type { Metadata } from "next";
import { Suspense } from "react";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { can } from "@/services/permissions";
import { TeamForm } from "./team-forms";

export const metadata: Metadata = { title: "Teams" };

export default function TeamsPage() {
  return (
    <div className="max-w-3xl space-y-4">
      <BackLink fallback="/people" label="People" />
      <PageHeader title="Teams" description="The teams people belong to, and who heads each one. A team head sees and plans their team's work." />
      <Suspense fallback={<LoadingRows rows={4} columns={2} label="Loading teams" />}>
        <Teams />
      </Suspense>
    </div>
  );
}

async function Teams() {
  const actor = await requireActor();
  const services = getServices();
  const [teams, directory] = await Promise.all([services.people.departments(actor), services.people.directory(actor)]);
  if (!teams.ok) return <ErrorState error={teams.error} />;
  if (!directory.ok) return <ErrorState error={directory.error} />;
  const people = directory.value.filter((p) => p.status === "active").map((p) => ({ id: p.id, name: p.fullName }));
  const members = (name: string) => directory.value.filter((p) => p.status === "active" && p.departmentName === name).length;
  const canEdit = can(actor, "people.write");
  return (
    <div className="space-y-3">
      {teams.value.length === 0 ? <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">No teams yet. Add the first one below.</p> : null}
      {teams.value.map((t) => (
        <TeamForm key={`${t.id}-${t.name}-${t.headPersonId ?? ""}`} team={t} people={people} members={members(t.name)} canEdit={canEdit} />
      ))}
      {canEdit ? <TeamForm key={`new-${teams.value.length}`} team={null} people={people} members={0} canEdit /> : null}
    </div>
  );
}
