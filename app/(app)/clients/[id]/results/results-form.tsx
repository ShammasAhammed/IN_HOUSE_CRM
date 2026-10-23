"use client";

import { useActionState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { UnsavedGuard } from "@/components/unsaved-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { saveResultsAction } from "./actions";

export type ResultsFormValues = { leads: string; spend: string; callsBooked: string; admissions: string; targetLeads: string; targetAdmissions: string };

export function ResultsForm({ clientId, month, initial, metaHint }: { clientId: string; month: string; initial: ResultsFormValues; metaHint: string | null }) {
  const [state, action] = useActionState(saveResultsAction, idle);
  const f = (name: keyof ResultsFormValues) => ({ id: name, name, defaultValue: fieldDefault(state, name, initial[name]), inputMode: "numeric" as const, ...invalidProps(state, name) });
  return (
    <form action={action} className="max-w-2xl space-y-5" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
      <UnsavedGuard />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="month" value={month} />
      <section className="space-y-4 rounded-lg border bg-card p-4 shadow-card md:p-5">
        <h2 className="text-sm font-semibold">Numbers</h2>
        {metaHint ? <p className="rounded-md bg-info-soft px-3 py-2 text-sm text-info">{metaHint}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Leads" name="leads" state={state} hint="Enquiries from ads, forms and calls.">
            <Input {...f("leads")} />
          </Field>
          <Field label="Ad spend (₹)" name="spend" state={state}>
            <Input {...f("spend")} inputMode="decimal" placeholder="45,000" />
          </Field>
          <Field label="Counselling calls booked" name="callsBooked" state={state}>
            <Input {...f("callsBooked")} />
          </Field>
          <Field label="Admissions" name="admissions" state={state} hint="Students who joined.">
            <Input {...f("admissions")} />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">Leave a box empty if you don&apos;t know yet; 0 means none.</p>
      </section>
      <section className="space-y-4 rounded-lg border bg-card p-4 shadow-card md:p-5">
        <h2 className="text-sm font-semibold">Targets</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Lead target" name="targetLeads" state={state}>
            <Input {...f("targetLeads")} />
          </Field>
          <Field label="Admission target" name="targetAdmissions" state={state}>
            <Input {...f("targetAdmissions")} />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">Optional. Health on the client page and the dashboard is judged against these.</p>
      </section>
      <FormStatus state={state} />
      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel="Saving…">Save results</SubmitButton>
        <Button variant="ghost" asChild>
          <Link href={`/clients/${clientId}` as Route}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
