import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows, SuccessNotice } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { forbidden } from "@/lib/result";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { FileItem } from "../knowledge-card";
import { CampaignForm, FileForm, KnowledgeForm, RemoveCampaign, RemoveFile } from "./knowledge-forms";

export const metadata: Metadata = { title: "Knowledge base" };

export default function KnowledgePage({ params, searchParams }: PageProps<"/clients/[id]/knowledge">) {
  return (
    <Suspense fallback={<LoadingRows rows={6} columns={2} label="Loading the knowledge base" />}>
      <Knowledge params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Knowledge({ params, searchParams }: Pick<PageProps<"/clients/[id]/knowledge">, "params" | "searchParams">) {
  const actor = await requireActor();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const services = getServices();
  const [client, r] = await Promise.all([services.clients.page(actor, id), services.knowledge.forClient(actor, id)]);
  if (!client.ok) return <ErrorState error={client.error} />;
  if (!r.ok) return <ErrorState error={r.error} />;
  if (!r.value.canEdit) return <ErrorState error={forbidden("The knowledge base is kept by strategists and the owner.").error} />;
  const { knowledge: k, campaigns, files, docs } = r.value;
  const name = client.value.client.name;
  return (
    <div className="space-y-5">
      <Link href={`/clients/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> {name}
      </Link>
      <PageHeader
        title="Knowledge base"
        description={k.updatedAt ? `${name}. Tone and do's last saved ${formatDateTime(k.updatedAt)}${k.updatedByName ? ` by ${k.updatedByName}` : ""}.` : `${name}: what the team and the AI need to work on this client.`}
      />
      {query.done === "saved" ? <SuccessNotice>Saved.</SuccessNotice> : null}
      <Card>
        <CardHeader>
          <CardTitle>Tone and do&apos;s and don&apos;ts</CardTitle>
        </CardHeader>
        <CardContent>
          <KnowledgeForm key={k.version} clientId={id} version={k.version} initial={{ tone: k.tone, dos: k.dos, donts: k.donts, brandColours: k.brandColours.join(", ") }} />
        </CardContent>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>Brand kit, SOPs and pages</CardTitle>
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/docs/new?client=${id}` as Route}>
                <Plus /> New page in Docs
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {files.length || docs.length ? (
              <ul className="divide-y rounded-md border">
                {files.map((f) => (
                  <FileItem key={f.id} f={f}>
                    <RemoveFile fileId={f.id} title={f.title} />
                  </FileItem>
                ))}
                {docs.map((d) => (
                  <li key={d.id} className="px-3 py-2 text-sm">
                    <Link href={`/docs/${d.id}` as Route} className="font-medium hover:underline">
                      {d.title}
                    </Link>
                    <span className="text-xs text-muted-foreground"> · in Docs</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No files or links yet.</p>
            )}
            <FileForm clientId={id} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Past campaigns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {campaigns.length ? (
              <ul className="divide-y">
                {campaigns.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 py-2.5 text-sm first:pt-0">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {c.name}
                        {c.period ? <span className="font-normal text-muted-foreground"> · {c.period}</span> : null}
                      </p>
                      <p className="break-words whitespace-pre-wrap text-muted-foreground">{c.whatWorked}</p>
                    </div>
                    <RemoveCampaign campaignId={c.id} name={c.name} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None yet. Note what worked, so the next campaign starts from it.</p>
            )}
            <CampaignForm clientId={id} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
