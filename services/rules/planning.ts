// Calendar, timeline and dependency rules (Stage 9b.3). Pure, unit-tested.
import { addDays, diffDays, eachDay, startOfMonth, startOfWeek, endOfMonth, type IsoDate } from "@/lib/dates";

/** The days a month calendar shows: whole weeks (Monday first) around the month. */
export function monthGrid(month: IsoDate): IsoDate[] {
  const first = startOfWeek(startOfMonth(month));
  const last = addDays(startOfWeek(endOfMonth(month)), 6);
  return eachDay(first, last);
}

export type Bar = { offset: number; length: number; startsBefore: boolean; endsAfter: boolean };

/**
 * Where a task's bar sits on a timeline of `days` days from `from`: its start (or its due date when it has none) to
 * its due date, cut to the window. Null when it falls outside or has no due date.
 */
export function barFor(start: IsoDate | null, due: IsoDate | null, from: IsoDate, days: number): Bar | null {
  if (!due) return null;
  const s = start && start <= due ? start : due;
  const to = addDays(from, days - 1);
  if (due < from || s > to) return null;
  const a = s < from ? from : s;
  const b = due > to ? to : due;
  return { offset: diffDays(from, a), length: diffDays(a, b) + 1, startsBefore: s < from, endsAfter: due > to };
}

/**
 * Whether making `taskId` wait on `dependsOnId` would close a loop: true when `dependsOnId` already waits, directly or
 * through others, on `taskId`. `waitsOn` maps a task to the tasks it waits on.
 */
export function wouldLoop(taskId: string, dependsOnId: string, waitsOn: ReadonlyMap<string, readonly string[]>): boolean {
  if (taskId === dependsOnId) return true;
  const seen = new Set<string>();
  const stack = [dependsOnId];
  while (stack.length) {
    const t = stack.pop()!;
    if (t === taskId) return true;
    if (seen.has(t)) continue;
    seen.add(t);
    stack.push(...(waitsOn.get(t) ?? []));
  }
  return false;
}
