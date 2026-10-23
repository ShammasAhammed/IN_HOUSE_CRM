// "Files & sheets" on the client or space page (Stage 13.0): the Google files and pages the team works in.
import type { Route } from "next";
import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatShortDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function FilesCard({ clientId }: { clientId: string }) {
  const actor = await requireActor();
  const r = await getServices().clientLinks.page(actor, clientId);
  if (!r.ok) return null;
  const { links, canEdit } = r.value;
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-card" aria-label="Files and sheets">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <FileSpreadsheet className="size-4 text-muted-foreground" /> Files &amp; sheets
        </h2>
        <Button size="sm" variant="outline" className="ml-auto" asChild>
          <Link href={`/clients/${clientId}/files` as Route}>{canEdit ? "Add or manage" : "All files"}</Link>
        </Button>
      </div>
      {links.length ? (
        <ul className="divide-y">
          {links.slice(0, 6).map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <Link href={`/clients/${clientId}/files/${l.id}` as Route} className="min-w-0 flex-1 truncate font-medium hover:underline">
                {l.title}
              </Link>
              <Badge>{l.kindLabel}</Badge>
              {l.problem ? <Badge tone="warning">Not shared</Badge> : null}
              {l.meta?.modifiedTime ? <span className="w-full text-xs text-muted-foreground sm:w-auto">Changed {formatShortDate(l.meta.modifiedTime.slice(0, 10))}{l.meta.modifiedBy ? ` by ${l.meta.modifiedBy}` : ""}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No sheets or files yet.{canEdit ? " Add the media plan, workbook, calendar or clarity sheet by pasting its link." : ""}</p>
      )}
    </section>
  );
}
