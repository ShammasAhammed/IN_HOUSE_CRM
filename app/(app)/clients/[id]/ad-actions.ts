"use server";

import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function linkAdAccountAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().ads.link(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Linked.", values);
}

export async function unlinkAdAccountAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().ads.unlink(actor, String(form.get("clientId") ?? ""));
  if (r.ok) refresh();
  return toActionState(r, "Unlinked.");
}

export async function refreshAdsAction(clientId: string, range: string): Promise<void> {
  const actor = await requireActor();
  await getServices().ads.forClient(actor, clientId, range, { refresh: true });
  refresh();
}
