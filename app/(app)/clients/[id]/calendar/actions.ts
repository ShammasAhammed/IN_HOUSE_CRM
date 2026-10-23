"use server";

import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function saveContentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const services = getServices();
  const r = values.itemId ? await services.content.update(actor, values) : await services.content.create(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Saved.", values);
}

export async function removeContentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().content.remove(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Removed.");
}
