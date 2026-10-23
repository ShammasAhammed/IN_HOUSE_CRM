// One goal (Stage 14.3): its numbers and health, the work behind it, check-ins (post one here) and its settings.
import type { Metadata } from "next";
import { Suspense } from "react";
import { BackLink } from "@/components/back-link";
import { goalAmount, GoalRow } from "@/components/goal-row";
import { ErrorState, LoadingRows } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { istDate } from "@/lib/dates";
import { formatDateTime } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { GOAL_SOURCE_LABELS } from "@/lib/types";
import { ArchiveGoal, CheckinForm, GoalForm } from "../goal-forms";

export const metadata: Metadata = { title: "Goal" };

export default function GoalRoute({ params }: PageProps<"/goals/[id]">) {
  return (
    <Suspense fallback={<LoadingRows rows={6} columns={1} label="Loading the goal" />}>
      <Goal params={params} />
    </Suspense>
  );
}

async function Goal({ params }: Pick<PageProps<"/goals/[id]">, "params">) {
  const actor = await requireActor();
  const services = getServices();
  const r = await services.goals.get(actor, (await params).id);
  if (!r.ok) return <ErrorState error={r.error} />;
  const g = r.value;
  const [people, projects] = g.canEdit ? await Promise.all([services.people.directory(actor), services.projects.list(actor, { statuses: ["planned", "active"] })]) : [null, null];
  return (
    <div className="space-y-4">
      <BackLink fallback="/goals" />
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{g.title}</h1>
        <p className="text-sm text-muted-foreground">
          {g.parentId ? `Team goal${g.parentTitle ? ` under “${g.parentTitle}”` : ""}` : `Company goal${g.leadersOnly ? " · leaders only" : ""}`} · {GOAL_SOURCE_LABELS[g.source]}
        </p>
        {g.description ? <p className="text-sm">{g.description}</p> : null}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px] [&>*]:min-w-0">
        <div className="space-y-5">
          <Card>
            <CardContent className="pt-4">
              <GoalRow g={g} />
            </CardContent>
          </Card>
          {g.supporting ? (
            <Card>
              <CardHeader>
                <CardTitle>Work behind it</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {g.supporting.projects.map((p) => (
                    <li key={p.id} className="flex justify-between gap-2 py-2">
                      <span className="truncate">{p.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular">
                        {p.done} of {p.total} tasks done
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Check-ins</CardTitle>
            </CardHeader>
            <CardContent>
              {g.checkins.length ? (
                <ul className="space-y-2 text-sm">
                  {g.checkins.map((c) => (
                    <li key={c.id} className="rounded-md border px-3 py-2">
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(c.createdAt)} · {c.personName}
                        {c.value !== null ? ` · ${goalAmount(g, c.value)}` : ""}
                      </p>
                      {c.note ? <p>{c.note}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No check-ins yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
        <aside className="space-y-5">
          {g.canCheckin ? (
            <Card>
              <CardHeader>
                <CardTitle>Post a check-in</CardTitle>
              </CardHeader>
              <CardContent>
                <CheckinForm goalId={g.id} unit={g.unit} live={g.source !== "manual"} />
              </CardContent>
            </Card>
          ) : null}
          {g.canEdit && !g.amountsHidden ? (
            <Card>
              <CardHeader>
                <CardTitle>Change the goal</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <GoalForm
                  initial={{ goalId: g.id, parentId: g.parentId, spaceId: g.spaceId, title: g.title, description: g.description, unit: g.unit, target: String(g.unit === "money" ? (g.target ?? 0) / 100 : (g.target ?? 0)), period: g.period, on: g.startsOn, source: g.source, ownerId: g.ownerId ?? "", leadersOnly: g.leadersOnly, projectIds: g.supporting?.projects.map((p) => p.id) ?? [] }}
                  company={[]}
                  spaces={[]}
                  people={people?.ok ? people.value.filter((p) => p.status === "active").map((p) => ({ id: p.id, name: p.fullName })) : []}
                  projects={projects?.ok ? projects.value.map((p) => ({ id: p.id, name: `${p.clientName}: ${p.name}` })) : []}
                  canCompany={false}
                  today={istDate()}
                />
                <ArchiveGoal goalId={g.id} />
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
