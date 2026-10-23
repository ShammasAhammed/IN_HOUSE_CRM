"use server";

import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function setProjectStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().projects.setStatus(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Saved.");
}

export async function setProjectStageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().projects.setStage(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Saved.");
}

export async function createRecurrenceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().recurrences.create(actor, values);
  if (r.ok) refresh();
  return toActionState(r, r.ok ? `Set up. ${r.value.tasks === 1 ? "1 task" : `${r.value.tasks} tasks`} made for the next two weeks.` : "", values);
}

export async function updateRecurrenceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().recurrences.update(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Saved. Open tasks nobody has touched follow the change.", values);
}

export async function setRecurrenceActiveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().recurrences.setActive(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Saved.");
}

export async function removeRecurrenceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().recurrences.remove(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Removed.");
}
