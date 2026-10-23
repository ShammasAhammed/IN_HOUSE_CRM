"use server";

import { refresh } from "next/cache";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export type DayTotalResult = { ok: true; minutes: number; dayMinutes: number } | { ok: false; message: string };

/** Set the hours spent on a task on a day (the Friday screen). */
export async function setDayTotalAction(input: { taskId: string; workDate: string; hours: string }): Promise<DayTotalResult> {
  const actor = await requireActor();
  const r = await getServices().time.setDayTotal(actor, input);
  if (!r.ok) return { ok: false, message: r.error.fieldErrors?.hours?.[0] ?? r.error.message };
  refresh();
  return { ok: true, ...r.value };
}
