"use server";

import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export type AskReply = { ok: true; text: string; costPaise: number | null } | { ok: false; message: string };

/** One question, with the conversation so far (kept in the browser; Oppllo One doesn't store questions). */
export async function askAction(question: string, history: Array<{ role: "user" | "assistant"; text: string }>, mode: "mine" | "all" = "mine"): Promise<AskReply> {
  const actor = await requireActor();
  const r = await getServices().assistant.ask(actor, { question, history, mode });
  if (!r.ok) return { ok: false, message: r.error.message };
  return { ok: true, text: r.value.text, costPaise: r.value.costPaise };
}
