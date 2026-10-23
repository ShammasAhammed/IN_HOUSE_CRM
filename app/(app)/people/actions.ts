"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function createPersonAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form, ["roles"]);
  const r = await getServices().people.create(actor, values);
  if (!r.ok) return toActionState(r, "", values);
  redirect(`/people/${r.value.id}?done=created`);
}

export async function updatePersonAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const personId = String(form.get("personId") ?? "");
  const values = formToObject(form, ["roles"]);
  const r = await getServices().people.update(actor, personId, values);
  if (!r.ok) return toActionState(r, "", values);
  redirect(`/people/${personId}?done=updated`);
}

export async function updateMyContactAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().people.updateMyContact(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Saved.", values);
}

export async function markLeftAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().people.markLeft(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Recorded. They can no longer sign in.");
}

// ---------- access register and checklists ----------

export async function grantAccessAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().access.grant(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Access recorded.", values);
}

export async function revokeAccessAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().access.revoke(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Marked as removed.");
}

export async function startChecklistAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().access.startChecklist(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Checklist started.");
}

export async function checklistDoneAction(input: { itemId: string; done: boolean }): Promise<{ ok: boolean; message: string }> {
  const actor = await requireActor();
  const r = await getServices().access.setDone(actor, { itemId: input.itemId, done: String(input.done) });
  if (!r.ok) return { ok: false, message: r.error.message };
  refresh();
  return { ok: true, message: "" };
}

export async function addChecklistItemAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().access.addItem(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Added.", values);
}

export async function removeChecklistItemAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().access.removeItem(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Removed.");
}

export async function setChecklistTemplateAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().access.setTemplate(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Saved. Checklists started from now on use it.", values);
}

// ---------- document locker ----------

export async function uploadDocumentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const picked = form.get("file");
  const file = picked instanceof File && picked.size > 0 ? { name: picked.name, bytes: new Uint8Array(await picked.arrayBuffer()) } : null;
  const r = await getServices().documents.upload(actor, values, file);
  if (r.ok) refresh();
  return toActionState(r, "Uploaded.", values);
}

export async function updateDocumentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().documents.update(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Saved.", values);
}

export async function removeDocumentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().documents.remove(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Removed.");
}

// ---------- teams ----------

export async function saveTeamAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().people.saveTeam(actor, values);
  if (r.ok) refresh();
  return toActionState(r, values.departmentId ? "Saved." : "Team added.", values);
}

export async function removeTeamAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().people.removeTeam(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Team removed.", values);
}
