// One doc (Stage 9b.5): read it, edit it, see who changed what, bring an old version back.
import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { MarkdownView } from "@/components/markdown-view";
import { ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { can } from "@/services/permissions";
import { ArchiveDoc, RestoreVersion, TrainingToggle } from "../doc-forms";
import { DocTableBlock } from "../doc-table";
import { DocComments } from "./doc-comments";
import { DocEditor } from "./doc-editor";
import { MeetingPanel } from "./meeting-panel";
import { SaveAsTemplate } from "../../templates/template-forms";

export const metadata: Metadata = { title: "Doc" };

export default function DocRoute({ params }: PageProps<"/docs/[id]">) {
  return (
    <Suspense fallback={<LoadingRows rows={8} columns={1} label="Loading the page" />}>
      <Doc params={params} />
    </Suspense>
  );
}

async function Doc({ params }: Pick<PageProps<"/docs/[id]">, "params">) {
  const actor = await requireActor();
  const { id } = await params;
  const services = getServices();
  const [r, versions, departments] = await Promise.all([services.docs.get(actor, id), services.docs.versions(actor, id), services.people.departments(actor)]);
  if (!r.ok) return <ErrorState error={r.error} />;
  const d = r.value;
  // Task and client @mentions show what this viewer may open ("No access" otherwise).
  const [chips, comments, mentionable, meeting] = await Promise.all([services.docs.chips(actor, d.body), services.docs.comments(actor, d.id), services.docs.mentionable(actor, d.id), services.meetings.forDoc(actor, d.id)]);
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_280px] [&>*]:min-w-0">
      <div className="space-y-4">
        <nav aria-label="Where this page is" className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <Link href="/docs" className="hover:text-foreground">
            Docs
          </Link>
          {d.clientName ? (
            <>
              <ChevronRight className="size-3.5" /> <span>{d.clientName}</span>
            </>
          ) : null}
          {d.crumbs.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1">
              <ChevronRight className="size-3.5" />
              <Link href={`/docs/${c.id}` as Route} className="hover:text-foreground">
                {c.title}
              </Link>
            </span>
          ))}
        </nav>
        <h1 className="text-xl font-semibold tracking-tight">{d.title}</h1>
        <p className="text-xs text-muted-foreground">
          Version {d.version}
          {d.updatedByName ? ` · ${d.updatedByName}` : ""} · {formatDateTime(new Date(d.updatedAt))}
        </p>
        <Card>
          <CardContent className="pt-4">
            <MarkdownView source={d.body} chips={chips} table={(tableId) => <DocTableBlock tableId={tableId} />} />
          </CardContent>
        </Card>
        <DocEditor doc={{ id: d.id, title: d.title, body: d.body, version: d.version }} />
      </div>
      <aside className="space-y-5">
        {meeting ? <MeetingPanel actor={actor} meeting={meeting} /> : null}
        <Card>
          <CardHeader>
            <CardTitle>Comments</CardTitle>
          </CardHeader>
          <CardContent>
            <DocComments docId={d.id} comments={comments.ok ? JSON.parse(JSON.stringify(comments.value)) : []} people={mentionable} canComment />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pages under it</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {d.children.length ? (
              <ul className="space-y-1 text-sm">
                {d.children.map((c) => (
                  <li key={c.id}>
                    <Link href={`/docs/${c.id}` as Route} className="hover:underline">
                      {c.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link href={`/docs/new?parent=${d.id}` as Route}>
                <Plus /> Add a page under it
              </Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Template</CardTitle>
          </CardHeader>
          <CardContent>
            <SaveAsTemplate target={{ docId: d.id }} defaultName={d.title} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent>
            {versions.ok && versions.value.length ? (
              <ul className="space-y-2 text-xs">
                {versions.value.map((v) => (
                  <li key={v.version} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-muted-foreground">
                      v{v.version} · {v.editedByName ?? "Someone"} · {formatDateTime(new Date(v.createdAt))}
                    </span>
                    {v.version !== d.version ? <RestoreVersion docId={d.id} version={v.version} /> : <span className="text-muted-foreground">Now</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No history yet.</p>
            )}
          </CardContent>
        </Card>
        {!d.clientId && (can(actor, "people.write") || can(actor, "projects.write")) ? (
          <Card>
            <CardHeader>
              <CardTitle>Training</CardTitle>
            </CardHeader>
            <CardContent>
              <TrainingToggle docId={d.id} training={d.training} departmentId={d.departmentId} departments={departments.ok ? departments.value.map((x) => ({ id: x.id, name: x.name })) : []} />
            </CardContent>
          </Card>
        ) : null}
        {d.canDelete ? <ArchiveDoc docId={d.id} /> : null}
      </aside>
    </div>
  );
}
