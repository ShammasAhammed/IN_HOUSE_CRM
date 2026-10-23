"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function saveKnowledgeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().knowledge.save(actor, values);
  if (!r.ok) return toActionState(r, "", values);
  // Reload so the form carries the new version (a second save from this page is then not "stale").
  redirect(`/clients/${String(values.clientId)}/knowledge?done=saved`);
}

export async function addCampaignAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().knowledge.addCampaign(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Added.", r.ok ? undefined : values);
}

export async function removeCampaignAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().knowledge.removeCampaign(actor, String(form.get("campaignId") ?? ""));
  if (r.ok) refresh();
  return toActionState(r, "Removed.");
}

export async function addClientFileAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const picked = form.get("file");
  const file = picked instanceof File && picked.size > 0 ? { name: picked.name, bytes: new Uint8Array(await picked.arrayBuffer()) } : null;
  const { file: _drop, ...kept } = values;
  const r = await getServices().knowledge.addFile(actor, kept, file);
  if (r.ok) refresh();
  return toActionState(r, "Added.", r.ok ? undefined : kept);
}

export async function removeClientFileAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().knowledge.removeFile(actor, String(form.get("fileId") ?? ""));
  if (r.ok) refresh();
  return toActionState(r, "Removed.");
}
