"use client";

import { useActionState, useState } from "react";
import { ConfirmForm } from "@/components/confirm-form";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import type { EngagementKind } from "@/lib/types";
import type { DeliverableRecord } from "@/repositories";
import { addDeliverableAction, changeFeeAction, removeDeliverableAction, updateDeliverableAction } from "../../clients/actions";

/** A new fee from a month on (retainer) or a corrected total (one-off), D66. */
export function FeeForm({ engagementId, kind, thisMonth }: { engagementId: string; kind: EngagementKind; thisMonth: string }) {
  const [state, action] = useActionState(changeFeeAction, idle);
  const retainer = kind === "retainer";
  return (
    <form action={action} className="space-y-3 border-t pt-3" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
      <input type="hidden" name="engagementId" value={engagementId} />
      <p className="text-xs font-medium text-muted-foreground">{retainer ? "Change the fee" : "Correct the total fee"}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="₹ before GST" name="amount" state={state} className={retainer ? undefined : "col-span-2"}>
          <Input id="amount" name="amount" inputMode="decimal" required placeholder="50,000" className="tabular" defaultValue={fieldDefault(state, "amount", "")} {...invalidProps(state, "amount")} />
        </Field>
        {retainer ? (
          <Field label="From" name="effectiveMonth" state={state}>
            <Input id="effectiveMonth" name="effectiveMonth" type="month" min={thisMonth} required defaultValue={fieldDefault(state, "effectiveMonth", thisMonth)} {...invalidProps(state, "effectiveMonth")} />
          </Field>
        ) : null}
      </div>
      <FormStatus state={state} />
      <SubmitButton size="sm" variant="outline" pendingLabel="Saving…">
        Save fee
      </SubmitButton>
    </form>
  );
}

/** Promised outputs ("12 reels a month"), counted against completed tasks linked to them. */
export function DeliverablesEditor({ engagementId, deliverables, perMonth }: { engagementId: string; deliverables: DeliverableRecord[]; perMonth: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {deliverables.length ? (
        <ul className="divide-y">
          {deliverables.map((d) =>
            editing === d.id ? (
              <li key={d.id} className="py-2.5">
                <DeliverableForm deliverable={d} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={d.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="flex-1">{d.name}</span>
                <span className="tabular text-muted-foreground">
                  {d.targetCount}
                  {perMonth ? " a month" : " in all"}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setEditing(d.id)}>
                  Edit
                </Button>
                <ConfirmForm action={removeDeliverableAction} fields={{ deliverableId: d.id }} label="Remove" variant="ghost" confirm={`Stop counting ${d.name}?`} showSuccess={false} />
              </li>
            ),
          )}
        </ul>
      ) : null}
      {editing === null ? <DeliverableForm engagementId={engagementId} /> : null}
    </div>
  );
}

function DeliverableForm({ engagementId, deliverable, onDone }: { engagementId?: string; deliverable?: DeliverableRecord; onDone?: () => void }) {
  const [state, action] = useActionState(async (prev: Parameters<typeof addDeliverableAction>[0], form: FormData) => {
    const next = await (deliverable ? updateDeliverableAction : addDeliverableAction)(prev, form);
    if (next.status === "ok") onDone?.();
    return next;
  }, idle);
  const prefix = deliverable?.id ?? "new";
  return (
    <form action={action} className="space-y-2" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
      {deliverable ? <input type="hidden" name="deliverableId" value={deliverable.id} /> : <input type="hidden" name="engagementId" value={engagementId} />}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1 space-y-1.5">
          <label htmlFor={`${prefix}-name`} className="text-xs font-medium text-muted-foreground">
            {deliverable ? "Name" : "Add a deliverable"}
          </label>
          <Input id={`${prefix}-name`} name="name" required maxLength={80} placeholder="e.g. Reels" defaultValue={fieldDefault(state, "name", deliverable?.name ?? "")} {...invalidProps(state, "name")} />
        </div>
        <div className="w-24 space-y-1.5">
          <label htmlFor={`${prefix}-count`} className="text-xs font-medium text-muted-foreground">
            How many
          </label>
          <Input id={`${prefix}-count`} name="targetCount" type="number" min="1" max="500" required className="tabular" defaultValue={fieldDefault(state, "targetCount", deliverable ? String(deliverable.targetCount) : "")} {...invalidProps(state, "targetCount")} />
        </div>
        <SubmitButton size="sm" variant={deliverable ? "default" : "outline"}>
          {deliverable ? "Save" : "Add"}
        </SubmitButton>
        {deliverable ? (
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
      {state.status === "error" ? <FormStatus state={state} /> : null}
    </form>
  );
}
