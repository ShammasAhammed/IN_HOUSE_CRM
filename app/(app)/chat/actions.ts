"use server";

// Chat (Stage 12.1): sending, correcting and removing messages, older pages, new channels and direct messages;
// AI in chat (Stage 12.2): @AI answers, catch-up and task proposals.
import type { Route } from "next";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import type { CardAction } from "@/repositories";
import type { CatchUp, TaskSuggestions } from "@/services/chat-ai";
import type { CardView } from "@/services/coworker";
import { wire, type WireMessage } from "./wire";

type Done<T> = { ok: true; value: T } | { ok: false; message: string };

export async function sendChatAction(form: FormData): Promise<Done<WireMessage>> {
  const actor = await requireActor();
  const picked = form.get("file");
  const file = picked instanceof File && picked.size > 0 ? { name: picked.name, bytes: new Uint8Array(await picked.arrayBuffer()) } : null;
  const r = await getServices().chat.send(actor, { channelId: form.get("channelId"), body: form.get("body") ?? "" }, file);
  if (!r.ok) return { ok: false, message: r.error.message };
  const m = r.value;
  // A promise in the person's own message becomes a suggestion for them (12.4), after the message is sent.
  if (m.body) after(() => getServices().myAssistant.notePromise(actor, { source: "chat", sourceId: m.id, link: `/chat/${m.channelId}`, text: m.body }));
  // In a chat shared with a client (12.6): an email to its portal users, at most hourly, while unread.
  after(() => getServices().clientChat.alertClients(m.channelId));
  return { ok: true, value: wire(m) };
}

export async function editChatAction(messageId: string, body: string): Promise<Done<WireMessage>> {
  const actor = await requireActor();
  const r = await getServices().chat.edit(actor, { messageId, body });
  return r.ok ? { ok: true, value: wire(r.value) } : { ok: false, message: r.error.message };
}

export async function removeChatAction(messageId: string): Promise<Done<null>> {
  const actor = await requireActor();
  const r = await getServices().chat.remove(actor, messageId);
  return r.ok ? { ok: true, value: null } : { ok: false, message: r.error.message };
}

export async function earlierChatAction(channelId: string, before: { createdAt: string; id: string }): Promise<Done<{ messages: WireMessage[]; hasEarlier: boolean }>> {
  const actor = await requireActor();
  const r = await getServices().chat.earlier(actor, channelId, before);
  return r.ok ? { ok: true, value: { messages: r.value.messages.map(wire), hasEarlier: r.value.hasEarlier } } : { ok: false, message: r.error.message };
}

export async function createTeamChannelAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form, ["memberIds"]);
  const r = await getServices().chat.createTeam(actor, values);
  if (r.ok) redirect(`/chat/${r.value.id}` as Route);
  return toActionState(r, "", values);
}

export async function startDirectAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form, ["personIds"]);
  const r = await getServices().chat.direct(actor, values);
  if (r.ok) redirect(`/chat/${r.value.id}` as Route);
  return toActionState(r, "", values);
}

export async function manageChannelAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().chat.manage(actor, values);
  if (r.ok) refresh();
  const done: Record<string, string> = { rename: "Renamed.", archive: "Archived.", unarchive: "Brought back.", add: "Added.", remove: "Taken out." };
  return toActionState(r, done[String(values.action)] ?? "Saved.");
}

// ---------- AI in chat (Stage 12.2) ----------

export async function askAiAction(questionId: string): Promise<Done<WireMessage>> {
  const actor = await requireActor();
  const r = await getServices().chatAi.answer(actor, questionId);
  return r.ok ? { ok: true, value: wire(r.value) } : { ok: false, message: r.error.message };
}

export async function catchUpAction(target: { channelId: string; since: string | null } | { taskId: string }): Promise<Done<CatchUp>> {
  const actor = await requireActor();
  const r = await getServices().chatAi.catchUp(actor, target);
  return r.ok ? r : { ok: false, message: r.error.message };
}

export async function suggestTasksAction(channelId: string, messageId: string | null): Promise<Done<TaskSuggestions>> {
  const actor = await requireActor();
  const r = await getServices().chatAi.suggestTasks(actor, { channelId, messageId });
  return r.ok ? r : { ok: false, message: r.error.message };
}

export async function approveProposalAction(input: { projectId: string; title: string; ownerId: string; dueDate: string }): Promise<Done<{ id: string }>> {
  const actor = await requireActor();
  const r = await getServices().chatAi.approveTask(actor, input);
  return r.ok ? r : { ok: false, message: r.error.message };
}

// ---------- the AI co-worker's cards (Stage 12.5) ----------

export async function approveCardAction(id: string, actions?: CardAction[]): Promise<Done<CardView>> {
  const actor = await requireActor();
  const r = await getServices().coworker.approve(actor, { id, ...(actions ? { actions } : {}) });
  return r.ok ? r : { ok: false, message: r.error.message };
}

export async function dismissCardAction(id: string): Promise<Done<CardView>> {
  const actor = await requireActor();
  const r = await getServices().coworker.dismiss(actor, id);
  return r.ok ? r : { ok: false, message: r.error.message };
}

export async function snoozeCardAction(id: string, until: "monday" | "3_days" | "client_reply"): Promise<Done<CardView>> {
  const actor = await requireActor();
  const r = await getServices().coworker.snooze(actor, { id, until });
  return r.ok ? r : { ok: false, message: r.error.message };
}

/** @AI in a chat shared with a client (D-12.6a): answered for the asker only, never posted. */
export async function askPrivatelyAction(channelId: string, question: string): Promise<Done<{ text: string; costPaise: number | null }>> {
  const actor = await requireActor();
  const r = await getServices().chatAi.askPrivately(actor, channelId, question);
  return r.ok ? r : { ok: false, message: r.error.message };
}
