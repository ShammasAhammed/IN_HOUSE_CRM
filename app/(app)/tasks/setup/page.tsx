// Fields and templates (Stage 9b.4): the custom fields tasks carry, and the saved tasks and projects to start from.
import type { Metadata } from "next";
import { Suspense } from "react";
import { FileStack, SlidersHorizontal } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import type { TemplateSummary } from "@/services/task-setup";
import { AddField, FieldRow, RemoveTemplate } from "../setup-forms";
import { mergeClients } from "../client-options";

export const metadata: Metadata = { title: "Fields and templates" };

export default function SetupPage() {
  return (
    <>
      <BackLink fallback="/tasks" />
      <PageHeader title="Fields and templates" description="Extra fields every task can carry, and saved tasks and projects to start new work from." />
      <Suspense fallback={<LoadingRows rows={6} columns={2} label="Loading fields and templates" />}>
        <Setup />
      </Suspense>
    </>
  );
}

function TemplateList({ items, canManage, kind }: { items: TemplateSummary[]; canManage: boolean; kind: "task" | "project" }) {
  if (!items.length)
    return <p className="text-sm text-muted-foreground">{kind === "task" ? "None yet. Open a task and choose \"Save as template\"." : "None yet. Open a project and choose \"Save as template\"."}</p>;
  return (
    <ul className="divide-y rounded-md border">
      {items.map((t) => (
        <li key={t.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{t.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {kind === "project" ? `${t.tasks} ${t.tasks === 1 ? "task" : "tasks"} · ` : ""}
              {t.checklist} checklist {t.checklist === 1 ? "step" : "steps"} · {t.subtasks} {t.subtasks === 1 ? "subtask" : "subtasks"}
              {t.createdByName ? ` · ${t.createdByName}` : ""} · {formatDateTime(new Date(t.updatedAt))}
            </p>
            {t.description ? <p className="truncate text-xs text-muted-foreground">{t.description}</p> : null}
          </div>
          {canManage ? <RemoveTemplate template={t} /> : null}
        </li>
      ))}
    </ul>
  );
}

async function Setup() {
  const actor = await requireActor();
  const services = getServices();
  const [fields, taskTemplates, projectTemplates, projects, clientOptions] = await Promise.all([
    services.taskSetup.fields(actor),
    services.taskSetup.templates(actor, "task"),
    services.taskSetup.templates(actor, "project"),
    services.projects.list(actor, { statuses: ["active", "planned", "on_hold"] }),
    services.clients.options(actor),
  ]);
  if (!fields.ok) return <ErrorState error={fields.error} />;
  if (!taskTemplates.ok) return <ErrorState error={taskTemplates.error} />;
  if (!projectTemplates.ok) return <ErrorState error={projectTemplates.error} />;
  const clients = mergeClients(projects.ok ? projects.value : [], clientOptions);
  const { canManage } = fields.value;
  return (
    <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
      <Card>
        <CardHeader>
          <CardTitle>Custom fields</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {fields.value.fields.length ? (
            <ul className="divide-y rounded-md border">
              {fields.value.fields.map((f, i) => (
                <FieldRow key={f.id} field={f} first={i === 0} last={i === fields.value.fields.length - 1} canManage={canManage} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={SlidersHorizontal} title="No custom fields yet" description="Add the details your tasks need: shoot location, ad budget, language, batch…" />
          )}
          {canManage ? <AddField clients={clients} /> : <p className="text-xs text-muted-foreground">Strategists and the owner add fields.</p>}
        </CardContent>
      </Card>
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Task templates</CardTitle>
            <FileStack className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            <TemplateList items={taskTemplates.value.templates} canManage={canManage} kind="task" />
            <p className="text-xs text-muted-foreground">Use one from a project page: &quot;From a template…&quot;.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Project templates</CardTitle>
            <FileStack className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            <TemplateList items={projectTemplates.value.templates} canManage={canManage} kind="project" />
            <p className="text-xs text-muted-foreground">Use one when starting a client&apos;s new project.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
