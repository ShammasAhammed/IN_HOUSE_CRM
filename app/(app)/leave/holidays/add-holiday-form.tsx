"use client";

import { useActionState } from "react";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Input } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { addHolidayAction } from "../actions";

export function AddHolidayForm({ year }: { year: number }) {
  const [state, action] = useActionState(addHolidayAction, idle);
  return (
    <form action={action} className="h-fit space-y-3 rounded-lg border bg-card p-4 shadow-card" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
      <h2 className="text-sm font-semibold">Add a holiday</h2>
      <Field label="Date" name="date" state={state}>
        <Input id="date" name="date" type="date" min={`${year}-01-01`} max={`${year}-12-31`} required defaultValue={fieldDefault(state, "date", "")} {...invalidProps(state, "date")} />
      </Field>
      <Field label="Name" name="name" state={state}>
        <Input id="name" name="name" placeholder="e.g. Thiruvonam" required maxLength={80} defaultValue={fieldDefault(state, "name", "")} {...invalidProps(state, "name")} />
      </Field>
      <FormStatus state={state} />
      <SubmitButton size="sm" pendingLabel="Adding…">
        Add holiday
      </SubmitButton>
    </form>
  );
}
