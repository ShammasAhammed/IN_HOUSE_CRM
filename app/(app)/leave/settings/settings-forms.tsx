"use client";

import { useActionState } from "react";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Input, Select } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { Checkbox } from "@/components/ui/choice";
import { addLeaveTypeAction, grantLeaveAction, setLeaveTypeActiveAction, setQuotaAction } from "../actions";

export function QuotaForm({ leaveTypeId, employmentType, days }: { leaveTypeId: string; employmentType: string; days: number }) {
  const [state, action] = useActionState(setQuotaAction, idle);
  return (
    <form action={action} className="flex items-center gap-1.5" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
      <input type="hidden" name="leaveTypeId" value={leaveTypeId} />
      <input type="hidden" name="employmentType" value={employmentType} />
      <Input
        name="days"
        type="number"
        step="0.5"
        min="0"
        max="60"
        defaultValue={fieldDefault(state, "days", String(days))}
        aria-label="Days per year"
        className="tabular h-8 w-20"
        {...invalidProps(state, "days")}
      />
      <SubmitButton size="sm" variant="outline">
        Save
      </SubmitButton>
      {state.status === "ok" ? <span className="text-xs text-success">Saved</span> : null}
      {state.status === "error" ? <span className="text-xs text-danger">{state.fieldErrors?.days?.[0] ?? state.message}</span> : null}
    </form>
  );
}

export function GrantForm({ people, types }: { people: Array<{ id: string; name: string }>; types: Array<{ id: string; name: string; key: string }> }) {
  const [state, action] = useActionState(grantLeaveAction, idle);
  const compOff = types.find((t) => t.key === "comp_off")?.id;
  return (
    <form action={action} className="space-y-3 rounded-lg border bg-card p-4 shadow-card" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
      <div>
        <h2 className="text-sm font-semibold">Grant comp-off or correct a balance</h2>
        <p className="text-xs text-muted-foreground">Comp-off expires 60 days after it&apos;s granted. Use a negative number to take days away.</p>
      </div>
      <Field label="Person" name="personId" state={state}>
        <Select id="personId" name="personId" required defaultValue={fieldDefault(state, "personId", "")} {...invalidProps(state, "personId")}>
          <option value="" disabled>
            Choose…
          </option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-[1fr_96px] gap-3">
        <Field label="Leave type" name="leaveTypeId" state={state}>
          <Select id="leaveTypeId" name="leaveTypeId" defaultValue={fieldDefault(state, "leaveTypeId", compOff ?? "")}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Days" name="days" state={state}>
          <Input id="days" name="days" type="number" step="0.5" defaultValue={fieldDefault(state, "days", "1")} required className="tabular" {...invalidProps(state, "days")} />
        </Field>
      </div>
      <Field label="What it's for" name="reason" state={state}>
        <Input id="reason" name="reason" required placeholder="e.g. Sunday campus shoot for CodeLeap" maxLength={200} defaultValue={fieldDefault(state, "reason", "")} {...invalidProps(state, "reason")} />
      </Field>
      <FormStatus state={state} />
      <SubmitButton size="sm" pendingLabel="Granting…">
        Grant
      </SubmitButton>
    </form>
  );
}

/** Add a leave type (test report H2): paid with yearly days, granted like comp-off, or unpaid. */
export function AddLeaveTypeForm() {
  const [state, action] = useActionState(addLeaveTypeAction, idle);
  const err = (k: string) => (state.status === "error" ? state.fieldErrors?.[k]?.[0] : undefined);
  return (
    <form action={action} className="space-y-3 rounded-lg border bg-card p-4 shadow-card">
      <h2 className="text-sm font-semibold">Add a leave type</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" name="name" state={state}>
          <Input id="name" name="name" required maxLength={40} placeholder="e.g. Earned leave" defaultValue={fieldDefault(state, "name", "")} {...invalidProps(state, "name")} />
        </Field>
        <Field label="How it works" name="kind" state={state}>
          <Select id="kind" name="kind" defaultValue={fieldDefault(state, "kind", "quota")}>
            <option value="quota">Paid, with days each year</option>
            <option value="granted">Paid, only when HR grants it (like comp-off)</option>
            <option value="unpaid">Unpaid, needs approval</option>
          </Select>
        </Field>
      </div>
      <fieldset className="space-y-1">
        <legend className="text-xs text-muted-foreground">Days each year (for &quot;days each year&quot;)</legend>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["full_time", "Full-time"],
              ["part_time", "Part-time"],
              ["intern", "Intern"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="space-y-1 text-xs text-muted-foreground">
              {label}
              <Input name={k} type="number" min="0" max="60" step="0.5" defaultValue={fieldDefault(state, k, "")} className="tabular h-9" aria-invalid={Boolean(err(k)) || undefined} />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Can apply up to this many days back" name="maxBackdateDays" state={state}>
          <Input id="maxBackdateDays" name="maxBackdateDays" type="number" min="0" max="30" defaultValue={fieldDefault(state, "maxBackdateDays", "0")} className="tabular" />
        </Field>
        <Field label="Granted days expire after (days)" name="grantExpiryDays" state={state}>
          <Input id="grantExpiryDays" name="grantExpiryDays" type="number" min="1" max="365" placeholder="Never" defaultValue={fieldDefault(state, "grantExpiryDays", "")} className="tabular" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="allowHalfDay" defaultChecked={state.status !== "error" || fieldDefault(state, "allowHalfDay", "") === "on"} /> Half days allowed
      </label>
      <FormStatus state={state} />
      <SubmitButton size="sm" pendingLabel="Adding…">
        Add leave type
      </SubmitButton>
    </form>
  );
}

export function LeaveTypeActive({ leaveTypeId, active }: { leaveTypeId: string; active: boolean }) {
  const [state, action] = useActionState(setLeaveTypeActiveAction, idle);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="leaveTypeId" value={leaveTypeId} />
      <input type="hidden" name="active" value={active ? "no" : "yes"} />
      <button type="submit" className="text-xs text-muted-foreground hover:text-foreground hover:underline" title={state.status === "error" ? state.message : undefined}>
        {active ? "Retire" : "Bring back"}
      </button>
    </form>
  );
}
