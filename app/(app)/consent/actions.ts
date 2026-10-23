"use server";

import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function recordConsentAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().consent.record(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Consent recorded.", r.ok ? undefined : values);
}

export async function withdrawConsentAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().consent.withdraw(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Withdrawal recorded.", r.ok ? undefined : values);
}
