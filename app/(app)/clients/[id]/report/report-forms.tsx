"use client";

import { useActionState } from "react";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { UnsavedGuard } from "@/components/unsaved-guard";
import { Textarea } from "@/components/ui/input";
import { fieldDefault, idle, type ActionState } from "@/lib/action-state";
import { createReportAction, finalizeReportAction, refreshReportAction, saveReportAction, writeReportWithAiAction } from "./actions";

type Key = { clientId: string; month: string; version?: number };

function Hidden({ clientId, month, version }: Key) {
  return (
    <>
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="month" value={month} />
      {version ? <input type="hidden" name="version" value={version} /> : null}
    </>
  );
}

/** A one-button step on the report (start, AI words, refresh numbers, make final). */
function StepButton({ k, action, label, pendingLabel, variant = "outline", disabled }: { k: Key; action: (s: ActionState, f: FormData) => Promise<ActionState>; label: string; pendingLabel: string; variant?: "default" | "outline"; disabled?: boolean }) {
  const [state, formAction] = useActionState(action, idle);
  return (
    <form action={formAction} className="space-y-2">
      <Hidden {...k} />
      <SubmitButton size="sm" variant={variant} pendingLabel={pendingLabel} disabled={disabled}>
        {label}
      </SubmitButton>
      <FormStatus state={state} />
    </form>
  );
}

export const StartReport = ({ k }: { k: Key }) => <StepButton k={k} action={createReportAction} label="Start the report" pendingLabel="Gathering the numbers…" variant="default" />;
export const WriteWithAi = ({ k, disabled }: { k: Key; disabled: boolean }) => <StepButton k={k} action={writeReportWithAiAction} label="Write the words with AI" pendingLabel="Writing…" disabled={disabled} />;
export const RefreshNumbers = ({ k }: { k: Key }) => <StepButton k={k} action={refreshReportAction} label="Read the numbers again" pendingLabel="Reading…" />;
export const MakeFinal = ({ k }: { k: Key }) => <StepButton k={k} action={finalizeReportAction} label="Make final" pendingLabel="Saving…" variant="default" />;

export function ReportTextForm({ k, initial }: { k: Required<Key>; initial: { summary: string; wentWell: string; nextSteps: string } }) {
  const [state, action] = useActionState(saveReportAction, idle);
  const f = (name: keyof typeof initial) => ({ id: name, name, defaultValue: fieldDefault(state, name, initial[name]), maxLength: 6000, ...invalidProps(state, name) });
  return (
    <form action={action} className="space-y-4" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "form"}>
      <UnsavedGuard />
      <Hidden {...k} />
      <Field label="Summary" name="summary" state={state} hint="Two or three sentences on the month.">
        <Textarea {...f("summary")} rows={4} />
      </Field>
      <Field label="What went well" name="wentWell" state={state} hint="One point per line.">
        <Textarea {...f("wentWell")} rows={5} />
      </Field>
      <Field label="Next month" name="nextSteps" state={state} hint="One point per line.">
        <Textarea {...f("nextSteps")} rows={5} />
      </Field>
      <FormStatus state={state} />
      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
    </form>
  );
}
