import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import type { AuditQuery } from "@/services/audit";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditPage({ searchParams }: PageProps<"/settings/audit">) {
  return (
    <Suspense fallback={<LoadingRows rows={8} columns={3} label="Loading the audit log" />}>
      <Audit searchParams={searchParams} />
    </Suspense>
  );
}

const words = (type: string) => type.replace(/_/g, " ");

function href(q: AuditQuery, page: number): Route {
  const p = new URLSearchParams();
  for (const k of ["person", "type", "client", "from", "to"] as const) if (q[k]) p.set(k, q[k]);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return `/settings/audit${s ? `?${s}` : ""}` as Route;
}

async function Audit({ searchParams }: Pick<PageProps<"/settings/audit">, "searchParams">) {
  const actor = await requireActor();
  const r = await getServices().audit.list(actor, await searchParams);
  if (!r.ok) return <ErrorState error={r.error} />;
  const { rows, query: q, hasMore, options } = r.value;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Every change anyone made in Oppllo One, newest first. Nothing here can be edited or removed.</p>
      <form method="get" className="grid gap-3 rounded-lg border bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="a-person">Person</Label>
          <Select id="a-person" name="person" defaultValue={q.person}>
            <option value="">Everyone</option>
            {options.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="a-type">About</Label>
          <Select id="a-type" name="type" defaultValue={q.type}>
            <option value="">Anything</option>
            {options.types.map((t) => (
              <option key={t} value={t}>
                {words(t)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="a-client">Client</Label>
          <Select id="a-client" name="client" defaultValue={q.client}>
            <option value="">Any client</option>
            {options.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="a-from">From</Label>
          <Input id="a-from" name="from" type="date" defaultValue={q.from} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="a-to">To</Label>
          <Input id="a-to" name="to" type="date" defaultValue={q.to} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm">
            Show
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/settings/audit">Clear</Link>
          </Button>
        </div>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="Nothing found" description="No changes match these filters." />
      ) : (
        <ol className="divide-y rounded-lg border bg-card shadow-card">
          {rows.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <span className="tabular w-36 shrink-0 text-xs text-muted-foreground">{formatDateTime(e.occurredAt)}</span>
              <span className="min-w-0 flex-1 basis-60">
                <span className="font-medium">{e.actorName ?? "Oppllo One"}</span> {e.text}
                {e.clientName ? <span className="text-muted-foreground"> · {e.clientName}</span> : null}
              </span>
              <Badge title={e.action}>{words(e.entityType)}</Badge>
            </li>
          ))}
        </ol>
      )}
      <nav aria-label="Pages" className="flex items-center justify-between text-sm">
        {q.page > 1 ? <Link href={href(q, q.page - 1)} className="text-primary hover:underline">← Newer</Link> : <span />}
        <span className="text-xs text-muted-foreground">Page {q.page}</span>
        {hasMore ? <Link href={href(q, q.page + 1)} className="text-primary hover:underline">Older →</Link> : <span />}
      </nav>
    </div>
  );
}
