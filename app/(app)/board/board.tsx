"use client";

// The Board (plan: "keep it fast and keyboard-friendly"). Drag cards between and within columns, or move a focused card
// with Shift + arrow keys; the move shows at once (optimistic) and settles when the server answers. Cards open the task
// page.
import Link from "next/link";
import { useActionState, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Tags } from "@/components/lead-bits";
import { DueChip, PriorityMark, TaskCounts } from "@/components/task-bits";
import { Avatar } from "@/components/ui/avatar";
import { Input, Select } from "@/components/ui/input";
import { idle } from "@/lib/action-state";
import { TASK_STATUS_LABELS, type TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { BoardColumn, TaskView } from "@/services/tasks";
import { createTaskAction, moveTaskAction } from "../tasks/actions";

type Move = { taskId: string; to: TaskStatus; index: number };

function applyMove(columns: BoardColumn[], move: Move): BoardColumn[] {
  let moving: TaskView | undefined;
  const without = columns.map((c) => ({ ...c, tasks: c.tasks.filter((t) => (t.id === move.taskId ? ((moving = t), false) : true)) }));
  if (!moving) return columns;
  return without.map((c) =>
    c.status === move.to ? { ...c, tasks: [...c.tasks.slice(0, move.index), { ...moving!, status: move.to }, ...c.tasks.slice(move.index)] } : c,
  );
}

const COLUMN_TONE: Record<TaskStatus, string> = {
  todo: "bg-muted-foreground",
  in_progress: "bg-info",
  in_review: "bg-warning",
  blocked: "bg-danger",
  done: "bg-success",
};

export function Board({
  columns: serverColumns,
  today,
  projects,
  defaultProjectId,
  defaultOwnerId,
  canCreate,
}: {
  columns: BoardColumn[];
  today: string;
  projects: Array<{ id: string; name: string; clientName: string }>;
  defaultProjectId: string | null;
  defaultOwnerId: string;
  /** Interns, the BDO and accounts don't add tasks (they ask a lead). */
  canCreate: boolean;
}) {
  const [columns, move] = useOptimistic(serverColumns, applyMove);
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ status: TaskStatus; index: number } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  function indexAt(list: HTMLElement, y: number, movingId: string | null): number {
    const cards = [...list.querySelectorAll<HTMLElement>("[data-card]")].filter((el) => el.dataset.card !== movingId);
    const i = cards.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    return i === -1 ? cards.length : i;
  }

  const [focusId, setFocusId] = useState<string | null>(null);

  function moveTo(taskId: string, status: TaskStatus, index: number) {
    const target = columns.find((c) => c.status === status)!.tasks.filter((t) => t.id !== taskId);
    const after = target[index - 1]?.id ?? null;
    const before = target[index]?.id ?? null;
    start(async () => {
      move({ taskId, to: status, index });
      const r = await moveTaskAction({ taskId, status, afterId: after, beforeId: before });
      setError(r.ok ? null : r.message);
    });
  }

  // Mouse dragging uses pointer events, not the browser's drag-and-drop (QA S2-B2): those don't fire for every mouse,
  // trackpad or test tool, and can't scroll a board wider than the screen. Touch keeps scrolling the board; keyboard
  // moves (Shift + arrows) are unchanged.
  const scroller = useRef<HTMLDivElement>(null);
  const justDragged = useRef(false);

  function targetAt(x: number, y: number, movingId: string): { status: TaskStatus; index: number } | null {
    const column = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-column]");
    const list = column?.querySelector<HTMLElement>("[data-list]");
    return column && list ? { status: column.dataset.column as TaskStatus, index: indexAt(list, y, movingId) } : null;
  }

  function startDrag(e: React.PointerEvent, task: TaskView) {
    if (!task.canEdit || e.button !== 0 || e.pointerType === "touch") return;
    const from = { x: e.clientX, y: e.clientY };
    let active = false;
    const onMove = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - from.x, ev.clientY - from.y) < 6) return;
        active = true;
        setDragging(task.id);
        document.body.style.userSelect = "none";
      }
      setDropAt(targetAt(ev.clientX, ev.clientY, task.id));
      // Near the board's left or right edge, scroll it so columns off screen can be reached.
      const box = scroller.current?.getBoundingClientRect();
      if (box && scroller.current) {
        if (ev.clientX > box.right - 48) scroller.current.scrollLeft += 16;
        else if (ev.clientX < box.left + 48) scroller.current.scrollLeft -= 16;
      }
    };
    const finish = (ev: PointerEvent, drop: boolean) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      document.body.style.userSelect = "";
      setDragging(null);
      setDropAt(null);
      if (!active) return;
      // The click that follows a drag must not open the task.
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 0);
      const target = drop ? targetAt(ev.clientX, ev.clientY, task.id) : null;
      if (target) moveTo(task.id, target.status, target.index);
    };
    const onUp = (ev: PointerEvent) => finish(ev, true);
    const onCancel = (ev: PointerEvent) => finish(ev, false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  /** Shift + ←/→ moves a card to the next column (at the top); Shift + ↑/↓ moves it within its column. */
  function keyMove(task: TaskView, key: string) {
    const c = columns.findIndex((col) => col.tasks.some((t) => t.id === task.id));
    const i = columns[c]!.tasks.findIndex((t) => t.id === task.id);
    const next =
      key === "ArrowRight" ? (c < columns.length - 1 ? { col: c + 1, index: 0 } : null)
      : key === "ArrowLeft" ? (c > 0 ? { col: c - 1, index: 0 } : null)
      : key === "ArrowUp" ? (i > 0 ? { col: c, index: i - 1 } : null)
      : key === "ArrowDown" ? (i < columns[c]!.tasks.length - 1 ? { col: c, index: i + 1 } : null)
      : null;
    if (!next) return;
    setFocusId(task.id);
    moveTo(task.id, columns[next.col]!.status, next.index);
  }

  // Keep focus on a card moved with the keyboard: it re-mounts in its new place.
  useEffect(() => {
    if (focusId) document.querySelector<HTMLElement>(`[data-card="${focusId}"] a`)?.focus();
  }, [columns, focusId]);

  return (
    <div className="space-y-2">
      {error ? <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
      <div ref={scroller} className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
        {columns.map((col) => (
          <section key={col.status} data-column={col.status} aria-label={TASK_STATUS_LABELS[col.status]} className="flex w-72 shrink-0 flex-col rounded-lg bg-subtle">
            <header className="flex items-center gap-2 px-3 pt-3 pb-2">
              <span className={cn("size-2 rounded-full", COLUMN_TONE[col.status])} />
              <h2 className="text-sm font-semibold">{TASK_STATUS_LABELS[col.status]}</h2>
              <span className="tabular text-xs text-muted-foreground">{col.tasks.length}</span>
              {col.status === "done" ? <span className="ml-auto text-[11px] text-muted-foreground">last 14 days</span> : null}
            </header>
            {col.status === "todo" && canCreate ? <QuickAdd projects={projects} defaultProjectId={defaultProjectId} ownerId={defaultOwnerId} /> : null}
            <ol data-list className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
              {col.tasks.map((t, i) => (
                <li key={t.id} data-card={t.id}>
                  {dropAt?.status === col.status && dropAt.index === i ? <DropLine /> : null}
                  <Card
                    task={t}
                    today={today}
                    dragging={dragging === t.id}
                    onPointerDown={(e) => startDrag(e, t)}
                    onClickCapture={(e) => justDragged.current && e.preventDefault()}
                    onKeyMove={(key) => keyMove(t, key)}
                  />
                </li>
              ))}
              {dropAt?.status === col.status && dropAt.index >= col.tasks.filter((t) => t.id !== dragging).length ? <DropLine /> : null}
              {col.tasks.length === 0 && dropAt?.status !== col.status ? (
                <li className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">Nothing here</li>
              ) : null}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

function DropLine() {
  return <div className="mb-2 h-0.5 rounded-full bg-primary" />;
}

function Card({
  task,
  today,
  dragging,
  onPointerDown,
  onClickCapture,
  onKeyMove,
}: {
  task: TaskView;
  today: string;
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onClickCapture: (e: React.MouseEvent) => void;
  onKeyMove: (key: string) => void;
}) {
  return (
    <Link
      href={`/tasks/${task.id}`}
      // The browser's own link dragging would take over the pointer; cards move with the pointer events above.
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={onPointerDown}
      onClickCapture={onClickCapture}
      aria-keyshortcuts={task.canEdit ? "Shift+ArrowLeft Shift+ArrowRight Shift+ArrowUp Shift+ArrowDown" : undefined}
      // The card's name for screen readers is the task and its column; moving it is a hint (test report L5).
      aria-label={`${task.title}, ${TASK_STATUS_LABELS[task.status]}`}
      aria-description={task.canEdit ? "Drag, or Shift + arrow keys, to move" : undefined}
      title={task.canEdit ? "Drag, or Shift + arrow keys, to move" : undefined}
      onKeyDown={(e) => {
        if (!task.canEdit || !e.shiftKey || !e.key.startsWith("Arrow")) return;
        e.preventDefault();
        onKeyMove(e.key);
      }}
      className={cn(
        "block rounded-md border bg-card p-2.5 shadow-card outline-none hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring/40",
        task.canEdit && "cursor-grab active:cursor-grabbing",
        task.status === "done" && "opacity-75",
        dragging && "opacity-50",
      )}
    >
      <div className="flex items-start gap-1.5">
        <span className="mt-1.5">
          <PriorityMark priority={task.priority} />
        </span>
        <p className={cn("min-w-0 flex-1 text-sm leading-snug font-medium", task.status === "done" && "line-through decoration-muted-foreground/50")}>{task.title}</p>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {task.clientName} · {task.projectName}
      </p>
      {/* Tags, as on the List (QA S9-20). */}
      {task.tags?.length ? (
        <div className="mt-1.5">
          <Tags tags={task.tags} />
        </div>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <DueChip due={task.dueDate} today={today} done={task.status === "done"} />
          <TaskCounts {...task} />
        </div>
        {task.ownerName ? <Avatar name={task.ownerName} size="sm" className="size-5 shrink-0 text-[9px]" /> : null}
      </div>
    </Link>
  );
}

function QuickAdd({ projects, defaultProjectId, ownerId }: { projects: Array<{ id: string; name: string; clientName: string }>; defaultProjectId: string | null; ownerId: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [state, action, pending] = useActionState(async (prev: Parameters<typeof createTaskAction>[0], form: FormData) => {
    const next = await createTaskAction(prev, form);
    if (next.status === "ok") setTitle("");
    return next;
  }, idle);
  if (projects.length === 0) return null;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mx-2 mb-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-hover hover:text-foreground">
        <Plus className="size-3.5" /> Add a task
      </button>
    );
  }
  return (
    // A second Enter while the first is saving is ignored (QA S9-02); the server also treats a repeat as the same task.
    <form action={action} onSubmit={(e) => pending && e.preventDefault()} className="mx-2 mb-2 space-y-1.5 rounded-md border bg-card p-2">
      <input type="hidden" name="stay" value="1" />
      <input type="hidden" name="ownerId" value={ownerId} />
      <Input name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title, then Enter" aria-label="New task title" className="h-8" autoFocus required minLength={2} readOnly={pending} />
      {defaultProjectId ? (
        <input type="hidden" name="projectId" value={defaultProjectId} />
      ) : (
        <Select name="projectId" aria-label="Project" className="h-8 text-xs" required defaultValue="">
          <option value="" disabled>
            Project…
          </option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.clientName} · {p.name}
            </option>
          ))}
        </Select>
      )}
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">
          Close
        </button>
        {state.status === "error" ? <span className="text-xs text-danger">{state.fieldErrors?.title?.[0] ?? state.message}</span> : null}
        {state.status === "ok" ? <span className="text-xs text-success">Added</span> : null}
      </div>
    </form>
  );
}
