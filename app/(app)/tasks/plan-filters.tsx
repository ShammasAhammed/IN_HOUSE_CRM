// Filters shared by the calendar and the timeline (Stage 9b.3): whose tasks, which client or project, open or all.
import type { Route } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { isId } from "@/lib/id";
import { getServices } from "@/lib/server/container";
import type { Actor } from "@/services/permissions";
import type { PlanFilter } from "@/services/planning";

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export function planFilterFrom(sp: Record<string, string | string[] | undefined>): PlanFilter {
  const owner = str(sp.owner);
  return {
    owner: owner === "me" || isId(owner) ? owner : "",
    clientId: isId(str(sp.clientId)) ? str(sp.clientId) : "",
    projectId: isId(str(sp.projectId)) ? str(sp.projectId) : "",
    status: str(sp.status) === "all" ? "all" : "",
  };
}

export async function PlanFilters({ actor, filter, path, keep }: { actor: Actor; filter: PlanFilter; path: string; keep: Record<string, string> }) {
  const services = getServices();
  const [projects, directory] = await Promise.all([services.projects.list(actor, { statuses: ["active", "planned", "on_hold"] }), services.people.directory(actor)]);
  const clients = projects.ok ? [...new Map(projects.value.map((p) => [p.clientId, { id: p.clientId, name: p.clientName }])).values()].sort((a, b) => a.name.localeCompare(b.name)) : [];
  const projectList = projects.ok ? projects.value.filter((p) => !filter.clientId || p.clientId === filter.clientId) : [];
  const people = directory.ok ? directory.value.filter((p) => p.status === "active") : [];
  const query = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as Array<[string, string]>).toString();
  return (
    <form key={query} className="flex flex-wrap items-end gap-2" role="search">
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <Select name="owner" defaultValue={filter.owner} aria-label="Whose tasks" className="h-9 w-auto max-w-44">
        <option value="">Anyone</option>
        <option value="me">Me</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.fullName}
          </option>
        ))}
      </Select>
      <Select name="clientId" defaultValue={filter.clientId} aria-label="Client" className="h-9 w-auto max-w-44">
        <option value="">All clients</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Select name="projectId" defaultValue={filter.projectId} aria-label="Project" className="h-9 w-auto max-w-44">
        <option value="">All projects</option>
        {projectList.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <Select name="status" defaultValue={filter.status} aria-label="Status" className="h-9 w-auto">
        <option value="">Open tasks</option>
        <option value="all">Done too</option>
      </Select>
      <Button type="submit" size="sm" variant="outline" className="h-9">
        Show
      </Button>
      {query ? (
        <Button asChild size="sm" variant="ghost" className="h-9">
          <Link href={`${path}?${new URLSearchParams(Object.entries(keep).filter(([, v]) => v))}` as Route}>Clear</Link>
        </Button>
      ) : null}
    </form>
  );
}

/** The address of this view with some settings changed, keeping the filters. */
export function planHref(path: string, filter: PlanFilter, extra: Record<string, string>): Route {
  const q = new URLSearchParams([...(Object.entries(filter).filter(([, v]) => v) as Array<[string, string]>), ...Object.entries(extra).filter(([, v]) => v)]);
  return `${path}?${q}` as Route;
}
