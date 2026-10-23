// The swipe file (Stage 13.2): every saved reference — links, YouTube, Instagram/Facebook embeds, screenshots and the
// team's videos — across the clients and spaces you can see, with notes and tags, searchable, and "Add to board".
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Bookmark, ExternalLink, Search } from "lucide-react";
import { EmptyState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { SWIPE_KIND_LABELS, SWIPE_KINDS } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { SwipeView } from "@/services/swipe";
import { AddFile, AddLink, SwipeItemTools } from "./swipe-forms";

export const metadata: Metadata = { title: "Swipe file" };

export default function SwipePage({ searchParams }: PageProps<"/swipe">) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Swipe file</h1>
        <p className="text-sm text-muted-foreground">Ads, reels, pages and screenshots worth learning from, with why. Links and official embeds only: other people&apos;s videos are never downloaded.</p>
      </div>
      <Suspense fallback={<LoadingRows rows={4} columns={3} label="Loading the swipe file" />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Body({ searchParams }: Pick<PageProps<"/swipe">, "searchParams">) {
  const [actor, sp] = await Promise.all([requireActor(), searchParams]);
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const f = { clientId: one("client"), q: one("q"), tag: one("tag"), kind: one("type"), savedBy: one("by"), from: one("from"), to: one("to") };
  const services = getServices();
  const [r, lib, places] = await Promise.all([services.swipe.search(actor, f), services.boards.library(actor), services.swipe.places(actor)]);
  if (!r.ok) return null;
  const { items, tags, savers, clients } = r.value;
  const boards = lib.ok ? lib.value.boards.filter((b) => b.level === "edit" || b.level === "manage").map((b) => ({ id: b.id, title: b.title, clientName: b.clientName })) : [];
  const focus = one("item");
  const filtered = Object.values(f).some(Boolean);
  return (
    <div className="space-y-4">
      <details className="rounded-lg border bg-card p-4 shadow-card" open={!items.length && !filtered}>
        <summary className="cursor-pointer text-sm font-semibold">Save a reference</summary>
        <div className="space-y-4 pt-3">
          <AddLink places={places} clientId={f.clientId} boards={boards} />
          <div className="border-t pt-3">
            <AddFile places={places} videoOk={services.swipe.videoUploads()} />
          </div>
        </div>
      </details>
      <form action="/swipe" className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4" role="search">
        <label className="flex items-center gap-2 sm:col-span-2">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input name="q" defaultValue={f.q} placeholder="Search titles, notes, tags, sites" aria-label="Search the swipe file" className="h-9" />
        </label>
        <Select name="client" defaultValue={f.clientId} aria-label="Client or space" className="h-9">
          <option value="">Every client and space</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.isSpace ? `Space: ${c.name}` : c.name}
            </option>
          ))}
        </Select>
        <Select name="type" defaultValue={f.kind} aria-label="Type" className="h-9">
          <option value="">Every type</option>
          {SWIPE_KINDS.map((k) => (
            <option key={k} value={k}>
              {SWIPE_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
        <Select name="tag" defaultValue={f.tag} aria-label="Tag" className="h-9">
          <option value="">Every tag</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </Select>
        <Select name="by" defaultValue={f.savedBy} aria-label="Saved by" className="h-9">
          <option value="">Saved by anyone</option>
          {savers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <span className="flex items-center gap-1">
          <Input type="date" name="from" defaultValue={f.from} aria-label="Saved from" className="h-9 min-w-0" />
          <Input type="date" name="to" defaultValue={f.to} aria-label="Saved until" className="h-9 min-w-0" />
        </span>
        <span className="flex items-center gap-2">
          <button type="submit" className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
            Filter
          </button>
          {filtered ? (
            <Link href={"/swipe" as Route} className="text-sm text-muted-foreground hover:text-foreground">
              Clear
            </Link>
          ) : null}
        </span>
      </form>
      {items.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <SwipeCard key={i.id} item={i} boards={boards} focus={i.id === focus} />
          ))}
        </ul>
      ) : (
        <EmptyState icon={Bookmark} title={filtered ? "Nothing matches" : "Nothing saved yet"} description={filtered ? "Try fewer filters." : "Save ads, reels and pages worth learning from: paste a link above, or share one from your phone."} />
      )}
    </div>
  );
}

function SwipeCard({ item: i, boards, focus }: { item: SwipeView; boards: Array<{ id: string; title: string; clientName: string }>; focus: boolean }) {
  return (
    <li id={`item-${i.id}`} className={cn("flex flex-col gap-2 overflow-hidden rounded-lg border bg-card p-3 shadow-card", focus && "ring-2 ring-primary")}>
      {i.embedUrl ? (
        <iframe src={i.embedUrl} title={i.title} loading="lazy" className="aspect-video w-full rounded-md border-0" allow="encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" />
      ) : i.embedHtml ? (
        <details className="rounded-md bg-subtle px-2 py-1.5 text-xs">
          <summary className="cursor-pointer">Show the {i.site} post here</summary>
          <iframe srcDoc={i.embedHtml} title={i.title} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" className="mt-2 h-96 w-full rounded-md border-0 bg-white" />
        </details>
      ) : i.kind === "image" && i.fileUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={i.fileUrl} alt={i.title} loading="lazy" className="max-h-56 w-full rounded-md bg-subtle object-contain" />
      ) : i.kind === "video" && i.fileUrl ? (
        <video src={i.fileUrl} controls preload="metadata" className="max-h-56 w-full rounded-md" />
      ) : i.imageUrl ? (
        // The page's own preview picture, from its site.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={i.imageUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="max-h-40 w-full rounded-md object-cover" />
      ) : null}
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium break-words">{i.title}</p>
        <Badge>{SWIPE_KIND_LABELS[i.kind]}</Badge>
      </div>
      {i.description ? <p className="line-clamp-2 text-xs text-muted-foreground">{i.description}</p> : null}
      {i.notes ? <p className="text-sm whitespace-pre-wrap">“{i.notes}”</p> : null}
      {i.tags.length ? (
        <p className="flex flex-wrap gap-1">
          {i.tags.map((t) => (
            <Link key={t} href={`/swipe?tag=${encodeURIComponent(t)}` as Route} className="rounded-full border px-2 py-0.5 text-xs text-primary hover:bg-hover">
              #{t}
            </Link>
          ))}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {i.clientName} · {i.createdByName ?? "Someone"} · {formatDateTime(i.createdAt)}
        {i.url ? (
          <>
            {" · "}
            <a href={i.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
              {i.kind === "instagram" ? "Open on Instagram" : i.kind === "facebook" ? "Open on Facebook" : (i.site ?? "Open")} <ExternalLink className="size-3" />
            </a>
          </>
        ) : null}
      </p>
      <SwipeItemTools item={i} boards={boards} />
    </li>
  );
}
