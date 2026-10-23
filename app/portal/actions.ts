"use server";

import { AuthError } from "next-auth";
import type { Route } from "next";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { signIn, signOut } from "@/lib/server/auth";
import { getServices } from "@/lib/server/container";
import { requirePortalUser } from "@/lib/server/session";

/** "Email me a link": the same answer whoever asks. In development the link is shown too. */
export async function requestLinkAction(_: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "").trim();
  if (!email.includes("@")) return { status: "error", message: "Enter the email Oppllo invited.", fieldErrors: { email: ["Enter your email."] }, values: { email } };
  const r = await getServices().portal.requestLink(email);
  return { status: "ok", message: `If ${email} is invited, a sign-in link is on its way. It works once, for 30 minutes.${r.devLink ? ` Development link: ${r.devLink}` : ""}` };
}

export async function googleAction() {
  await signIn("google", { redirectTo: "/portal" });
}

/** The link's button: the token is used only now, never on the email's own visit (link checkers open links). */
export async function linkSignInAction(form: FormData) {
  try {
    await signIn("portal-link", { token: String(form.get("token") ?? ""), redirectTo: "/portal" });
  } catch (err) {
    if (err instanceof AuthError) redirect("/portal/sign-in?expired=1" as Route);
    throw err;
  }
}

export async function portalSignOutAction() {
  await signOut({ redirectTo: "/portal/sign-in" });
}

export async function agreeAction() {
  const user = await requirePortalUser({ allowUnagreed: true });
  await getServices().portal.agree(user);
  redirect("/portal" as Route);
}

export async function decideAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requirePortalUser();
  const values = formToObject(form);
  const r = await getServices().portal.decide(user, values);
  if (r.ok) refresh();
  return toActionState(r, r.ok && r.value.state === "approved" ? "Approved. Thank you!" : "Sent to the team.", r.ok ? undefined : values);
}

export async function commentAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requirePortalUser();
  const values = formToObject(form);
  const r = await getServices().portal.comment(user, values);
  if (r.ok) refresh();
  return toActionState(r, "Comment sent.", r.ok ? undefined : values);
}

export async function requestAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requirePortalUser();
  const values = formToObject(form);
  const r = await getServices().portal.request(user, values);
  return toActionState(r, "Sent. Your Oppllo team has it as a task and will reply.", r.ok ? undefined : values);
}

// ---------- messages (Stage 12.6) ----------

type Done<T> = { ok: true; value: T } | { ok: false; message: string };
type Message = import("@/services/client-chat").PortalMessage;

export async function portalSendMessageAction(form: FormData): Promise<Done<Message>> {
  const user = await requirePortalUser();
  const picked = form.get("file");
  const file = picked instanceof File && picked.size > 0 ? { name: picked.name, bytes: new Uint8Array(await picked.arrayBuffer()) } : null;
  const r = await getServices().clientChat.send(user, { body: form.get("body") ?? "" }, file);
  return r.ok ? r : { ok: false, message: r.error.message };
}

export async function portalEditMessageAction(messageId: string, body: string): Promise<Done<Message>> {
  const user = await requirePortalUser();
  const r = await getServices().clientChat.edit(user, { messageId, body });
  return r.ok ? r : { ok: false, message: r.error.message };
}

export async function portalRemoveMessageAction(messageId: string): Promise<Done<null>> {
  const user = await requirePortalUser();
  const r = await getServices().clientChat.remove(user, messageId);
  return r.ok ? r : { ok: false, message: r.error.message };
}
