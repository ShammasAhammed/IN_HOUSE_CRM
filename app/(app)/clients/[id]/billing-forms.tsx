"use client";

import { useActionState } from "react";
import { FormStatus, SubmitButton } from "@/components/form";
import { Input } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { createInvoiceAction, makeFolderAction } from "./billing-actions";

export function MakeFolder({ clientId }: { clientId: string }) {
  const [state, action] = useActionState(makeFolderAction, idle);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="clientId" value={clientId} />
      <SubmitButton size="sm" variant="outline" pendingLabel="Making…">
        Make the Drive folder
      </SubmitButton>
      {state.status !== "idle" ? <FormStatus state={state} /> : null}
    </form>
  );
}

export function InvoiceForm({ clientId }: { clientId: string }) {
  const [state, action] = useActionState(createInvoiceAction, idle);
  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">Draft an invoice in Zoho</summary>
      <form action={action} className="space-y-3 pt-3">
        <input type="hidden" name="clientId" value={clientId} />
        <label className="block space-y-1 text-sm">
          <span className="text-xs text-muted-foreground">For</span>
          <Input name="description" required maxLength={500} placeholder="e.g. Admissions retainer, November 2026" defaultValue={fieldDefault(state, "description", "")} className="h-9" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">Amount before GST (₹)</span>
            <Input name="amountRupees" type="number" min={1} step="0.01" required defaultValue={fieldDefault(state, "amountRupees", "")} className="h-9 tabular" />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">Date</span>
            <Input name="invoiceDate" type="date" defaultValue={fieldDefault(state, "invoiceDate", "")} className="h-9" />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">Made as a draft: check the tax in Zoho Books, then send it from there.</p>
        {state.status !== "idle" ? <FormStatus state={state} /> : null}
        <SubmitButton size="sm" pendingLabel="Making…">
          Make draft
        </SubmitButton>
      </form>
    </details>
  );
}
