// Search everything you can see (Stage 9b.4): tasks, clients, projects, people, leads and creatives.
import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { formatDateTime } from "@/lib/format";
import type { SearchHit, SearchResults } from "@/services/search";

export const metadata: Metadata = { title: "Search" };

const GROUPS: Array<[keyof Omit<SearchResults, "query" | "total">, string]> = [
  ["tasks", "Tasks"],
  ["clients", "Clients"],
  ["projects", "Projects"],
  ["leads", "Leads"],
  ["creatives", "Creatives"],
  ["people", "People"],
  ["docs", "Docs"],
];

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <>
      <PageHeader title="Search" description="Tasks, clients, projects, leads, creatives, docs, chat messages and people you can open." />
      <Suspense fallback={<LoadingRows rows={6} columns={2} label="Searching" />}>
        <SearchBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function SearchBody({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  return (
    <>
      <form role="search" className="mb-5 flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search everything</span>
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input key={q} name="q" type="search" defaultValue={q} autoFocus placeholder="A task, client, lead, person…" className="h-9 pl-8" />
        </label>
        <Button type="submit" size="sm" className="h-9">
          Search
        </Button>
      </form>
      <Results q={q} />
    </>
  );
}

function Hits({ hits }: { hits: SearchHit[] }) {
  return (
    <ul className="divide-y">
      {hits.map((h) => (
        <li key={h.id}>
          <Link href={h.href as Route} className="block px-4 py-2.5 hover:bg-hover">
            <span className="block truncate text-sm font-medium">{h.title}</span>
            <span className="block truncate text-xs text-muted-foreground">{h.detail}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function Results({ q }: { q: string }) {
  const actor = await requireActor();
  if (q.trim().length < 2) return <p className="text-sm text-muted-foreground">Type at least two letters. Tip: press / anywhere to jump to the search box.</p>;
  const [r, messages] = await Promise.all([getServices().search.search(actor, q), getServices().chat.search(actor, q.trim())]);
  if (!r.ok) return <ErrorState error={r.error} />;
  const messageHits: SearchHit[] = messages.map((m) => ({ id: m.id, title: m.body || (m.file?.name ?? "File"), detail: `${m.channelName} · ${m.authorName} · ${formatDateTime(m.createdAt)}`, href: `/chat/${m.channelId}` }));
  if (r.value.total === 0 && !messageHits.length) return <EmptyState icon={Search} title={`Nothing matches "${r.value.query}"`} description="Try fewer or different words." />;
  return (
    <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      {GROUPS.filter(([k]) => r.value[k].length).map(([k, label]) => (
        <Card key={k}>
          <CardHeader>
            <CardTitle>{label}</CardTitle>
            {k === "tasks" && r.value.tasks.length >= 8 ? (
              <Link href={`/tasks?status=all&q=${encodeURIComponent(r.value.query)}` as Route} className="text-xs text-primary hover:underline">
                All matching tasks
              </Link>
            ) : null}
          </CardHeader>
          <CardContent className="p-0">
            <Hits hits={r.value[k]} />
          </CardContent>
        </Card>
      ))}
      {messageHits.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Chat messages</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Hits hits={messageHits} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
