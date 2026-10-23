// Docs and wiki (Stage 9b.5): team pages and client pages, nested, searchable.
import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookOpen, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import type { DocTreeNode } from "@/services/docs";

export const metadata: Metadata = { title: "Docs" };

export default function DocsPage({ searchParams }: PageProps<"/docs">) {
  return (
    <>
      <PageHeader
        title="Docs"
        description="How we work (SOPs, checklists, playbooks) and notes for each client. Everyone can edit; every version is kept."
        actions={
          <Button asChild size="sm">
            <Link href="/docs/new">
              <Plus /> New page
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<LoadingRows rows={6} columns={1} label="Loading docs" />}>
        <Docs searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function Tree({ nodes, depth = 0 }: { nodes: DocTreeNode[]; depth?: number }) {
  return (
    <ul className={depth ? "ml-4 border-l pl-3" : "divide-y"}>
      {nodes.map((n) => (
        <li key={n.id} className={depth ? "py-1" : "py-2"}>
          <Link href={`/docs/${n.id}` as Route} className="block rounded px-2 py-1 hover:bg-hover">
            <span className="block truncate text-sm font-medium">{n.title}</span>
            {depth === 0 ? (
              <span className="block truncate text-xs text-muted-foreground">
                {n.clientName ?? "Team"} · {n.updatedByName ? `${n.updatedByName}, ` : ""}
                {formatDateTime(new Date(n.updatedAt))}
              </span>
            ) : null}
          </Link>
          {n.children.length ? <Tree nodes={n.children} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  );
}

async function Docs({ searchParams }: { searchParams: PageProps<"/docs">["searchParams"] }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const { nodes, search } = await getServices().docs.tree(actor, { search: q });
  return (
    <div className="space-y-4">
      <form role="search" className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search docs</span>
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input key={q} name="q" type="search" defaultValue={q} placeholder="Search titles and text" className="h-9 pl-8" />
        </label>
        <Button type="submit" size="sm" variant="outline" className="h-9">
          Search
        </Button>
      </form>
      {nodes.length === 0 ? (
        <EmptyState icon={BookOpen} title={search ? `No page mentions "${search}"` : "No pages yet"} description={search ? "Try other words." : "Start with how your team does its most common job: a reel, an ad launch, a client onboarding."} />
      ) : (
        <div className="rounded-lg border bg-card px-2 shadow-card">
          <Tree nodes={nodes} />
        </div>
      )}
    </div>
  );
}
