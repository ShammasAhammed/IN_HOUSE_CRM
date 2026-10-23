"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import type { Preview } from "@/services/leave";

export async function previewLeaveAction(input: Record<string, unknown>): Promise<{ preview: Preview | null; error: string | null }> {
  const actor = await requireActor();
  const r = await getServices().leave.preview(actor, input);
  return r.ok ? { preview: r.value, error: null } : { preview: null, error: r.error.code === "invalid" && r.error.fieldErrors ? null : r.error.message };
}

export async function applyLeaveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().leave.apply(actor, values);
  if (!r.ok) return toActionState(r, "", values);
  redirect(r.value.approved ? "/leave?done=recorded" : "/leave?done=applied");
}

export async function cancelLeaveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().leave.cancel(actor, String(form.get("requestId") ?? ""));
  if (r.ok) refresh();
  const messages = {
    cancelled: "Leave cancelled. Your balance is back.",
    cut_short_requested: "Asked your approver to end this leave from tomorrow.",
    cut_short: "Your leave now ends today.",
  } as const;
  return toActionState(r, r.ok ? messages[r.value.outcome] : "");
}

export async function decideLeaveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const input = formToObject(form);
  const approve = input.decision === "approve";
  const leave = getServices().leave;
  const r = input.kind === "cut_short" ? await leave.decideCutShort(actor, input, approve) : await leave.decide(actor, input, approve);
  if (r.ok) refresh();
  return toActionState(r, approve ? "Approved." : "Declined.");
}

export async function revokeLeaveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().leave.revoke(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Leave revoked. The person can see your reason.");
}

export async function addHolidayAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().leave.addHoliday(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Holiday added.", values);
}

export async function removeHolidayAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().leave.removeHoliday(actor, String(form.get("holidayId") ?? ""));
  if (r.ok) refresh();
  return toActionState(r, "Holiday removed.");
}

export async function addLeaveTypeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().leave.addType(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Leave type added.", r.ok ? undefined : values);
}

export async function setLeaveTypeActiveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().leave.setTypeActive(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Saved.");
}

export async function setQuotaAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().leave.setQuota(actor, formToObject(form));
  if (r.ok) refresh();
  return toActionState(r, "Quota saved.");
}

export async function grantLeaveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().leave.grant(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Granted. It shows in their balance now.", values);
}
