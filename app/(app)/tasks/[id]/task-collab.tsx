"use client";

// The task page's people, checklist and files (Stage 9b.2).
import { useActionState, useOptimistic, useState } from "react";
import { ArrowDown, Check, ArrowUp, Eye, EyeOff, FileText, Link2, Pencil, Plus, X } from "lucide-react";
import { FormStatus, SubmitButton } from "@/components/form";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { fieldDefault, idle, type ActionState } from "@/lib/action-state";
import { formatDateTime, formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ACCEPTED_TASK_FILE_EXTENSIONS } from "@/services/rules/task-files";
import type { TaskTeam } from "@/services/task-collab";
import { addChecklistAction, addDependencyAction, addTaskFileAction, addTaskPersonAction, changeChecklistAction, removeDependencyAction, removeTaskFileAction, removeTaskPersonAction } from "./collab-actions";
import Link from "next/link";
import type { Route } from "next";
import { Badge } from "@/components/ui/badge";
import { TASK_STATUS_LABELS } from "@/lib/types";
import type { TaskDependencies } from "@/services/planning";

type Person = { id: string; name: string };

function RemovePerson({ taskId, personId, role, label }: { taskId: string; personId: string; role: "assignee" | "watcher"; label: string }) {
  const [state, action] = useActionState(removeTaskPersonAction, idle);
  return (
    <form action={action}>
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="role" value={role} />
      <button type="submit" aria-label={label} title={state.status === "error" ? state.message : label} className="rounded p-0.5 text-muted-foreground hover:bg-hover hover:text-foreground">
        <X className="size-3.5" />
      </button>
    </form>
  );
}

function AddPerson({ taskId, role, people, label }: { taskId: string; role: "assignee" | "watcher"; people: Person[]; label: string }) {
  const [state, action] = useActionState(addTaskPersonAction, idle);
  if (!people.length) return null;
  return (
    <form action={action} key={state.status === "ok" ? `added-${state.message}-${people.length}` : role} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="role" value={role} />
      <Select name="personId" aria-label={label} required defaultValue="" className="h-8 min-w-0 flex-1">
        <option value="" disabled>
          {label}…
        </option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <SubmitButton size="sm" variant="outline" pendingLabel="Adding…">
        Add
      </SubmitButton>
      {state.status === "error" ? <FormStatus state={state} className="basis-full" /> : null}
    </form>
  );
}

