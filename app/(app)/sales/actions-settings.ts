"use server";

import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function saveConversionsAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().conversions.setSettings(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Saved.", values);
}

export async function setAutoAssignAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().leads.setAutoAssign(actor, form.get("on") === "on");
  if (r.ok) refresh();
  return toActionState(r, "Saved.");
}
