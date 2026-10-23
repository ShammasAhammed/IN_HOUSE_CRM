import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AiDrafts } from "./ai-drafts";
import { TaskChecklist, TaskFiles, TaskPeople, TaskWaits } from "./task-collab";
import { TaskTags } from "./task-tags";
import { TaskTimerButton } from "@/components/timer/timer-bits";
import { SaveAsTemplate, TaskFieldsForm } from "../setup-forms";
import { ApprovalBadge } from "@/components/approval-badge";
import { BackLink } from "@/components/back-link";
import { ErrorState, LoadingRows } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { istDate } from "@/lib/dates";
import { formatDateTime, formatShortDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { can } from "@/services/permissions";
import { TaskRow } from "../../task-row";
import { NewCreativeForm } from "../../creatives/creative-forms";
import { AddSubtask, Comments, DeleteTask, DetailsForm, StatusSelect, TimePanel } from "./task-forms";
import { TaskCatchUp } from "./task-catch-up";

export const metadata: Metadata = { title: "Task" };

export default function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  return (
    <Suspense fallback={<LoadingRows rows={5} columns={2} label="Loading task" />}>
      <Task params={params} />
    </Suspense>
  );
}

async function Task({ params }: { params: PageProps<"/tasks/[id]">["params"] }) {
  const actor = await requireActor();
  const { id } = await params;
  const services = getServices();
  const [result, directory, tagOptions, teamResult, deps, blockerOptions, fields, timer, ai, draft] = await Promise.all([services.tasks.get(actor, id), services.people.directory(actor), services.tasks.tagOptions(actor), services.taskCollab.forTask(actor, id), services.planning.dependencies(actor, id), services.planning.blockerOptions(actor, id), services.taskSetup.forTask(actor, id), services.timers.running(actor), services.chatAi.status(actor), services.myAssistant.status(actor)]);
  if (!result.ok) return <ErrorState error={result.error} />;
  if (!teamResult.ok) return <ErrorState error={teamResult.error} />;
  const team = teamResult.value;
  const task = result.value;
  const today = istDate();
  const people = directory.ok ? directory.value.map((p) => ({ id: p.id, name: p.fullName })) : [];
  const canDelete = can(actor, "tasks.write.all") || task.createdById === actor.personId;

  return (
    <div className="space-y-5">
      <div>
        <BackLink fallback="/" />
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              {task.clientName} ·{" "}
              <Link href={`/projects/${task.projectId}`} className="hover:text-foreground hover:underline">
                {task.projectName}
              </Link>
              {task.stageName ? ` · ${task.stageName}` : ""}
              {task.recurrenceId ? " · repeats" : ""}
            </p>
            <h1 className="text-xl font-semibold tracking-tight">{task.title}</h1>
            <div className="mt-1">
              <TaskTags taskId={task.id} tags={task.tags ?? []} known={tagOptions.map((t) => t.tag)} canEdit={task.canEdit} />
            </div>
          </div>
          <StatusSelect taskId={task.id} status={task.status} disabled={!task.canEdit} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-5">
          <Suspense fallback={null}>
            <RequestAnswers taskId={task.id} />
          </Suspense>
          <Card>
            <CardHeader>
              <CardTitle>Checklist</CardTitle>
              {team.checklist.length ? (
                <span className="tabular text-xs text-muted-foreground">
                  {team.checklist.filter((c) => c.done).length}/{team.checklist.length}
                </span>
              ) : null}
            </CardHeader>
            <CardContent>
              <TaskChecklist taskId={task.id} items={team.checklist} canEdit={team.canEdit} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Subtasks</CardTitle>
              <span className="tabular text-xs text-muted-foreground">
                {task.subtasks.filter((s) => s.status === "done").length}/{task.subtasks.length}
              </span>
            </CardHeader>
            <CardContent className="space-y-3">
              {task.subtasks.length ? (
                <ul className="divide-y rounded-md border">
                  {task.subtasks.map((s) => (
                    <TaskRow key={s.id} task={s} today={today} showLog={false} showWhere={false} />
                  ))}
                </ul>
              ) : null}
              {task.canAddSubtask && task.canEdit ? <AddSubtask projectId={task.projectId} parentTaskId={task.id} ownerId={task.ownerId} /> : null}
            </CardContent>
          </Card>
          <Suspense fallback={<LoadingRows rows={2} columns={2} label="Loading creatives" />}>
            <Creatives taskId={task.id} clientId={task.clientId} title={task.title} canAdd={task.canEdit} />
          </Suspense>
          <Card>
            <CardHeader>
              <CardTitle>Files and links</CardTitle>
            </CardHeader>
            <CardContent>
              <TaskFiles taskId={task.id} files={team.files} canEdit={team.canEdit} />
            </CardContent>
          </Card>
          <Suspense fallback={<LoadingRows rows={2} columns={1} label="Loading AI drafts" />}>
            <AiDrafts taskId={task.id} />
          </Suspense>
          <Card id="comments" className="scroll-mt-16">
            <CardHeader className="flex-wrap">
              <CardTitle>Comments</CardTitle>
              {task.comments.length >= 3 && ai.ready ? <TaskCatchUp taskId={task.id} /> : null}
            </CardHeader>
            <CardContent>
              <Comments task={task} people={people} canDraft={draft.prefs.drafts && !draft.aiReason} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<LoadingRows rows={3} columns={1} label="Loading the history" />}>
                <Activity taskId={task.id} />
              </Suspense>
            </CardContent>
          </Card>
        </div>
        <aside className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>People</CardTitle>
            </CardHeader>
            <CardContent>
              <TaskPeople taskId={task.id} team={team} people={people} me={actor.personId} />
            </CardContent>
          </Card>
          {fields.ok && fields.value.fields.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Fields</CardTitle>
              </CardHeader>
              <CardContent>
                <TaskFieldsForm taskId={task.id} fields={fields.value.fields} canEdit={fields.value.canEdit} />
              </CardContent>
            </Card>
          ) : null}
          {deps.ok ? (
            <Card>
              <CardHeader>
                <CardTitle>Dependencies</CardTitle>
              </CardHeader>
              <CardContent>
                <TaskWaits taskId={task.id} deps={deps.value} options={blockerOptions} />
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Time</CardTitle>
              <TaskTimerButton taskId={task.id} runningHere={timer?.taskId === task.id} />
            </CardHeader>
            <CardContent>
              <TimePanel task={task} today={today} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailsForm task={task} people={people} />
            </CardContent>
          </Card>
          {can(actor, "projects.write") && !task.parentTaskId ? <SaveAsTemplate kind="task" sourceId={task.id} defaultName={task.title} /> : null}
          {canDelete ? <DeleteTask taskId={task.id} /> : null}
        </aside>
      </div>
    </div>
  );
}

