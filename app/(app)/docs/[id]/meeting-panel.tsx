// A meeting page's side panel (Stage 13.4): when, who, and its action items as proposals to Approve into tasks.
import type { Route } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { MEETING_KIND_LABELS } from "@/lib/types";
import type { Actor } from "@/services/permissions";
import type { MeetingDetail } from "@/services/meetings";
import { ApproveItem, MeetingAi, NextMeeting } from "../../meetings/meeting-forms";

export async function MeetingPanel({ actor, meeting: m }: { actor: Actor; meeting: MeetingDetail }) {
  const projects = await getServices().projects.list(actor, m.clientId ? { clientId: m.clientId } : {});
  const options = projects.ok ? projects.value.filter((p) => p.status !== "completed" && p.status !== "cancelled").map((p) => ({ id: p.id, name: m.clientId ? p.name : `${p.clientName}: ${p.name}` })) : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Meeting</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={m.kind === "client_call" ? "brand" : m.kind === "review" ? "info" : "neutral"}>{MEETING_KIND_LABELS[m.kind]}</Badge>
          <span className="tabular">
            {formatDate(m.meetingDate)}
            {m.startTime ? ` · ${m.startTime.slice(0, 5)}` : ""}
          </span>
          {m.repeat !== "none" ? <Badge tone="neutral">{m.repeat === "weekly" ? "Every week" : "Every month"}</Badge> : null}
        </div>
        {m.people.length ? <p className="text-xs text-muted-foreground">With {m.people.map((p) => p.name).join(", ")}</p> : null}
        <div className="space-y-2">
          <p className="text-xs font-semibold">Action items</p>
          {m.items.length === 0 ? (
            <p className="text-xs text-muted-foreground">Write them under &quot;Action items&quot; as checklist lines: &quot;@Name what by Friday&quot;.</p>
          ) : (
            <ul className="space-y-3">
              {m.items.map((i) => (
                <li key={i.key} className="space-y-1">
                  <p className={i.done ? "text-muted-foreground line-through" : ""}>{i.text}</p>
                  <p className="text-xs text-muted-foreground">
                    {i.ownerName ?? "No owner yet"} · {i.due ? `due ${formatDate(i.due)}` : "no date"}
                  </p>
                  {i.taskId ? (
                    <Link href={`/tasks/${i.taskId}` as Route} className="inline-flex items-center gap-1 text-xs text-success hover:underline">
                      <CheckCircle2 className="size-3.5" /> Task made
                    </Link>
                  ) : i.done ? null : (
                    <ApproveItem meetingId={m.id} itemKey={i.key} projects={options} projectId={m.projectId} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        {m.decisions.length ? (
          <p className="text-xs text-muted-foreground">
            {m.decisions.length} decision{m.decisions.length === 1 ? "" : "s"} ·{" "}
            <Link href={`/meetings?q=${encodeURIComponent(m.decisions[0]!.slice(0, 30))}` as Route} className="hover:underline">
              search decisions
            </Link>
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3 text-xs">
          {m.previousId ? <MeetingLink id={m.previousId} label="← Last meeting" /> : null}
          {m.nextId ? <MeetingLink id={m.nextId} label="Next meeting →" /> : null}
        </div>
        <MeetingAi meetingId={m.id} />
        {m.repeat !== "none" && !m.nextId ? <NextMeeting meetingId={m.id} label="Make the next meeting now" /> : null}
        <Link href={(m.clientId ? `/meetings?client=${m.clientId}` : "/meetings?client=team") as Route} className="block text-xs text-muted-foreground hover:underline">
          All {m.clientName ?? "team"} meetings
        </Link>
      </CardContent>
    </Card>
  );
}

function MeetingLink({ id, label }: { id: string; label: string }) {
  // /meetings/<id> opens that meeting's page (looked up through the same visibility rules).
  return (
    <Link href={`/meetings/${id}` as Route} className="hover:underline">
      {label}
    </Link>
  );
}
