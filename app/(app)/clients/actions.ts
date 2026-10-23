"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

// ---------- clients ----------

export async function createClientAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const services = getServices();
  const r = await services.clientAdmin.create(actor, values);
  if (!r.ok) return toActionState(r, "", values);
  // The client's Drive folder, when Drive is connected; a failure is reported and can be retried from the client page.
  await services.billing.makeFolder(actor, r.value.id);
  redirect(`/clients/${r.value.id}/edit?done=created`);
}

export async function updateClientAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const clientId = String(form.get("clientId") ?? "");
  const values = formToObject(form);
  const r = await getServices().clientAdmin.update(actor, clientId, values);
  if (!r.ok) return toActionState(r, "", values);
  redirect(`/clients/${clientId}?done=updated`);
}

export async function addContactAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().clientAdmin.addContact(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Contact added.", values);
}

export async function updateContactAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().clientAdmin.updateContact(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Saved.", values);
}

export async function removeContactAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().clientAdmin.removeContact(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Removed.");
}

export async function addMemberAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().clientAdmin.addMember(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Added to the team.");
}

export async function removeMemberAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().clientAdmin.removeMember(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Taken off the team.");
}

// ---------- engagements ----------

export async function createEngagementAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().engagements.create(actor, values);
  if (!r.ok) return toActionState(r, "", values);
  redirect(`/engagements/${r.value.id}?done=created`);
}

export async function updateEngagementAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().engagements.update(actor, values);
  if (!r.ok) return toActionState(r, "", values);
  redirect(`/engagements/${r.value.id}?done=updated`);
}

export async function changeFeeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().engagements.changeFee(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Fee saved.", values);
}

export async function addDeliverableAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().engagements.addDeliverable(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Added.", values);
}

export async function updateDeliverableAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().engagements.updateDeliverable(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Saved.", values);
}

export async function removeDeliverableAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().engagements.removeDeliverable(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Removed.");
}

// ---------- projects ----------

export async function createProjectAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().projects.create(actor, values);
  if (!r.ok) return toActionState(r, "", values);
  redirect(`/board?client=${String(values.clientId)}&project=${r.value.id}`);
}
