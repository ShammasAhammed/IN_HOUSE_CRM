"use server";

// Docs and wiki (Stage 9b.5).
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function createDocAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().docs.create(actor, values);
  if (!r.ok) return toActionState(r, "", values);
  redirect(`/docs/${r.value.id}`);
}

export async function saveDocAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().docs.update(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Saved.", values);
}

export async function restoreDocAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().docs.restore(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "That version is back (saved as the newest).");
}

export async function archiveDocAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().docs.remove(actor, String(form.get("docId") ?? ""));
  if (!r.ok) return toActionState(r, "");
  redirect("/docs");
}

export async function setTrainingAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().docs.setTraining(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Saved.", values);
}

/** Stage 13.4: comments on a page (or on words quoted from it). */
export async function commentDocAction(input: { docId: string; quote?: string; body: string }): Promise<{ ok: true } | { ok: false; message: string }> {
  const r = await getServices().docs.comment(await requireActor(), input);
  if (r.ok) refresh();
  return r.ok ? { ok: true } : { ok: false, message: r.error.message };
}
export async function resolveDocCommentAction(commentId: string, resolved: boolean): Promise<{ ok: true } | { ok: false; message: string }> {
  const r = await getServices().docs.resolveComment(await requireActor(), commentId, resolved);
  if (r.ok) refresh();
  return r.ok ? { ok: true } : { ok: false, message: r.error.message };
}
export async function removeDocCommentAction(commentId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const r = await getServices().docs.removeComment(await requireActor(), commentId);
  if (r.ok) refresh();
  return r.ok ? { ok: true } : { ok: false, message: r.error.message };
}
