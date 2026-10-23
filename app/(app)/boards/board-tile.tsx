// One board in a list (Stage 13.1): thumbnail, name, where, section and tags, and who changed it last.
import type { Route } from "next";
import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import type { BoardCard } from "@/services/boards";
import { FavouriteButton } from "./board-forms";

export function BoardTile({ board: b, showWhere = true }: { board: BoardCard; showWhere?: boolean }) {
  return (
    <li className="overflow-hidden rounded-lg border bg-card shadow-card">
      <Link href={`/boards/${b.id}` as Route} className="block aspect-[16/9] border-b bg-subtle" tabIndex={-1} aria-hidden>
        {b.thumbnail ? (
          // A data URL made in the browser on save: next/image adds nothing here.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.thumbnail} alt="" className="size-full object-contain" loading="lazy" />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            <Lightbulb className="size-6" />
          </span>
        )}
      </Link>
      <div className="space-y-1.5 p-3">
        <div className="flex items-start gap-2">
          <Link href={`/boards/${b.id}` as Route} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
            {b.title}
          </Link>
          <FavouriteButton boardId={b.id} initial={b.favourite} />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {[showWhere ? b.clientName : null, b.projectName, b.section].filter(Boolean).join(" · ") || "No section"}
        </p>
        {b.tags.length ? (
          <div className="flex flex-wrap gap-1">
            {b.tags.map((t) => (
              <Badge key={t}>#{t}</Badge>
            ))}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {b.archivedAt ? "Archived · " : ""}Changed {formatDateTime(b.updatedAt)}
          {b.updatedByName ? ` by ${b.updatedByName}` : ""} · {b.objectCount} {b.objectCount === 1 ? "object" : "objects"}
        </p>
      </div>
    </li>
  );
}
