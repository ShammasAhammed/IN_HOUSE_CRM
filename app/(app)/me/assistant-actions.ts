"use server";

// The personal assistant (Stage 12.4): drafts, promises, switches and report help, each one click by the person.
import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

type Done<T> = { ok: true; value: T } | { ok: false; message: string };

export type DraftTarget = { kind: "chat"; channelId: string } | { kind: "task"; taskId: string } | { kind: "creative"; assetId: string };

export async function draftReplyAction(target: DraftTarget): Promise<Done<string>> {
  const actor = await requireActor();
  const r = await getServices().myAssistant.draftReply(actor, target);
  return r.ok ? { ok: true, value: r.value.text } : { ok: false, message: r.error.message };
}

export async function decidePromiseAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().myAssistant.decidePromise(actor, values);
  if (r.ok) refresh();
  const done: Record<string, string> = { remind: "Reminder set.", task: "Task added.", kept: "Marked kept.", dismiss: "Removed." };
  return toActionState(r, done[String(values.action)] ?? "Saved.", values);
}

export async function setAssistantPartAction(form: FormData): Promise<void> {
  const actor = await requireActor();
  const r = await getServices().myAssistant.setPart(actor, formToObject(form));
  if (r.ok) refresh();
}

export async function weekWriteUpAction(): Promise<Done<{ text: string; costPaise: number | null }>> {
  const actor = await requireActor();
  const r = await getServices().myAssistant.weekWriteUp(actor);
  return r.ok ? r : { ok: false, message: r.error.message };
}

export async function selfReviewAction(): Promise<Done<{ text: string; costPaise: number | null }>> {
  const actor = await requireActor();
  const r = await getServices().myAssistant.selfReview(actor);
  return r.ok ? r : { ok: false, message: r.error.message };
}
