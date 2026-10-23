// A client's or space's sheets, Google files and artifact pages (Stage 13.0). Google stays the editor.
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ExternalLink, FileSpreadsheet } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { CopyButton } from "@/components/copy-button";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { formatShortDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { AddLink, LinkSettings, UploadArtifact } from "./forms";

export const metadata: Metadata = { title: "Files & sheets" };

async function Body({ params }: Pick<PageProps<"/clients/[id]/files">, "params">) {
  const [actor, { id: clientId }] = await Promise.all([requireActor(), params]);
  const services = getServices();
  const r = await services.clientLinks.page(actor, clientId);
  if (!r.ok) return <ErrorState error={r.error} />;
  const { links, canEdit, canSetUp, google } = r.value;
  const summaries = await Promise.all(links.map((l) => (l.summary.length ? services.clientLinks.summary(actor, l.id) : null)));
  return (
    <div className="space-y-4">
      <BackLink fallback={`/clients/${clientId}` as Route} label="Client" />
      {google.connected ? null : (
        <p className="rounded-md bg-subtle px-3 py-2 text-sm text-muted-foreground">Google isn&apos;t connected yet: links open as usual, but Oppllo One can&apos;t read them (docs/google-drive.md).</p>
      )}
      {canEdit ? (
        <section className="space-y-3 rounded-lg border bg-card p-4 shadow-card">
          <h2 className="text-sm font-semibold">Add a file</h2>
          <AddLink clientId={clientId} />
          <p className="text-xs text-muted-foreground">Or upload a Claude artifact page (.html or .md, up to 3.5 MB): it opens here in a closed-off frame.</p>
          <UploadArtifact clientId={clientId} />
        </section>
      ) : null}
      {links.length ? (
        <ul className="space-y-3">
          {links.map((l, i) => {
            const s = summaries[i];
            return (
              <li key={l.id} className="space-y-2 rounded-lg border bg-card p-4 shadow-card">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/clients/${clientId}/files/${l.id}` as Route} className="min-w-0 flex-1 truncate font-medium hover:underline">
                    {l.title}
                  </Link>
                  <Badge>{l.kindLabel}</Badge>
                  {l.aiReadable ? null : <Badge tone="neutral">AI may not read</Badge>}
                  <a href={l.openUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <ExternalLink className="size-3.5" /> {l.googleId ? "Open in Google" : "Open"}
                  </a>
                </div>
                <p className="text-xs text-muted-foreground">
                  {l.meta?.modifiedTime ? `Changed ${formatShortDate(l.meta.modifiedTime.slice(0, 10))}${l.meta.modifiedBy ? ` by ${l.meta.modifiedBy}` : ""}` : l.fileName ? `Uploaded page · ${l.fileName}` : l.googleId ? "Google file · not read yet" : "Link"}
                  {l.meta?.tabs?.length ? ` · tabs: ${l.meta.tabs.map((t) => t.title).join(", ")}` : ""}
                </p>
                {l.problem ? (
                  <p className="flex flex-wrap items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
                    {l.problem}
                    {google.serviceAccountEmail && l.meta?.reason === "not_shared" ? <CopyButton text={google.serviceAccountEmail} label="Copy the address" /> : null}
                  </p>
                ) : null}
                {s?.ok && s.value.length ? (
                  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {s.value.map((x) => (
                      <div key={x.label} className="rounded-md bg-subtle px-2 py-1.5">
                        <dt className="text-xs text-muted-foreground">{x.label}</dt>
                        <dd className={x.value ? "tabular text-sm font-semibold" : "text-xs text-warning"}>{x.value ?? x.problem}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {canEdit ? <LinkSettings link={l} canSetUp={canSetUp} /> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={FileSpreadsheet} title="No sheets or files yet" description={canEdit ? "Paste the media plan, workbook, calendar or clarity sheet link above." : "A strategist adds the client's sheets here."} />
      )}
    </div>
  );
}

export default function FilesPage({ params }: PageProps<"/clients/[id]/files">) {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Files &amp; sheets</h1>
        <p className="text-sm text-muted-foreground">The Google files and pages the team works in. Google stays the editor; Oppllo One reads them for the AI, the MCP and summaries.</p>
      </div>
      <Suspense fallback={<LoadingRows rows={4} columns={2} label="Loading files" />}>
        <Body params={params} />
      </Suspense>
    </div>
  );
}
