"use server";

// Automation rules (Stage 9b.5).
import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function saveAutomationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().automationRules.save(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Saved. It runs from now on.", values);
}

export async function removeAutomationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().automationRules.remove(actor, String(form.get("automationId") ?? ""));
  if (r.ok) refresh();
  return toActionState(r, "Removed.");
}
