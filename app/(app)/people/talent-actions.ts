"use server";

// HR slice 3: intern records and reviews, one-to-ones, letters.
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function saveInternRecordAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().talent.saveRecord(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Saved.", values);
}

export async function reviewInternAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().talent.review(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Review saved.", values);
}

export async function addOneToOneAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().talent.addOneToOne(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Noted.", r.ok ? undefined : values);
}

export async function removeOneToOneAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().talent.removeOneToOne(actor, String(form.get("id") ?? ""));
  if (r.ok) refresh();
  return toActionState(r, "Removed.");
}

export async function issueLetterAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().talent.issueLetter(actor, values);
  if (!r.ok) return toActionState(r, "", values);
  redirect(`/letters/${r.value.id}`);
}

export async function withdrawLetterAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().talent.withdrawLetter(actor, String(form.get("id") ?? ""));
  if (r.ok) refresh();
  return toActionState(r, "Withdrawn.");
}

export async function saveLetterTemplatesAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const v = formToObject(form) as Record<string, string>;
  const raw = Object.fromEntries(["offer", "internship_certificate", "experience", "relieving"].map((k) => [k, { title: v[`${k}.title`] ?? "", body: v[`${k}.body`] ?? "" }]));
  const r = await getServices().talent.saveLetterTemplates(actor, raw);
  if (r.ok) refresh();
  return toActionState(r, "Templates saved.", v);
}
