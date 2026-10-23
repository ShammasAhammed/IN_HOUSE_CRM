// What was ticked done or undone on this page since it loaded, so My Day's counts change at once while the rows stay
// where they are (QA S2-B7, test report L8). The page refreshes on its next visit, and after an Undo.
import { useSyncExternalStore } from "react";

const done = new Map<string, boolean>();
const listeners = new Set<() => void>();
let version = 0;

export function markDone(taskId: string, isDone: boolean) {
  done.set(taskId, isDone);
  version++;
  for (const l of listeners) l();
}

/** Forget local ticks (leaving My Day): the next visit reads everything fresh from the server. */
export function clearDone() {
  done.clear();
  version++;
}

/** Re-renders when anything is ticked; the number only changes when something did. */
export function useDoneChanges(): ReadonlyMap<string, boolean> {
  useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => version,
    () => 0,
  );
  return done;
}
