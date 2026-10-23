// The client knowledge base on the client page (Stage 11.2): tone, do's and don'ts, brand kit and SOPs, Docs pages
// and past campaigns, for everyone who works on the client.
import type { Route } from "next";
import Link from "next/link";
import { BookOpen, FileText, Link2, Pencil } from "lucide-react";
import { ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { KNOWLEDGE_FILE_KIND_LABELS } from "@/lib/types";
import { points } from "@/services/rules/knowledge";
import type { KnowledgeFile } from "@/services/knowledge";

export async function KnowledgeCard({ clientId }: { clientId: string }) {
  const actor = await requireActor();
  const r = await getServices().knowledge.forClient(actor, clientId);
  if (!r.ok) return <ErrorState error={r.error} />;
  const { knowledge: k, campaigns, files, docs, canEdit } = r.value;
  const dos = points(k.dos);
  const donts = points(k.donts);
  const empty = !k.tone && !dos.length && !donts.length && !files.length && !docs.length && !campaigns.length;
  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 shadow-card" aria-label="Knowledge base">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <BookOpen className="size-4 text-muted-foreground" /> Knowledge base
        </h2>
        {canEdit ? (
          <Button size="sm" variant="outline" className="ml-auto" asChild>
            <Link href={`/clients/${clientId}/knowledge` as Route}>
              <Pencil /> Edit
            </Link>
          </Button>
        ) : null}
      </div>
      {empty ? (
        <p className="text-sm text-muted-foreground">
          Nothing kept yet.{canEdit ? " Add the tone of voice, do's and don'ts, brand kit, SOPs and what worked in past campaigns." : " A strategist adds the brand kit, tone of voice and do's and don'ts here."}
        </p>
      ) : null}
      {k.tone ? (
        <div>
          <h3 className="text-xs text-muted-foreground">Tone of voice</h3>
          <p className="text-sm break-words whitespace-pre-wrap">{k.tone}</p>
        </div>
      ) : null}
      {dos.length || donts.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Points title="Do" items={dos} />
          <Points title="Don't" items={donts} />
        </div>
      ) : null}
      {files.length || docs.length ? (
        <div>
          <h3 className="mb-1 text-xs text-muted-foreground">Brand kit, SOPs and pages</h3>
          <ul className="divide-y rounded-md border">
            {files.map((f) => (
              <FileItem key={f.id} f={f} />
            ))}
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <Link href={`/docs/${d.id}` as Route} className="min-w-0 flex-1 truncate font-medium hover:underline">
                  {d.title}
                </Link>
                <Badge>Docs</Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {campaigns.length ? (
        <div>
          <h3 className="mb-1 text-xs text-muted-foreground">Past campaigns</h3>
          <ul className="divide-y">
            {campaigns.map((c) => (
              <li key={c.id} className="space-y-0.5 py-2.5 text-sm first:pt-0 last:pb-0">
                <p className="font-medium">
                  {c.name}
                  {c.period ? <span className="font-normal text-muted-foreground"> · {c.period}</span> : null}
                </p>
                <p className="break-words whitespace-pre-wrap">
                  <span className="text-success">Worked: </span>
                  {c.whatWorked}
                </p>
                {c.whatToAvoid ? (
                  <p className="break-words whitespace-pre-wrap">
                    <span className="text-danger">Avoid: </span>
                    {c.whatToAvoid}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Points({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-xs text-muted-foreground">{title}</h3>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
        {items.map((x, i) => (
          <li key={i} className="break-words">
            {x}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FileItem({ f, children }: { f: KnowledgeFile; children?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5 px-3 py-2 text-sm">
      {f.isLink ? <Link2 className="size-4 shrink-0 text-muted-foreground" /> : <FileText className="size-4 shrink-0 text-muted-foreground" />}
      <a href={`/api/client-files/${f.id}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-medium hover:underline">
        {f.title}
      </a>
      <Badge tone={f.kind === "brand" ? "brand" : "neutral"}>{KNOWLEDGE_FILE_KIND_LABELS[f.kind]}</Badge>
      {children}
    </li>
  );
}
