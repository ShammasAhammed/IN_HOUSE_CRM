"use server";

import { refresh } from "next/cache";
import { toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function confirmAccessAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().spaceAccess.confirm(actor, String(form.get("requestId") ?? ""));
  if (r.ok) refresh();
  return toActionState(r, "Access is open.");
}
