"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

async function fileFrom(form: FormData) {
  const picked = form.get("file");
  return picked instanceof File && picked.size > 0 ? { name: picked.name, bytes: new Uint8Array(await picked.arrayBuffer()) } : null;
}

export async function createAssetAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().assets.create(actor, values, await fileFrom(form));
  if (!r.ok) return toActionState(r, "", values);
  redirect(`/creatives/${r.value.id}`);
}

export async function addVersionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().assets.addVersion(actor, values, await fileFrom(form));
  if (r.ok) refresh();
  return toActionState(r, r.ok ? `Version ${r.value.version} added.` : "", values);
}

export async function reviewAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().assets.review(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Done.", values);
}

export async function assetCommentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().assets.comment(actor, values);
  if (r.ok) {
    refresh();
    after(() => getServices().myAssistant.notePromise(actor, { source: "creative", sourceId: r.value.id, link: `/creatives/${String(values.assetId)}`, text: String(values.body ?? "") }));
  }
  return toActionState(r, "Posted.", values);
}
