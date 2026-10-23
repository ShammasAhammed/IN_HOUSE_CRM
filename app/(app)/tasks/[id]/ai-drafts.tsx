// AI teammate on the task page (Stage 11.3): ask for a draft, then approve (edited) or reject it.
import { Sparkles } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { ErrorState } from "@/components/states";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatRupees } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { AI_DRAFT_KIND_LABELS, type AiDraftStatus } from "@/lib/types";
import { DecideDraftForm, RequestDraftForm } from "./ai-draft-forms";

const STATUS: Record<AiDraftStatus, { tone: BadgeTone; label: string }> = {
  draft: { tone: "warning", label: "Waiting for a person" },
  approved: { tone: "success", label: "Approved" },
  rejected: { tone: "neutral", label: "Rejected" },
};

export async function AiDrafts({ taskId }: { taskId: string }) {
  const actor = await requireActor();
  const r = await getServices().aiDrafts.forTask(actor, taskId);
  if (!r.ok) return <ErrorState error={r.error} />;
  const { drafts, canUse, blocked } = r.value;
  if (!canUse && drafts.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" /> AI teammate
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canUse && blocked ? (
          <div className="space-y-1 rounded-md bg-subtle px-3 py-2 text-sm">
            <p className="font-medium">{blocked}</p>
            <p className="text-muted-foreground">
              Once it&apos;s on: pick a caption, creative brief, first script or report prep and the AI writes a draft here from this task and the client&apos;s tone and do&apos;s and
              don&apos;ts. It can&apos;t change the task; nothing is used until a person approves it.
            </p>
          </div>
        ) : canUse ? (
          <RequestDraftForm taskId={taskId} />
        ) : null}
        {drafts.length ? (
          <ul className="space-y-3">
            {drafts.map((d) => (
              <li key={d.id} className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{AI_DRAFT_KIND_LABELS[d.kind]}</span>
                  <Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
                  {d.status === "approved" ? <span className="ml-auto"><CopyButton text={d.body} /></span> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  Asked by {d.requestedByName} · {formatDateTime(d.createdAt)}
                  {d.model ? ` · ${d.model}` : ""}
                  {d.costPaise !== null ? ` · ${formatRupees(d.costPaise)}` : ""}
                  {d.reviewedByName && d.reviewedAt ? ` · ${STATUS[d.status].label.toLowerCase()} by ${d.reviewedByName}, ${formatDateTime(d.reviewedAt)}` : ""}
                </p>
                {d.instructions ? <p className="text-xs text-muted-foreground">Note: {d.instructions}</p> : null}
                {d.status === "draft" && canUse ? (
                  <DecideDraftForm draftId={d.id} body={d.body} />
                ) : d.status === "rejected" ? (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-xs text-muted-foreground">Show the rejected text</summary>
                    <p className="mt-1 break-words whitespace-pre-wrap text-muted-foreground">{d.body}</p>
                  </details>
                ) : (
                  <p className="text-sm break-words whitespace-pre-wrap">{d.body}</p>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
