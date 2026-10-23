"use server";

// A client's sheets, Google files and artifacts (Stage 13.0): add, upload, set up, refresh, remove.
import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function addLinkAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().clientLinks.add(actor, { ...values, kind: values.kind || undefined });
  if (r.ok) refresh();
  return toActionState(r, "Added.", r.ok ? undefined : values);
}

export async function uploadArtifactAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const picked = form.get("file");
  if (!(picked instanceof File) || picked.size === 0) return { status: "error", message: "Pick an .html or .md file." };
  const r = await getServices().clientLinks.upload(actor, formToObject(form), { name: picked.name, bytes: new Uint8Array(await picked.arrayBuffer()) });
  if (r.ok) refresh();
  return toActionState(r, "Uploaded.");
}

/** One setting at a time, sent as JSON from the file's row. */
export async function linkSettingsAction(input: { linkId: string; aiReadable?: boolean; tabs?: string[]; summary?: Array<{ label: string; range: string }>; writeBack?: boolean }): Promise<{ ok: boolean; message: string }> {
  const actor = await requireActor();
  const r = await getServices().clientLinks.settings(actor, input);
  if (r.ok) refresh();
  return r.ok ? { ok: true, message: "Saved." } : { ok: false, message: r.error.message };
}

export async function refreshLinkAction(linkId: string): Promise<{ ok: boolean; message: string }> {
  const actor = await requireActor();
  const r = await getServices().clientLinks.refresh(actor, linkId);
  if (r.ok) refresh();
  return r.ok ? { ok: true, message: r.value.problem ?? "Up to date." } : { ok: false, message: r.error.message };
}

export async function removeLinkAction(linkId: string): Promise<{ ok: boolean; message: string }> {
  const actor = await requireActor();
  const r = await getServices().clientLinks.remove(actor, linkId);
  if (r.ok) refresh();
  return r.ok ? { ok: true, message: "Removed." } : { ok: false, message: r.error.message };
}
