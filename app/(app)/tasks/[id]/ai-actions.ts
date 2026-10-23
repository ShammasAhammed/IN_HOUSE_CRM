"use server";

import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function requestDraftAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().aiDrafts.request(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Draft ready below. Check it, edit it, then approve or reject.", r.ok ? undefined : values);
}

export async function decideDraftAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().aiDrafts.decide(actor, values);
  if (r.ok) refresh();
  return toActionState(r, r.ok && r.value.status === "approved" ? "Approved." : "Rejected.", r.ok ? undefined : values);
}
