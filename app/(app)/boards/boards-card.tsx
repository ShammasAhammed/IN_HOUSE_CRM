// "Idea boards" on a client, space or project page (Stage 13.1).
import type { Route } from "next";
import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function BoardsCard({ clientId, projectId }: { clientId: string; projectId?: string }) {
  const actor = await requireActor();
  const r = await getServices().boards.card(actor, { clientId, ...(projectId ? { projectId } : {}) });
  if (!r.ok) return null;
  const { boards, canCreate, total } = r.value;
  const where = `client=${clientId}${projectId ? `&project=${projectId}` : ""}`;
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-card" aria-label="Idea boards">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Lightbulb className="size-4 text-muted-foreground" /> Idea boards
        </h2>
        <div className="ml-auto flex gap-2">
          {canCreate ? (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/boards?${where}&new=1` as Route}>New board</Link>
            </Button>
          ) : null}
          {total ? (
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/boards?${where}` as Route}>All {total}</Link>
            </Button>
          ) : null}
        </div>
      </div>
      {boards.length ? (
        <ul className="divide-y">
          {boards.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-x-2 py-2 text-sm">
              <Link href={`/boards/${b.id}` as Route} className="min-w-0 flex-1 truncate font-medium hover:underline">
                {b.title}
              </Link>
              <span className="w-full text-xs text-muted-foreground sm:w-auto">
                {b.section ? `${b.section} · ` : ""}
                {formatDateTime(b.updatedAt)}
                {b.updatedByName ? ` · ${b.updatedByName}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No boards yet.{canCreate ? " Start one for brainstorming, a campaign plan or a retro." : ""}</p>
      )}
    </section>
  );
}
