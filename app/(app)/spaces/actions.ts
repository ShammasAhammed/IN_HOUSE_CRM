"use server";

import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

type Step = "create" | "update";
const DONE: Record<Step, string> = { create: "Space added.", update: "Saved." };

async function run(step: Step, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().spaces[step](actor, values);
  if (r.ok) refresh();
  return toActionState(r, DONE[step], r.ok ? undefined : values);
}

/** A new space, empty or ready to work from a kit (Stage 14.4: the kit decides privacy). */
export async function createSpaceAction(_: ActionState, form: FormData): Promise<ActionState> {
  const values = formToObject(form);
  if (!values.kit) return run("create", form);
  const r = await getServices().spaceKits.apply(await requireActor(), { kit: values.kit, newSpaceName: values.name });
  if (r.ok) refresh();
  return toActionState(r, r.ok ? `Space added with ${r.value.created.length} things ready to work.${r.value.privacy ? ` ${r.value.privacy}` : ""}` : "", r.ok ? undefined : values);
}
export const updateSpaceAction = async (_: ActionState, form: FormData) => run("update", form);

/** Stage 14.2: removing access is one step and instant (owner or HR); adding goes through a request on Access. */
export async function removeMemberAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().spaceAccess.remove(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Removed.", r.ok ? undefined : values);
}

export async function addSuggestedAction(_: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().spaces.addSuggested(actor);
  if (r.ok) refresh();
  return toActionState(r, r.ok ? `${r.value.created} ${r.value.created === 1 ? "space" : "spaces"} added.` : "");
}

/** Stage 14.4: a kit's preview, then applying it to a space (or a new one). */
export async function previewKitAction(input: { kit: string; spaceId?: string; newSpaceName?: string }) {
  const r = await getServices().spaceKits.preview(await requireActor(), input);
  return r.ok ? { ok: true as const, value: { create: r.value.create, existing: r.value.existing, privacy: r.value.privacy, notes: r.value.notes } } : { ok: false as const, message: r.error.message };
}

export async function applyKitAction(input: { kit: string; spaceId?: string; newSpaceName?: string }) {
  const r = await getServices().spaceKits.apply(await requireActor(), input);
  if (r.ok) refresh();
  return r.ok ? { ok: true as const, value: r.value } : { ok: false as const, message: r.error.message };
}

export async function kitOverridesAction(_: ActionState, form: FormData): Promise<ActionState> {
  const key = String(form.get("kit") ?? "");
  const off = form.getAll("off").map(String);
  const days: Record<string, number> = {};
  const targets: Record<string, number> = {};
  for (const [k, v] of form.entries()) {
    if (k.startsWith("day:") && String(v).trim()) days[k.slice(4)] = Number(v);
    if (k.startsWith("target:") && String(v).trim()) targets[k.slice(7)] = Number(v);
  }
  const r = await getServices().spaceKits.setOverrides(await requireActor(), key, { off, days, targets });
  if (r.ok) refresh();
  return toActionState(r, "Kit saved. It applies to spaces set up from now on.");
}
