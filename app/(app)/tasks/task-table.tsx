"use client";

// The task list (Stage 9b.1): a sortable table on wide screens, cards on phones, with ticks for bulk changes.
import { Checkbox } from "@/components/ui/choice";
import Link from "next/link";
import type { Route } from "next";
import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { FormStatus, SubmitButton } from "@/components/form";
import { Tags } from "@/components/lead-bits";
import { DueChip, PriorityMark } from "@/components/task-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { fieldDefault, idle, type ActionState } from "@/lib/action-state";
import { formatMinutes } from "@/lib/format";
import { TASK_PRIORITIES, TASK_STATUSES, TASK_STATUS_LABELS, type TaskStatus } from "@/lib/types";
import type { SavedTaskView } from "@/repositories";
import type { TaskView } from "@/services/tasks";
import { bulkTasksAction, removeTaskViewAction, saveTaskViewAction } from "./list-actions";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<TaskStatus, "neutral" | "info" | "brand" | "danger" | "success"> = { todo: "neutral", in_progress: "info", in_review: "brand", blocked: "danger", done: "success" };
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

function Head({ by, label, links }: { by: string; label: string; links: Record<string, { href: string; arrow: string }> }) {
  return (
    <th className="pb-2 font-normal">
      <Link href={links[by]!.href as Route} className="hover:text-foreground">
        {label} {links[by]!.arrow}
      </Link>
    </th>
  );
}

