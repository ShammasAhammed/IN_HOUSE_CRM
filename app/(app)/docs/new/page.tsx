import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { LoadingRows } from "@/components/states";
import { isId } from "@/lib/id";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { NewDocForm } from "../doc-forms";

export const metadata: Metadata = { title: "New page" };

export default function NewDocPage({ searchParams }: PageProps<"/docs/new">) {
  return (
    <Suspense fallback={<LoadingRows rows={4} columns={1} label="Loading" />}>
      <NewDoc searchParams={searchParams} />
    </Suspense>
  );
}

async function NewDoc({ searchParams }: { searchParams: PageProps<"/docs/new">["searchParams"] }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const parent = typeof sp.parent === "string" && isId(sp.parent) ? await getServices().docs.get(actor, sp.parent) : null;
  const projects = await getServices().projects.list(actor, {});
  const clients = projects.ok ? [...new Map(projects.value.map((p) => [p.clientId, { id: p.clientId, name: p.clientName }])).values()].sort((a, b) => a.name.localeCompare(b.name)) : [];
  const clientId = typeof sp.client === "string" && clients.some((c) => c.id === sp.client) ? sp.client : "";
  return (
    <div className="max-w-3xl space-y-4">
      <BackLink fallback="/docs" />
      <PageHeader title="New page" description={parent?.ok ? `Under "${parent.value.title}"` : undefined} />
      <p className="text-sm text-muted-foreground">
        More page templates, saved by the team, are in the{" "}
        <Link href="/templates?kind=page" className="text-primary hover:underline">
          template gallery
        </Link>
        .
      </p>
      <NewDocForm parentId={parent?.ok ? parent.value.id : null} clients={clients} clientId={clientId} {...(typeof sp.template === "string" ? { template: sp.template } : {})} />
    </div>
  );
}
