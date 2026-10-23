"use server";

import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function askAccessAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().spaceAccess.ask(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Sent for approval. The other of the owner and HR decides.", r.ok ? undefined : values);
}

export async function decideAccessAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().spaceAccess.decide(actor, values);
  if (r.ok) refresh();
  return toActionState(r, r.ok && r.value.status === "approved" ? "Approved. They'll read it and confirm." : "Refused.", r.ok ? undefined : values);
}

export async function markReviewedAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().spaceAccess.markReviewed(actor, String(form.get("spaceId") ?? ""));
  if (r.ok) refresh();
  return toActionState(r, "Reviewed.");
}
