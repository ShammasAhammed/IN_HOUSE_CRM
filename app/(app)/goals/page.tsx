// Goals (Stage 14.3): the founder dashboard. Every company goal with its team goals, health, progress and the last
// check-in; filter by period. Everyone sees what they may (private spaces, leaders only, money amounts).
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Flag } from "lucide-react";
import { GoalRow } from "@/components/goal-row";
import { PageHeader } from "@/components/page-header";
import { EmptyState, LoadingRows } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { istDate } from "@/lib/dates";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { cn } from "@/lib/utils";
import { GOAL_FILTERS, type GoalFilter } from "@/services/goals";
import { GoalForm } from "./goal-forms";

export const metadata: Metadata = { title: "Goals" };

const FILTER_LABELS: Record<GoalFilter, string> = { now: "Running now", year: "Year goals", quarter: "Quarter goals", month: "Month goals", all: "All" };

export default function GoalsPage({ searchParams }: PageProps<"/goals">) {
  return (
    <>
      <PageHeader title="Goals" description="The whole company on one screen: company goals, the team goals under them, and how each is doing." />
      <Suspense fallback={<LoadingRows rows={6} columns={2} label="Loading goals" />}>
        <Goals searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Goals({ searchParams }: Pick<PageProps<"/goals">, "searchParams">) {
  const [actor, sp] = await Promise.all([requireActor(), searchParams]);
  const filter = GOAL_FILTERS.find((f) => f === sp.period) ?? "now";
  const services = getServices();
  const [d, options, people, projects] = await Promise.all([services.goals.dashboard(actor, filter), services.goals.options(actor), services.people.directory(actor), services.projects.list(actor, { statuses: ["planned", "active"] })]);
  const canAdd = d.canCreate || options.spaces.length > 0;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px] [&>*]:min-w-0">
      <div className="space-y-4">
        <nav aria-label="Period" className="flex flex-wrap gap-1">
          {GOAL_FILTERS.map((f) => (
            <Link key={f} href={(f === "now" ? "/goals" : `/goals?period=${f}`) as Route} aria-current={filter === f ? "page" : undefined} className={cn("rounded-md px-2.5 py-1.5 text-sm", filter === f ? "bg-accent font-medium text-primary" : "text-muted-foreground hover:bg-hover")}>
              {FILTER_LABELS[f]}
            </Link>
          ))}
        </nav>
        {d.company.length === 0 && d.teams.length === 0 ? (
          <EmptyState icon={Flag} title="No goals here yet" description={d.canCreate ? "Set the first company goal on the right, like “₹50 lakh revenue this year”." : "The owner sets company goals; team goals go under them."} />
        ) : null}
        {d.company.map((c) => (
          <Card key={c.id}>
            <CardContent className="space-y-4 pt-4">
              <GoalRow g={c} />
              {c.teams.length ? (
                <ul className="space-y-3 border-l-2 pl-4">
                  {c.teams.map((t) => (
                    <li key={t.id}>
                      <GoalRow g={t} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        ))}
        {d.teams.length ? (
          <Card>
            <CardHeader>
              <CardTitle>Team goals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {d.teams.map((t) => (
                <GoalRow key={t.id} g={t} />
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
      {canAdd && (d.canCreate || options.company.length) ? (
        <aside>
          <Card>
            <CardHeader>
              <CardTitle>New goal</CardTitle>
            </CardHeader>
            <CardContent>
              <GoalForm company={options.company} spaces={options.spaces} people={people.ok ? people.value.filter((p) => p.status === "active").map((p) => ({ id: p.id, name: p.fullName })) : []} projects={projects.ok ? projects.value.map((p) => ({ id: p.id, name: `${p.clientName}: ${p.name}` })) : []} canCompany={actor.roles.includes("owner")} today={istDate()} />
            </CardContent>
          </Card>
        </aside>
      ) : null}
    </div>
  );
}
