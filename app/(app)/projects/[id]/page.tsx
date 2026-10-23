import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BoardsCard } from "../../boards/boards-card";
import { ChevronLeft, KanbanSquare } from "lucide-react";
import { ErrorState, LoadingRows } from "@/components/states";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { istDate } from "@/lib/dates";
import { formatShortDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { canCreateTasks } from "@/services/tasks";
import { SaveAsTemplate, TaskFromTemplate } from "../../tasks/setup-forms";
import type { ProjectStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { can } from "@/services/permissions";
import { ProjectControls, RecurrenceList } from "./project-forms";

export const metadata: Metadata = { title: "Project" };

const STATUS: Record<ProjectStatus, { label: string; tone: BadgeTone }> = {
  planned: { label: "Planned", tone: "info" },
  active: { label: "Active", tone: "success" },
  on_hold: { label: "On hold", tone: "warning" },
  completed: { label: "Completed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export default function ProjectRoute({ params }: PageProps<"/projects/[id]">) {
  return (
    <Suspense fallback={<LoadingRows rows={5} columns={3} label="Loading the project" />}>
      <ProjectScreen params={params} />
    </Suspense>
  );
}

async function ProjectScreen({ params }: Pick<PageProps<"/projects/[id]">, "params">) {
  const actor = await requireActor();
  const { id } = await params;
  const services = getServices();
  const [project, recurrences, taskTemplates, directory] = await Promise.all([
    services.projects.get(actor, id),
    services.recurrences.list(actor, id),
    services.taskSetup.templates(actor, "task"),
    services.people.directory(actor),
  ]);
  const people = directory.ok ? directory.value.filter((x) => x.status === "active").map((x) => ({ id: x.id, name: x.fullName })) : [];
  if (!project.ok) return <ErrorState error={project.error} />;
  const p = project.value;
  const current = p.stages.findIndex((s) => s.id === p.currentStageId);
  const today = istDate();

  return (
    <div className="space-y-5">
      <Link href={`/clients/${p.clientId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> {p.clientName}
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{p.name}</h1>
            <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {p.engagementName ? (
              can(actor, "engagements.read") && p.engagementId ? (
                <Link href={`/engagements/${p.engagementId}`} className="hover:text-foreground hover:underline">
                  {p.engagementName}
                </Link>
              ) : (
                p.engagementName
              )
            ) : (
              "No engagement"
            )}
            {p.leadName ? ` · Lead: ${p.leadName}` : ""}
            {p.startDate ? ` · ${formatShortDate(p.startDate)}` : ""}
            {p.dueDate ? ` to ${formatShortDate(p.dueDate)}` : ""}
          </p>
        </div>
        {/* People who see projects but not their tasks (the BDO) have nothing to open on the Board. */}
        {can(actor, "tasks.read.all") || can(actor, "tasks.read.assigned") || !can(actor, "projects.read.all") ? (
          <Button size="sm" asChild>
            <Link href={`/board?client=${p.clientId}&project=${p.id}`}>
              <KanbanSquare /> Open on the Board
            </Link>
          </Button>
        ) : null}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Where it stands</CardTitle>
          {can(actor, "projects.write") ? <ProjectControls projectId={p.id} status={p.status} stageId={p.currentStageId} stages={p.stages} /> : null}
        </CardHeader>
        <CardContent className="space-y-4 pt-3">
          <ol className="grid gap-2 sm:grid-flow-col sm:auto-cols-fr" aria-label="Stages">
            {p.stages.map((s, i) => (
              <li key={s.id} className="space-y-1.5">
                <div className={cn("h-1.5 rounded-full", p.status === "completed" || i < current ? "bg-primary/50" : i === current ? "bg-primary" : "bg-neutral-soft")} />
                <p className={cn("text-xs", i === current ? "font-medium text-foreground" : "text-muted-foreground")}>{s.name}</p>
              </li>
            ))}
          </ol>
          {p.countsVisible ? (
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <div>
                <dt className="inline text-muted-foreground">Open </dt>
                <dd className="tabular inline font-medium">{p.openTasks}</dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">Late </dt>
                <dd className={cn("tabular inline font-medium", p.overdueTasks ? "text-danger" : undefined)}>{p.overdueTasks}</dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">Done </dt>
                <dd className="tabular inline font-medium">{p.doneTasks}</dd>
              </div>
            </dl>
          ) : null}
        </CardContent>
      </Card>

      <Suspense fallback={<LoadingRows rows={2} columns={2} label="Loading idea boards" />}>
        <BoardsCard clientId={p.clientId} projectId={p.id} />
      </Suspense>

      {(canCreateTasks(actor) && taskTemplates.ok && taskTemplates.value.templates.length) || can(actor, "projects.write") ? (
        <Card>
          <CardHeader>
            <CardTitle>Templates</CardTitle>
            {can(actor, "projects.write") ? <SaveAsTemplate kind="project" sourceId={p.id} defaultName={p.name} /> : null}
          </CardHeader>
          <CardContent>
            {canCreateTasks(actor) && taskTemplates.ok && taskTemplates.value.templates.length ? (
              <TaskFromTemplate projectId={p.id} templates={taskTemplates.value.templates} people={people} />
            ) : (
              <p className="text-sm text-muted-foreground">Save a task as a template from its page to start new tasks here from it.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recurring tasks</CardTitle>
            <p className="text-xs text-muted-foreground">Made two weeks ahead, each its own task. A date on a holiday moves to the working day before.</p>
          </div>
        </CardHeader>
        <CardContent className="pt-3">
          {recurrences.ok ? <RecurrenceList projectId={p.id} data={recurrences.value} today={today} /> : <ErrorState error={recurrences.error} />}
        </CardContent>
      </Card>
    </div>
  );
}
