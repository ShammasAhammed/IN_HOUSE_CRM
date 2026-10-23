import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Billing } from "./billing";
import { AdResults } from "./ad-results";
import { ResultsCard } from "./results-card";
import { KnowledgeCard } from "./knowledge-card";
import { FilesCard } from "./files-card";
import { BoardsCard } from "../../boards/boards-card";
import { GoalRow } from "@/components/goal-row";
import { PortalCard } from "./portal-card";
import { ChevronLeft, FolderPlus, Image as ImageIcon, Eye, Mail, MessagesSquare, Pencil, Phone, Plus, Video } from "lucide-react";
import { BurnMeter } from "@/components/burn-meter";
import { EmptyState, ErrorState, LoadingRows, SuccessNotice } from "@/components/states";
import { Avatar } from "@/components/ui/avatar";
import { ApprovalBadge } from "@/components/approval-badge";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { diffDays, istDate } from "@/lib/dates";
import { eventText } from "@/lib/event-text";
import { formatDate, formatDateTime, formatDays, formatMinutes, formatRupees, formatShortDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { CLIENT_SEGMENT_LABELS, CLIENT_STATUS_LABELS, CONTENT_CHANNEL_LABELS, CONTENT_STATUS_LABELS, type ClientStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { ClientPage, EngagementView } from "@/services/clients";

export const metadata: Metadata = { title: "Client" };

const STATUS_TONE: Record<ClientStatus, BadgeTone> = { onboarding: "info", active: "success", paused: "warning", churned: "neutral" };

export default function ClientPageRoute({ params, searchParams }: PageProps<"/clients/[id]">) {
  return (
    <Suspense fallback={<LoadingRows rows={6} columns={3} label="Loading client" />}>
      <ClientScreen params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ClientScreen({ params, searchParams }: Pick<PageProps<"/clients/[id]">, "params" | "searchParams">) {
  const actor = await requireActor();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const result = await getServices().clients.page(actor, id);
  if (!result.ok) return <ErrorState error={result.error} />;
  const page = result.value;
  const { client, visible, actions, space } = page;
  const today = istDate();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={space ? "/spaces" : "/clients"} className="mr-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> {space ? "Spaces" : "Clients"}
        </Link>
        {/* Everyone who sees the client sees its chat (Stage 12.1); made on first open, so a plain link, never prefetched. */}
        <Button size="sm" variant="outline" asChild>
          <a href={`/chat/client/${client.id}`}>
            <MessagesSquare /> Chat
          </a>
        </Button>
        {space ? null : (
          // The chat the client sees (12.6), beside the team's own.
          <Button size="sm" variant="outline" asChild>
            <a href={`/chat/shared/${client.id}`}>
              <Eye /> Chat with client
            </a>
          </Button>
        )}
        {actions.startProject ? (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/clients/${client.id}/projects/new`}>
              <FolderPlus /> New project
            </Link>
          </Button>
        ) : null}
        {actions.addEngagement ? (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/clients/${client.id}/engagements/new`}>
              <Plus /> New engagement
            </Link>
          </Button>
        ) : null}
        {actions.edit ? (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/clients/${client.id}/edit`}>
              <Pencil /> Edit
            </Link>
          </Button>
        ) : null}
      </div>
      {query.done === "updated" ? <SuccessNotice>Saved.</SuccessNotice> : null}

      <header className="flex flex-wrap items-start gap-4 rounded-lg border bg-card p-4 shadow-card md:p-5">
        <Avatar name={client.name} size="lg" className="size-12 rounded-lg text-base" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{client.name}</h1>
            {space ? (
              <>
                <Badge tone="brand">Space</Badge>
                {space.isPrivate ? <Badge tone="warning">Private</Badge> : null}
                {space.isSelf ? <Badge tone="info">Oppllo&apos;s own marketing</Badge> : null}
                {client.profile?.status === "churned" ? <Badge>Archived</Badge> : null}
              </>
            ) : client.profile ? (
              <Badge tone={STATUS_TONE[client.profile.status]}>{CLIENT_STATUS_LABELS[client.profile.status]}</Badge>
            ) : null}
          </div>
          {client.profile ? (
            <p className="text-sm text-muted-foreground">
              {CLIENT_SEGMENT_LABELS[client.profile.segment]}
              {client.profile.city ? ` · ${client.profile.city}` : ""}
              {client.profile.leadStrategist ? ` · Lead: ${client.profile.leadStrategist.fullName}` : ""}
            </p>
          ) : null}
          <p className="text-sm">
            <span className="tabular font-medium">{client.openTasks}</span> open {client.openTasks === 1 ? "task" : "tasks"}
            {client.overdueTasks ? <span className="text-danger"> · {client.overdueTasks} late</span> : null}
          </p>
        </div>
        {client.contacts?.length ? (
          <ul className="space-y-1.5 text-sm">
            {client.contacts.slice(0, 2).map((c) => (
              <li key={c.id} className="leading-tight">
                <p className="font-medium">
                  {c.name}
                  {c.designation ? <span className="font-normal text-muted-foreground"> · {c.designation}</span> : null}
                </p>
                <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  {c.phone ? (
                    <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="tabular flex items-center gap-1 hover:text-foreground">
                      <Phone className="size-3" /> {c.phone}
                    </a>
                  ) : null}
                  {c.email ? (
                    <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-foreground">
                      <Mail className="size-3" /> {c.email}
                    </a>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      {page.engagements.length ? (
        <section className="grid gap-4 md:grid-cols-2">
          {page.engagements.map((e) => (
            <EngagementCard key={e.id} engagement={e} today={today} linked={actions.openEngagements} />
          ))}
        </section>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          {/* Oppllo's own space (14.5) has results and a monthly self-report like a client; other spaces don't. */}
          {space && !space.isSelf ? null : (
            <Suspense fallback={<LoadingRows rows={3} columns={4} label="Loading results" />}>
              <ResultsCard clientId={client.id} />
            </Suspense>
          )}
          <Suspense fallback={<LoadingRows rows={3} columns={2} label="Loading the knowledge base" />}>
            <KnowledgeCard clientId={client.id} />
          </Suspense>
          <Suspense fallback={null}>
            <MeetingsCard clientId={client.id} />
          </Suspense>
          <Suspense fallback={null}>
            <SpaceGoals spaceId={client.id} />
          </Suspense>
          <Suspense fallback={<LoadingRows rows={2} columns={2} label="Loading files and sheets" />}>
            <FilesCard clientId={client.id} />
          </Suspense>
          <Suspense fallback={<LoadingRows rows={2} columns={2} label="Loading idea boards" />}>
            <BoardsCard clientId={client.id} />
          </Suspense>
          {space && !space.isSelf ? null : (
            <Suspense fallback={<LoadingRows rows={3} columns={4} label="Loading ad results" />}>
              <AdResults clientId={client.id} range={typeof query.ads === "string" ? query.ads : undefined} />
            </Suspense>
          )}
          {visible.projects ? <Projects page={page} /> : null}
          {visible.assets ? (
            <Suspense fallback={null}>
              <ComingUp clientId={page.client.id} />
            </Suspense>
          ) : null}
          {visible.assets ? <Creatives page={page} /> : null}
        </div>
        <aside className="space-y-5">
          {page.notes ? (
            // Notes were only on the Edit page (QA S9-08).
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <p className="text-sm break-words whitespace-pre-wrap">{page.notes}</p>
              </CardContent>
            </Card>
          ) : null}
          {space ? null : (
            <Suspense fallback={null}>
              <Billing clientId={client.id} />
            </Suspense>
          )}
          {space ? null : (
            <Suspense fallback={null}>
              <PortalCard clientId={client.id} clientName={client.name} />
            </Suspense>
          )}
          {visible.team && (page.team.length || space) ? (
            <Card>
              <CardHeader>
                <CardTitle>{space ? "Members" : "Team"}</CardTitle>
                {space ? (
                  <Link href="/spaces" className="text-xs text-primary hover:underline">
                    Spaces
                  </Link>
                ) : null}
              </CardHeader>
              <CardContent className="pt-3">
                {space && !page.team.length ? <p className="text-sm text-muted-foreground">{space.isPrivate ? "No members yet: only the owner sees this space." : "No members yet."}</p> : null}
                <ul className="space-y-2">
                  {page.team.map((m) => (
                    <li key={m.personId} className="flex items-center gap-2 text-sm">
                      <Avatar name={m.fullName} size="sm" />
                      <Link href={`/people/${m.personId}`} className="hover:underline">
                        {m.fullName}
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          {visible.history ? (
            <Card>
              <CardHeader>
                <CardTitle>Lately</CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                {page.history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing yet.</p>
                ) : (
                  <ol className="space-y-2.5">
                    {page.history.map((h) => (
                      <li key={h.id} className="text-sm leading-snug">
                        <span className="font-medium">{h.actorName ?? "Oppllo One"}</span> <span className="text-foreground-2">{eventText(h)}</span>
                        <p className="text-xs text-muted-foreground">{formatDateTime(new Date(h.occurredAt))}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function EngagementCard({ engagement: e, today, linked }: { engagement: EngagementView; today: string; linked: boolean }) {
  const renewalSoon = e.renewalDate && diffDays(today, e.renewalDate) <= 30 && diffDays(today, e.renewalDate) >= 0;
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="truncate">
            {linked ? (
              <Link href={`/engagements/${e.id}`} className="hover:underline">
                {e.serviceName}
              </Link>
            ) : (
              e.serviceName
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {e.kind === "retainer" ? "Monthly retainer" : "One-off job"} since {formatShortDate(e.startDate)}
            {e.status === "paused" ? " · paused" : ""}
          </p>
        </div>
        {e.feePaise !== undefined && e.feePaise !== null ? (
          <p className="tabular text-right text-sm font-semibold">
            {formatRupees(e.feePaise)}
            <span className="block text-xs font-normal text-muted-foreground">{e.kind === "retainer" ? "per month" : "total"}</span>
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {e.burn ? (
          <div>
            <BurnMeter {...e.burn} />
            <p className="mt-1 text-xs text-muted-foreground">
              {e.kind === "retainer" ? `${formatDays(e.burn.daysLeft)} left this month` : e.endDate ? `Whole job · ${formatDays(e.burn.daysLeft)} to go` : "Whole job"}
              {e.burn.nonBillableMinutes ? ` · ${formatMinutes(e.burn.nonBillableMinutes)} non-billable` : ""}
              {e.kind === "retainer" && e.rolloverPolicy === "rollover" ? " · unused hours roll over" : ""}
            </p>
          </div>
        ) : e.burn === null ? (
          <p className="text-xs text-muted-foreground">{e.kind === "retainer" ? "No hours budget for this month." : "Not sold in hours."}</p>
        ) : null}
        {e.deliverables.length ? (
          <ul className="space-y-1.5">
            {e.deliverables.map((d) => (
              <li key={d.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{d.name}</span>
                <span className={cn("tabular text-xs", d.delivered >= d.targetCount ? "text-success" : "text-muted-foreground")}>
                  {d.delivered} of {d.targetCount}
                  {e.kind === "retainer" ? " this month" : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {renewalSoon ? <Badge tone="warning">Renews {formatDate(e.renewalDate!)}</Badge> : null}
      </CardContent>
    </Card>
  );
}

function Projects({ page }: { page: ClientPage }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>
      </CardHeader>
      <CardContent>
        {page.projects.length === 0 ? (
          <EmptyState title="No projects yet" description="Projects appear here when one is started for this client." className="py-8" />
        ) : (
          <ul className="divide-y">
            {page.projects.map((p) => {
              const current = p.stages.findIndex((s) => s.id === p.currentStageId);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
                  {/* On a phone the name takes its own row; the stage bar and counts sit below. */}
                  <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                    <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {p.status === "active" ? (p.currentStageName ?? "In progress") : p.status.replace("_", " ")}
                      {p.dueDate ? ` · until ${formatShortDate(p.dueDate)}` : ""}
                    </p>
                  </div>
                  {/* Stage pipeline: done, current, still to come. */}
                  <ol className="flex items-center gap-1" aria-label="Stages">
                    {p.stages.map((s, i) => (
                      <li
                        key={s.id}
                        title={s.name}
                        className={cn(
                          "h-1.5 w-6 rounded-full",
                          p.status === "completed" || i < current ? "bg-primary/50" : i === current ? "bg-primary" : "bg-neutral-soft",
                        )}
                      />
                    ))}
                  </ol>
                  {page.visible.projectCounts ? (
                    <span className="tabular ml-auto text-right text-xs text-muted-foreground sm:ml-0 sm:w-24">
                      {p.openTasks} open{p.overdueTasks ? <span className="text-danger"> · {p.overdueTasks} late</span> : null}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Creatives({ page }: { page: ClientPage }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Latest creatives</CardTitle>
        {page.assets.length ? (
          <Link href={`/creatives?client=${page.client.id}&state=all`} className="text-xs text-primary hover:underline">
            All creatives
          </Link>
        ) : null}
      </CardHeader>
      <CardContent>
        {page.assets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No creatives yet. They&apos;re added on tasks.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {page.assets.map((a) => (
              <li key={a.id}>
                <Link href={`/creatives/${a.id}`} className="flex min-w-0 items-center gap-2.5 rounded-md border p-2 hover:bg-subtle">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-subtle text-muted-foreground">
                    {a.kind === "video" ? <Video className="size-4" /> : <ImageIcon className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground">v{a.currentVersion}</p>
                  </div>
                  <ApprovalBadge state={a.approvalState} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}


/** A space's own goals (Stage 14.3); private spaces' goals only reach their members here, as everywhere. */
async function SpaceGoals({ spaceId }: { spaceId: string }) {
  const goals = await getServices().goals.forSpace(await requireActor(), spaceId);
  // Only spaces own goals; a client page (or a space with none yet) shows nothing.
  if (!goals.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Goals</CardTitle>
        <Link href="/goals" className="text-xs text-primary hover:underline">
          All goals
        </Link>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {goals.map((g) => (
            <li key={g.id}>
              <GoalRow g={g} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** The client's latest meetings (Stage 13.4); the full library is /meetings filtered to this client. */
async function MeetingsCard({ clientId }: { clientId: string }) {
  const actor = await requireActor();
  const list = await getServices().meetings.list(actor, { clientId, limit: 4 });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Meetings</CardTitle>
        <Link href={`/meetings?client=${clientId}`} className="text-xs text-primary hover:underline">
          All meetings and decisions
        </Link>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No meetings yet. Each one gets a page with decisions and action items.</p>
        ) : (
          <ul className="divide-y">
            {list.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <Link href={`/docs/${m.docId}`} className="min-w-0 truncate hover:underline">
                  {m.title}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground tabular">{formatDate(m.meetingDate)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** The next posts and ads on the content calendar (Stage 7.3). */
async function ComingUp({ clientId }: { clientId: string }) {
  const actor = await requireActor();
  const r = await getServices().content.upcoming(actor, clientId);
  if (!r.ok) return <ErrorState error={r.error} />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Content coming up</CardTitle>
        <Link href={`/clients/${clientId}/calendar`} className="text-xs text-primary hover:underline">
          Calendar
        </Link>
      </CardHeader>
      <CardContent>
        {r.value.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing planned. Plan posts and ads on the calendar.</p>
        ) : (
          <ul className="divide-y">
            {r.value.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="tabular w-24 shrink-0 text-muted-foreground">{formatShortDate(i.publishOn)}{i.publishTime ? ` ${i.publishTime}` : ""}</span>
                <span className="min-w-0 flex-1 truncate">{i.title}</span>
                <span className="text-xs text-muted-foreground">{CONTENT_CHANNEL_LABELS[i.channel]} · {CONTENT_STATUS_LABELS[i.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
