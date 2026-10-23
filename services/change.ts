// Every state change and its events commit together, or not at all (CLAUDE.md: every state-changing action writes
// an Event). Services make all writes through commit(); the type demands at least one event per change.

import type { Failure, Result } from "@/lib/result";
import type { DataStore, NewEvent, Repositories } from "@/repositories";
import { runAutomations } from "./automation-runner";
import { dispatch } from "./notify";

export type Change<T> = { ok: true; value: T; events: [NewEvent, ...NewEvent[]] };
/** Nothing changed (e.g. an edit that left every field the same): commits nothing, records no event. */
export type NoChange<T> = { ok: true; value: T; events: []; unchanged: true };

/** Rolls the transaction back when the change turns out to be an expected failure. */
class Abort {
  constructor(readonly failure: Failure) {}
}

export async function commit<T>(store: DataStore, fn: (repos: Repositories) => Promise<Change<T> | NoChange<T> | Failure>): Promise<Result<T>> {
  try {
    return await store.transaction(async (repos) => {
      const outcome = await fn(repos);
      if (!outcome.ok) throw new Abort(outcome);
      for (const event of outcome.events) await repos.events.record(event);
      // The event bus: notifications for whoever needs to act, in the same transaction (D82).
      await dispatch(repos, outcome.events);
      // Automation rules (Stage 9b.5) on the same change; what they do is recorded and notified too, never re-run.
      const more = await runAutomations(repos, outcome.events, new Date());
      for (const event of more) await repos.events.record(event);
      if (more.length) await dispatch(repos, more);
      return { ok: true as const, value: outcome.value };
    });
  } catch (err) {
    if (err instanceof Abort) return err.failure;
    throw err;
  }
}

export const change = <T>(value: T, ...events: [NewEvent, ...NewEvent[]]): Change<T> => ({ ok: true, value, events });
export const noChange = <T>(value: T): NoChange<T> => ({ ok: true, value, events: [], unchanged: true });
