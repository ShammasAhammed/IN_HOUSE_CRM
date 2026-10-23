"use server";

// Start/stop timer (Stage 9b.5).
import { refresh } from "next/cache";
import { formatMinutes } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

type Reply = { ok: boolean; message: string };

export async function startTimerAction(taskId: string): Promise<Reply> {
  const actor = await requireActor();
  const r = await getServices().timers.start(actor, taskId);
  if (!r.ok) return { ok: false, message: r.error.message };
  refresh();
  const s = r.value.stopped;
  return { ok: true, message: s?.logged ? `Timer started. ${formatMinutes(s.minutes)} logged on the last task.` : "Timer started." };
}

export async function stopTimerAction(): Promise<Reply> {
  const actor = await requireActor();
  const r = await getServices().timers.stop(actor);
  if (!r.ok) return { ok: false, message: r.error.message };
  refresh();
  const v = r.value;
  return { ok: true, message: v.logged ? `${formatMinutes(v.minutes)} logged${v.capped ? " (capped at 12 hours: check it)" : ""}.` : "Under a minute: nothing logged." };
}

export async function discardTimerAction(): Promise<Reply> {
  const actor = await requireActor();
  const r = await getServices().timers.discard(actor);
  if (!r.ok) return { ok: false, message: r.error.message };
  refresh();
  return { ok: true, message: "Timer discarded." };
}
