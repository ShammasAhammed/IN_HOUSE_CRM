"use server";

import { refresh } from "next/cache";
import { toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

/** Disconnect an AI app (D87): its tokens stop working at once. */
export async function disconnectAppAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().mcpAuth.revoke(actor, String(form.get("connectionId") ?? ""));
  if (r.ok) refresh();
  return toActionState(r, "Disconnected.");
}
