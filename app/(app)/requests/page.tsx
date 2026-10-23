// Requests (Stage 9b.5): the forms to ask the team for work; leads set them up here.
import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Globe, Inbox, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { can } from "@/services/permissions";

export const metadata: Metadata = { title: "Requests" };

export default function RequestsPage() {
  return (
    <Suspense fallback={<LoadingRows rows={4} columns={2} label="Loading forms" />}>
      <Requests />
    </Suspense>
  );
}

async function Requests() {
  const actor = await requireActor();
  const { forms, canManage } = await getServices().requestForms.list(actor);
  return (
    <>
      <PageHeader
        title="Requests"
        description="Ask the team for work. Each request becomes a task for the right person."
        actions={
          can(actor, "projects.write") ? (
            <Button asChild size="sm">
              <Link href="/requests/new">
                <Plus /> New form
              </Link>
            </Button>
          ) : null
        }
      />
      {forms.length === 0 ? (
        <EmptyState icon={Inbox} title="No request forms yet" description={canManage ? "Create one: a design request, an ad change, a content brief…" : "Your leads haven't set one up yet."} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {forms.map((f) => (
            <li key={f.id}>
              <Link href={`/requests/${f.id}` as Route} className="block h-full rounded-lg border bg-card p-4 shadow-card hover:bg-hover">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{f.name}</p>
                  {!f.active ? <Badge tone="neutral">Closed</Badge> : null}
                  {f.publicSlug ? (
                    <Badge tone="info">
                      <Globe className="size-3" /> Public link
                    </Badge>
                  ) : null}
                </div>
                {f.description ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{f.description}</p> : null}
                {f.canManage ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {f.clientName} · {f.projectName} · {f.submissions} {f.submissions === 1 ? "request" : "requests"}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
