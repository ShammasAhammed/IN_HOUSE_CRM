// The task list (Stage 9b.1): every task you can see as a sortable, filterable table, with saved views and bulk edit.
import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ListChecks, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TaskViewSwitch } from "@/components/task-view-switch";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { istDate } from "@/lib/dates";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { TASK_PRIORITIES, TASK_STATUSES, TASK_STATUS_LABELS } from "@/lib/types";
import { TASK_LIST_KEYS, type TaskListFilter } from "@/services/tasks";
import { mergeClients } from "./client-options";
import { TaskTable, TaskViews } from "./task-table";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPage({ searchParams }: PageProps<"/tasks">) {
  return (
    <>
      <PageHeader
        title="Tasks"
        description="Every task you can see, as a list. Sort by a column, filter, save the view, or tick tasks to change them together."
        actions={
<>
            <Button asChild size="sm" variant="ghost">
              <Link href={"/tasks/setup" as Route}>Fields and templates</Link>
            </Button>
            <TaskViewSwitch current="list" />
          </>
        }
      />
      <Suspense fallback={<LoadingRows rows={8} columns={6} label="Loading tasks" />}>
        <List searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/tasks">["searchParams"] }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const filter: TaskListFilter = Object.fromEntries(TASK_LIST_KEYS.map((k) => [k, typeof sp[k] === "string" ? (sp[k] as string) : ""]).filter(([, v]) => v));
  const services = getServices();
  const [r, projects, directory, tags, views, clientOptions] = await Promise.all([
    services.tasks.table(actor, filter),
    services.projects.list(actor, { statuses: ["active", "planned", "on_hold"] }),
    services.people.directory(actor),
    services.tasks.tagOptions(actor),
    services.tasks.views(actor),
    services.clients.options(actor),
  ]);
  if (!r.ok) return <ErrorState error={r.error} />;
  const clients = mergeClients(projects.ok ? projects.value : [], clientOptions);
  const projectList = projects.ok ? projects.value.filter((p) => !filter.clientId || p.clientId === filter.clientId) : [];
  const people = directory.ok ? directory.value.filter((p) => p.status === "active").map((p) => ({ id: p.id, name: p.fullName })) : [];
  const query = new URLSearchParams(Object.entries(filter) as Array<[string, string]>).toString();
  const sortBy = filter.sort ?? "due";
  const dir = filter.dir === "desc" ? "desc" : "asc";
  const sortLinks = Object.fromEntries(
    ["title", "client", "status", "priority", "owner", "due"].map((by) => {
      const next = new URLSearchParams(Object.entries(filter) as Array<[string, string]>);
      next.set("sort", by);
      next.set("dir", by === sortBy && dir === "asc" ? "desc" : "asc");
      return [by, { href: `/tasks?${next}`, arrow: by === sortBy ? (dir === "asc" ? "↑" : "↓") : "" }];
    }),
  );
  return (
    <div className="space-y-4" data-wide>
      <TaskViews views={views} query={query} />
      {/* Keyed by the address: a saved view or sort link shows its own filters, and ticks start fresh. */}
      <form key={query} className="flex flex-wrap items-end gap-2" role="search">
        <label className="relative min-w-0 flex-1 basis-48">
          <span className="sr-only">Search task titles</span>
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input name="q" defaultValue={filter.q} placeholder="Search titles" className="h-9 pl-8" />
        </label>
        <Pick name="status" label="Status" value={filter.status ?? ""} any="Open" options={[["all", "All"], ...TASK_STATUSES.map((s) => [s, TASK_STATUS_LABELS[s]] as [string, string])]} />
        <Pick name="owner" label="Owner" value={filter.owner ?? ""} any="Anyone" options={[["me", "Me"], ...people.map((p) => [p.id, p.name] as [string, string])]} />
        <Pick name="clientId" label="Client" value={filter.clientId ?? ""} any="All clients" options={clients.map((c) => [c.id, c.name])} />
        <Pick name="projectId" label="Project" value={filter.projectId ?? ""} any="All projects" options={projectList.map((p) => [p.id, p.name])} />
        <Pick name="priority" label="Priority" value={filter.priority ?? ""} any="Any priority" options={TASK_PRIORITIES.map((p) => [p, p[0]!.toUpperCase() + p.slice(1)])} />
        <Pick name="due" label="Due" value={filter.due ?? ""} any="Any due date" options={[["overdue", "Overdue"], ["today", "Today"], ["week", "Next 7 days"], ["none", "No due date"]]} />
        {tags.length ? <Pick name="tag" label="Tag" value={filter.tag ?? ""} any="Any tag" options={tags.map((t) => [t.tag, `${t.tag} (${t.count})`])} /> : null}
        {filter.sort ? <input type="hidden" name="sort" value={filter.sort} /> : null}
        {filter.dir ? <input type="hidden" name="dir" value={filter.dir} /> : null}
        <Button type="submit" size="sm" variant="outline" className="h-9">
          Show
        </Button>
        {query ? (
          <Button asChild size="sm" variant="ghost" className="h-9">
            <Link href={"/tasks" as Route}>Clear</Link>
          </Button>
        ) : null}
      </form>
      {r.value.tasks.length === 0 ? (
        <EmptyState icon={ListChecks} title="No tasks match" description="Try another status or fewer filters." />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{r.value.total === 1000 ? "The first 1,000. Filter to narrow it down." : `${r.value.total} ${r.value.total === 1 ? "task" : "tasks"}.`}</p>
          <TaskTable key={query} tasks={r.value.tasks} today={istDate()} people={people} tags={tags.map((t) => t.tag)} sortLinks={sortLinks} />
        </>
      )}
    </div>
  );
}

function Pick({ name, label, value, any, options }: { name: string; label: string; value: string; any: string; options: Array<[string, string]> }) {
  return (
    <Select name={name} defaultValue={value} aria-label={`Filter by ${label.toLowerCase()}`} className="h-9 w-auto max-w-44">
      <option value="">{any}</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </Select>
  );
}
