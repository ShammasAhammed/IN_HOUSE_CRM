"use server";

// Ops extras on the client page: the Drive folder and Zoho Books invoices.
import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export async function makeFolderAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().billing.makeFolder(actor, String(form.get("clientId") ?? ""));
  if (r.ok) refresh();
  return toActionState(r, "Folder ready.");
}

export async function createInvoiceAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().billing.createInvoice(actor, values);
  if (r.ok) refresh();
  return toActionState(r, r.ok ? `Draft ${r.value.number} made in Zoho Books.` : "", r.ok ? undefined : values);
}
