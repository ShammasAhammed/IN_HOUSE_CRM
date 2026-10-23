// Idea Boards library (Stage 13.1): every board you can open, by client and space; search names and the words on
// boards; favourites, recently opened and archived; start a new one from a template.
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Lightbulb, Search } from "lucide-react";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Input } from "@/components/ui/input";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { cn } from "@/lib/utils";
import type { BoardCard } from "@/services/boards";
import { NewBoardForm } from "./board-forms";
import { BoardTile } from "./board-tile";

export const metadata: Metadata = { title: "Idea boards" };

const VIEWS = [
  { id: "all", label: "All" },
  { id: "favourites", label: "Favourites" },
  { id: "recent", label: "Recently opened" },
  { id: "archived", label: "Archived" },
] as const;

export default function BoardsPage({ searchParams }: PageProps<"/boards">) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Idea boards</h1>
        <p className="text-sm text-muted-foreground">Brainstorm next to the work: stickies, frames, votes and comments, per client, project and space.</p>
      </div>
      <Suspense fallback={<LoadingRows rows={4} columns={3} label="Loading boards" />}>
        <Library searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Library({ searchParams }: Pick<PageProps<"/boards">, "searchParams">) {
  const [actor, sp] = await Promise.all([requireActor(), searchParams]);
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const view = (VIEWS.find((v) => v.id === one("view"))?.id ?? "all") as (typeof VIEWS)[number]["id"];
  const q = one("q").slice(0, 100);
  const tag = one("tag");
  const clientId = one("client");
  const projectId = one("project");
  const services = getServices();
  const [r, places, presets] = await Promise.all([
    services.boards.library(actor, { ...(clientId ? { clientId } : {}), ...(projectId ? { projectId } : {}), ...(q ? { q } : {}), archived: view === "archived" }),
    services.boards.whereCanCreate(actor),
    services.gallery.presets(actor),
  ]);
  if (!r.ok) return <ErrorState error={r.error} />;
  let list: BoardCard[] = r.value.boards;
  if (view === "favourites") list = list.filter((b) => b.favourite);
  if (view === "recent") list = list.filter((b) => b.viewedAt).sort((a, b) => b.viewedAt!.getTime() - a.viewedAt!.getTime());
  if (tag) list = list.filter((b) => b.tags.includes(tag));
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...(clientId ? { client: clientId } : {}), ...(projectId ? { project: projectId } : {}), ...(q ? { q } : {}), ...(tag ? { tag } : {}), ...(view !== "all" ? { view } : {}), ...patch });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    return `/boards${p.size ? `?${p}` : ""}` as Route;
  };
  // Grouped by client or space, then section (recent keeps its own order).
  const groups = new Map<string, BoardCard[]>();
  for (const b of list) {
    const key = view === "recent" ? "Recently opened" : `${b.clientName}${b.section ? ` · ${b.section}` : ""}`;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  const ordered = view === "recent" ? [...groups] : [...groups].sort(([a], [b]) => a.localeCompare(b));
  const place = clientId ? places.find((p) => p.id === clientId) : null;
  const canCreate = clientId ? r.value.canCreate : places.length > 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <form action="/boards" className="flex min-w-0 flex-1 items-center gap-2" role="search">
          {clientId ? <input type="hidden" name="client" value={clientId} /> : null}
          {projectId ? <input type="hidden" name="project" value={projectId} /> : null}
          {view !== "all" ? <input type="hidden" name="view" value={view} /> : null}
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Search names, tags and words on boards" aria-label="Search boards" className="h-9 min-w-0" />
        </form>
        <nav aria-label="Which boards" className="flex flex-wrap gap-1">
          {VIEWS.map((v) => (
            <Link key={v.id} href={href({ view: v.id === "all" ? "" : v.id })} aria-current={view === v.id ? "page" : undefined} className={cn("rounded-md px-2.5 py-1.5 text-sm", view === v.id ? "bg-accent font-medium text-primary" : "text-muted-foreground hover:bg-hover")}>
              {v.label}
            </Link>
          ))}
        </nav>
      </div>
      {clientId || projectId || tag ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          Showing {place ? place.name : "one client"}
          {projectId ? ", one project" : ""}
          {tag ? ` tagged #${tag}` : ""}.
          <Link href={"/boards" as Route} className="text-primary hover:underline">
            Show every board
          </Link>
        </p>
      ) : null}
      {r.value.tags.length ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Tags">
          {r.value.tags.map((t) => (
            <Link key={t} href={href({ tag: tag === t ? "" : t })} aria-current={tag === t ? "true" : undefined} className={cn("rounded-full border px-2 py-0.5 text-xs", tag === t ? "border-primary bg-accent text-primary" : "text-muted-foreground hover:bg-hover")}>
              #{t}
            </Link>
          ))}
        </div>
      ) : null}
      {canCreate && view !== "archived" ? (
        <details className="rounded-lg border bg-card p-4 shadow-card" open={one("new") === "1"}>
          <summary className="cursor-pointer text-sm font-semibold">New board</summary>
          <div className="pt-3">
            <NewBoardForm places={places} {...(clientId ? { clientId } : {})} {...(projectId ? { projectId } : {})} sections={r.value.sections} presets={presets.presets.map((p) => ({ id: p.id, kind: p.kind, name: p.name }))} />
          </div>
        </details>
      ) : null}
      {ordered.length ? (
        ordered.map(([name, items]) => (
          <section key={name} className="space-y-2" aria-label={name}>
            <h2 className="text-sm font-semibold">{name}</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((b) => (
                <BoardTile key={b.id} board={b} showWhere={view === "recent"} />
              ))}
            </ul>
          </section>
        ))
      ) : (
        <EmptyState
          icon={Lightbulb}
          title={q || tag ? "No boards match" : view === "archived" ? "Nothing archived" : view === "favourites" ? "No favourites yet" : view === "recent" ? "Nothing opened yet" : "No boards yet"}
          description={q || tag ? "Try other words: search looks at names, tags and every sticky." : view === "favourites" ? "Star a board to keep it here." : canCreate ? "Start one above, from a template or blank." : "Boards from your clients and spaces show here."}
        />
      )}
    </div>
  );
}
