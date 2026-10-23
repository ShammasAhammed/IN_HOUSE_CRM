"use client";

import { useActionState, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { formatDateTime, formatMinutes, formatWeekdayDate } from "@/lib/format";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUSES, TASK_STATUS_LABELS, type TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { QUICK_LOG_MINUTES } from "@/services/rules/time";
import type { TaskDetail } from "@/services/tasks";
import {
  commentAction,
  createTaskAction,
  deleteTaskAction,
  logTimeAction,
  moveTaskAction,
  removeTimeAction,
  setBillableAction,
  updateTaskAction,
} from "../actions";
import { DraftReplyButton } from "@/components/draft-reply";
import { MentionBox } from "@/components/mention-box";

type Person = { id: string; name: string };
const PRIORITY_LABELS = TASK_PRIORITY_LABELS;

export function StatusSelect({ taskId, status, disabled }: { taskId: string; status: TaskStatus; disabled: boolean }) {
  const [value, setValue] = useState(status);
  const [error, setError] = useState<string | null>(null);
  // Done with something still open asks first (QA S9-03): the warning, then "Mark done anyway" or "Keep it open".
  const [ask, setAsk] = useState<{ status: TaskStatus; prev: TaskStatus; message: string } | null>(null);
  const [pending, start] = useTransition();
  const move = (next: TaskStatus, prev: TaskStatus, confirmed = false) =>
    start(async () => {
      const r = await moveTaskAction({ taskId, status: next, confirmed, canConfirm: true });
      if (r.ok) {
        setError(null);
        setAsk(null);
        return;
      }
      setValue(prev);
      if (r.needsConfirm) setAsk({ status: next, prev, message: r.message });
      else setError(r.message);
    });
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <Select
          aria-label="Status"
          value={value}
          disabled={disabled || pending}
          className="h-8 w-40"
          onChange={(e) => {
            const next = e.target.value as TaskStatus;
            const prev = value;
            setValue(next);
            setAsk(null);
            move(next, prev);
          }}
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        {error ? <span className="text-xs text-danger">{error}</span> : null}
      </div>
      {ask ? (
        <div role="alert" className="flex max-w-sm flex-wrap items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          <span className="basis-full">{ask.message}</span>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => (setValue(ask.status), move(ask.status, ask.prev, true))}>
            Mark done anyway
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setAsk(null)}>
            Keep it open
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function DetailsForm({ task, people }: { task: TaskDetail; people: Person[] }) {
  const [state, action] = useActionState(updateTaskAction, idle);
  const d = (name: string, initial: string) => fieldDefault(state, name, initial);
  const disabled = !task.canEdit;
  return (
    <form action={action} key={state.status === "error" ? JSON.stringify(state.values ?? {}) : `${task.id}-${task.title}`} className="space-y-3">
      <input type="hidden" name="taskId" value={task.id} />
      <input type="hidden" name="loadedAt" value={new Date(task.updatedAt).toISOString()} />
      <fieldset disabled={disabled} className="space-y-3">
        <Field label="Title" name="title" state={state}>
          <Input id="title" name="title" defaultValue={d("title", task.title)} required {...invalidProps(state, "title")} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Owner" name="ownerId" state={state}>
            <Select id="ownerId" name="ownerId" defaultValue={d("ownerId", task.ownerId ?? "")}>
              <option value="">Nobody yet</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reviewer" name="reviewerId" state={state}>
            <Select id="reviewerId" name="reviewerId" defaultValue={d("reviewerId", task.reviewerId ?? "")}>
              <option value="">None</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Start" name="startDate" state={state}>
            <Input id="startDate" name="startDate" type="date" defaultValue={d("startDate", task.startDate ?? "")} />
          </Field>
          <Field label="Due" name="dueDate" state={state}>
            <Input id="dueDate" name="dueDate" type="date" defaultValue={d("dueDate", task.dueDate ?? "")} {...invalidProps(state, "dueDate")} />
          </Field>
          <Field label="Estimate (hours)" name="estimateHours" state={state}>
            <Input
              id="estimateHours"
              name="estimateHours"
              type="number"
              min="0"
              step="0.25"
              defaultValue={d("estimateHours", task.estimateMinutes !== null ? String(task.estimateMinutes / 60) : "")}
              className="tabular"
            />
          </Field>
          <Field label="Priority" name="priority" state={state}>
            <Select id="priority" name="priority" defaultValue={d("priority", task.priority)}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {task.stages.length ? (
          <Field label="Stage" name="stageId" state={state}>
            <Select id="stageId" name="stageId" defaultValue={d("stageId", task.stageId ?? "")}>
              <option value="">No stage</option>
              {task.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {task.deliverables.length ? (
          <Field label="Counts as" name="deliverableId" state={state} hint="When it's done, it counts towards this promise on the client page.">
            <Select id="deliverableId" name="deliverableId" defaultValue={d("deliverableId", task.deliverableId ?? "")} {...invalidProps(state, "deliverableId")}>
              <option value="">Nothing</option>
              {task.deliverables.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Notes" name="description" state={state}>
          <Textarea id="description" name="description" rows={4} defaultValue={d("description", task.description ?? "")} placeholder="Brief, links, what done looks like…" />
        </Field>
        <FormStatus state={state} />
        {task.canEdit ? (
          <SubmitButton size="sm" pendingLabel="Saving…">
            Save
          </SubmitButton>
        ) : (
          <p className="text-xs text-muted-foreground">Only the owner, reviewer, creator or a lead can change this task.</p>
        )}
      </fieldset>
    </form>
  );
}

export function AddSubtask({ projectId, parentTaskId, ownerId }: { projectId: string; parentTaskId: string; ownerId: string | null }) {
  const [title, setTitle] = useState("");
  // Clear the box once the subtask is saved (inside the action, not during render).
  const [state, action, pending] = useActionState(async (prev: Parameters<typeof createTaskAction>[0], form: FormData) => {
    const next = await createTaskAction(prev, form);
    if (next.status === "ok") setTitle("");
    return next;
  }, idle);
  return (
    // A second Enter while saving is ignored (QA S9-02); the server also treats a repeat as the same subtask.
    <form action={action} onSubmit={(e) => pending && e.preventDefault()} className="flex gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="parentTaskId" value={parentTaskId} />
      <input type="hidden" name="ownerId" value={ownerId ?? ""} />
      <input type="hidden" name="stay" value="1" />
      <Input name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a subtask" aria-label="New subtask" className="h-8" required minLength={2} readOnly={pending} />
      <SubmitButton size="sm" variant="outline">
        Add
      </SubmitButton>
      {state.status === "error" ? <span className="self-center text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

/** A comment's text with "@Full Name" mentions of people on the team picked out. */
function CommentBody({ body, people }: { body: string; people: Person[] }) {
  const names = people.map((p) => p.name).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!names.length || !body.includes("@")) return <>{body}</>;
  const pattern = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))(?![\\p{L}\\p{N}_])`, "giu");
  return (
    <>
      {body.split(pattern).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="font-medium text-primary">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function Comments({ task, people, canDraft = false }: { task: TaskDetail; people: Person[]; canDraft?: boolean }) {
  const [state, action] = useActionState(commentAction, idle);
  return (
    <div className="space-y-3">
      {task.comments.length === 0 ? <p className="text-sm text-muted-foreground">No comments yet.</p> : null}
      <ul className="space-y-3">
        {task.comments.map((c) => (
          <li key={c.id} className="flex gap-2.5">
            <Avatar name={c.authorName} size="sm" />
            <div className="min-w-0 flex-1 rounded-lg bg-subtle px-3 py-2">
              <p className="text-xs">
                <span className="font-medium">{c.authorName}</span> <span className="text-muted-foreground">· {formatDateTime(new Date(c.createdAt))}</span>
              </p>
              <p className="mt-0.5 text-sm whitespace-pre-wrap">
                <CommentBody body={c.body} people={people} />
              </p>
            </div>
          </li>
        ))}
      </ul>
      <form action={action} className="space-y-2" key={state.status === "ok" ? `posted-${task.comments.length}` : "comment"}>
        <input type="hidden" name="taskId" value={task.id} />
        <MentionBox name="body" people={people} defaultValue={fieldDefault(state, "body", "")} />
        {state.status === "error" ? <FormStatus state={state} /> : null}
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton size="sm" variant="outline" pendingLabel="Posting…">
            Comment
          </SubmitButton>
          {canDraft && task.comments.length ? <DraftReplyButton target={{ kind: "task", taskId: task.id }} /> : null}
        </div>
      </form>
    </div>
  );
}

export function TimePanel({ task, today }: { task: TaskDetail; today: string }) {
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [minutes, setMinutes] = useState("");
  const [date, setDate] = useState(today);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message: string }>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      setMessage({ text: r.message, error: !r.ok });
      if (r.ok) onOk?.();
    });
  const total = task.time.reduce((s, e) => s + e.minutes, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {QUICK_LOG_MINUTES.map((m) => (
          <Button key={m} size="sm" variant="outline" disabled={pending} onClick={() => run(() => logTimeAction({ taskId: task.id, minutes: m }))}>
            +{m >= 60 ? `${m / 60}h` : `${m}m`}
          </Button>
        ))}
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const m = Math.round(Number(minutes) * 60);
          if (!m) return setMessage({ text: "Enter hours, e.g. 1.5", error: true });
          // The hours stay in the box until the entry is saved, so a refusal doesn't lose them.
          run(() => logTimeAction({ taskId: task.id, minutes: m, workDate: date }), () => setMinutes(""));
        }}
      >
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Hours</span>
          <Input value={minutes} onChange={(e) => setMinutes(e.target.value)} type="number" step="0.25" min="0" className="tabular h-8 w-20" aria-label="Hours to log" />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Day</span>
          <Input value={date} onChange={(e) => setDate(e.target.value)} type="date" max={today} className="h-8 w-40" aria-label="Day worked" />
        </label>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          Log
        </Button>
      </form>
      {message ? <p className={cn("text-xs", message.error ? "text-danger" : "text-success")}>{message.text}</p> : null}
      <p className="text-xs text-muted-foreground">
        <span className="tabular font-medium text-foreground">{formatMinutes(total)}</span> logged{task.loggedMinutes === null ? " by you" : ""}
        {task.estimateMinutes ? ` of ${formatMinutes(task.estimateMinutes)} estimated` : ""}
      </p>
      {task.time.length ? (
        <ul className="divide-y rounded-md border text-sm">
          {task.time.map((e) => (
            <li key={e.id} className="flex items-center gap-2 px-2.5 py-1.5">
              <span className="tabular w-14 font-medium">{formatMinutes(e.minutes)}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {formatWeekdayDate(e.workDate)} · {e.personName}
                {!e.billable ? " · non-billable" : ""}
              </span>
              {task.canManageTime ? (
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => run(() => setBillableAction(e.id, !e.billable))}>
                  {e.billable ? "Non-billable" : "Billable"}
                </button>
              ) : null}
              {e.canEdit ? (
                <button type="button" aria-label="Remove entry" className="text-muted-foreground hover:text-danger" onClick={() => run(() => removeTimeAction(e.id))}>
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function DeleteTask({ taskId }: { taskId: string }) {
  const [state, action] = useActionState(deleteTaskAction, idle);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("Delete this task and its subtasks? It's kept in history.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="taskId" value={taskId} />
      <SubmitButton size="sm" variant="ghost" className="text-danger hover:text-danger">
        <Trash2 /> Delete task
      </SubmitButton>
      <FormStatus state={state} />
    </form>
  );
}
