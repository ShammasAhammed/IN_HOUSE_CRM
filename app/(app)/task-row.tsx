"use client";

// One task on My Day: tick to finish, tap to log time. Both respond instantly; the server catches up.
import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Undo2 } from "lucide-react";
import { DueChip, PriorityMark, TaskCounts } from "@/components/task-bits";
import { cn } from "@/lib/utils";
import { QUICK_LOG_MINUTES } from "@/services/rules/time";
import type { TaskView } from "@/services/tasks";
import { logTimeAction, moveTaskAction } from "./tasks/actions";
import { markDone } from "./done-store";

export function TaskRow({ task, today, showLog = true, showWhere = true }: { task: TaskView; today: string; showLog?: boolean; showWhere?: boolean }) {
  const [done, setDone] = useState(task.status === "done");
  // Unticking puts the task back where it was (In progress stays In progress); one done before the page loaded reopens to To do.
  const [before] = useState(task.status === "done" ? "todo" : task.status);
  const [logged, setLogged] = useState(task.loggedMinutes);
  const [flash, setFlash] = useState<{ text: string; error?: boolean } | null>(null);
  const [, start] = useTransition();

  const toggle = () => {
    const next = !done;
    setDone(next);
    start(async () => {
      // Done keeps the list still (test report L8); Undo puts the task back in its section at once (QA S9-10).
      const r = await moveTaskAction({ taskId: task.id, status: next ? "done" : before, keepList: next });
      if (!r.ok) {
        setDone(!next);
        setFlash({ text: r.message, error: true });
      } else markDone(task.id, next);
    });
  };

  const log = (minutes: number) => {
    setLogged((m) => (m ?? 0) + minutes);
    setFlash({ text: `+${minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`}` });
    start(async () => {
      const r = await logTimeAction({ taskId: task.id, minutes });
      if (!r.ok) {
        setLogged((m) => (m ?? 0) - minutes);
        setFlash({ text: r.message, error: true });
      }
    });
  };

  return (
    <li className={cn("group flex flex-wrap items-start gap-x-3 gap-y-2 px-3 py-2.5 sm:flex-nowrap md:px-4", done && "bg-subtle/60")}>
      <button
        type="button"
        onClick={toggle}
        disabled={!task.canEdit}
        aria-label={done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:opacity-40",
          done ? "border-success bg-success text-primary-foreground" : "border-border-strong hover:border-success hover:bg-success-soft",
        )}
      >
        {done ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </button>
      <div className="min-w-0 flex-1 basis-[calc(100%-2.25rem)] sm:basis-0">
        <div className="flex items-center gap-2">
          <PriorityMark priority={task.priority} />
          <Link href={`/tasks/${task.id}`} className={cn("min-w-0 truncate font-medium hover:underline", done && "text-muted-foreground line-through")}>
            {task.title}
          </Link>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {showWhere ? (
            <span className="truncate text-muted-foreground">
              {task.clientName} · {task.projectName}
            </span>
          ) : null}
          <DueChip due={task.dueDate} today={today} done={done} />
          <TaskCounts {...task} loggedMinutes={logged} />
          {flash ? <span className={cn("font-medium", flash.error ? "text-danger" : "text-success")}>{flash.text}</span> : null}
        </div>
      </div>
      {showLog ? (
        // Hidden, not removed, once done: the row keeps its height so the rows below don't move (test report L8).
        <div aria-hidden={done || undefined} className={cn("ml-9 flex shrink-0 items-center gap-1 opacity-100 sm:ml-0 md:opacity-60 md:group-hover:opacity-100 md:focus-within:opacity-100", done && "invisible")}>
          {QUICK_LOG_MINUTES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => log(m)}
              className="tabular h-7 rounded-md border border-border-strong bg-card px-2 text-xs font-medium text-foreground-2 hover:border-primary hover:text-primary"
              aria-label={`Log ${m} minutes on “${task.title}”`}
            >
              +{m >= 60 ? `${m / 60}h` : `${m}m`}
            </button>
          ))}
        </div>
      ) : null}
      {done ? (
        <button type="button" onClick={toggle} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" aria-label="Undo">
          <Undo2 className="size-3.5" /> Undo
        </button>
      ) : null}
    </li>
  );
}
