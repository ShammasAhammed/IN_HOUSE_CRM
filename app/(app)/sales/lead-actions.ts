"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import type { Actor } from "@/services/permissions";
import type { Result } from "@/lib/result";

type Call = (actor: Actor, raw: unknown) => Promise<Result<unknown>>;

async function run(call: (s: ReturnType<typeof getServices>) => Call, form: FormData, success: string): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await call(getServices())(actor, values);
  if (r.ok) refresh();
  return toActionState(r, success, values);
}

export const leadStageAction = async (_: ActionState, f: FormData) => run((s) => s.leads.changeStage, f, "Stage changed.");
export const leadOwnerAction = async (_: ActionState, f: FormData) => run((s) => s.leads.assign, f, "Owner changed.");
export const leadNoteAction = async (_: ActionState, f: FormData) => run((s) => s.leads.addNote, f, "Note added.");
export const leadFollowUpAction = async (_: ActionState, f: FormData) => run((s) => s.leads.setFollowUp, f, "Follow-up saved.");
export const leadTagsAction = async (_: ActionState, f: FormData) => run((s) => s.leads.setTags, f, "Tags saved.");

export async function bulkLeadsAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form, ["ids"]);
  const r = await getServices().leads.bulk(actor, values);
  if (r.ok) refresh();
  return toActionState(r, r.ok ? (r.value.changed ? `${r.value.changed} ${r.value.changed === 1 ? "lead" : "leads"} changed.` : "Nothing to change: they already had that.") : "", values);
}

export const leadUpdateAction = async (_: ActionState, f: FormData) => run((s) => s.leads.update, f, "Saved.");

export async function createLeadAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().leads.create(actor, values);
  if (!r.ok) return toActionState(r, "", values);
  redirect(`/sales/leads/${r.value.id}` as Route);
}

export async function goLiveAction(_: ActionState): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().leads.goLive(actor);
  if (r.ok) refresh();
  return toActionState(r, "Sales now works in Oppllo One.");
}

export async function whatsappAction(leadId: string, templateId: string): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const actor = await requireActor();
  const r = await getServices().leads.whatsapp(actor, leadId, templateId);
  if (!r.ok) return { ok: false, message: r.error.message };
  refresh();
  return { ok: true, url: r.value.url };
}

export async function saveViewAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().leads.saveView(actor, values);
  if (r.ok) refresh();
  return toActionState(r, "View saved.", values);
}

export async function removeViewAction(_: ActionState, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const r = await getServices().leads.removeView(actor, String(form.get("viewId") ?? ""));
  if (r.ok) refresh();
  return toActionState(r, "Removed.");
}

export const templatesAction = async (_: ActionState, f: FormData) => run((s) => s.leads.setTemplates, f, "Templates saved.");
