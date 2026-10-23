"use server";

import { refresh } from "next/cache";
import { toActionState, type ActionState } from "@/lib/action-state";
import { ok } from "@/lib/result";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function dismissLeadAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().crm.dismiss(actor, String(form.get("rowId") ?? ""));
  if (r.ok) refresh();
  return toActionState(r, "Taken off the list.");
}

export async function syncLeadsAction(_prev: ActionState, _form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const services = getServices();
  const allowed = await services.crm.inbox(actor);
  if (!allowed.ok) return toActionState(allowed, "");
  const r = await services.crm.sync();
  if (r.errors.length) return { status: "error", message: "The CRM couldn't be read just now. Try again in a minute." };
  refresh();
  return toActionState(ok(null), r.won ? `Checked: ${r.won} won ${r.won === 1 ? "lead" : "leads"} up to date.` : "Checked: nothing new.");
}
