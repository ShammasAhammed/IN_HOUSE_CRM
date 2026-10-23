"use server";

// People on a task, its checklist and its files (Stage 9b.2).
import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function addTaskPersonAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().taskCollab.addPerson(actor, values);
  if (r.ok) refresh();
  return toActionState(r, values.role === "watcher" ? "Watching." : "Added.", values);
}

export async function removeTaskPersonAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().taskCollab.removePerson(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Removed.");
}

export async function addChecklistAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().taskCollab.addChecklist(actor, values);
  if (r.ok) refresh();
  return toActionState(r, r.ok && r.value.added > 1 ? `${r.value.added} steps added.` : "Added.", r.ok ? undefined : values);
}

export async function changeChecklistAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().taskCollab.changeChecklist(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Saved.", values);
}

export async function addTaskFileAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const picked = form.get("file");
  const file = picked instanceof File && picked.size > 0 ? { name: picked.name, bytes: new Uint8Array(await picked.arrayBuffer()) } : null;
  const r = await getServices().taskCollab.addFile(actor, values, file);
  if (r.ok) refresh();
  return toActionState(r, "Attached.", r.ok ? undefined : values);
}

export async function removeTaskFileAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().taskCollab.removeFile(actor, String(form.get("fileId") ?? ""));
  if (r.ok) refresh();
  return toActionState(r, "Removed.");
}

export async function addDependencyAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().planning.addDependency(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Linked.", values);
}

export async function removeDependencyAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().planning.removeDependency(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Unlinked.");
}
