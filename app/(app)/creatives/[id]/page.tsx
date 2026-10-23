import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CheckCircle2, ExternalLink, FileText, History } from "lucide-react";
import { ApprovalBadge } from "@/components/approval-badge";
import { BackLink } from "@/components/back-link";
import { ErrorState, LoadingRows } from "@/components/states";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatFileSize, formatTimecode } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import type { AssetPage, VersionView } from "@/services/assets";
import { REVIEW_ACTION_PAST } from "@/services/rules/assets";
import { CommentForm, NewVersionForm, ReviewPanel } from "../creative-forms";

export const metadata: Metadata = { title: "Creative" };

export default function CreativePage({ params }: PageProps<"/creatives/[id]">) {
  return (
    <Suspense fallback={<LoadingRows rows={6} columns={2} label="Loading the creative" />}>
      <Creative params={params} />
    </Suspense>
  );
}

/** What waits, said plainly at the top. */
function nextStepText(p: AssetPage): string {
  const a = p.asset;
  switch (a.approvalState) {
    case "draft":
      return "Not sent for review yet.";
    case "internal_review":
      return a.clientIsInternal ? "Waiting for a strategist or the owner to approve it." : "Waiting for a strategist or the owner to check it before it goes to the client.";
    case "client_review":
      return "With the client. Record their answer here when it comes.";
    case "changes_requested":
      return "Changes asked: the next version goes back for review.";
    case "approved":
      return "";
  }
}

async function Creative({ params }: { params: PageProps<"/creatives/[id]">["params"] }) {
  const actor = await requireActor();
  const { id } = await params;
  const [r, assistant] = await Promise.all([getServices().assets.page(actor, id), getServices().myAssistant.status(actor)]);
  if (!r.ok) return <ErrorState error={r.error} />;
  const canDraft = assistant.prefs.drafts && !assistant.aiReason;
  const p = r.value;
  const a = p.asset;
  const [current, ...earlier] = p.versions;
  const approved = p.versions.find((v) => v.isApproved);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <BackLink fallback="/creatives" />
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              <Link href={`/clients/${a.clientId}`} className="hover:text-foreground hover:underline">
                {a.clientName}
              </Link>
              {a.projectName ? ` · ${a.projectName}` : ""}
              {a.taskId ? (
                <>
                  {" · "}
                  <Link href={`/tasks/${a.taskId}`} className="hover:text-foreground hover:underline">
                    {a.taskTitle}
                  </Link>
                </>
              ) : null}
            </p>
            <h1 className="text-xl font-semibold tracking-tight">{a.title}</h1>
          </div>
          <ApprovalBadge state={a.approvalState} />
        </div>
        {approved ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-success">
            <CheckCircle2 className="size-4" />
            {approved.version === a.currentVersion ? "" : `Version ${approved.version} is the approved one to publish · `}
            Approved by {a.approvedByName ?? "—"}
            {a.approvedAt ? ` on ${formatDateTime(a.approvedAt)}` : ""}
          </p>
        ) : null}
        {nextStepText(p) ? <p className="mt-1 text-sm text-muted-foreground">{nextStepText(p)}</p> : null}
      </div>

      {p.actions.length ? (
        <section className="rounded-lg border bg-card p-4 shadow-card" aria-label="Review">
          <ReviewPanel assetId={a.id} versionId={current!.id} actions={p.actions} />
        </section>
      ) : null}

      {current ? <VersionCard version={current} asset={p} current canDraft={canDraft} /> : <p className="text-sm text-muted-foreground">No version yet.</p>}

      {p.canMake ? <NewVersionForm assetId={a.id} next={a.currentVersion + 1} /> : null}

      {earlier.length ? (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <History className="size-4 text-muted-foreground" /> Earlier versions
          </h2>
          {earlier.map((v) => (
            <details key={v.id} className="rounded-lg border bg-card shadow-card" open={v.isApproved}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                <span className="font-medium">Version {v.version}</span>
                {v.isApproved ? <Badge tone="success">Approved</Badge> : null}
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(v.createdAt)}
                  {v.comments.length ? ` · ${v.comments.length} in the thread` : ""}
                </span>
              </summary>
              <div className="border-t p-4">
                <VersionBody version={v} asset={p} />
              </div>
            </details>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function VersionCard({ version: v, asset, current, canDraft = false }: { version: VersionView; asset: AssetPage; current?: boolean; canDraft?: boolean }) {
  return (
    <section className="rounded-lg border bg-card shadow-card" aria-label={`Version ${v.version}`}>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 text-sm">
        <span className="font-semibold">Version {v.version}</span>
        {current ? <span className="text-xs text-muted-foreground">latest</span> : null}
        {v.isApproved ? <Badge tone="success">Approved</Badge> : null}
      </div>
      <div className="p-4">
        <VersionBody version={v} asset={asset} canDraft={canDraft && v.comments.length > 0} />
      </div>
    </section>
  );
}

function VersionBody({ version: v, asset, canDraft = false }: { version: VersionView; asset: AssetPage; canDraft?: boolean }) {
  const image = !v.isLink && v.mimeType?.startsWith("image/");
  return (
    <div className="space-y-4">
      {image && v.link ? (
        <a href={v.link} target="_blank" rel="noopener" className="block">
          {/* The app's own short-lived link: next/image would cache it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={v.link} alt={`${asset.asset.title}, version ${v.version}`} className="mx-auto max-h-[60vh] w-auto rounded-md border bg-subtle object-contain" />
        </a>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {v.link ? (
          <Button asChild size="sm" variant="outline">
            <a href={v.link} target="_blank" rel="noopener noreferrer">
              {v.isLink ? <ExternalLink /> : <FileText />} {v.isLink ? "Open link" : image ? "Full size" : "Open file"}
            </a>
          </Button>
        ) : (
          <span className="text-muted-foreground">The file isn&apos;t reachable right now.</span>
        )}
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {[v.fileName, v.sizeBytes ? formatFileSize(v.sizeBytes) : null, v.uploadedByName ? `by ${v.uploadedByName}` : null, formatDateTime(v.createdAt)].filter(Boolean).join(" · ")}
        </span>
      </div>
      {v.note ? <p className="rounded-md bg-subtle px-3 py-2 text-sm">{v.note}</p> : null}
      <Thread version={v} />
      <CommentForm assetId={asset.asset.id} versionId={v.id} video={asset.asset.kind === "video"} canDraft={canDraft} />
    </div>
  );
}

function Thread({ version: v }: { version: VersionView }) {
  if (v.comments.length === 0) return null;
  return (
    <ol className="space-y-3">
      {v.comments.map((c) => (
        <li key={c.id} className="flex gap-2.5 text-sm">
          <Avatar name={c.authorName} size="sm" />
          <div className="min-w-0 flex-1">
            <p>
              <span className="font-medium">{c.authorName}</span>
              {c.action ? <span className="text-muted-foreground"> {REVIEW_ACTION_PAST[c.action]}</span> : null}
              <span className="text-xs text-muted-foreground"> · {formatDateTime(c.createdAt)}</span>
            </p>
            {c.body ? (
              <p className="mt-0.5 break-words whitespace-pre-wrap">
                {c.atSeconds !== null ? <span className="tabular mr-1.5 rounded bg-subtle px-1.5 py-0.5 text-xs font-medium">{formatTimecode(c.atSeconds)}</span> : null}
                {c.body}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