/** Owner and other assignees, then watchers; watch or stop watching yourself. */
export function TaskPeople({ taskId, team, people, me }: { taskId: string; team: TaskTeam; people: Person[]; me: string }) {
  const [state, watch] = useActionState((prev: ActionState, f: FormData) => (f.get("op") === "stop" ? removeTaskPersonAction(prev, f) : addTaskPersonAction(prev, f)), idle);
  const taken = new Set([...team.assignees.map((a) => a.id)]);
  const watched = new Set(team.watchers.map((w) => w.id));
  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Assignees</p>
        {team.assignees.length ? (
          <ul className="space-y-1.5">
            {team.assignees.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <Avatar name={a.name} size="sm" />
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                {a.isOwner ? <span className="text-xs text-muted-foreground">Owner</span> : team.canEdit ? <RemovePerson taskId={taskId} personId={a.id} role="assignee" label={`Take ${a.name} off this task`} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Nobody yet.</p>
        )}
        {team.canEdit ? <AddPerson taskId={taskId} role="assignee" label="Add an assignee" people={people.filter((p) => !taken.has(p.id))} /> : null}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Watchers get every comment and status change</p>
          <form action={watch}>
            <input type="hidden" name="taskId" value={taskId} />
            <input type="hidden" name="personId" value={me} />
            <input type="hidden" name="role" value="watcher" />
            <input type="hidden" name="op" value={team.watching ? "stop" : "watch"} />
            <SubmitButton size="sm" variant="ghost" pendingLabel="Saving…">
              {team.watching ? (
                <>
                  <EyeOff /> Stop watching
                </>
              ) : (
                <>
                  <Eye /> Watch
                </>
              )}
            </SubmitButton>
          </form>
        </div>
        {state.status === "error" ? <FormStatus state={state} /> : null}
        {team.watchers.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {team.watchers.map((w) => (
              <li key={w.id} className="inline-flex items-center gap-1 rounded-md border bg-card py-0.5 pr-1 pl-1.5 text-xs">
                {w.name}
                {team.canEdit || w.id === me ? <RemovePerson taskId={taskId} personId={w.id} role="watcher" label={`Stop ${w.id === me ? "watching" : `${w.name} watching`}`} /> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {team.canEdit ? <AddPerson taskId={taskId} role="watcher" label="Add a watcher" people={people.filter((p) => !watched.has(p.id) && p.id !== me)} /> : null}
      </div>
    </div>
  );
}

function ChecklistItem({ item, canEdit, first, last }: { item: TaskTeam["checklist"][number]; canEdit: boolean; first: boolean; last: boolean }) {
  const [renaming, setRenaming] = useState(false);
  // The tick shows at once; the page catches up when the change is saved (or goes back if it isn't).
  const [done, setDone] = useOptimistic(item.done);
  const [state, action] = useActionState(async (prev: ActionState, f: FormData) => {
    if (f.get("action") === "check" || f.get("action") === "uncheck") setDone(f.get("action") === "check");
    const r = await changeChecklistAction(prev, f);
    if (r.status === "ok") setRenaming(false);
    return r;
  }, idle);
  const run = (verb: string) => (
    <form action={action}>
      <input type="hidden" name="itemId" value={item.id} />
      <input type="hidden" name="action" value={verb} />
      {verb === "up" || verb === "down" || verb === "remove" ? (
        <button type="submit" aria-label={`${verb === "remove" ? "Remove" : `Move ${verb}`}: ${item.text}`} className="rounded p-1 text-muted-foreground hover:bg-hover hover:text-foreground">
          {verb === "up" ? <ArrowUp className="size-3.5" /> : verb === "down" ? <ArrowDown className="size-3.5" /> : <X className="size-3.5" />}
        </button>
      ) : null}
    </form>
  );
  if (renaming)
    return (
      <li className="px-3 py-2">
        <form action={action} className="flex flex-wrap items-center gap-2" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="action" value="rename" />
          <Input name="text" aria-label="Step" defaultValue={fieldDefault(state, "text", item.text)} autoFocus required maxLength={300} className="h-8 flex-1" />
          <SubmitButton size="sm" pendingLabel="Saving…">
            Save
          </SubmitButton>
          <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(false)}>
            Cancel
          </Button>
          {state.status === "error" ? <FormStatus state={state} className="basis-full" /> : null}
        </form>
      </li>
    );
  return (
    <li className="group flex items-start gap-2.5 px-3 py-2 text-sm">
      <form action={action} className="pt-0.5">
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="action" value={done ? "uncheck" : "check"} />
        {/* A button, not a checkbox: what it shows always comes from the saved state (test report M7). */}
        <button
          type="submit"
          role="checkbox"
          aria-checked={done}
          aria-label={item.text}
          disabled={!canEdit}
          className={cn("flex size-4 items-center justify-center rounded-sm border", done ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card", canEdit ? "cursor-pointer" : "cursor-not-allowed opacity-60")}
        >
          {done ? <Check className="size-3" strokeWidth={3} /> : null}
        </button>
      </form>
      <div className="min-w-0 flex-1">
        <p className={cn("break-words", done && "text-muted-foreground line-through")}>{item.text}</p>
        {done && item.doneByName ? <p className="text-xs text-muted-foreground">{item.doneByName}{item.doneAt ? ` · ${formatDateTime(new Date(item.doneAt))}` : ""}</p> : null}
        {state.status === "error" ? <FormStatus state={state} /> : null}
      </div>
      {canEdit ? (
        <div className="flex shrink-0 items-center opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
          <button type="button" aria-label={`Rename: ${item.text}`} onClick={() => setRenaming(true)} className="rounded p-1 text-muted-foreground hover:bg-hover hover:text-foreground">
            <Pencil className="size-3.5" />
          </button>
          {first ? null : run("up")}
          {last ? null : run("down")}
          {run("remove")}
        </div>
      ) : null}
    </li>
  );
}

/** The steps inside a task: tick as you go; paste several lines to add many at once. */
export function TaskChecklist({ taskId, items, canEdit }: { taskId: string; items: TaskTeam["checklist"]; canEdit: boolean }) {
  const [state, action] = useActionState(addChecklistAction, idle);
  return (
    <div className="space-y-3">
      {items.length ? (
        <ul className="divide-y rounded-md border">
          {items.map((item, i) => (
            <ChecklistItem key={item.id} item={item} canEdit={canEdit} first={i === 0} last={i === items.length - 1} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{canEdit ? "Break the task into steps you can tick off." : "No steps."}</p>
      )}
      {canEdit ? (
        <form action={action} key={state.status === "ok" ? `added-${items.length}` : "add"} className="space-y-2">
          <input type="hidden" name="taskId" value={taskId} />
          <Textarea name="text" rows={1} aria-label="New step" placeholder="Add a step (paste several lines to add many)" defaultValue={fieldDefault(state, "text", "")} required className="min-h-9" />
          {state.status === "error" ? <FormStatus state={state} /> : null}
          <SubmitButton size="sm" variant="outline" pendingLabel="Adding…">
            <Plus /> Add
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function RemoveFile({ fileId, title }: { fileId: string; title: string }) {
  const [state, action] = useActionState(removeTaskFileAction, idle);
  return (
    <form action={action}>
      <input type="hidden" name="fileId" value={fileId} />
      <button type="submit" aria-label={`Remove ${title}`} title={state.status === "error" ? state.message : `Remove ${title}`} className="rounded p-1 text-muted-foreground hover:bg-hover hover:text-foreground">
        <X className="size-3.5" />
      </button>
    </form>
  );
}

/** Files and links on the task. Files up to 3.5 MB; bigger ones go in Drive and are attached as a link. */
export function TaskFiles({ taskId, files, canEdit }: { taskId: string; files: TaskTeam["files"]; canEdit: boolean }) {
  const [adding, setAdding] = useState(false);
  const [state, action] = useActionState(async (prev: ActionState, f: FormData) => {
    const r = await addTaskFileAction(prev, f);
    if (r.status === "ok") setAdding(false);
    return r;
  }, idle);
  return (
    <div className="space-y-3">
      {files.length ? (
        <ul className="divide-y rounded-md border">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2.5 px-3 py-2 text-sm">
              {f.isLink ? <Link2 className="size-4 shrink-0 text-muted-foreground" /> : <FileText className="size-4 shrink-0 text-muted-foreground" />}
              <div className="min-w-0 flex-1">
                <a href={`/api/task-files/${f.id}`} target="_blank" rel="noopener noreferrer" className="block truncate font-medium hover:underline">
                  {f.title}
                </a>
                <p className="truncate text-xs text-muted-foreground">
                  {f.isLink ? f.host : f.sizeBytes !== null ? formatFileSize(f.sizeBytes) : ""}
                  {f.addedByName ? ` · ${f.addedByName}` : ""} · {formatDateTime(new Date(f.createdAt))}
                </p>
              </div>
              {f.canRemove ? <RemoveFile fileId={f.id} title={f.title} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{canEdit ? "Attach briefs, references or exports, or link to a Drive folder." : "No files."}</p>
      )}
      {state.status === "ok" && !adding ? <FormStatus state={state} /> : null}
      {canEdit && !adding ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus /> Attach
        </Button>
      ) : null}
      {canEdit && adding ? (
        <form action={action} className="space-y-2 rounded-md border p-3">
          <input type="hidden" name="taskId" value={taskId} />
          <label className="block space-y-1 text-xs text-muted-foreground">
            File (up to 3.5 MB)
            <Input name="file" type="file" accept={ACCEPTED_TASK_FILE_EXTENSIONS} className="h-9 text-sm" />
          </label>
          <label className="block space-y-1 text-xs text-muted-foreground">
            Or a link (Drive, Canva, Figma…)
            <Input name="link" type="url" inputMode="url" placeholder="https://" defaultValue={fieldDefault(state, "link", "")} className="h-9 text-sm" />
          </label>
          <label className="block space-y-1 text-xs text-muted-foreground">
            Name (optional)
            <Input name="title" maxLength={120} defaultValue={fieldDefault(state, "title", "")} className="h-9 text-sm" />
          </label>
          {state.status === "error" ? <FormStatus state={state} /> : null}
          <div className="flex gap-2">
            <SubmitButton size="sm" pendingLabel="Attaching…">
              Attach
            </SubmitButton>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function Unlink({ taskId, dependsOnId, label }: { taskId: string; dependsOnId: string; label: string }) {
  const [state, action] = useActionState(removeDependencyAction, idle);
  return (
    <form action={action}>
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="dependsOnId" value={dependsOnId} />
      <button type="submit" aria-label={label} title={state.status === "error" ? state.message : label} className="rounded p-1 text-muted-foreground hover:bg-hover hover:text-foreground">
        <X className="size-3.5" />
      </button>
    </form>
  );
}

/** What this task waits on (finish those first) and what waits on it (Stage 9b.3). */
export function TaskWaits({ taskId, deps, options }: { taskId: string; deps: TaskDependencies; options: Array<{ id: string; title: string; projectName: string }> }) {
  const [state, action] = useActionState(addDependencyAction, idle);
  const taken = new Set(deps.waitingOn.map((t) => t.id));
  const row = (t: TaskDependencies["waitingOn"][number], unlink: React.ReactNode) => (
    <li key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm">
      <Link href={`/tasks/${t.id}` as Route} className={cn("min-w-0 flex-1 truncate hover:underline", t.status === "done" && "text-muted-foreground line-through")}>
        {t.title}
      </Link>
      <Badge tone={t.status === "done" ? "success" : t.status === "blocked" ? "danger" : "neutral"}>{TASK_STATUS_LABELS[t.status]}</Badge>
      {unlink}
    </li>
  );
  const open = deps.waitingOn.filter((t) => t.status !== "done").length;
  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">{open ? `Waits on ${open} unfinished ${open === 1 ? "task" : "tasks"}` : "Waits on"}</p>
        {deps.waitingOn.length ? <ul className="divide-y rounded-md border">{deps.waitingOn.map((t) => row(t, deps.canEdit ? <Unlink taskId={taskId} dependsOnId={t.id} label={`Stop waiting on ${t.title}`} /> : null))}</ul> : <p className="text-muted-foreground">Nothing.</p>}
      </div>
      {deps.blocking.length ? (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Holds up</p>
          <ul className="divide-y rounded-md border">{deps.blocking.map((t) => row(t, null))}</ul>
        </div>
      ) : null}
      {deps.hidden ? <p className="text-xs text-muted-foreground">Also linked to {deps.hidden} {deps.hidden === 1 ? "task" : "tasks"} you can&apos;t see.</p> : null}
      {deps.canEdit && options.some((o) => !taken.has(o.id)) ? (
        <form action={action} key={state.status === "ok" ? `linked-${deps.waitingOn.length}` : "link"} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="taskId" value={taskId} />
          <Select name="dependsOnId" aria-label="Wait on a task" required defaultValue="" className="h-8 min-w-0 flex-1">
            <option value="" disabled>
              Wait on a task…
            </option>
            {options
              .filter((o) => !taken.has(o.id))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title} · {o.projectName}
                </option>
              ))}
          </Select>
          <SubmitButton size="sm" variant="outline" pendingLabel="Linking…">
            Link
          </SubmitButton>
          {state.status === "error" ? <FormStatus state={state} className="basis-full" /> : null}
        </form>
      ) : null}
    </div>
  );
}
