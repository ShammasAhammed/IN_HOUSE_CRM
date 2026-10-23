"use client";

import { useActionState, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { ENGAGEMENT_STATUSES, type EngagementKind } from "@/lib/types";
import { createEngagementAction, updateEngagementAction } from "../clients/actions";
import { UnsavedGuard } from "@/components/unsaved-guard";

export type EngagementFormValues = {
  clientId?: string;
  engagementId?: string;
  serviceId: string;
  kind: EngagementKind;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  renewalDate: string;
  hoursBudget: string;
  rolloverPolicy: string;
  notes: string;
};

const STATUS_LABELS: Record<(typeof ENGAGEMENT_STATUSES)[number], string> = { draft: "Draft", active: "Active", paused: "Paused", ended: "Ended" };

export function EngagementForm({
  initial,
  services,
  cancelHref,
}: {
  initial: EngagementFormValues;
  services: Array<{ id: string; name: string; active: boolean }>;
  cancelHref: Route;
}) {
  const editing = Boolean(initial.engagementId);
  const [state, action] = useActionState(editing ? updateEngagementAction : createEngagementAction, idle);
  const [kind, setKind] = useState<string>(fieldDefault(state, "kind", initial.kind));
  type Name = Exclude<keyof EngagementFormValues, "clientId" | "engagementId" | "kind">;
  const f = (name: Name) => ({ id: name, name, defaultValue: fieldDefault(state, name, initial[name]), ...invalidProps(state, name) });
  const retainer = (editing ? initial.kind : kind) === "retainer";

  return (
    <form action={action} className="max-w-3xl space-y-6" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
      <UnsavedGuard />
      {initial.clientId ? <input type="hidden" name="clientId" value={initial.clientId} /> : null}
      {initial.engagementId ? <input type="hidden" name="engagementId" value={initial.engagementId} /> : null}
      <section className="space-y-4 rounded-lg border bg-card p-4 shadow-card md:p-5">
        <h2 className="text-sm font-semibold">What was sold</h2>
        {editing ? null : (
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Kind</legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["retainer", "Monthly retainer", "Hours and fee every calendar month"],
                  ["one_off", "One-off job", "One budget and one fee for the whole job"],
                ] as const
              ).map(([value, label, hint]) => (
                <label key={value} className="flex min-w-56 flex-1 cursor-pointer items-start gap-2 rounded-md border p-3 text-sm has-checked:border-primary has-checked:bg-accent">
                  <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="mt-0.5 accent-primary" />
                  <span>
                    <span className="block font-medium">{label}</span>
                    <span className="text-xs text-muted-foreground">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Service" name="serviceId" state={state}>
            <Select {...f("serviceId")} required>
              <option value="" disabled>
                Choose…
              </option>
              {services
                .filter((s) => s.active || s.id === initial.serviceId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Name" name="name" state={state} hint={editing ? undefined : "Leave empty to use the service's name."}>
            <Input {...f("name")} maxLength={120} />
          </Field>
          <Field label="Starts" name="startDate" state={state}>
            <Input {...f("startDate")} type="date" required />
          </Field>
          <Field label="Ends" name="endDate" state={state} hint={retainer ? "Leave empty while it keeps renewing." : "When the job is due to finish."}>
            <Input {...f("endDate")} type="date" />
          </Field>
          {retainer ? (
            <Field label="Renews on" name="renewalDate" state={state} hint={editing ? "The BDO is reminded 30 days before." : "Leave empty for a year after the start."}>
              <Input {...f("renewalDate")} type="date" />
            </Field>
          ) : null}
          {editing ? (
            <Field label="Status" name="status" state={state} hint="Paused and ended retainers open no new months.">
              <Select {...f("status")}>
                {ENGAGEMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-4 shadow-card md:p-5">
        <div>
          <h2 className="text-sm font-semibold">Hours{editing ? "" : " and fee"}</h2>
          <p className="text-xs text-muted-foreground">
            {retainer ? "A month that starts part-way gets a share of the hours and the fee by days." : "All time logged on the job counts against this budget."}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={retainer ? "Hours per month" : "Hours for the job"} name="hoursBudget" state={state} hint="Leave empty if the deal isn't sold in hours.">
            <Input {...f("hoursBudget")} type="number" min="0" max="2000" step="0.5" className="tabular" />
          </Field>
          {editing ? null : (
            <Field label={retainer ? "Monthly fee (₹, before GST)" : "Total fee (₹, before GST)"} name="fee" state={state}>
              <Input id="fee" name="fee" inputMode="decimal" required placeholder="45,000" defaultValue={fieldDefault(state, "fee", "")} className="tabular" {...invalidProps(state, "fee")} />
            </Field>
          )}
          {retainer ? (
            <Field label="Unused hours" name="rolloverPolicy" state={state}>
              <Select {...f("rolloverPolicy")}>
                <option value="expire">Expire at month end</option>
                <option value="rollover">Roll over to the next month only</option>
              </Select>
            </Field>
          ) : null}
        </div>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-4 shadow-card md:p-5">
        <Field label="Notes" name="notes" state={state} hint="What's included, special terms.">
          <Textarea {...f("notes")} maxLength={2000} rows={3} />
        </Field>
      </section>

      <FormStatus state={state} />
      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel="Saving…">{editing ? "Save changes" : "Start engagement"}</SubmitButton>
        <Button variant="ghost" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
