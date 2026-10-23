"use server";

// Skills and growth (plan/5): the matrix, levels, goals and learning.
import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function saveSkillAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().growth.saveSkill(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Saved.", r.ok ? undefined : values);
}

export async function removeSkillAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().growth.removeSkill(actor, String(form.get("skillId") ?? ""));
  if (r.ok) refresh();
  return toActionState(r, "Removed.");
}

export async function setRequirementAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().growth.setRequirement(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Saved.");
}

export async function setLevelAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().growth.setLevel(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Level set.", r.ok ? undefined : values);
}

export async function addGoalAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().growth.addGoal(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Goal set.", r.ok ? undefined : values);
}

export async function closeGoalAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().growth.closeGoal(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Closed.");
}

export async function assignLearningAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().growth.assignLearning(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Assigned.", r.ok ? undefined : values);
}

export async function learningStatusAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().growth.learningStatus(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Updated.");
}
