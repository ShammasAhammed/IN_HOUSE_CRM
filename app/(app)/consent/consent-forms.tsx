"use client";

import { useActionState } from "react";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Input, Select } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { CONSENT_METHOD_LABELS, CONSENT_METHODS, type ConsentSubject } from "@/lib/types";
import { recordConsentAction, withdrawConsentAction } from "./actions";

function MethodSelect({ id, value }: { id: string; value: string }) {
  return (
    <Select id={id} name="method" defaultValue={value}>
      {CONSENT_METHODS.map((m) => (
        <option key={m} value={m}>
          {CONSENT_METHOD_LABELS[m]}
        </option>
      ))}
    </Select>
  );
}

export function RecordConsentForm({ subjectType, subjectId, today, defaultPurpose }: { subjectType: ConsentSubject; subjectId: string; today: string; defaultPurpose: string }) {
  const [state, action] = useActionState(recordConsentAction, idle);
  return (
    <form action={action} className="space-y-3" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "form"}>
      <input type="hidden" name="subjectType" value={subjectType} />
      <input type="hidden" name="subjectId" value={subjectId} />
      <Field label="What was agreed" name="purpose" htmlFor="c-purpose" state={state}>
        <Input id="c-purpose" name="purpose" maxLength={300} defaultValue={fieldDefault(state, "purpose", defaultPurpose)} {...invalidProps(state, "purpose", "c-purpose")} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="How" name="method" htmlFor="c-method" state={state}>
          <MethodSelect id="c-method" value={fieldDefault(state, "method", subjectType === "lead" ? "call" : "paper")} />
        </Field>
        <Field label="When" name="givenOn" htmlFor="c-given" state={state}>
          <Input id="c-given" name="givenOn" type="date" max={today} defaultValue={fieldDefault(state, "givenOn", today)} {...invalidProps(state, "givenOn", "c-given")} />
        </Field>
      </div>
      <Field label="Note (optional)" name="note" htmlFor="c-note" state={state}>
        <Input id="c-note" name="note" maxLength={500} placeholder="Where the signed copy is, who took the call…" defaultValue={fieldDefault(state, "note", "")} />
      </Field>
      <FormStatus state={state} />
      <SubmitButton size="sm" pendingLabel="Saving…">
        Record consent
      </SubmitButton>
    </form>
  );
}

export function WithdrawConsentForm({ consentId }: { consentId: string }) {
  const [state, action] = useActionState(withdrawConsentAction, idle);
  const id = `w-${consentId}`;
  return (
    <form action={action} className="space-y-2" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "form"}>
      <input type="hidden" name="consentId" value={consentId} />
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        <Field label="How it was withdrawn" name="method" htmlFor={`${id}-m`} state={state}>
          <MethodSelect id={`${id}-m`} value={fieldDefault(state, "method", "call")} />
        </Field>
        <Field label="Note (optional)" name="note" htmlFor={`${id}-n`} state={state}>
          <Input id={`${id}-n`} name="note" maxLength={500} defaultValue={fieldDefault(state, "note", "")} />
        </Field>
      </div>
      <FormStatus state={state} />
      <SubmitButton size="sm" variant="outline" pendingLabel="Saving…">
        Record withdrawal
      </SubmitButton>
    </form>
  );
}
