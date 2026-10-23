"use client";

import { useActionState, useState } from "react";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { markLeftAction, updateMyContactAction } from "../actions";

export function MyContactForm({ initial }: { initial: Record<"workPhone" | "personalPhone" | "personalEmail" | "emergencyContactName" | "emergencyContactPhone" | "emergencyContactRelation", string> }) {
  const [state, action] = useActionState(updateMyContactAction, idle);
  const f = (name: keyof typeof initial) => ({ id: `me-${name}`, name, defaultValue: fieldDefault(state, name, initial[name]), ...invalidProps(state, name) });
  return (
    <form action={action} className="space-y-4" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Work phone" name="workPhone" state={state}>
          <Input {...f("workPhone")} type="tel" />
        </Field>
        <Field label="Personal phone" name="personalPhone" state={state}>
          <Input {...f("personalPhone")} type="tel" />
        </Field>
        <Field label="Personal email" name="personalEmail" state={state}>
          <Input {...f("personalEmail")} type="email" />
        </Field>
        <Field label="Emergency contact" name="emergencyContactName" state={state}>
          <Input {...f("emergencyContactName")} />
        </Field>
        <Field label="Their phone" name="emergencyContactPhone" state={state}>
          <Input {...f("emergencyContactPhone")} type="tel" />
        </Field>
        <Field label="Relation" name="emergencyContactRelation" state={state}>
          <Input {...f("emergencyContactRelation")} placeholder="Parent, spouse…" />
        </Field>
      </div>
      <FormStatus state={state} />
      <SubmitButton size="sm" pendingLabel="Saving…">
        Save my details
      </SubmitButton>
    </form>
  );
}

export function MarkLeftForm({ personId, name, today }: { personId: string; name: string; today: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(markLeftAction, idle);
  if (state.status === "ok") return <FormStatus state={state} />;
  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Record exit
      </Button>
    );
  }
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`${name} won't be able to sign in after this. Continue?`)) e.preventDefault();
      }}
      className="space-y-3 rounded-lg border border-danger/30 bg-danger-soft/40 p-3"
      key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}
    >
      <input type="hidden" name="personId" value={personId} />
      <Field label="Last working day" name="endDate" state={state} hint="The exit checklist (accounts, devices, client handover) is further down this page.">
        <Input id="endDate" name="endDate" type="date" max={today} defaultValue={fieldDefault(state, "endDate", today)} required {...invalidProps(state, "endDate")} />
      </Field>
      <FormStatus state={state} />
      <div className="flex gap-2">
        <SubmitButton size="sm" variant="destructive">
          Record exit
        </SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
