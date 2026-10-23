"use server";

// Company and team goals (Stage 14.3). Money is typed in rupees and kept in paise.
import type { Route } from "next";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

/** A form's number in the goal's unit: rupees (with commas) to paise for money. */
function amount(raw: unknown, unit: unknown): number | null {
  const t = String(raw ?? "").replace(/[,₹\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(unit === "money" ? n * 100 : n) : NaN;
}
function goalInput(form: FormData) {
  const v = formToObject(form, ["projectIds"]);
  return { ...v, target: amount(v.target, v.unit), leadersOnly: v.leadersOnly === "on" };
}

export async function createGoalAction(_: ActionState, form: FormData): Promise<ActionState> {
  const r = await getServices().goals.create(await requireActor(), goalInput(form));
  if (!r.ok) return toActionState(r, "", formToObject(form));
  redirect(`/goals/${r.value.id}` as Route);
}

export async function updateGoalAction(_: ActionState, form: FormData): Promise<ActionState> {
  const r = await getServices().goals.update(await requireActor(), goalInput(form));
  if (r.ok) refresh();
  return toActionState(r, "Saved.", formToObject(form));
}

export async function checkinAction(_: ActionState, form: FormData): Promise<ActionState> {
  const v = formToObject(form);
  const r = await getServices().goals.checkin(await requireActor(), { goalId: v.goalId, note: v.note, value: amount(v.value, v.unit) });
  if (r.ok) refresh();
  return toActionState(r, "Check-in posted.", r.ok ? undefined : v);
}

export async function archiveGoalAction(_: ActionState, form: FormData): Promise<ActionState> {
  const r = await getServices().goals.archive(await requireActor(), String(form.get("goalId") ?? ""));
  if (!r.ok) return toActionState(r, "");
  redirect("/goals" as Route);
}
