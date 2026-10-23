"use server";

import { refresh } from "next/cache";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import type { ImportCheck } from "@/services/lead-import";

export type ImportReply = { ok: true; check: ImportCheck; imported?: number } | { ok: false; message: string };

export async function checkImportAction(payload: unknown): Promise<ImportReply> {
  const actor = await requireActor();
  const r = await getServices().leadImport.preview(actor, payload);
  return r.ok ? { ok: true, check: r.value } : { ok: false, message: r.error.message };
}

export async function runImportAction(payload: unknown): Promise<ImportReply> {
  const actor = await requireActor();
  const r = await getServices().leadImport.run(actor, payload);
  if (!r.ok) return { ok: false, message: r.error.message };
  refresh();
  return { ok: true, check: r.value, imported: r.value.imported };
}
