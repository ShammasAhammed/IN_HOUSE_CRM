"use server";

import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import type { Actor } from "@/services/permissions";
import type { Result } from "@/lib/result";

type Call = (actor: Actor, raw: unknown) => Promise<Result<unknown>>;

/** Every settings form: run the service call, refresh on success, keep typed values on error. */
async function run(call: (s: ReturnType<typeof getServices>) => Call, form: FormData, success: string, arrays: string[] = []): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form, arrays);
  const r = await call(getServices())(actor, values);
  if (r.ok) refresh();
  return toActionState(r, success, values);
}

export const createServiceAction = async (_: ActionState, f: FormData) => run((s) => s.catalog.createService, f, "Service added with the default stages.");
export const updateServiceAction = async (_: ActionState, f: FormData) => run((s) => s.catalog.updateService, f, "Saved.");
export const moveServiceAction = async (_: ActionState, f: FormData) => run((s) => s.catalog.moveService, f, "Moved.");
export const addStageAction = async (_: ActionState, f: FormData) => run((s) => s.catalog.addStage, f, "Stage added.");
export const renameStageAction = async (_: ActionState, f: FormData) => run((s) => s.catalog.renameStage, f, "Saved.");
export const moveStageAction = async (_: ActionState, f: FormData) => run((s) => s.catalog.moveStage, f, "Moved.");
export const removeStageAction = async (_: ActionState, f: FormData) => run((s) => s.catalog.removeStage, f, "Removed.");
export const addTemplateAction = async (_: ActionState, f: FormData) => run((s) => s.catalog.addTemplate, f, "Starter task added.");
export const updateTemplateAction = async (_: ActionState, f: FormData) => run((s) => s.catalog.updateTemplate, f, "Saved.");
export const moveTemplateAction = async (_: ActionState, f: FormData) => run((s) => s.catalog.moveTemplate, f, "Moved.");
export const removeTemplateAction = async (_: ActionState, f: FormData) => run((s) => s.catalog.removeTemplate, f, "Removed.");
export const setWorkWeekAction = async (_: ActionState, f: FormData) => run((s) => s.leave.setWorkWeek, f, "Working week saved.", ["workingWeekdays", "saturdaysOff"]);
export const setAiLimitAction = async (_: ActionState, f: FormData) => run((s) => s.ai.setLimit, f, "Limit saved.");
export const setDailySummaryAction = async (_: ActionState, f: FormData) => run((s) => s.dailySummary.setOn, f, "Saved.");
export const setChatAiAction = async (_: ActionState, f: FormData) => run((s) => s.chatAi.setOn, f, "Saved.");
export const setAssistantAiAction = async (_: ActionState, f: FormData) => run((s) => s.myAssistant.setOwnerSetting, f, "Saved.");

// ---------- ClickUp import ----------

export type PreviewResult = { ok: true; preview: import("@/services/import").ImportPreview } | { ok: false; message: string };
export type ImportRunResult = { ok: true; result: import("@/services/import").ImportResult } | { ok: false; message: string };

export async function previewImportAction(tasks: unknown): Promise<PreviewResult> {
  const actor = await requireActor();
  const r = await getServices().import.preview(actor, tasks);
  return r.ok ? { ok: true, preview: r.value } : { ok: false, message: r.error.message };
}

export async function runImportAction(input: { tasks: unknown; mapping: unknown }): Promise<ImportRunResult> {
  const actor = await requireActor();
  const r = await getServices().import.run(actor, input);
  if (!r.ok) return { ok: false, message: r.error.message };
  refresh();
  return { ok: true, result: r.value };
}

/** The AI co-worker's switches (Stage 12.5): one small change per form. */
export async function coworkerAction(form: FormData): Promise<void> {
  const actor = await requireActor();
  const r = await getServices().coworker.set(actor, formToObject(form));
  if (r.ok) refresh();
}

/** The AI router's settings (Stage 12.3): one small change per form (move a model, lock a feature, a switch…). */
export async function routerAction(form: FormData): Promise<void> {
  const actor = await requireActor();
  const r = await getServices().ai.setRouter(actor, formToObject(form));
  if (r.ok) refresh();
}

export type CompareResult = { ok: true; text: string; costPaise: number | null } | { ok: false; message: string };

/** One example on one model, for the owner's comparison (Stage 12.3). Logged as "compare" inside the limit. */
export async function compareAction(input: { model: string; instruction: string; example: string }): Promise<CompareResult> {
  const actor = await requireActor();
  const r = await getServices().ai.compare(actor, input.model, {
    system: input.instruction.slice(0, 4000) || "Answer the request.",
    turns: [{ role: "user", text: input.example.slice(0, 8000) }],
    tools: [],
    effort: "low",
    maxOutputTokens: 1500,
    maxSteps: 1,
    maxCostMicroUsd: 100_000,
  });
  return r.ok ? { ok: true, text: r.value.text, costPaise: r.value.costPaise } : { ok: false, message: r.error.message };
}

/** "Use this model first for this feature", from the comparison. */
export async function preferModelAction(feature: string, model: string): Promise<{ ok: boolean; message: string }> {
  const actor = await requireActor();
  const r = await getServices().ai.setRouter(actor, { op: "prefer", feature, model });
  if (r.ok) refresh();
  return r.ok ? { ok: true, message: `${model} is now tried first.` } : { ok: false, message: r.error.message };
}
