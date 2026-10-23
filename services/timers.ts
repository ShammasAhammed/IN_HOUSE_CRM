// Start/stop timer (Stage 9b.5, ClickUp parity). One running timer per person; starting another stops the first.
// Stopping logs the minutes on the task for the day it started, through the same rules as one-tap time.
import { istDate } from "@/lib/dates";
import { isId, newId } from "@/lib/id";
import { conflict, notFound, type Result } from "@/lib/result";
import type { DataStore, NewEvent, Repositories, RunningTimer } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, type Actor } from "./permissions";
import { levelBlocks } from "./spaces";
import { isTimeLocked } from "./rules/time";
import { taskScope } from "./tasks";

/** A timer left running longer than this was almost surely forgotten: it logs this much, and says so. */
export const MAX_TIMER_MINUTES = 12 * 60;

export type StoppedTimer = { minutes: number; capped: boolean; logged: boolean; taskId: string };

export function createTimerService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;

  /** Ends the timer and logs its time (under a minute logs nothing). Inside a commit. */
  async function stopAndLog(repos: Repositories, actor: Actor, timer: RunningTimer): Promise<{ result: StoppedTimer; events: NewEvent[] } | null> {
    const now = clock.now();
    const elapsed = Math.round((now.getTime() - timer.startedAt.getTime()) / 60000);
    const minutes = Math.min(Math.max(elapsed, 0), MAX_TIMER_MINUTES);
    const workDate = istDate(timer.startedAt);
    const t = await repos.tasks.findById(timer.taskId, { kind: "all" });
    const canLog = minutes >= 1 && t !== null && (!isTimeLocked(workDate, clock.today()) || can(actor, "time.manage"));
    const entryId = canLog ? newId() : null;
    const events: NewEvent[] = [{ actorId: actor.personId, action: "timer.stopped", entityType: "timer", entityId: timer.id, personId: actor.personId, clientId: t?.clientId ?? null, data: { taskId: timer.taskId, minutes, capped: elapsed > MAX_TIMER_MINUTES } }];
    if (canLog && t && entryId) {
      await repos.time.add(entryId, { taskId: t.id, personId: actor.personId, clientId: t.clientId, engagementId: t.engagementId, workDate, minutes, billable: t.engagementId !== null, note: elapsed > MAX_TIMER_MINUTES ? "Timer ran over 12 hours; logged 12. Check it." : "Timer" });
      events.push({ actorId: actor.personId, action: "time.logged", entityType: "time_entry", entityId: entryId, clientId: t.clientId, data: { taskId: t.id, minutes, workDate, timer: true } });
    }
    // After the entry exists (the timer points at it); a timer stopped meanwhile undoes the whole change.
    if (!(await repos.time.stopTimer(timer.id, now, entryId))) return null;
    return { result: { minutes, capped: elapsed > MAX_TIMER_MINUTES, logged: canLog, taskId: timer.taskId }, events };
  }

  return {
    async running(actor: Actor): Promise<RunningTimer | null> {
      return store.time.runningTimer(actor.personId);
    },

    /** Start timing a task you can see. A timer already running on another task is stopped and logged first. */
    async start(actor: Actor, taskId: string): Promise<Result<{ stopped: StoppedTimer | null }>> {
      if (!isId(taskId)) return notFound("That task");
      return commit(store, async (repos) => {
        const t = await repos.tasks.findById(taskId, taskScope(actor));
        if (!t) return notFound("That task");
        { const blocked = await levelBlocks(repos, actor, t.clientId, "edit"); if (blocked) return blocked; }
        const current = await repos.time.runningTimer(actor.personId);
        if (current?.taskId === t.id) return noChange({ stopped: null });
        const stopped = current ? await stopAndLog(repos, actor, current) : null;
        if (current && !stopped) return conflict("That timer just changed. Try again.");
        const id = newId();
        await repos.time.startTimer({ id, personId: actor.personId, taskId: t.id, startedAt: clock.now() });
        const started: NewEvent = { actorId: actor.personId, action: "timer.started", entityType: "timer", entityId: id, personId: actor.personId, clientId: t.clientId, data: { taskId: t.id, title: t.title } };
        return change({ stopped: stopped?.result ?? null }, started, ...(stopped?.events ?? []));
      });
    },

    async stop(actor: Actor): Promise<Result<StoppedTimer>> {
      return commit(store, async (repos) => {
        const current = await repos.time.runningTimer(actor.personId);
        if (!current) return notFound("A running timer");
        const stopped = await stopAndLog(repos, actor, current);
        if (!stopped) return conflict("That timer was already stopped.");
        const [first, ...rest] = stopped.events;
        return change(stopped.result, first!, ...rest);
      });
    },

    /** Throw a running timer away without logging (started by mistake). */
    async discard(actor: Actor): Promise<Result<null>> {
      return commit(store, async (repos) => {
        const current = await repos.time.runningTimer(actor.personId);
        if (!current) return notFound("A running timer");
        if (!(await repos.time.stopTimer(current.id, clock.now(), null))) return conflict("That timer was already stopped.");
        return change(null, { actorId: actor.personId, action: "timer.discarded", entityType: "timer", entityId: current.id, personId: actor.personId, data: { taskId: current.taskId } });
      });
    },
  };
}

export type TimerService = ReturnType<typeof createTimerService>;
