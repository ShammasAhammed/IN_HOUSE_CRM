// Template gallery (Stage 13.6): board and page templates (approved and built-in first), search, tags, most used and
// newest, and presets. A template opens to a preview with "Use template".
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LayoutTemplate, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { cn } from "@/lib/utils";
import type { GalleryItem } from "@/services/gallery";
import { PresetForm, RemovePreset } from "./template-forms";

export const metadata: Metadata = { title: "Templates" };

const TABS = [
  { id: "board", label: "Boards" },
  { id: "page", label: "Pages" },
  { id: "presets", label: "Presets" },
  { id: "kits", label: "Space kits" },
] as const;

export default function TemplatesPage({ searchParams }: PageProps<"/templates">) {
  return (
    <>
      <PageHeader title="Templates" description="The team's best boards and pages, ready to reuse. Approved ones come first. Save any board or page as a template from its page." />
      <Suspense fallback={<LoadingRows rows={4} columns={3} label="Loading templates" />}>
        <Gallery searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const templateHref = (key: string) => `/templates/${encodeURIComponent(key)}` as Route;

function TemplateTile({ t }: { t: GalleryItem }) {
  return (
    <Link href={templateHref(t.key)} className="flex flex-col overflow-hidden rounded-lg border bg-card shadow-card hover:border-primary">
      <div className="flex h-32 items-center justify-center overflow-hidden border-b bg-subtle">
        {t.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element -- a small data URL made in the browser
          <img src={t.thumbnail} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <p className="line-clamp-4 px-3 text-xs text-muted-foreground">{t.preview || t.description || "Blank"}</p>
        )}
      </div>
      <div className="space-y-1 p-3">
        <p className="truncate text-sm font-medium">{t.name}</p>
        <div className="flex flex-wrap items-center gap-1">
          {t.approved ? <Badge tone="success">Approved</Badge> : null}
          {t.builtIn ? <Badge tone="neutral">Built in</Badge> : null}
          {t.mine && t.scope === "mine" ? <Badge tone="info">Only me</Badge> : null}
          {!t.approved && t.scope === "company" ? <Badge tone="warning">Waiting for approval</Badge> : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {t.ownerName ?? ""}
          {t.uses ? ` · used ${t.uses} time${t.uses === 1 ? "" : "s"}` : ""}
          {t.tags.length ? ` · ${t.tags.map((x) => `#${x}`).join(" ")}` : ""}
        </p>
      </div>
    </Link>
  );
}

async function Gallery({ searchParams }: Pick<PageProps<"/templates">, "searchParams">) {
  const [actor, sp] = await Promise.all([requireActor(), searchParams]);
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const tab = TABS.find((t) => t.id === one("kind"))?.id ?? "board";
  const q = one("q").slice(0, 100);
  const tag = one("tag");
  const sort = one("sort") === "new" ? "new" : "used";
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ kind: tab, ...(q ? { q } : {}), ...(tag ? { tag } : {}), ...(sort === "new" ? { sort } : {}), ...patch });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    return `/templates?${p}` as Route;
  };
  const services = getServices();
  const nav = (
    <nav aria-label="Kind" className="flex flex-wrap gap-1">
      {TABS.map((t) => (
        <Link key={t.id} href={href({ kind: t.id, tag: "" })} aria-current={tab === t.id ? "page" : undefined} className={cn("rounded-md px-2.5 py-1.5 text-sm", tab === t.id ? "bg-accent font-medium text-primary" : "text-muted-foreground hover:bg-hover")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );

  if (tab === "kits") {
    // Stage 14.4: ready-made spaces. Built in and approved; the owner changes them on each kit's page.
    const kits = await services.spaceKits.list(actor);
    return (
      <div className="space-y-4">
        {nav}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {kits.map((k) => (
            <Link key={k.key} href={`/spaces/kits/${k.key}` as Route} className="space-y-1.5 rounded-lg border bg-card p-4 shadow-card hover:border-primary">
              <p className="text-sm font-medium">{k.name}</p>
              <div className="flex flex-wrap gap-1">
                <Badge tone="success">Approved</Badge>
                {k.private ? <Badge tone="warning">Private</Badge> : null}
              </div>
              <p className="text-xs text-muted-foreground">{k.description}</p>
              <p className="text-xs text-muted-foreground">
                {k.items.length} things{k.appliedTo.length ? ` · in ${k.appliedTo.map((a) => a.name).join(", ")}` : ""}
              </p>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  if (tab === "presets") {
    const { presets, canShare } = await services.gallery.presets(actor);
    return (
      <div className="space-y-4">
        {nav}
        <div className="grid gap-5 lg:grid-cols-[1fr_340px] [&>*]:min-w-0">
          <Card>
            <CardHeader>
              <CardTitle>Presets</CardTitle>
            </CardHeader>
            <CardContent>
              {presets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No presets yet. A client&apos;s brand colours (from its knowledge base) are always offered when you use a board template.</p>
              ) : (
                <ul className="divide-y">
                  {presets.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                      <span className="font-medium">{p.name}</span>
                      <Badge tone="neutral">{p.kind === "palette" ? "Palette" : p.kind === "sticky" ? "Sticky style" : "Layout"}</Badge>
                      {p.scope === "company" ? <Badge tone="info">Team</Badge> : null}
                      <span className="flex gap-1">
                        {[...(p.value.colours ?? []), ...(p.value.colour ? [p.value.colour] : []), ...(p.value.sectionColours ?? [])].map((c, i) => (
                          <span key={i} className="size-4 rounded border" style={{ backgroundColor: c }} title={c} />
                        ))}
                      </span>
                      {p.value.mindLayout ? <span className="text-xs text-muted-foreground">mind maps: {p.value.mindLayout}</span> : null}
                      {p.ownerId === actor.personId || canShare ? (
                        <span className="ml-auto">
                          <RemovePreset id={p.id} />
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>New preset</CardTitle>
            </CardHeader>
            <CardContent>
              <PresetForm canShare={canShare} />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const [list, tags] = await Promise.all([services.gallery.list(actor, { kind: tab, q, tag, sort }), services.gallery.tags(actor)]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {nav}
        <form action="/templates" className="flex min-w-0 flex-1 items-center gap-2" role="search">
          <input type="hidden" name="kind" value={tab} />
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Search templates" aria-label="Search templates" className="h-9 min-w-0" />
        </form>
        <nav aria-label="Order" className="flex gap-1 text-sm">
          <Link href={href({ sort: "" })} aria-current={sort === "used" ? "page" : undefined} className={cn("rounded-md px-2 py-1", sort === "used" ? "font-medium text-primary" : "text-muted-foreground")}>
            Most used
          </Link>
          <Link href={href({ sort: "new" })} aria-current={sort === "new" ? "page" : undefined} className={cn("rounded-md px-2 py-1", sort === "new" ? "font-medium text-primary" : "text-muted-foreground")}>
            New
          </Link>
        </nav>
      </div>
      {tags.length ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Tags">
          {tags.map((t) => (
            <Link key={t} href={href({ tag: tag === t ? "" : t })} aria-current={tag === t ? "true" : undefined} className={cn("rounded-full border px-2 py-0.5 text-xs", tag === t ? "border-primary bg-accent text-primary" : "text-muted-foreground hover:bg-hover")}>
              #{t}
            </Link>
          ))}
        </div>
      ) : null}
      {list.length === 0 ? (
        <EmptyState icon={LayoutTemplate} title={q || tag ? "No template matches" : "No templates yet"} description={q || tag ? "Try other words or another tag." : "Open a board or page and use “Save as template”."} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((t) => (
            <TemplateTile key={t.key} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}