/** The creatives made on this task, and adding one (Stage 7.2). */
async function Creatives({ taskId, clientId, title, canAdd }: { taskId: string; clientId: string; title: string; canAdd: boolean }) {
  const actor = await requireActor();
  const r = await getServices().assets.forTask(actor, taskId);
  if (!r.ok) return <ErrorState error={r.error} />;
  if (r.value.length === 0 && !canAdd) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Creatives</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {r.value.length ? (
          <ul className="divide-y rounded-md border">
            {r.value.map((a) => (
              <li key={a.id}>
                <Link href={`/creatives/${a.id}`} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-subtle">
                  <span className="min-w-0 flex-1 truncate font-medium">{a.title}</span>
                  <span className="tabular text-xs text-muted-foreground">v{a.currentVersion}</span>
                  <ApprovalBadge state={a.approvalState} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Upload the work here (or link to it) to send it for review.</p>
        )}
        {canAdd ? <NewCreativeForm clientId={clientId} taskId={taskId} defaultTitle={title} /> : null}
      </CardContent>
    </Card>
  );
}

/** Who changed what on this task, newest first (test report M4). */
async function Activity({ taskId }: { taskId: string }) {
  const actor = await requireActor();
  const r = await getServices().tasks.activity(actor, taskId, { day: formatShortDate });
  if (!r.ok) return <ErrorState error={r.error} />;
  if (r.value.length === 0) return <p className="text-sm text-muted-foreground">No changes yet.</p>;
  return (
    <ol className="space-y-2">
      {r.value.map((a) => (
        <li key={a.id} className="text-sm">
          <span className="font-medium">{a.who}</span> <span className="text-foreground-2">{a.text}</span>
          <span className="block text-xs text-muted-foreground">{formatDateTime(a.at)}</span>
        </li>
      ))}
    </ol>
  );
}

/** What was asked for, when the task came from a request form: first thing on the page (test report L11). */
async function RequestAnswers({ taskId }: { taskId: string }) {
  const actor = await requireActor();
  const r = await getServices().requestForms.forTask(actor, taskId);
  if (!r.ok || !r.value) return null;
  const req = r.value;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{req.formName}</CardTitle>
        <span className="text-xs text-muted-foreground">
          from {req.from} · {formatDateTime(req.at)}
        </span>
      </CardHeader>
      <CardContent>
        {req.answers.length ? (
          <dl className="space-y-3">
            {req.answers.map((a, i) => (
              <div key={i}>
                <dt className="text-xs text-muted-foreground">{a.label}</dt>
                <dd className="text-sm whitespace-pre-wrap">{a.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">No answers were given.</p>
        )}
      </CardContent>
    </Card>
  );
}
