"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import type { TaskStatus } from "@/lib/types";

export type QuickResult = { ok: true; message: string; loggedTodayMinutes?: number } | { ok: false; message: string; needsConfirm?: boolean };

/** Board drag and My Day "done": status and position. */
export async function moveTaskAction(input: { taskId: string; status: TaskStatus; afterId?: string | null; beforeId?: string | null; keepList?: boolean; confirmed?: boolean; canConfirm?: boolean }): Promise<QuickResult> {
  const actor = await requireActor();
  const { keepList, canConfirm, ...move } = input;
  const r = await getServices().tasks.move(actor, move);
  if (!r.ok) {
    const open = r.error.fieldErrors?.confirm?.[0];
    // Screens without a confirm step (Board, My Day) show what's open and point to the task page.
    return open ? { ok: false, needsConfirm: true, message: canConfirm ? r.error.message : `${open} Open the task to mark it done anyway.` } : { ok: false, message: r.error.message };
  }
  // Ticking a row on a list keeps the list still, so the next tap lands where it was aimed (test report L8). The row
  // shows its own state; the list re-sorts on the next visit.
  if (!keepList) refresh();
  return { ok: true, message: input.status === "done" ? "Done." : "Moved." };
}

/** One-tap time from My Day or the task page. */
export async function logTimeAction(input: { taskId: string; minutes: number; workDate?: string }): Promise<QuickResult> {
  const actor = await requireActor();
  const r = await getServices().tasks.logTime(actor, input);
  if (!r.ok) return { ok: false, message: r.error.message };
  refresh();
  return { ok: true, message: "Logged.", loggedTodayMinutes: r.value.loggedTodayMinutes };
}

export async function removeTimeAction(entryId: string): Promise<QuickResult> {
  const actor = await requireActor();
  const r = await getServices().tasks.removeTime(actor, entryId);
  if (!r.ok) return { ok: false, message: r.error.message };
  refresh();
  return { ok: true, message: "Removed." };
}

export async function setBillableAction(entryId: string, billable: boolean): Promise<QuickResult> {
  const actor = await requireActor();
  const r = await getServices().tasks.setBillable(actor, entryId, billable);
  if (!r.ok) return { ok: false, message: r.error.message };
  refresh();
  return { ok: true, message: billable ? "Billable." : "Marked non-billable." };
}

export async function commentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().tasks.comment(actor, values);
  if (r.ok) {
    refresh();
    // A promise in the person's own comment becomes a suggestion for them (12.4), after the reply is sent.
    after(() => getServices().myAssistant.notePromise(actor, { source: "task", sourceId: r.value.id, link: `/tasks/${r.value.taskId}#comments`, text: r.value.body }));
  }
  return toActionState(r, "Posted.", r.ok ? undefined : values);
}

export async function createTaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().tasks.create(actor, values);
  if (!r.ok) return toActionState(r, "", values);
  if (values.stay === "1") {
    refresh();
    return { status: "ok", message: "Added." };
  }
  redirect(`/tasks/${r.value.id}`);
}

export async function updateTaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().tasks.update(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Saved.", r.ok ? undefined : values);
}

export async function deleteTaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().tasks.remove(actor, String(form.get("taskId") ?? ""));
  if (!r.ok) return toActionState(r, "");
  redirect("/");
}
