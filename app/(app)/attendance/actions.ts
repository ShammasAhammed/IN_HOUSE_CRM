"use server";

import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export type QuickResult = { ok: boolean; message: string };

export async function checkInAction(input: { location: string; note?: string; lat?: number | null; lng?: number | null }): Promise<QuickResult> {
  const actor = await requireActor();
  const r = await getServices().attendance.checkIn(actor, input);
  if (!r.ok) return { ok: false, message: r.error.message };
  refresh();
  return { ok: true, message: r.value.late ? "Checked in. After 9:45, so it shows as late — that's just for you to see first." : "Checked in." };
}

export async function checkOutAction(input: { workDate?: string; time?: string }): Promise<QuickResult> {
  const actor = await requireActor();
  const r = await getServices().attendance.checkOut(actor, input);
  if (!r.ok) return { ok: false, message: r.error.fieldErrors?.time?.[0] ?? r.error.message };
  refresh();
  return { ok: true, message: "Checked out." };
}

export async function recordAttendanceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().attendance.record(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Saved, with your reason.", values);
}

export async function removeAttendanceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().attendance.remove(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "Removed.", values);
}
