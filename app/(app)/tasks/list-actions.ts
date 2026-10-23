"use server";

import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function bulkTasksAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form, ["ids"]);
  const r = await getServices().tasks.bulk(actor, values);
  if (r.ok) refresh();
  const skipped = r.ok && r.value.skipped ? ` ${r.value.skipped} skipped: not yours to change, or a due date before the start.` : "";
  const msg = r.ok ? `${r.value.changed ? `${r.value.changed} ${r.value.changed === 1 ? "task" : "tasks"} changed.` : "Nothing to change: they already had that."}${skipped}` : "";
  return toActionState(r, msg, values);
}

export async function taskTagsAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().tasks.setTags(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Tags saved.", values);
}

export async function saveTaskViewAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().tasks.saveView(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "View saved.", values);
}

export async function removeTaskViewAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().tasks.removeView(actor, String(form.get("viewId") ?? ""));
  if (r.ok) refresh();
  return toActionState(r, "Removed.");
}
