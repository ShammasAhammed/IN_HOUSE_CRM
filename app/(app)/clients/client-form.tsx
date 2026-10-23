"use client";

import { useActionState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { CLIENT_SEGMENTS, CLIENT_SEGMENT_LABELS, CLIENT_STATUSES, CLIENT_STATUS_LABELS } from "@/lib/types";
import { createClientAction, updateClientAction } from "./actions";
import { UnsavedGuard } from "@/components/unsaved-guard";

export type ClientFormValues = {
  clientId?: string;
  name: string;
  legalName: string;
  segment: string;
  status: string;
  city: string;
  startDate: string;
  leadStrategistId: string;
  gstin: string;
  billingAddress: string;
  crmLeadId: string;
  notes: string;
  driveFolderUrl: string;
};

export function ClientForm({
  initial,
  leads,
  contactDetails,
  cancelHref,
}: {
  initial: ClientFormValues;
  leads: Array<{ id: string; fullName: string }>;
  /** GSTIN and billing address are contact details (D14). */
  contactDetails: boolean;
  cancelHref: Route;
}) {
  const [state, action] = useActionState(initial.clientId ? updateClientAction : createClientAction, idle);
  const f = (name: Exclude<keyof ClientFormValues, "clientId">) => ({ id: name, name, defaultValue: fieldDefault(state, name, initial[name]), ...invalidProps(state, name) });

  return (
    // `key` remounts the fields after an error so they keep what was typed.
    <form action={action} className="max-w-3xl space-y-6" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
      <UnsavedGuard />
      {initial.clientId ? <input type="hidden" name="clientId" value={initial.clientId} /> : null}
      <section className="space-y-4 rounded-lg border bg-card p-4 shadow-card md:p-5">
        <h2 className="text-sm font-semibold">The client</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" name="name" state={state} hint="As the team calls them.">
            {/* The browser stops a name of only spaces before sending, with the same words as the server (QA S9-05). */}
            <Input {...f("name")} required maxLength={120} pattern=".*\S.*" title="Please enter the client's name." placeholder="e.g. Zenith IAS Academy" />
          </Field>
          <Field label="Legal name" name="legalName" state={state}>
            <Input {...f("legalName")} maxLength={160} placeholder="For invoices, if different" />
          </Field>
          <Field label="Kind of institution" name="segment" state={state}>
            <Select {...f("segment")}>
              {CLIENT_SEGMENTS.map((s) => (
                <option key={s} value={s}>
                  {CLIENT_SEGMENT_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="City" name="city" state={state}>
            <Input {...f("city")} maxLength={80} placeholder="e.g. Kozhikode" />
          </Field>
          <Field label="Status" name="status" state={state}>
            <Select {...f("status")}>
              {CLIENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CLIENT_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Client since" name="startDate" state={state}>
            <Input {...f("startDate")} type="date" />
          </Field>
          <Field label="Lead strategist" name="leadStrategistId" state={state} hint="Joins the client's team automatically.">
            <Select {...f("leadStrategistId")}>
              <option value="">Not decided yet</option>
              {leads.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="CRM lead id" name="crmLeadId" state={state} hint="The won lead this client came from, if you know it.">
            <Input {...f("crmLeadId")} maxLength={64} />
          </Field>
        </div>
      </section>

      {contactDetails ? (
        <section className="space-y-4 rounded-lg border bg-card p-4 shadow-card md:p-5">
          <div>
            <h2 className="text-sm font-semibold">Billing</h2>
            <p className="text-xs text-muted-foreground">Seen only by the owner, strategists, performance marketers, the BDO and accounts.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="GSTIN" name="gstin" state={state}>
              <Input {...f("gstin")} maxLength={15} placeholder="32ABCDE1234F1Z5" className="uppercase" autoComplete="off" />
            </Field>
            <Field label="Billing address" name="billingAddress" state={state} className="sm:col-span-2">
              <Textarea {...f("billingAddress")} maxLength={500} rows={3} />
            </Field>
          </div>
        </section>
      ) : null}

      <section className="space-y-4 rounded-lg border bg-card p-4 shadow-card md:p-5">
        <Field label="Drive folder" name="driveFolderUrl" state={state} hint="Optional: the link to the client's Google Drive folder. It shows on the client page.">
          <Input {...f("driveFolderUrl")} type="url" maxLength={500} placeholder="https://drive.google.com/drive/folders/…" />
        </Field>
        <Field label="Notes" name="notes" state={state} hint="Anything the team should know: how they like to work, who decides.">
          <Textarea {...f("notes")} maxLength={2000} rows={4} />
        </Field>
      </section>

      <FormStatus state={state} />
      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel="Saving…">{initial.clientId ? "Save changes" : "Add client"}</SubmitButton>
        <Button variant="ghost" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
