"use server";

// Meetings library (Stage 13.4).
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function createMeetingAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form, ["attendees"]);
  const r = await getServices().meetings.create(actor, values);
  if (!r.ok) return toActionState(r, "", values);
  redirect(`/docs/${r.value.docId}`);
}

/** Approve one action item: the task is made through the task service. */
export async function approveItemAction(_: ActionState, form: FormData): Promise<ActionState> {
  const r = await getServices().meetings.approve(await requireActor(), formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Task made.");
}

export async function nextMeetingAction(_: ActionState, form: FormData): Promise<ActionState> {
  const r = await getServices().meetings.createNext(await requireActor(), String(form.get("meetingId") ?? ""));
  if (!r.ok) return toActionState(r, "");
  redirect(`/docs/${r.value.docId}`);
}

type AiDone = { ok: true; text: string } | { ok: false; message: string };

/** The AI parts of a meeting (summary, suggested items, notes from a transcript): suggestions to copy into the page. */
export async function meetingAiAction(input: { meetingId: string; kind: "summary" | "actions" | "transcript"; transcript?: string }): Promise<AiDone> {
  const actor = await requireActor();
  const ai = getServices().docAi;
  if (input.kind === "actions") {
    const r = await ai.suggestActions(actor, input.meetingId);
    return r.ok ? { ok: true, text: r.value.items.join("\n") || "No new action items found." } : { ok: false, message: r.error.message };
  }
  const r = input.kind === "summary" ? await ai.summary(actor, input.meetingId) : await ai.notesFromTranscript(actor, { meetingId: input.meetingId, transcript: input.transcript ?? "" });
  return r.ok ? { ok: true, text: r.value.text } : { ok: false, message: r.error.message };
}
