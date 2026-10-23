import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { TaskViewSwitch } from "@/components/task-view-switch";
import { ErrorState, LoadingRows } from "@/components/states";
import { isId } from "@/lib/id";
import { istDate } from "@/lib/dates";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { Board } from "./board";
import { BoardFilters } from "./filters";
import { mergeClients } from "../tasks/client-options";

export const metadata: Metadata = { title: "Board" };

export default function BoardPage({ searchParams }: PageProps<"/board">) {
  return (
    <>
      <PageHeader
        title="Board"
        description="All work by status. Drag a card to move it."
        actions={
<TaskViewSwitch current="board" />
        }
      />
      <Suspense fallback={<LoadingRows rows={6} columns={5} label="Loading the board" />}>
        <BoardData searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const one = (v: string | string[] | undefined) => (typeof v === "string" && isId(v) ? v : undefined);

async function BoardData({ searchParams }: { searchParams: PageProps<"/board">["searchParams"] }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const filter = { clientId: one(sp.client), projectId: one(sp.project), ownerId: one(sp.owner) };
  const services = getServices();
  const [board, projects, directory, clientOptions] = await Promise.all([
    services.tasks.board(actor, filter),
    services.projects.list(actor, { statuses: ["active", "planned", "on_hold"] }),
    services.people.directory(actor),
    services.clients.options(actor),
  ]);
  if (!board.ok) return <ErrorState error={board.error} />;
  if (!projects.ok) return <ErrorState error={projects.error} />;
  // A completed or cancelled project picked from its page still shows in the filter.
  if (filter.projectId && !projects.value.some((p) => p.id === filter.projectId)) {
    const picked = await services.projects.get(actor, filter.projectId);
    if (picked.ok) projects.value.push(picked.value);
  }
  // Every live client, with or without projects yet, as on Tasks and Fields (QA S2-B6).
  const clients = mergeClients(projects.value, clientOptions);
  const visibleProjects = projects.value.filter((p) => !filter.clientId || p.clientId === filter.clientId);

  return (
    <div className="space-y-4" data-wide>
      <BoardFilters
        clients={clients}
        projects={projects.value.map((p) => ({ id: p.id, name: p.name, clientId: p.clientId }))}
        people={directory.ok ? directory.value.map((p) => ({ id: p.id, name: p.fullName })) : []}
        me={actor.personId}
      />
      <Board
        key={JSON.stringify(filter)}
        columns={board.value.columns}
        today={istDate()}
        projects={visibleProjects.map((p) => ({ id: p.id, name: p.name, clientName: p.clientName }))}
        defaultProjectId={filter.projectId ?? null}
        defaultOwnerId={filter.ownerId ?? actor.personId}
        canCreate={board.value.canCreate}
      />
    </div>
  );
}
