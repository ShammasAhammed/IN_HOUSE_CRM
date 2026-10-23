"use server";

import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export type InviteState = ActionState & { link?: string | null };

export async function inviteAction(_: InviteState, form: FormData): Promise<InviteState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().portal.invite(actor, values);
  if (!r.ok) return toActionState(r, "", values);
  // With a link to pass on, keep this form on screen until the inviter has copied it (a refresh would swap it out).
  if (r.value.emailSent) refresh();
  return r.value.emailSent
    ? { status: "ok", message: "Invite emailed." }
    : { status: "ok", message: "Email sending isn't set up yet, so nothing was emailed. Send them this link yourself: it works once, for 7 days.", link: r.value.link };
}

export async function revokePortalAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().portal.revoke(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Access removed.");
}
