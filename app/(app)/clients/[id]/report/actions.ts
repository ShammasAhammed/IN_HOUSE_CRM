"use server";

import { refresh } from "next/cache";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

type Step = "create" | "writeWithAi" | "refreshNumbers" | "save" | "finalize";
const DONE: Record<Step, string> = {
  create: "Report started.",
  writeWithAi: "The AI wrote the words. Read and edit them before making the report final.",
  refreshNumbers: "Numbers read again.",
  save: "Saved.",
  finalize: "The report is final.",
};

async function run(step: Step, form: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(form);
  const r = await getServices().reports[step](actor, values);
  if (r.ok) refresh();
  return toActionState(r, DONE[step], r.ok ? undefined : values);
}

export const createReportAction = async (_: ActionState, form: FormData) => run("create", form);
export const writeReportWithAiAction = async (_: ActionState, form: FormData) => run("writeWithAi", form);
export const refreshReportAction = async (_: ActionState, form: FormData) => run("refreshNumbers", form);
export const saveReportAction = async (_: ActionState, form: FormData) => run("save", form);
export const finalizeReportAction = async (_: ActionState, form: FormData) => run("finalize", form);
