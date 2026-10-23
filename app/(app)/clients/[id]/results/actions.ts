"use server";

import { redirect } from "next/navigation";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function saveResultsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().results.save(actor, values);
  if (!r.ok) return toActionState(r, "", values);
  redirect(`/clients/${String(values.clientId)}?done=updated`);
}
