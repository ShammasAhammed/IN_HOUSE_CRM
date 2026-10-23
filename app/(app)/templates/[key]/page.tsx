// One template (Stage 13.6): a preview, then "Use template" in a client, space or project.
import type { Metadata } from "next";
import { Suspense } from "react";
import { BackLink } from "@/components/back-link";
import { MarkdownView } from "@/components/markdown-view";
import { ErrorState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { boardItems } from "@/services/rules/boards";
import { ApproveTemplate, RemoveTemplate, UseTemplateForm } from "../template-forms";

export const metadata: Metadata = { title: "Template" };

export default function TemplateRoute({ params }: PageProps<"/templates/[key]">) {
  return (
    <Suspense fallback={<LoadingRows rows={6} columns={1} label="Loading the template" />}>
      <Template params={params} />
    </Suspense>
  );
}

async function Template({ params }: Pick<PageProps<"/templates/[key]">, "params">) {
  const actor = await requireActor();
  const key = decodeURIComponent((await params).key);
  const services = getServices();
  const r = await services.gallery.get(actor, key);
  if (!r.ok) return <ErrorState error={r.error} />;
  const t = r.value;
  const [places, projects, presets] = await Promise.all([services.boards.whereCanCreate(actor), services.projects.list(actor, {}), services.gallery.presets(actor)]);
  const { items, frames } = t.kind === "board" ? boardItems(t.elements ?? []) : { items: [], frames: [] };
  return (
    <div className="space-y-4">
      <BackLink fallback="/templates" />
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t.name}</h1>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge tone="neutral">{t.kind === "board" ? "Board" : "Page"}</Badge>
          {t.approved ? <Badge tone="success">Approved</Badge> : t.scope === "company" ? <Badge tone="warning">Waiting for approval</Badge> : <Badge tone="info">Only me</Badge>}
          {t.ownerName ? <span>by {t.ownerName}</span> : null}
          {t.uses ? <span>· used {t.uses} times</span> : null}
          {t.tags.map((x) => (
            <span key={x}>#{x}</span>
          ))}
        </div>
        {t.description ? <p className="text-sm text-muted-foreground">{t.description}</p> : null}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px] [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {t.kind === "board" ? (
              <>
                {t.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a small data URL made in the browser
                  <img src={t.thumbnail} alt={`Picture of ${t.name}`} className="max-h-96 w-full rounded-md border object-contain" />
                ) : null}
                {frames.length ? <p className="text-sm">Frames: {frames.map((f) => f.name).join(" · ")}</p> : null}
                <ul className="grid gap-1 text-sm sm:grid-cols-2">
                  {items.slice(0, 40).map((i) => (
                    <li key={i.id} className="truncate rounded-md border px-2 py-1" style={i.colour ? { backgroundColor: i.colour } : undefined}>
                      {i.text || "(empty)"}
                    </li>
                  ))}
                </ul>
                {items.length === 0 ? <p className="text-sm text-muted-foreground">An empty canvas.</p> : null}
              </>
            ) : (
              <>
                <MarkdownView source={t.body ?? ""} table={(id) => <p className="text-xs text-muted-foreground">Table: {t.tables?.find((x) => x.id === id)?.columns.map((c) => c.name).join(", ") ?? "columns"}</p>} />
              </>
            )}
          </CardContent>
        </Card>
        <aside className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Use template</CardTitle>
            </CardHeader>
            <CardContent>
              <UseTemplateForm templateKey={t.key} kind={t.kind} places={places} projects={projects.ok ? projects.value.map((p) => ({ id: p.id, name: p.name, clientId: p.clientId })) : []} presets={presets.presets.map((p) => ({ id: p.id, kind: p.kind, name: p.name }))} defaultTitle={t.name} />
            </CardContent>
          </Card>
          {t.canApprove ? <ApproveTemplate id={t.key} approved={t.approved} /> : null}
          {t.canRemove ? <RemoveTemplate id={t.key} /> : null}
        </aside>
      </div>
    </div>
  );
}
