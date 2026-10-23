"use server";

// Request forms (Stage 9b.5).
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function saveFormAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().requestForms.save(actor, values);
  if (!r.ok) return toActionState(r, "", values);
  redirect(`/requests/${r.value.id}`);
}

export async function removeFormAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().requestForms.remove(actor, String(form.get("formId") ?? ""));
  if (!r.ok) return toActionState(r, "");
  redirect("/requests");
}

export async function submitRequestAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().requestForms.submit(actor, String(values.formId ?? ""), values);
  if (!r.ok) return toActionState(r, "", values);
  if (r.value.canOpen) redirect(`/tasks/${r.value.taskId}`);
  refresh();
  return toActionState(r, "Sent. The team has it as a task and will pick it up.");
}
