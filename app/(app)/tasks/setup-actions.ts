"use server";

// Custom fields and templates (Stage 9b.4).
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function addFieldAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().taskSetup.addField(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Field added.", r.ok ? undefined : values);
}

export async function changeFieldAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().taskSetup.changeField(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Saved.", values);
}

export async function setFieldValuesAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form) as Record<string, string>;
  const r = await getServices().taskSetup.setValues(actor, String(values.taskId ?? ""), values);
  if (r.ok) refresh();
  return toActionState(r, r.ok && r.value.changed ? "Saved." : "Nothing changed.", values);
}

export async function saveTemplateAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const services = getServices().taskSetup;
  const r = values.kind === "project" ? await services.saveProjectTemplate(actor, values) : await services.saveTaskTemplate(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Saved as a template. Find it under Tasks → Fields and templates.", values);
}

export async function removeTemplateAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().taskSetup.removeTemplate(actor, String(form.get("templateId") ?? ""));
  if (r.ok) refresh();
  return toActionState(r, "Removed.");
}

export async function taskFromTemplateAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().taskSetup.createTask(actor, values);
  if (!r.ok) return toActionState(r, "", values);
  redirect(`/tasks/${r.value.id}`);
}

export async function projectFromTemplateAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().taskSetup.createProject(actor, values);
  if (!r.ok) return toActionState(r, "", values);
  redirect(`/projects/${r.value.id}`);
}
