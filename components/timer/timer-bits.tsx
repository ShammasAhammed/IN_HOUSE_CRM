"use client";

// The running timer (Stage 9b.5): a ticking chip in the frame with Stop, and Start on a task page.
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState, useTransition } from "react";
import { Pause, Play, Timer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { discardTimerAction, startTimerAction, stopTimerAction } from "./actions";

const clockText = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

function useElapsed(startedAt: string) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now === null ? "–:––:––" : clockText(now - new Date(startedAt).getTime());
}

export function RunningTimer({ timer, compact = false }: { timer: { taskId: string; taskTitle: string; clientName: string; startedAt: string }; compact?: boolean }) {
  const elapsed = useElapsed(timer.startedAt);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) => start(async () => setMessage((await fn()).message));
  return (
    <div className={cn("flex items-center gap-1.5 rounded-md border border-primary/30 bg-accent px-2 py-1 text-xs text-accent-foreground", compact && "py-0.5")} role="status" aria-live="polite">
      <Timer className="size-3.5 shrink-0" aria-hidden />
      <span className="tabular font-medium">{elapsed}</span>
      {compact ? null : (
        <Link href={`/tasks/${timer.taskId}` as Route} className="min-w-0 flex-1 truncate hover:underline" title={`${timer.taskTitle} · ${timer.clientName}`}>
          {timer.taskTitle}
        </Link>
      )}
      <button type="button" disabled={pending} onClick={() => run(stopTimerAction)} aria-label="Stop the timer and log the time" title="Stop and log" className="rounded p-0.5 hover:bg-hover">
        <Pause className="size-3.5" />
      </button>
      {compact ? null : (
        <button type="button" disabled={pending} onClick={() => run(discardTimerAction)} aria-label="Discard the timer without logging" title="Discard" className="rounded p-0.5 hover:bg-hover">
          <Trash2 className="size-3.5" />
        </button>
      )}
      {message ? <span className="sr-only">{message}</span> : null}
    </div>
  );
}

/** On a task page: start timing it, or stop if it is the one running. */
export function TaskTimerButton({ taskId, runningHere }: { taskId: string; runningHere: boolean }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant={runningHere ? "default" : "outline"}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = runningHere ? await stopTimerAction() : await startTimerAction(taskId);
            setMessage({ text: r.message, error: !r.ok });
          })
        }
      >
        {runningHere ? <Pause /> : <Play />} {runningHere ? "Stop timer" : "Start timer"}
      </Button>
      {message ? <p className={cn("max-w-48 text-right text-xs", message.error ? "text-danger" : "text-muted-foreground")}>{message.text}</p> : null}
    </div>
  );
}
