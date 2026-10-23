// One file (Stage 13.0): Google's own editor in a frame (it shows only for someone signed in to Google with access in
// this browser), always "Open in Google"; an uploaded artifact page in a sandboxed frame (scripts run, but with no
// access to Oppllo One: no same origin, no cookies, no top navigation), or as Markdown.
import type { Metadata, Route } from "next";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { MarkdownView } from "@/components/markdown-view";
import { ErrorState, LoadingRows } from "@/components/states";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "File" };

async function Body({ params }: Pick<PageProps<"/clients/[id]/files/[linkId]">, "params">) {
  const [actor, { id: clientId, linkId }] = await Promise.all([requireActor(), params]);
  const services = getServices();
  const page = await services.clientLinks.page(actor, clientId);
  if (!page.ok) return <ErrorState error={page.error} />;
  const l = page.value.links.find((x) => x.id === linkId);
  if (!l) return <ErrorState error={{ code: "not_found", message: "That file isn't here any more." }} />;
  const head = (
    <>
      <BackLink fallback={`/clients/${clientId}/files` as Route} label="Files & sheets" />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{l.title}</h1>
        {l.fileName ? null : (
          <a href={l.openUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <ExternalLink className="size-4" /> {l.googleId ? "Open in Google" : "Open"}
          </a>
        )}
      </div>
    </>
  );
  if (l.fileName) {
    const a = await services.clientLinks.artifact(actor, l.id);
    if (!a.ok) return <ErrorState error={a.error} />;
    return (
      <>
        {head}
        {a.value.format === "md" ? (
          <article className="rounded-lg border bg-card p-4 shadow-card">
            <MarkdownView source={a.value.content} />
          </article>
        ) : (
          <iframe title={l.title} srcDoc={a.value.content} sandbox="allow-scripts allow-popups" referrerPolicy="no-referrer" className="h-[75vh] w-full rounded-lg border bg-white" />
        )}
      </>
    );
  }
  return (
    <>
      {head}
      {l.frameUrl ? (
        <>
          <p className="text-xs text-muted-foreground">Google&apos;s editor shows here when you&apos;re signed in to Google with access to this file. If it stays blank or asks you to sign in, use Open in Google.</p>
          <iframe title={l.title} src={l.frameUrl} className="h-[75vh] w-full rounded-lg border bg-white" allow="clipboard-read; clipboard-write" />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">This one opens outside Oppllo One.</p>
      )}
    </>
  );
}

export default function FilePage({ params }: PageProps<"/clients/[id]/files/[linkId]">) {
  return (
    <div className="space-y-4">
      <Suspense fallback={<LoadingRows rows={3} columns={1} label="Loading the file" />}>
        <Body params={params} />
      </Suspense>
    </div>
  );
}