export function TaskTable({ tasks, today, people, tags, sortLinks }: { tasks: TaskView[]; today: string; people: Array<{ id: string; name: string }>; tags: string[]; sortLinks: Record<string, { href: string; arrow: string }> }) {
  const editable = tasks.filter((t) => t.canEdit);
  const [ticked, setPicked] = useState<Set<string>>(new Set());
  // Only ticks on tasks still in the list count: a filter or a change can take ticked tasks out of view.
  const picked = new Set(editable.filter((t) => ticked.has(t.id)).map((t) => t.id));
  const [kind, setKind] = useState("status");
  const [state, action] = useActionState(async (prev: ActionState, form: FormData) => {
    const r = await bulkTasksAction(prev, form);
    if (r.status === "ok") setPicked(new Set());
    return r;
  }, idle);
  const all = picked.size > 0 && picked.size === editable.length;
  const toggle = (id: string) => setPicked((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set([...p, id])));
  return (
    // Room under the last rows for the floating bulk bar (test report BUG-11: it no longer pushes rows down).
    <div className={cn("space-y-2", picked.size > 0 && "pb-28")}>
      {editable.length ? (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox className="size-4 accent-primary" checked={all} onChange={() => setPicked(all ? new Set() : new Set(editable.map((t) => t.id)))} />
          {picked.size ? `${picked.size} picked` : "Pick all you can change"}
        </label>
      ) : null}
      {picked.size ? (
        <form action={action} className="fixed inset-x-3 bottom-20 z-30 mx-auto flex max-w-3xl flex-wrap items-end gap-2 rounded-lg border bg-card p-3 shadow-lg md:right-6 md:bottom-6 md:left-[calc(232px+1.5rem)]">
          {[...picked].map((id) => (
            <input key={id} type="hidden" name="ids" value={id} />
          ))}
          <Select name="action" aria-label="Change" value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 w-auto">
            <option value="status">Set status</option>
            <option value="owner">Assign to</option>
            <option value="priority">Set priority</option>
            <option value="due">Set due date</option>
            <option value="tag_add">Add tag</option>
            <option value="tag_remove">Remove tag</option>
          </Select>
          {kind === "status" ? (
            <Select name="status" aria-label="Status" className="h-9 w-auto">
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          ) : kind === "owner" ? (
            <Select name="ownerId" aria-label="Owner" className="h-9 w-auto">
              <option value="">Nobody</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          ) : kind === "priority" ? (
            <Select name="priority" aria-label="Priority" className="h-9 w-auto">
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {cap(p)}
                </option>
              ))}
            </Select>
          ) : kind === "due" ? (
            <Input name="dueDate" type="date" aria-label="Due date" className="h-9 w-auto" />
          ) : (
            <>
              <Input name="tag" list="task-tags" aria-label="Tag" required maxLength={30} placeholder="e.g. Shoot" className="h-9 w-40" />
              <datalist id="task-tags">
                {tags.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </>
          )}
          <SubmitButton size="sm" pendingLabel="Saving…">
            Apply to {picked.size}
          </SubmitButton>
          <Button type="button" size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
            Clear
          </Button>
          <FormStatus state={state} className="basis-full" />
        </form>
      ) : state.status === "ok" ? (
        <FormStatus state={state} />
      ) : null}

      {/* Phones: cards. */}
      <ul className="divide-y rounded-lg border bg-card shadow-card md:hidden">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-start gap-3 px-3 py-2.5 text-sm">
            {t.canEdit ? <Checkbox aria-label={`Pick ${t.title}`} className="mt-1 size-4 accent-primary" checked={picked.has(t.id)} onChange={() => toggle(t.id)} /> : <span className="w-4" />}
            <Link href={`/tasks/${t.id}` as Route} className="min-w-0 flex-1 space-y-1">
              <span className="flex items-center gap-1.5 font-medium">
                <PriorityMark priority={t.priority} />
                <span className="truncate">{t.title}</span>
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {t.clientName} · {t.projectName} · {t.ownerName ?? "Nobody"}
              </span>
              <span className="flex flex-wrap items-center gap-2 text-xs">
                <Badge tone={STATUS_TONE[t.status]}>{TASK_STATUS_LABELS[t.status]}</Badge>
                <DueChip due={t.dueDate} today={today} done={t.status === "done"} />
                <Tags tags={t.tags ?? []} />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* Wide screens: the table. */}
      <div className="hidden overflow-x-auto rounded-lg border bg-card shadow-card md:block">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b [&>th]:px-3 [&>th]:pt-2.5">
              <th className="w-8" />
              <Head by="title" label="Task" links={sortLinks} />
              <Head by="client" label="Client · project" links={sortLinks} />
              <Head by="status" label="Status" links={sortLinks} />
              <Head by="priority" label="Priority" links={sortLinks} />
              <Head by="owner" label="Owner" links={sortLinks} />
              <Head by="due" label="Due" links={sortLinks} />
              <th className="hidden pb-2 text-right font-normal 2xl:table-cell">Time</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="border-b last:border-0 hover:bg-hover [&>td]:px-3 [&>td]:py-2">
                <td>{t.canEdit ? <Checkbox aria-label={`Pick ${t.title}`} className="size-4 accent-primary" checked={picked.has(t.id)} onChange={() => toggle(t.id)} /> : null}</td>
                <td className="max-w-72">
                  <Link href={`/tasks/${t.id}` as Route} className="block truncate font-medium hover:underline">
                    {t.title}
                  </Link>
                  {t.tags?.length ? (
                    <span className="mt-0.5 block">
                      <Tags tags={t.tags} />
                    </span>
                  ) : null}
                </td>
                <td className="max-w-48 truncate text-muted-foreground">
                  {t.clientName} · {t.projectName}
                </td>
                <td>
                  <Badge tone={STATUS_TONE[t.status]}>{TASK_STATUS_LABELS[t.status]}</Badge>
                </td>
                <td>
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <PriorityMark priority={t.priority} />
                    {cap(t.priority)}
                  </span>
                </td>
                <td className="max-w-36 truncate">{t.ownerName ?? <span className="text-muted-foreground">Nobody</span>}</td>
                <td className="whitespace-nowrap">
                  <DueChip due={t.dueDate} today={today} done={t.status === "done"} />
                </td>
                <td className="tabular hidden text-right whitespace-nowrap text-muted-foreground 2xl:table-cell">
                  {t.loggedMinutes !== null ? formatMinutes(t.loggedMinutes) : ""}
                  {t.estimateMinutes ? ` / ${formatMinutes(t.estimateMinutes)}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TaskViews({ views, query }: { views: SavedTaskView[]; query: string }) {
  const [adding, setAdding] = useState(false);
  // A saved view closes the name box; a refused one keeps it open with the name typed (QA S2-B3).
  const [state, action] = useActionState(async (prev: ActionState, f: FormData) => {
    const r = await saveTaskViewAction(prev, f);
    if (r.status === "ok") setAdding(false);
    return r;
  }, idle);
  const [, remove] = useActionState(removeTaskViewAction, idle);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {views.map((v) => (
        <span key={v.id} className="inline-flex items-center rounded-md border bg-card text-sm">
          <Link href={`/tasks?${v.query}` as Route} className={`rounded-l-md px-2.5 py-1 hover:bg-hover ${v.query === query ? "bg-accent font-medium text-accent-foreground" : ""}`}>
            {v.name}
          </Link>
          <form action={remove}>
            <input type="hidden" name="viewId" value={v.id} />
            <button type="submit" aria-label={`Remove the view ${v.name}`} className="rounded-r-md px-1.5 py-1 text-muted-foreground hover:bg-hover hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </form>
        </span>
      ))}
      {adding ? (
        <form action={action} key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "new"} className="flex items-center gap-1.5">
          <input type="hidden" name="query" value={query} />
          <Input name="name" aria-label="View name" required maxLength={40} placeholder="e.g. My overdue" className="h-8 w-44" autoFocus defaultValue={fieldDefault(state, "name", "")} />
          <SubmitButton size="sm" pendingLabel="Saving…">
            Save
          </SubmitButton>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
          {state.status === "error" ? <FormStatus state={state} /> : null}
        </form>
      ) : (
        <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(true)} disabled={!query}>
          <Plus /> Save this view
        </Button>
      )}
    </div>
  );
}
